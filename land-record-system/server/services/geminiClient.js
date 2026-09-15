/**
 * Direct Gemini client for the Node server.
 *
 * Talks to Google's Gemini API straight from Node (no Python AI service hop),
 * so document extraction keeps working on Vercel (serverless) where the
 * Python/Tesseract service can't run. This is now the PRIMARY path on
 * serverless; the Python service remains the primary on local dev only.
 *
 * Env: GEMINI_API_KEY (required), GEMINI_MODEL (default gemini-3.6-flash).
 */
import { GoogleGenAI } from "@google/genai";

const API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const MODEL = (process.env.GEMINI_MODEL || "gemini-3.6-flash").trim();
// Verified-alive alternates (mirror of the Python chain): busy or retired
// models are skipped, so a capacity spike never hard-fails an upload.
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
// Total wall-clock budget — must fit inside the serverless function limit
// (Vercel Hobby = 10s default, Pro configurable up to 60/300s) and the
// frontend axios timeout (120s).
const RETRY_BUDGET_MS = 55_000;

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

const FIELDS = [
  "ownerName",
  "fatherName",
  "khatianNumber",
  "plotNumber",
  "surveyNumber",
  "area",
  "areaUnit",
  "village",
  "tehsil",
  "district",
  "state",
  "landType",
  "mutationDetails",
];

const PROMPT = `You are an expert digitization assistant for Indian land revenue records
(Khatian, Khasra, Patta, Jamabandi, FIR, Form-1, pahani, adangal, etc.).

MULTILINGUAL READING: the document may be in ANY Indian language and script —
Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam,
Arabic script (Urdu), Ol Chiki, Meetei Mayek — or English, or several mixed on one
page. Read every script natively. Do NOT transliterate or translate: copy every
value EXACTLY as written, in whatever script it appears.

Labels may appear in any Indian language — match semantically, not literally
(e.g. खातेदार / मालिक / খতিয়ান দাবিদার / குதிரையாளர் / కౌలుదారు / ಸ್ವಾಮ್ಯದಾರ /
ഉടമസ്ഥൻ / پٹادار and "Name of Tenant / Khatedar / Pattadar / Raiyat", ग्राम / মৌজা /
Village / Mouza, जिला / জেলা / District / Zilla, etc.).

Return ONLY a JSON object (no markdown, no explanation) with exactly these keys:
${JSON.stringify(FIELDS)}

Rules:
- Copy values EXACTLY as written (do not translate, transliterate or normalise names).
- Omit a key (or use "") only when it is genuinely not present in the document.
- For "area", capture the numeric value only (e.g. "2.50"); put the unit in
  "areaUnit" (acre, hectare, bigha, katha, decimal, guntha, cent, sq_yard, sq_feet).
- Numbers may be written in Indic digits — convert them to ASCII digits (०१२ → 012).
- "confidence" is your 0-100 certainty for each extracted field.
- Also return "documentLanguage" (ISO 639 code, or comma-separated if mixed) and
  "documentScript" (e.g. Devanagari, Bengali, Tamil, Latin).
- If the document is unreadable, return an empty "confidence" object and put the
  reason in "notes".`;

let client = null;
let initError = null;
let activeModel = MODEL;

function getClient() {
  if (client || initError) return client;
  if (!API_KEY) {
    initError = "GEMINI_API_KEY not set";
    return null;
  }
  try {
    client = new GoogleGenAI({ apiKey: API_KEY });
  } catch (e) {
    initError = e.message;
  }
  return client;
}

export function geminiStatus() {
  if (API_KEY && getClient()) return `gemini-direct (${activeModel})`;
  if (API_KEY && initError) return `gemini-direct error: ${initError}`;
  return "gemini-direct not configured (GEMINI_API_KEY missing)";
}

function isRetryable(err) {
  const msg = String(err?.message || err).toLowerCase();
  const network = [
    "getaddrinfo",
    "temporary failure",
    "connection",
    "timed out",
    "timeout",
  ];
  const transient = [
    "503",
    "429",
    "500",
    "unavailable",
    "resource_exhausted",
    "rate limit",
    "overloaded",
    "high demand",
    "internal error",
  ];
  return [...network, ...transient].some((t) => msg.includes(t));
}

