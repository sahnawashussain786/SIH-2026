/**
 * Heuristic field extraction from OCR text — mirrors what the Python
 * microservice does with its rule-based extractor. Handles the common
 * "Label: value" patterns of khatian / khasra / patta documents in
 * English, transliterated Hindi/Bengali AND the major native Indic
 * scripts (Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil,
 * Telugu, Kannada, Malayalam, Urdu). Gemini handles the long tail;
 * these patterns keep the fallback path useful India-wide.
 */

const LABELS = {
  ownerName: [
    /name\s+of\s+(the\s+)?tenant[:\-]?\s*(.+)/i,
    /owner(?:'s)?\s*name[:\-]?\s*(.+)/i,
    /(?:name\s+of\s+)?(?:khatedar|pattdar|pattadar|raiyyat|ryot)[:\-]?\s*(.+)/i,
    /malik\s*(?:ka\s*)?naam[:\-]?\s*(.+)/i,
    /(?:खातेदार|रैयत|खस्रेदार)(?:\s*का\s*नाम)?\s*[:\-]?\s*(.+)/,
    /मालिक\s*(?:का\s*)?नाम[:\-]?\s*(.+)/,
    /(?:দাবিদার|মালিক|রৈয়ত|খতিয়ানকারী)(?:ের)?\s*(?:নাম)?\s*[:\-]?\s*(.+)/,
    /ਮਾਲਕ(?:\s*ਦਾ)?\s*(?:ਨਾਮ)?\s*[:\-]?\s*(.+)/,
    /માલિક(?:નું)?\s*(?:નામ)?\s*[:\-]?\s*(.+)/,
    /ମାଲିକ(?:ର)?\s*(?:ନାମ)?\s*[:\-]?\s*(.+)/,
    /(?:உரிமையாளர்|குதிரையாளர்)(?:\s*பெயர்)?\s*[:\-]?\s*(.+)/,
    /(?:యజమాని|కౌలుదారు|ఖతేదార్)(?:\s*పేరు)?\s*[:\-]?\s*(.+)/,
    /(?:ಸ್ವಾಮ್ಯದಾರ|ಮಾಲೀಕ)(?:\s*ಹೆಸರು)?\s*[:\-]?\s*(.+)/,
    /(?:ഉടമസ്ഥൻ|കുടിയാൻ)(?:\s*പേര്)?\s*[:\-]?\s*(.+)/,
    /مالک(?:\s*کا\s*نام)?\s*[:\-]?\s*(.+)/,
    /(?:full\s+)?name[:\-]\s*(.+)/i,
  ],
  fatherName: [
    /father(?:'s)?\s*name[:\-]?\s*(.+)/i,
    /s\/o[:\-]?\s*(.+)/i,
    /pitra?\s*(?:ka\s*)?naam[:\-]?\s*(.+)/i,
    /(?:पिता|पिताश्री|वडील)[:\-]?\s*(?:का\s*)?नाम[:\-]?\s*(.+)/,
    /পিতা(?:র)?\s*(?:নাম)?\s*[:\-]?\s*(.+)/,
    /ਪਿਤਾ\s*ਦਾ\s*ਨਾਮ[:\-]?\s*(.+)/,
    /પિતાનું\s*નામ[:\-]?\s*(.+)/,
    /ପିତାଙ\u200dକ\s*ନାମ[:\-]?\s*(.+)/,
    /தந\u200dதை\s*பெயர்[:\-]?\s*(.+)/,
    /తండ్రి\s*పేరు[:\-]?\s*(.+)/,
    /ತಂದೆಯ\s*ಹೆಸರು[:\-]?\s*(.+)/,
    /അച\u200dഛന\u200dറെ\s*പേര്[:\-]?\s*(.+)/,
    /والد\s*کا\s*نام[:\-]?\s*(.+)/,
  ],
  khatianNumber: [
    /khatian\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9]{1,6})/i,
    /khata\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9]{1,6})/i,
    /khatiyan\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9]{1,6})/i,
    /(?:खाता|खतियान|खसरा|खातियन)\s*(?:नं\.?|नंबर|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /(?:খতিয়ান|খাতা|দাগ)\s*(?:নং|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /ਖਾਤਾ\s*(?:ਨੰ\.?|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /ખાતા\s*(?:નં|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /கதா\s*(?:எண்|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /ఖాతా\s*(?:నం|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /ಖಾತಾ\s*(?:ಸಂ\.?|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /ഖാതാ\s*(?:നം|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /(?:کھاتہ|کھاتا|پٹہ)\s*(?:نمبر|#)?\s*[:\-]?\s*([0-9]{1,6})/,
  ],
  plotNumber: [
    /plot\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9]{1,6})/i,
    /dag\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9]{1,6})/i,
    /(?:गाटा|गट|प्लॉट|दाग)\s*(?:नं\.?|नंबर|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /দাগ\s*(?:নং|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /(?:ਪਲਾਟ|ਗਟ)\s*(?:ਨੰ|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /ప్లాట్\s*(?:నం|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /ಪ್ಲಾಟ್\s*(?:ಸಂ|#)?\s*[:\-]?\s*([0-9]{1,6})/,
    /പ്ലോട്ട്\s*(?:നം|#)?\s*[:\-]?\s*([0-9]{1,6})/,
  ],
  surveyNumber: [
    /survey\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9a-z\-\/]{1,12})/i,
    /khasra\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9a-z\-\/]{1,12})/i,
    /(?:खसरा|सर्वे)\s*(?:नं\.?|नंबर|#)?\s*[:\-]?\s*([0-9a-z\-\/]{1,12})/,
    /(?:সর্বেক্ষণ|জরিপ)\s*(?:নং|#)?\s*[:\-]?\s*([0-9a-z\-\/]{1,12})/,
    /సర్వే\s*(?:నం|#)?\s*[:\-]?\s*([0-9a-z\-\/]{1,12})/,
    /ಸರ್ವೇ\s*(?:ಸಂ|#)?\s*[:\-]?\s*([0-9a-z\-\/]{1,12})/,
    /സർവേ\s*(?:നം|#)?\s*[:\-]?\s*([0-9a-z\-\/]{1,12})/,
    /சர்வே\s*(?:எண்|#)?\s*[:\-]?\s*([0-9a-z\-\/]{1,12})/,
  ],
  area: [
    /area[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(acre|hectare|hect|bigha|katha|decimal|sq\.?\s*yards?|sq\.?\s*feet?|guntha|cent)?/i,
    /rageba[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(acre|hectare|bigha|katha|decimal|guntha)?/i,
    /(?:रकबा|रक्बा|क्षेत्रफल)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(एकड़|हेक्टेयर|बीघा|कठ्ठा|शतांश)?/,
    /(?:রকবা|এরিয়া)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(একর|হেক্টর|বিঘা|কাঠা)?/,
    /(?:பரப்பு|ஏக்கர்)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/,
    /(?:విస్తీర్ణం|ఎకరాలు)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/,
    /(?:ವಿಸ್ತೀರ್ಣ|ಎಕರೆ)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/,
    /(?:വിസ്തീര്\u200dണ്ണം|ഏക്കര്\u200d)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/,
    /ਰਕਬਾ\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/,
    /વિસ્તાર\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/,
    /କ୍ଷେତ୍ରଫଳ\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/,
  ],
  village: [
    /village[:\-]?\s*(.+)/i,
    /mouza[:\-]?\s*(.+)/i,
    /(?:gaon|gram|gao)[:\-]?\s*(.+)/i,
    /(?:ग्राम|गाँव|गांव|मौजा)[:\-]?\s*(.+)/,
    /(?:গ্রাম|মৌজা)[:\-]?\s*(.+)/,
    /ਪਿੰਡ[:\-]?\s*(.+)/,
    /ગામ[:\-]?\s*(.+)/,
    /ଗାଁ[:\-]?\s*(.+)/,
    /(?:கிராமம்|ஊர்)[:\-]?\s*(.+)/,
    /గ్రామం[:\-]?\s*(.+)/,
    /(?:ಗ್ರಾಮ|ಹಳ್ಳಿ)[:\-]?\s*(.+)/,
    /(?:ഗ്രാമം|ദേശം)[:\-]?\s*(.+)/,
    /(?:گاؤں|گام|موضع)[:\-]?\s*(.+)/,
  ],
  tehsil: [
    /tehsil[:\-]?\s*(.+)/i,
    /tahsil[:\-]?\s*(.+)/i,
    /(?:block|mandal|circle|taluk|taluka)[:\-]?\s*(.+)/i,
    /(?:तहसील|तेहसील|मंडल|प्रखंड)[:\-]?\s*(.+)/,
    /(?:সার্কেল|থানা|ব্লক)[:\-]?\s*(.+)/,
    /ਤਹਿਸੀਲ[:\-]?\s*(.+)/,
    /તહસીલ[:\-]?\s*(.+)/,
    /ତହସିଲ[:\-]?\s*(.+)/,
    /(?:வட்டம்|தாலுகா)[:\-]?\s*(.+)/,
    /(?:మండలం|తహసీల్)[:\-]?\s*(.+)/,
    /(?:ಹೋಬಳಿ|ತಾಲೂಕು)[:\-]?\s*(.+)/,
    /(?:താലൂക്ക്|വില്ലേജ്)[:\-]?\s*(.+)/,
    /(?:تحصیل|تعلقہ)[:\-]?\s*(.+)/,
  ],
  district: [
    /district[:\-]?\s*(.+)/i,
    /(?:zilla|zila|jila)[:\-]?\s*(.+)/i,
    /(?:जिला|जिल्हा)[:\-]?\s*(.+)/,
    /জেলা[:\-]?\s*(.+)/,
    /ਜ਼ਿਲ\u200dਹਾ[:\-]?\s*(.+)/,
    /જિલ\u200dલો[:\-]?\s*(.+)/,
    /ଜିଲ\u200dଲା[:\-]?\s*(.+)/,
    /மாவட்டம்[:\-]?\s*(.+)/,
    /జిల\u200dలా[:\-]?\s*(.+)/,
    /ಜಿಲ\u200dಲೆ[:\-]?\s*(.+)/,
    /ജില\u200dല[:\-]?\s*(.+)/,
    /(?:ضلع|ضلعہ)[:\-]?\s*(.+)/,
  ],
  state: [
    /state[:\-]?\s*(.+)/i,
    /prant[:\-]?\s*(.+)/i,
    /(?:राज्य|प्रांत)[:\-]?\s*(.+)/,
    /রাজ\u200dয[:\-]?\s*(.+)/,
    /ਸੂਬਾ[:\-]?\s*(.+)/,
    /રાજ\u200dય[:\-]?\s*(.+)/,
    /ରାଜ\u200dୟ[:\-]?\s*(.+)/,
    /மாநிலம்[:\-]?\s*(.+)/,
    /రాష\u200dట\u200dరం[:\-]?\s*(.+)/,
    /ರಾಜ\u200dಯ[:\-]?\s*(.+)/,
    /സംസ\u200dഥാനം[:\-]?\s*(.+)/,
    /صوبہ[:\-]?\s*(.+)/,
  ],
  landType: [
    /land\s*type[:\-]?\s*(.+)/i,
    /nature\s*of\s*land[:\-]?\s*(.+)/i,
    /class\s*of\s*land[:\-]?\s*(.+)/i,
    /zameen\s*ka\s*prakar[:\-]?\s*(.+)/i,
    /(?:भूमि|जमीन|ज़मीन)\s*(?:का|की)?\s*प्रकार[:\-]?\s*(.+)/,
    /জমির\s*ধরন[:\-]?\s*(.+)/,
    /நில\s*வகை[:\-]?\s*(.+)/,
    /భూమి\s*రకం[:\-]?\s*(.+)/,
    /ಭೂಮಿಯ\s*ವಿಧ[:\-]?\s*(.+)/,
    /ഭൂമിയുടെ\s*തരം[:\-]?\s*(.+)/,
  ],
  mutationDetails: [
    /mutation[:\-]?\s*(.+)/i,
    /namantari?[:\-]?\s*(.+)/i,
    /(?:नामांतरण|नामान्तरण|नामांतरित)[:\-]?\s*(.+)/,
    /নামজারি[:\-]?\s*(.+)/,
    /నామాంతరం[:\-]?\s*(.+)/,
    /ಹಕ\u200dಕು\s*ಬದಲಾವಣೆ[:\-]?\s*(.+)/,
    /പേര\u200dമാറ\u200dറം[:\-]?\s*(.+)/,
  ],
};

const AREA_UNITS = ['acre', 'hectare', 'bigha', 'katha', 'decimal', 'guntha', 'cent', 'sq yards', 'sq feet', 'एकड़', 'हेक्टेयर', 'বিঘা', 'কাঠা', 'ஏக்கர்', 'ఎకరం', 'ಎಕರೆ', 'ഏക്കർ'];

/** Map script-name → probable language code(s), used to report document language. */
const SCRIPT_LANGS = {
  Devanagari: ['hi', 'mr'],
  Bengali: ['bn', 'as'],
  Gurmukhi: ['pa'],
  Gujarati: ['gu'],
  Odia: ['or'],
  Tamil: ['ta'],
  Telugu: ['te'],
  Kannada: ['kn'],
  Malayalam: ['ml'],
  Arabic: ['ur'],
};

const LANGUAGE_NAMES = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', bn: 'Bengali', as: 'Assamese',
  gu: 'Gujarati', pa: 'Punjabi', or: 'Odia', ta: 'Tamil', te: 'Telugu',
  kn: 'Kannada', ml: 'Malayalam', ur: 'Urdu', sa: 'Sanskrit', ne: 'Nepali',
  mai: 'Maithili', kok: 'Konkani', doi: 'Dogri', ks: 'Kashmiri', sd: 'Sindhi',
  mni: 'Manipuri', bodo: 'Bodo', santali: 'Santali',
};

const SCRIPT_RANGES = [
  ['Devanagari', 0x0900, 0x097f], ['Bengali', 0x0980, 0x09ff],
  ['Gurmukhi', 0x0a00, 0x0a7f], ['Gujarati', 0x0a80, 0x0aff],
  ['Odia', 0x0b00, 0x0b7f], ['Tamil', 0x0b80, 0x0bff],
  ['Telugu', 0x0c00, 0x0c7f], ['Kannada', 0x0c80, 0x0cff],
  ['Malayalam', 0x0d00, 0x0d7f], ['Arabic', 0x0600, 0x06ff],
];

/** Convert Indic/Arabic-Indic digits to ASCII so number patterns always match. */
function normalizeIndicDigits(text) {
  return text
    .replace(/[\u0966-\u096f]/g, (d) => String(d.charCodeAt(0) - 0x0966)) // Devanagari ०-९
    .replace(/[\u09e6-\u09ef]/g, (d) => String(d.charCodeAt(0) - 0x09e6)) // Bengali ০-৯
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic ٠-٩
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)); // Extended ۰-۹
}

/** Scripts present in the text (ordered by letter share) — for language reporting. */
export function detectScripts(text) {
  if (!text) return [];
  const counts = {};
  let letters = 0;
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    letters += 1;
    const cp = ch.codePointAt(0);
    for (const [script, lo, hi] of SCRIPT_RANGES) {
      if (cp >= lo && cp <= hi) {
        counts[script] = (counts[script] || 0) + 1;
        break;
      }
    }
  }
  if (letters < 6) return [];
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n / letters >= 0.08)
    .map(([s]) => s);
}

/** Probable Indian language codes for a piece of text. */
export function detectLanguages(text) {
  const langs = [];
  for (const script of detectScripts(text)) {
    for (const code of SCRIPT_LANGS[script] || []) {
      if (!langs.includes(code)) langs.push(code);
    }
  }
  if (!langs.length && /[a-z]/i.test(text || '')) langs.push('en');
  return langs;
}

export function languageNames(codes) {
  return (codes || []).map((c) => LANGUAGE_NAMES[c] || c);
}

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

export function extractFieldsFromText(rawText) {
  const text = normalizeIndicDigits(String(rawText || ''));
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
