import LandRecord from '../models/LandRecord.js';

const VALID_DISTRICTS = new Set([
  'burdwan', 'bardhaman', 'nadia', 'murshidabad', 'birbhum', 'bankura', 'purulia',
  'muzaffarpur', 'patna', 'gaya', 'rewa', 'sitapur', 'lucknow', 'kanpur',
  'indore', 'bhopal', 'jabalpur', 'hooghly', 'howrah', '24 parganas', 'nadia',
  'kishanganj', 'darbhanga', 'ranchi', 'rampur', 'varanasi', 'allahabad',
]);

const REQUIRED = ['ownerName', 'khatianNumber', 'plotNumber', 'area', 'village', 'district'];

/** Rule-based validation of extracted fields. Returns {errors, warnings}. */
export function runValidation(extracted, _duplicates = []) {
  const errors = [];
  const warnings = [];

  // Required fields
  for (const field of REQUIRED) {
    if (!extracted[field] || String(extracted[field]).trim() === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Plot / khatian numeric format
  if (extracted.plotNumber && !/^[0-9]+([\/\-][0-9]+)?$/.test(String(extracted.plotNumber))) {
    errors.push(`Plot number "${extracted.plotNumber}" is not in a valid format`);
  }
  if (extracted.khatianNumber && !/^[0-9]+$/.test(String(extracted.khatianNumber))) {
    errors.push(`Khatian number "${extracted.khatianNumber}" is not numeric`);
  }

  // Area sanity
  const areaNum = parseFloat(extracted.area);
  if (extracted.area && (Number.isNaN(areaNum) || areaNum <= 0)) {
    errors.push(`Area "${extracted.area}" is not a valid positive number`);
  } else if (areaNum > 500) {
    warnings.push(`Area ${areaNum} seems unusually large — please verify`);
  }

  // District plausibility
  if (extracted.district && !VALID_DISTRICTS.has(String(extracted.district).toLowerCase().trim())) {
    warnings.push(`District "${extracted.district}" is not in the known districts list — please verify`);
  }

  return { errors, warnings };
}

/** Confidence routing per the spec: >90 auto-accept, 70–90 review, <70 mandatory verification. */
export function confidenceRoute(overallConfidence, validation) {
  if (validation.errors.length > 0) return 'manual_review';
  if (overallConfidence >= 90) return 'auto_accept';
  if (overallConfidence >= 70) return 'manual_review';
  return 'mandatory_verification';
}

/**
 * Duplicate detection: exact parcel match on (khatian, plot, village, district),
 * fuzzy owner match on the same parcel. Runs against LandRecord + pending Documents.
 */
export async function findDuplicates(extracted, excludeDocumentId = null) {
  const duplicates = [];
  const { khatianNumber, plotNumber, village, district, ownerName } = extracted;

  if (!khatianNumber || !plotNumber) return duplicates;

  // Against approved records
  const recordQuery = {
    khatianNumber: String(khatianNumber),
    plotNumber: String(plotNumber),
  };
  if (village) recordQuery.village = new RegExp(`^${escapeRegex(village)}$`, 'i');
  if (district) recordQuery.district = new RegExp(`^${escapeRegex(district)}$`, 'i');

  const records = await LandRecord.find(recordQuery).limit(5).lean();
  for (const r of records) {
    const sameOwner = ownerName && r.ownerName && similarity(ownerName, r.ownerName) > 0.8;
    duplicates.push({
      recordId: r._id,
      documentId: null,
      reason: sameOwner
        ? 'Exact parcel match (khatian + plot + village) with same owner in approved records'
        : 'Parcel match (khatian + plot + village) in approved records — owner differs',
      score: Math.round((sameOwner ? 0.95 : 0.8) * 100),
    });
  }

  // Against other unverified documents (cross-upload duplicates)
  const Document = (await import('../models/Document.js')).default;
  const docQuery = {
    status: { $in: ['processed', 'verified'] },
    'extracted.khatianNumber': String(khatianNumber),
    'extracted.plotNumber': String(plotNumber),
  };
  if (excludeDocumentId) docQuery._id = { $ne: excludeDocumentId };
  const docs = await Document.find(docQuery).limit(5).lean();
  for (const d of docs) {
    duplicates.push({
      recordId: null,
      documentId: d._id,
      reason: 'Same parcel found in another uploaded document pending review',
      score: 75,
    });
  }

  return duplicates;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Very small string similarity (Jaccard over character bigrams) */
export function similarity(a, b) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const A = norm(a); const B = norm(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const grams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(A); const gb = grams(B);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / Math.max(ga.size + gb.size - inter, 1);
}
