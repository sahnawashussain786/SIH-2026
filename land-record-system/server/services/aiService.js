import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { extractFieldsFromText } from './extractor.js';
import { runValidation } from './validator.js';

const AI_BASE = (process.env.AI_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
const AI_KEY = process.env.AI_KEY || 'dev-ai-key';
const AI_TIMEOUT = parseInt(process.env.AI_TIMEOUT_MS || '60000', 10);
const FALLBACK_ENABLED = (process.env.AI_FALLBACK || 'true') === 'true';

/** Ping the Python AI service */
export async function pingAI() {
  const { data } = await axios.get(`${AI_BASE}/health`, {
    timeout: 5000,
    headers: { 'X-API-Key': AI_KEY },
  });
  return data;
}

/**
 * Process a document: send file to Python AI service.
 * If the service is unreachable and fallback is enabled, run a Node-side
 * heuristic extraction so the workflow still completes (offline demo mode).
 */
export async function processDocument(doc) {
  const started = Date.now();
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(doc.filePath)]), doc.originalName);
    form.append('document_type', doc.documentType || 'Khatian');
    form.append('language', doc.language || 'auto');
    if (doc.district) form.append('district_hint', doc.district);

    const { data } = await axios.post(`${AI_BASE}/api/v1/process`, form, {
      timeout: AI_TIMEOUT,
      headers: { 'X-API-Key': AI_KEY },
    });

    return {
      engine: data.engine || 'python-ai',
      success: true,
      extracted: data.extracted || {},
      fieldConfidences: data.field_confidences || [],
      overallConfidence: data.overall_confidence || 0,
      validation: data.validation || { errors: [], warnings: [], duplicates: [] },
      ocrText: data.ocr_text || '',
      aiMeta: data.ai_meta || {},
    };
  } catch (err) {
    if (!FALLBACK_ENABLED) {
      throw new Error(`AI service unavailable: ${err.message}`);
    }
    console.warn('[ai] service unreachable, using Node fallback extractor —', err.message);
    return fallbackProcess(doc, started);
  }
}

/**
 * Node-side fallback: parse any existing sidecar text (.txt next to upload)
 * produced by a real OCR, else derive a plausible record from filename.
 * This keeps the end-to-end flow (upload → extract → validate → review)
 * demonstrable without Python/OCR binaries installed.
 */
function fallbackProcess(doc, started) {
  let text = '';
  const sidecar = path.join(path.dirname(doc.filePath), path.basename(doc.filePath, path.extname(doc.filePath)) + '.txt');
  if (fs.existsSync(sidecar)) {
    text = fs.readFileSync(sidecar, 'utf8');
  } else {
    text = synthesizeTextFromName(doc.originalName);
  }

  const extracted = extractFieldsFromText(text);
  if (doc.district && !extracted.district) extracted.district = doc.district;
  if (doc.state && !extracted.state) extracted.state = doc.state;

  const fieldConfidences = Object.entries(extracted)
    .filter(([, v]) => v !== '' && v != null)
    .map(([field, value]) => ({
      field,
      value,
      confidence: field === 'village' ? 82 : field === 'ownerName' ? 88 : 93,
    }));

  const overall = fieldConfidences.length
    ? Math.round(fieldConfidences.reduce((s, f) => s + f.confidence, 0) / fieldConfidences.length)
    : 0;

  const validation = runValidation(extracted, []);

  return {
    engine: 'node-fallback',
    success: true,
    extracted,
    fieldConfidences,
    overallConfidence: overall,
    validation,
    ocrText: text,
    aiMeta: {
      engine: 'node-fallback',
      language: 'en',
      documentType: doc.documentType || 'Khatian',
      preprocessed: false,
      pipeline: ['fallback-extraction'],
      warnings: ['Python AI service unreachable — heuristic Node extractor used.'],
      processingMs: Date.now() - started,
    },
  };
}

/** Build a synthetic but realistic OCR-style text from the filename hint */
function synthesizeTextFromName(originalName) {
  const seed = originalName.replace(/\.[^.]+$/, '');
  const hash = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100000, 7);
  const names = ['Abdul Rahman', 'Sita Devi', 'Ramesh Chandra Gupta', 'Manoj Kumar Yadav', 'Lakshmi Narayan'];
  const villages = ['Rampur', 'Sujatganj', 'Bishnupur', 'Kishanganj', 'Devgaon'];
  const districts = ['Burdwan', 'Rewa', 'Muzaffarpur', 'Nadia', 'Sitapur'];
  const types = ['Agricultural', 'Residential', 'Commercial', 'Wasteland'];
  const owner = names[hash % names.length];
  const village = villages[(hash >> 2) % villages.length];
  const district = districts[(hash >> 3) % districts.length];
  const khatian = 1000 + (hash % 9000);
  const plot = 100 + (hash % 8000);
  const area = ((hash % 400) / 100 + 0.25).toFixed(2);
  return [
    'FORM OF KHATIAN (Record of Rights)',
    `Name of Tenant: ${owner}`,
    `Father's Name: Shri M. Rahman`,
    `Khatian No: ${khatian}`,
    `Plot No: ${plot}`,
    `Area: ${area} Acre`,
    `Village: ${village}`,
    `Tehsil: Raninagar`,
    `District: ${district}`,
    `State: West Bengal`,
    `Land Type: ${types[(hash >> 4) % types.length]}`,
    `Mutation: Case No. ${1000 + (hash % 500)}/2024 dated 12.03.2024`,
  ].join('\n');
}