async function callGemini(parts, temperature = 0) {
  const ai = getClient();
  if (!ai) throw new Error(initError || "Gemini not configured");

  const candidates = [MODEL, ...FALLBACK_MODELS.filter((m) => m !== MODEL)];
  const deadline = Date.now() + RETRY_BUDGET_MS;
  let lastErr;

  for (const model of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: { temperature, responseMimeType: "application/json" },
        });
        activeModel = model;
        return resp.text || "";
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err)) {
          const msg = String(err?.message || err);
          if (/404|NOT_FOUND|no longer available/i.test(msg)) break; // retired → next model
          throw err; // bad key / bad request — fail fast
        }
        if (Date.now() > deadline) throw err;
        if (attempt < 1) await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw lastErr || new Error("Gemini call failed");
}

function parseJson(raw) {
  let s = String(raw || "").trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
  }
  return {};
}

function splitParsed(parsed) {
  const fields = {};
  for (const f of FIELDS) fields[f] = String(parsed?.[f] ?? "").trim();
  const confMap =
    parsed?.confidence && typeof parsed.confidence === "object"
      ? parsed.confidence
      : {};
  const notes = String(parsed?.notes ?? "");
  const langInfo = {
    language: String(parsed?.documentLanguage ?? "")
      .trim()
      .toLowerCase(),
    script: String(parsed?.documentScript ?? "").trim(),
  };
  return { fields, confMap, notes, langInfo };
}

function scoreFields(fields, confMap) {
  const fieldConfidences = [];
  const confs = [];
  for (const f of FIELDS) {
    const v = (fields[f] || "").trim();
    if (!v) continue;
    const c = Math.max(0, Math.min(100, Number(confMap[f] ?? 80)));
    confs.push(c);
    fieldConfidences.push({ field: f, value: v.slice(0, 120), confidence: c });
  }
  const overall = confs.length
    ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 10) / 10
    : 0;
  return { fieldConfidences, overall };
}

/** Extract fields from a document image/PDF buffer via Gemini vision. */
export async function geminiExtractImage(
  buffer,
  filename,
  documentType = "Khatian",
) {
  const started = Date.now();
  const empty = {
    fields: {},
    fieldConfidences: [],
    overallConfidence: 0,
    warnings: [],
    langInfo: {},
  };
  if (!getClient())
    return {
      ...empty,
      warnings: ["Gemini not configured — GEMINI_API_KEY missing"],
    };

  const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] || ".png").toLowerCase();
  const mime = MIME[ext] || "image/png";
  try {
    const raw = await callGemini([
      {
        inlineData: {
          mimeType: mime,
          data: Buffer.from(buffer).toString("base64"),
        },
      },
      { text: PROMPT },
    ]);
    const { fields, confMap, notes, langInfo } = splitParsed(parseJson(raw));
    const warnings = [];
    if (langInfo.language)
      warnings.push(`documentLanguage=${langInfo.language}`);
    if (langInfo.script) warnings.push(`documentScript=${langInfo.script}`);
    if (notes) warnings.push(`Gemini notes: ${notes}`);
    const { fieldConfidences, overall } = scoreFields(fields, confMap);
    if (!fieldConfidences.length) warnings.push("Gemini returned no fields.");
    return {
      fields,
      fieldConfidences,
      overallConfidence: overall,
      warnings,
      langInfo,
      processingMs: Date.now() - started,
    };
  } catch (err) {
    return { ...empty, warnings: [`Gemini call failed: ${err.message}`] };
  }
}

/** Extract fields from already-OCR'd / plain text via Gemini. */
export async function geminiExtractText(text) {
  const started = Date.now();
  const empty = {
    fields: {},
    fieldConfidences: [],
    overallConfidence: 0,
    warnings: [],
    langInfo: {},
  };
  if (!getClient() || !String(text || "").trim())
    return { ...empty, warnings: ["Gemini not available"] };

  try {
    const raw = await callGemini([
      { text: `${PROMPT}\n\nDOCUMENT TEXT:\n${String(text).slice(0, 24000)}` },
    ]);
    const { fields, confMap, notes, langInfo } = splitParsed(parseJson(raw));
    const warnings = [];
    if (notes) warnings.push(`Gemini notes: ${notes}`);
    const { fieldConfidences, overall } = scoreFields(fields, confMap);
    return {
      fields,
      fieldConfidences,
      overallConfidence: overall,
      warnings,
      langInfo,
      processingMs: Date.now() - started,
    };
  } catch (err) {
    return { ...empty, warnings: [`Gemini call failed: ${err.message}`] };
  }
}
