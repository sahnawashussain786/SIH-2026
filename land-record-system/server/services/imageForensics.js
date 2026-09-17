/**
 * AI-generated image detection — pure JS, zero dependencies (works on Vercel).
 *
 * Two independent assessors are combined into one verdict:
 *
 *  1. Metadata forensics (this file, always available): scans the raw bytes
 *     for the fingerprints AI generators leave behind —
 *       • PNG tEXt/zTXt/iTXt chunks ("parameters", "prompt", "Software":
 *         Midjourney / Stable Diffusion / DALL·E / ComfyUI / NovelAI …)
 *       • JPEG EXIF Software / ImageDescription / UserComment / XP* tags
 *       • Adobe XMP (CreatorTool, xmpMM, generator refs)
 *       • C2PA "content credentials" provenance manifests (APP11 / caBX) —
 *         embedded by DALL·E 3, Firefly and friends
 *       • Default generator output resolutions (1024×1024, 896×1152, …)
 *       • Suspicious file names ("ai_", "midjourney", "generated"…)
 *  2. Gemini visual inspection (optional, passed in by the caller): looks at
 *     the actual image for melted pseudo-text, impossible paper texture,
 *     missing print/scan artifacts, etc. See geminiClient.js PROMPT.
 *
 * combineAuthenticity() merges both into:
 *   { verdict: 'ai_generated' | 'suspicious' | 'likely_authentic', score, reasons[] }
 */
import zlib from "zlib";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Known AI image generators / editing services. One strong hit is decisive.
const GENERATOR_RE =
  /midjourney|stable[\s_-]?diffusion|stablediffusion|stability\.ai|automatic1111|comfyui|novelai|dall[-·.\s]?e|openai|adobe\s+firefly|(?<!\w)firefly(?!\w)|\bimagen\b|made\s+with\s+google\s+ai|google\s+ai\s+(?:studio|app)|gemini\s+app|meta\s+ai\b|\bgrok\b|flux\.?[01]|black\s+forest\s+labs|leonardo\.(?:ai|com)|ideogram|runwayml|playground\s+ai|bing\s+image\s+creator|civitai|waifu\s+diffusion|animagine|\bsdxl\b|\bsd3\b|qwen-image|seedream|recraft|\bkrea\b/i;

// Ordinary image editors — weak signal only (edited, not necessarily AI).
const EDITOR_RE =
  /photoshop|lightroom|gimp|canva|picsart|snapseed|paint\.net|affinity\s+photo/i;

// File-name hints. (No trailing \b — names like "ai_generated_x.png" end the
// keyword right before an underscore, which is itself a word character.)
const AI_FILENAME_RE =
  /\b(?:ai[-_]?generated|ai[-_]?image|midjourney|dall[-_ ]?e|openai|sdxl|stable[-_ ]?diffusion|comfy|gen[-_]?ai|generated|deepfake|synthetic)/i;

// Common default resolutions of popular generators (weak signal on its own).
const GEN_SIZES = new Set([
  "256x256",
  "512x512",
  "768x768",
  "1024x1024",
  "1024x1792",
  "1792x1024",
  "1024x1536",
  "1536x1024",
  "896x1152",
  "1152x896",
  "1216x832",
  "832x1216",
  "1344x768",
  "768x1344",
  "512x768",
  "768x512",
  "640x1536",
  "1536x640",
]);

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

function pngChunks(buf) {
  const chunks = [];
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return chunks;
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    if (len < 0 || len > buf.length) break;
    const type = buf.toString("latin1", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len;
    if (type === "IEND") break;
  }
  return chunks;
}

function inflateTry(data) {
  try {
    return zlib.inflateSync(data).toString("utf8");
  } catch {
    return "";
  }
}

function pngTexts(chunks) {
  const texts = [];
  for (const { type, data } of chunks) {
    try {
      if (type === "tEXt") {
        const nul = data.indexOf(0);
        if (nul > 0)
          texts.push({
            source: `PNG tEXt "${data.toString("latin1", 0, nul)}"`,
            value: data.toString("latin1", nul + 1),
          });
      } else if (type === "zTXt") {
        const nul = data.indexOf(0);
        if (nul > 0)
          texts.push({
            source: `PNG zTXt "${data.toString("latin1", 0, nul)}"`,
            value: inflateTry(data.subarray(nul + 2)),
          });
      } else if (type === "iTXt") {
        const nul = data.indexOf(0);
        if (nul > 0) {
          const compFlag = data[nul + 1];
          let rest = data.subarray(nul + 5);
          // lang tag \0 translated keyword \0 text
          const l1 = rest.indexOf(0);
          if (l1 >= 0) {
            rest = rest.subarray(l1 + 1);
            const l2 = rest.indexOf(0);
            if (l2 >= 0) {
              const payload = rest.subarray(l2 + 1);
              const value =
                compFlag === 1 ? inflateTry(payload) : payload.toString("utf8");
              texts.push({
                source: `PNG iTXt "${data.toString("latin1", 0, nul)}"`,
                value,
              });
            }
          }
        }
      }
    } catch {
      /* malformed chunk — skip */
    }
  }
  return texts;
}

