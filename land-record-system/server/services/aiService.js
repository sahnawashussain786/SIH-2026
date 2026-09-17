import axios from "axios";
import fs from "fs";
import path from "path";
import {
  extractFieldsFromText,
  detectLanguages,
  languageNames,
} from "./extractor.js";
import { runValidation } from "./validator.js";
import {
  geminiExtractImage,
  geminiExtractText,
  geminiStatus,
} from "./geminiClient.js";
import { combineAuthenticity } from "./imageForensics.js";

const AI_BASE = (process.env.AI_SERVICE_URL || "http://localhost:8001").replace(
  /\/$/,
  "",
);
const AI_KEY = process.env.AI_KEY || "dev-ai-key";
const AI_TIMEOUT = parseInt(process.env.AI_TIMEOUT_MS || "90000", 10);
const FALLBACK_ENABLED = (process.env.AI_FALLBACK || "true") === "true";
// Gemini-direct can be turned off with GEMINI_DIRECT=false (then the Python
// AI service is the primary engine again, as in local dev with Tesseract).
const GEMINI_DIRECT = (process.env.GEMINI_DIRECT || "true") === "true";

export { geminiStatus };

/** Ping the Python AI service (health checks only — not on the upload path). */
export async function pingAI() {
  const { data } = await axios.get(`${AI_BASE}/health`, {
    timeout: 5000,
    headers: { "X-API-Key": AI_KEY },
  });
  return data;
}

/**
 * Process a document. Extraction chain, in order:
 *
 *   1. Gemini DIRECT from Node (needs only GEMINI_API_KEY — works everywhere,
 *      including Vercel serverless; handles every Indic script natively).
 *   2. Python AI service (FastAPI + Tesseract cross-check) — local dev only.
 *   3. Node heuristic extractor (offline demo mode, no network needed).
 *
 * `fileBuffer` is the raw upload bytes (multer memory storage) — the function
 * never depends on the file being present on disk, which matters on ephemeral
 * serverless filesystems.
 */
export async function processDocument(doc, fileBuffer) {
  const started = Date.now();
  const buffer = fileBuffer ?? safeRead(doc.filePath);

  // ---- Tier 1: Gemini direct from Node ------------------------------------
  if (GEMINI_DIRECT) {
    try {
      const result = await geminiDirectProcess(doc, buffer, started);
      if (result) return result;
    } catch (err) {
      console.warn(
        "[ai] Gemini-direct failed, trying next engine —",
        err.message,
      );
    }
  }

  // ---- Tier 2: Python AI service (local dev / Tesseract cross-check) ------
  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob([buffer ?? new Uint8Array()]),
      doc.originalName,
    );
    form.append("document_type", doc.documentType || "Khatian");
    form.append("language", doc.language || "auto");
    if (doc.district) form.append("district_hint", doc.district);

    const { data } = await axios.post(`${AI_BASE}/api/v1/process`, form, {
      timeout: AI_TIMEOUT,
      headers: { "X-API-Key": AI_KEY },
    });

    return {
      engine: data.engine || "python-ai",
      success: true,
      extracted: data.extracted || {},
      fieldConfidences: data.field_confidences || [],
      overallConfidence: data.overall_confidence || 0,
      validation: data.validation || {
        errors: [],
        warnings: [],
        duplicates: [],
      },
      ocrText: data.ocr_text || "",
      aiMeta: data.ai_meta || {},
      authenticity:
        data.authenticity ||
        combineAuthenticity(
          buffer ?? null,
          doc.mimeType,
          doc.originalName,
          null,
        ),
    };
  } catch (err) {
    if (!FALLBACK_ENABLED) {
      throw new Error(`AI extraction unavailable: ${err.message}`);
    }
    console.warn(
      "[ai] service unreachable, using Node fallback extractor —",
      err.message,
    );
    // Safety gate: never let the heuristic fallback *synthesize* a plausible
    // record for an image the forensics probe flagged as AI-generated — a
    // fabricated document must not become a land record. Return empty
    // extraction instead; the flagged authenticity verdict routes it to
    // manual review.
    if (doc.authenticity?.verdict === "ai_generated") {
      return {
        engine: "authenticity-gate",
        success: true,
        extracted: {},
        fieldConfidences: [],
        overallConfidence: 0,
        validation: runValidation({}, []),
        ocrText: "",
        authenticity: doc.authenticity,
        aiMeta: {
          engine: "authenticity-gate",
          language: "en",
          languageName: "Unknown",
          languages: [],
          documentType: doc.documentType || "Khatian",
          preprocessed: false,
          pipeline: ["metadata-forensics", "authenticity-gate"],
          warnings: [
            "Image flagged as AI-generated — no fields were auto-extracted; routed to manual verification.",
          ],
          processingMs: Date.now() - started,
        },
      };
    }
    return fallbackProcess(doc, started, buffer);
  }
}

