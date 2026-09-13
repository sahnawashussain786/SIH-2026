/**
 * Heuristic field extraction from OCR text — mirrors what the Python
 * microservice does with its rule-based extractor. Handles the common
 * "Label: value" patterns of khatian / khasra / patta documents
 * in English and transliterated Hindi/Bengali.
 */

const LABELS = {
  ownerName: [
    /name\s+of\s+(the\s+)?tenant[:\-]?\s*(.+)/i,
    /owner(?:'s)?\s*name[:\-]?\s*(.+)/i,
    /(?:name\s+of\s+)?(?:khatedar|pattdar|pattadar|raiyyat|ryot)[:\-]?\s*(.+)/i,
    /malik\s*(?:ka\s*)?naam[:\-]?\s*(.+)/i,
    /(?:full\s+)?name[:\-]\s*(.+)/i,
  ],
  fatherName: [
    /father(?:'s)?\s*name[:\-]?\s*(.+)/i,
    /s\/o[:\-]?\s*(.+)/i,
    /pitra?\s*(?:ka\s*)?naam[:\-]?\s*(.+)/i,
  ],
  khatianNumber: [
    /khatian\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9]{1,6})/i,
    /khata\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9]{1,6})/i,
    /khatiyan\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9]{1,6})/i,
  ],
  plotNumber: [
    /plot\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9]{1,6})/i,
    /dag\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9]{1,6})/i,
  ],
  surveyNumber: [
    /survey\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9a-z\-\/]{1,12})/i,
    /khasra\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9a-z\-\/]{1,12})/i,
  ],
  area: [/area[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(acre|hectare|hect|bigha|katha|decimal|sq\.?\s*yards?|sq\.?\s*feet?|guntha)?/i, /rageba[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(acre|hectare|bigha|katha|decimal|guntha)?/i],
  village: [/village[:\-]?\s*(.+)/i, /mouza[:\-]?\s*(.+)/i, /gaon[:\-]?\s*(.+)/i, /gram[:\-]?\s*(.+)/i],
  tehsil: [/tehsil[:\-]?\s*(.+)/i, /tahsil[:\-]?\s*(.+)/i, /block[:\-]?\s*(.+)/i, /thana[:\-]?\s*(.+)/i, /mandal[:\-]?\s*(.+)/i],
  district: [/district[:\-]?\s*(.+)/i, /zilla[:\-]?\s*(.+)/i, /jila[:\-]?\s*(.+)/i],
  state: [/state[:\-]?\s*(.+)/i, /prant[:\-]?\s*(.+)/i],
  landType: [/land\s*type[:\-]?\s*(.+)/i, /nature\s*of\s*land[:\-]?\s*(.+)/i, /class\s*of\s*land[:\-]?\s*(.+)/i, /zameen\s*ka\s*prakar[:\-]?\s*(.+)/i],
  mutationDetails: [/mutation[:\-]?\s*(.+)/i, /namantari?[:\-]?\s*(.+)/i],
};

const AREA_UNITS = ['acre', 'hectare', 'bigha', 'katha', 'decimal', 'guntha', 'sq yards', 'sq feet'];

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    // first non-empty capture group = the value (later groups may be units/modifiers)
    const group = [...m.slice(1)].find((g) => g !== undefined && String(g).trim() !== '');
    if (group !== undefined) return clean(group);
  }
  return '';
}

function clean(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[|;]+$/, '')
    .trim()
    .slice(0, 120);
}

export function extractFieldsFromText(text) {
  const out = {
    ownerName: '',
    fatherName: '',
    khatianNumber: '',
    plotNumber: '',
    surveyNumber: '',
    area: '',
    areaUnit: '',
    village: '',
    tehsil: '',
    district: '',
    state: '',
    landType: '',
    mutationDetails: '',
  };
  if (!text) return out;

  for (const [field, patterns] of Object.entries(LABELS)) {
    const value = firstMatch(text, patterns);
    if (value) out[field] = value;
  }

  // Area: split numeric part and unit
  if (out.area) {
    const m = out.area.match(/([0-9]+(?:\.[0-9]+)?)\s*(acre|hectare|bigha|katha|decimal|guntha|sq\.?\s*(?:yards|feet))?/i);
    if (m) {
      out.area = m[1];
      const unit = (m[2] || '').toLowerCase().replace(/\./g, '');
      if (unit) out.areaUnit = unit;
    }
  }
  if (!out.areaUnit && AREA_UNITS.some((u) => text.toLowerCase().includes(u))) {
    const found = AREA_UNITS.find((u) => text.toLowerCase().includes(u));
    out.areaUnit = found;
  }

  // Normalise trailing "Dist." style noise; strip honorific leftovers on names
  ['ownerName', 'fatherName', 'village', 'tehsil', 'district', 'state', 'landType'].forEach((k) => {
    out[k] = out[k].replace(/\s*,\s*$/, '').replace(/\b(dist\.?|district)\s*$/i, '').trim();
  });
  out.ownerName = out.ownerName.replace(/^(?:shri|smt\.?|sri|md\.?|mohd\.?)\s+/i, '').trim();

  return out;
}