/* ------------------------------------------------------------------ */
/* JPEG                                                                */
/* ------------------------------------------------------------------ */

function jpegSegments(buf) {
  const segs = [];
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return segs;
  let off = 2;
  while (off + 4 <= buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = buf[off + 1];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      if (marker === 0xd9) break;
      off += 2;
      continue;
    }
    const len = buf.readUInt16BE(off + 2);
    if (len < 2) break;
    segs.push({
      marker,
      data: buf.subarray(off + 4, Math.min(off + 2 + len, buf.length)),
    });
    if (marker === 0xda) break; // start of scan — metadata is all before it
    off += 2 + len;
  }
  return segs;
}

const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\x00";

function jpegStrings(segments) {
  const texts = [];
  let c2pa = false;
  let dims = { width: 0, height: 0 };
  for (const { marker, data } of segments) {
    try {
      if (marker === 0xe1 && data.toString("latin1", 0, 5) === "Exif\x00") {
        texts.push(
          ...parseTiffStrings(data.subarray(6)).map((value) => ({
            source: "EXIF metadata",
            value,
          })),
        );
      } else if (
        marker === 0xe1 &&
        data.toString("latin1", 0, XMP_HEADER.length) === XMP_HEADER
      ) {
        texts.push({
          source: "XMP metadata",
          value: data.toString("latin1", XMP_HEADER.length),
        });
      } else if (marker === 0xeb) {
        c2pa = true; // APP11 = JUMBF container used by C2PA content credentials
      } else if (marker === 0xfe) {
        texts.push({ source: "JPEG comment", value: data.toString("latin1") });
      } else if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        dims = { height: data.readUInt16BE(1), width: data.readUInt16BE(3) };
      }
    } catch {
      /* malformed segment — skip */
    }
  }
  // C2PA manifests also surface inside XMP sometimes
  return { texts, c2pa, dims };
}

/* ------------------------------------------------------------------ */
/* TIFF / EXIF (inside JPEG APP1)                                      */
/* ------------------------------------------------------------------ */

