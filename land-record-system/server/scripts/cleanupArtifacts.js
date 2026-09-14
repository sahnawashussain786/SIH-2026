/**
 * One-time data cleanup: strip extraction artifacts that older, noisier
 * extraction runs baked into stored documents and land records.
 *
 * Fixes values like:
 *   ": Late Mohan Singh"            → "Late Mohan Singh"
 *   "Khasra No.: : 78/3 Tehsil: …"  → "" (no real value was present)
 *   "Survey No.: No" (label noise)  → ""
 *   "No" / "None" in surveyNumber   → ""
 *
 * Safe to run multiple times (idempotent). DRY RUN by default:
 *   node scripts/cleanupArtifacts.js          # show what would change
 *   node scripts/cleanupArtifacts.js --apply  # write the fixes
 *
 * Requires the server's MongoDB to be reachable (same MONGO_URI as server/.env).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Document from '../models/Document.js';
import LandRecord from '../models/LandRecord.js';

const APPLY = process.argv.includes('--apply');

// Same embedded-label rule as the extractors: a repeated label inside a value
// means the OCR ran lines together — keep only the part before it, or drop.
const EMBEDDED_LABEL =
  /\b(?:khasra|khata|khatian|khatiyan|plot|dag|survey|tehsil|tahsil|district|zilla|village|mouza|block|circle|area|rageba|mutation|father|tenant)\s*(?:no\.?|number|#)?\s*[:\-–—]/i;

const TEXT_FIELDS = [
  'ownerName', 'fatherName', 'village', 'tehsil', 'district', 'state',
  'landType', 'mutationDetails',
];
const ID_FIELDS = ['surveyNumber']; // must start with a digit to be meaningful

function cleanText(value) {
  // NOTE: no length cap here — legitimate stored values may exceed the
  // extractors' 120-char capture cap and must not be shortened.
  let v = String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[:\-–—;,|]+\s*/, '')
    .replace(/\s*[:\-–—;,|]+\s*$/, '')
    .replace(/[|;]+$/, '')
    .trim();
  const m = EMBEDDED_LABEL.exec(v);
  if (m) {
    if (m.index === 0) return '';
    v = v.slice(0, m.index).replace(/[\s,;|\-–—]+$/, '').trim();
  }
  return v;
}

function cleanId(value) {
  const v = cleanText(value);
  // Survey/khasra numbers always start with a digit; "No", "N/A", "-" are noise
  if (!v || !/^[0-9]/.test(v) || /^(?:no|none|n\/?a|null|nil)$/i.test(v)) return '';
  return v;
}

function fixExtracted(extracted = {}) {
  const updates = {};
  for (const k of TEXT_FIELDS) {
    const v = String(extracted[k] || '');
    const c = cleanText(v);
    if (c !== v) updates[k] = c;
  }
  for (const k of ID_FIELDS) {
    const v = String(extracted[k] || '');
    const c = cleanId(v);
    if (c !== v) updates[k] = c;
  }
  return updates;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/land_record_system');
  console.log(`[cleanup] connected → ${mongoose.connection.name} (${APPLY ? 'APPLY' : 'DRY RUN'})`);

  let docsFixed = 0;
  const docs = await Document.find({});
  for (const doc of docs) {
    const updates = fixExtracted(doc.extracted || {});
    if (!Object.keys(updates).length) continue;
    docsFixed += 1;
    console.log(`\n[document] ${doc.originalName || doc._id}`);
    for (const [k, v] of Object.entries(updates)) {
      console.log(`   ${k}: ${JSON.stringify(doc.extracted[k])} → ${JSON.stringify(v)}`);
    }
    if (APPLY) {
      Object.assign(doc.extracted, updates);
      await doc.save();
    }
  }

  let recsFixed = 0;
  const records = await LandRecord.find({});
  for (const rec of records) {
    const updates = fixExtracted(rec);
    if (!Object.keys(updates).length) continue;
    recsFixed += 1;
    console.log(`\n[record] ${rec.ownerName || rec._id}`);
    for (const [k, v] of Object.entries(updates)) {
      console.log(`   ${k}: ${JSON.stringify(rec[k])} → ${JSON.stringify(v)}`);
    }
    if (APPLY) {
      Object.assign(rec, updates);
      await rec.save();
    }
  }

  console.log(`\n[cleanup] ${docsFixed} document(s), ${recsFixed} record(s) ${APPLY ? 'fixed' : 'would be fixed'}.`);
  await mongoose.disconnect();
  if (!APPLY) console.log('[cleanup] dry run only — re-run with --apply to write changes.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[cleanup] failed:', err.message);
  process.exit(1);
});