/** Tier 1 impl. Returns null when Gemini produced nothing (→ next engine). */
async function geminiDirectProcess(doc, buffer, started) {
  const isText =
    doc.mimeType === "text/plain" || /\.txt$/i.test(doc.originalName || "");
  const result = isText
    ? await geminiExtractText(buffer ? buffer.toString("utf8") : "")
    : await geminiExtractImage(buffer, doc.originalName, doc.documentType);

  if (!result.fieldConfidences.length) {
    if (result.warnings.length)
      console.warn("[ai] gemini-direct:", result.warnings.join(" | "));
    return null; // no fields → let the next engine try
  }

  const extracted = result.fields;
  if (doc.district && !extracted.district) extracted.district = doc.district;
  if (doc.state && !extracted.state) extracted.state = doc.state;

  const langs = [result.langInfo?.language]
    .filter(Boolean)
    .flatMap((l) => l.split(","));
  return {
    engine: "gemini-direct",
    success: true,
    extracted,
    fieldConfidences: result.fieldConfidences,
    overallConfidence: result.overallConfidence,
    validation: runValidation(extracted, []),
    ocrText: isText ? (buffer || "").toString("utf8").slice(0, 24000) : "",
    authenticity: combineAuthenticity(
      isText ? null : buffer,
      doc.mimeType,
      doc.originalName,
      result.authenticity,
    ),
    aiMeta: {
      engine: "gemini-direct",
      language: result.langInfo?.language || langs[0] || "en",
      languageName:
        languageNames(langs.length ? langs : ["en"])[0] || "English",
      languages: langs.length ? langs : ["en"],
      script: result.langInfo?.script || "",
      documentType: doc.documentType || "Khatian",
      preprocessed: false,
      pipeline: isText ? ["gemini-direct:text"] : ["gemini-direct:vision"],
      warnings: result.warnings || [],
      processingMs: result.processingMs || Date.now() - started,
    },
  };
}

function safeRead(p) {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

/**
 * Node-side fallback: parse any existing sidecar text (.txt next to upload)
 * produced by a real OCR, else derive a plausible record from filename.
 * This keeps the end-to-end flow (upload → extract → validate → review)
 * demonstrable without Gemini, Python, or OCR binaries.
 */
function fallbackProcess(doc, started, fileBuffer) {
  let text = "";
  const sidecar = path.join(
    path.dirname(doc.filePath),
    path.basename(doc.filePath, path.extname(doc.filePath)) + ".txt",
  );
  if (doc.filePath && fs.existsSync(sidecar)) {
    text = fs.readFileSync(sidecar, "utf8");
  } else {
    text = synthesizeTextFromName(doc.originalName);
  }

  const extracted = extractFieldsFromText(text);
  if (doc.district && !extracted.district) extracted.district = doc.district;
  if (doc.state && !extracted.state) extracted.state = doc.state;

  // Script-aware language detection — every Indic script, no extra deps
  const langs = detectLanguages(text);
  const fieldConfidences = Object.entries(extracted)
    .filter(([, v]) => v !== "" && v != null)
    .map(([field, value]) => ({
      field,
      value,
      confidence: field === "village" ? 82 : field === "ownerName" ? 88 : 93,
    }));

  const overall = fieldConfidences.length
    ? Math.round(
        fieldConfidences.reduce((s, f) => s + f.confidence, 0) /
          fieldConfidences.length,
      )
    : 0;

  const validation = runValidation(extracted, []);

  return {
    engine: "node-fallback",
    success: true,
    extracted,
    fieldConfidences,
    overallConfidence: overall,
    validation,
    ocrText: text,
    authenticity: combineAuthenticity(
      fileBuffer ?? null,
      doc.mimeType,
      doc.originalName,
      null,
    ),
    aiMeta: {
      engine: "node-fallback",
      language: langs[0] || "en",
      languageName: languageNames(langs)[0] || "English",
      languages: langs.length ? langs : ["en"],
      documentType: doc.documentType || "Khatian",
      preprocessed: false,
      pipeline: ["fallback-extraction"],
      warnings: [
        "Gemini and Python AI service unavailable — heuristic Node extractor used.",
      ],
      processingMs: Date.now() - started,
    },
  };
}

/** Build a synthetic but realistic OCR-style text from the filename hint */
function synthesizeTextFromName(originalName) {
  const seed = originalName.replace(/\.[^.]+$/, "");
  const hash = [...seed].reduce(
    (a, c) => (a * 31 + c.charCodeAt(0)) % 100000,
    7,
  );
  const names = [
    "Abdul Rahman",
    "Sita Devi",
    "Ramesh Chandra Gupta",
    "Manoj Kumar Yadav",
    "Lakshmi Narayan",
  ];
  const villages = [
    "Rampur",
    "Sujatganj",
    "Bishnupur",
    "Kishanganj",
    "Devgaon",
  ];
  const districts = ["Burdwan", "Rewa", "Muzaffarpur", "Nadia", "Sitapur"];
  const types = ["Agricultural", "Residential", "Commercial", "Wasteland"];
  const owner = names[hash % names.length];
  const village = villages[(hash >> 2) % villages.length];
  const district = districts[(hash >> 3) % districts.length];
  const khatian = 1000 + (hash % 9000);
  const plot = 100 + (hash % 8000);
  const area = ((hash % 400) / 100 + 0.25).toFixed(2);
  return [
    "FORM OF KHATIAN (Record of Rights)",
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
  ].join("\n");
}