const EXIF_TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function parseTiffStrings(tiff) {
  const strings = [];
  if (tiff.length < 8) return strings;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49; // "II" else "MM"
  const magic = little ? tiff.readUInt16LE(2) : tiff.readUInt16BE(2);
  if (magic !== 42) return strings; // TIFF magic 0x002A (both byte orders)
  const u16 = (o) => (little ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (little ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const seen = new Set();

  const readIFD = (off, depth) => {
    if (depth > 3 || off <= 0 || off + 2 > tiff.length || seen.has(off)) return;
    seen.add(off);
    const n = u16(off);
    if (n <= 0 || n > 512) return;
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (e + 12 > tiff.length) return;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = Math.min((EXIF_TYPE_SIZE[type] || 1) * count, 512);
      const vOff = size <= 4 ? e + 8 : u32(e + 8);
      if (vOff < 0 || vOff + size > tiff.length) continue;
      if (type === 2) {
        // ASCII — Software (0x0131), ImageDescription (0x010e), Copyright (0x8298)…
        const s = tiff
          .toString("latin1", vOff, vOff + size)
          .replace(/\0[\s\S]*$/, "")
          .trim();
        if (s) strings.push(s);
      } else if (type === 7 && tag === 0x9286) {
        // UserComment — 8-byte charset prefix
        const s = tiff
          .subarray(vOff, vOff + size)
          .toString("latin1")
          .replace(/^(?:ASCII|UNICODE|JIS)\x00\x00\x00/i, "")
          .replace(/\0+$/, "")
          .trim();
        if (s) strings.push(s);
      } else if (type === 1 && tag >= 0x9c9b && tag <= 0x9c9f) {
        // XP* tags — UTF-16LE
        const s = tiff
          .subarray(vOff, vOff + size)
          .toString("utf16le")
          .replace(/\0+$/, "")
          .trim();
        if (s) strings.push(s);
      } else if (tag === 0x8769) {
        readIFD(u32(e + 8), depth + 1); // EXIF sub-IFD
      }
    }
    if (depth === 0) {
      const next = u32(off + 2 + n * 12);
      if (next) readIFD(next, depth + 1);
    }
  };

  try {
    readIFD(u32(4), 0);
  } catch {
    /* corrupt EXIF — skip */
  }
  return strings;
}

/* ------------------------------------------------------------------ */
/* Analyzer                                                            */
/* ------------------------------------------------------------------ */

/** Raw metadata forensics on one image buffer. */
export function analyzeImage(buffer, mimeType = "", originalName = "") {
  const signals = [];
  let score = 0;
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) {
    return { score, signals, width: 0, height: 0 };
  }

  const isPng = buffer.subarray(0, 8).equals(PNG_SIG);
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  let width = 0;
  let height = 0;
  let c2pa = false;
  const texts = [];

  if (isPng) {
    const chunks = pngChunks(buffer);
    for (const { type, data } of chunks) {
      if (type === "IHDR") {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
      } else if (type === "caBX" || type === "c2pa") {
        c2pa = true; // C2PA manifest stored as a PNG chunk
      }
    }
    texts.push(...pngTexts(chunks));
  } else if (isJpeg) {
    const j = jpegStrings(jpegSegments(buffer));
    texts.push(...j.texts);
    c2pa = j.c2pa;
    ({ width, height } = j.dims);
  } else {
    return { score, signals, width, height }; // unsupported raster format
  }

  // 1. Explicit generator signature in embedded metadata (decisive)
  for (const t of texts) {
    if (!t.value) continue;
    const m = t.value.match(GENERATOR_RE);
    if (m) {
      score += 40;
      signals.push(
        `Metadata ${t.source} references an AI image generator ("${m[0].trim()}")`,
      );
      break; // one decisive hit is enough
    }
  }

  // 2. C2PA content-credentials manifest (used by DALL·E 3, Firefly, Photoshop…)
  if (c2pa) {
    score += 20;
    signals.push(
      'Contains a C2PA "content credentials" provenance manifest (used by AI generators and Adobe tools)',
    );
  }

  // 3. Ordinary editor software — weak "tampered/edited" hint only
  for (const t of texts) {
    const m = (t.value || "").match(EDITOR_RE);
    if (m) {
      score += 5;
      signals.push(
        `Edited with "${m[0].trim()}" according to embedded metadata`,
      );
      break;
    }
  }

  // 4. Default generator resolution
  const dims = `${width}x${height}`;
  if (GEN_SIZES.has(dims)) {
    score += 10;
    signals.push(
      `Image is exactly ${dims} — a default output size of common AI generators`,
    );
  }

  // 5. File-name hint
  const fm = String(originalName || "").match(AI_FILENAME_RE);
  if (fm) {
    score += 25;
    signals.push(`File name suggests AI generation ("${fm[0]}")`);
  }

  return { score: Math.min(score, 100), signals, width, height };
}

/* ------------------------------------------------------------------ */
/* Combine forensics + Gemini's visual assessment                      */
/* ------------------------------------------------------------------ */

/**
 * Build the Document.authenticity sub-document.
 * Returns null for file types we cannot assess (plain text).
 *
 * @param {Buffer|null} buffer      raw upload bytes
 * @param {string} mimeType
 * @param {string} originalName
 * @param {{assessment:string, confidence:number, reasons:string[]}|null} geminiAssessment
 */
export function combineAuthenticity(
  buffer,
  mimeType,
  originalName,
  geminiAssessment,
) {
  const isRaster =
    /^image\/(png|jpe?g|webp|bmp|tiff?)/i.test(mimeType || "") ||
    /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(originalName || "");
  const isPdf =
    /^application\/pdf$/i.test(mimeType || "") ||
    /\.pdf$/i.test(originalName || "");
  if (!isRaster && !isPdf) return null; // plain text — nothing to inspect visually

  const reasons = [];
  let score = 0;

  if (isRaster) {
    const f = analyzeImage(buffer, mimeType, originalName);
    score = f.score;
    reasons.push(...f.signals);
  }

  const gem =
    geminiAssessment &&
    ["authentic_scan", "likely_ai_generated", "unclear"].includes(
      geminiAssessment.assessment,
    )
      ? geminiAssessment
      : null;

  if (gem?.assessment === "likely_ai_generated") {
    score = Math.max(score, Math.max(0, Math.min(100, gem.confidence || 60)));
    reasons.push(
      `Gemini visual inspection: likely AI-generated — ${(gem.reasons || []).join("; ") || "visual artifacts consistent with AI generation"}`,
    );
  } else if (gem?.assessment === "unclear") {
    reasons.push(
      "Gemini visual inspection could not conclusively classify this image",
    );
  } else if (gem?.assessment === "authentic_scan") {
    reasons.push(
      "Gemini visual inspection: consistent with a genuine scan/photograph of a paper document",
    );
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict =
    score >= 45
      ? "ai_generated"
      : score >= 20
        ? "suspicious"
        : "likely_authentic";

  return {
    verdict,
    score,
    geminiAssessment: gem?.assessment || "",
    geminiConfidence: gem?.confidence || 0,
    reasons,
    assessedAt: new Date(),
  };
}
