"""Canonical table of Indian languages the system understands.

Every scheduled Indian language + English, mapped to its writing script.
This drives:
- Script-based automatic language detection (Unicode-block analysis — works
  on OCR text and raw document text, no langdetect needed for Indic scripts).
- The Gemini prompt (tells the model which scripts it may encounter).
- Tesseract language-pack selection when OCR is used.

Gemini itself is natively multilingual, so extraction quality does not
depend on this table — the table exists so detection, reporting and the
deterministic fallback layers are language-aware too.
"""

from __future__ import annotations

import re
import unicodedata

# code → {name, native, script}
INDIAN_LANGUAGES: dict[str, dict[str, str]] = {
    "en": {"name": "English", "native": "English", "script": "Latin"},
    "hi": {"name": "Hindi", "native": "हिन्दी", "script": "Devanagari"},
    "mr": {"name": "Marathi", "native": "मराठी", "script": "Devanagari"},
    "sa": {"name": "Sanskrit", "native": "संस्कृतम्", "script": "Devanagari"},
    "kok": {"name": "Konkani", "native": "कोंकणी", "script": "Devanagari"},
    "ne": {"name": "Nepali", "native": "नेपाली", "script": "Devanagari"},
    "bn": {"name": "Bengali", "native": "বাংলা", "script": "Bengali"},
    "as": {"name": "Assamese", "native": "অসমীয়া", "script": "Bengali"},
    "mai": {"name": "Maithili", "native": "मैथिली", "script": "Devanagari"},
    "gu": {"name": "Gujarati", "native": "ગુજરાતી", "script": "Gujarati"},
    "pa": {"name": "Punjabi", "native": "ਪੰਜਾਬੀ", "script": "Gurmukhi"},
    "or": {"name": "Odia", "native": "ଓଡ଼ିଆ", "script": "Odia"},
    "ta": {"name": "Tamil", "native": "தமிழ்", "script": "Tamil"},
    "te": {"name": "Telugu", "native": "తెలుగు", "script": "Telugu"},
    "kn": {"name": "Kannada", "native": "ಕನ್ನಡ", "script": "Kannada"},
    "ml": {"name": "Malayalam", "native": "മലയാളം", "script": "Malayalam"},
    "ur": {"name": "Urdu", "native": "اردو", "script": "Arabic"},
    "ks": {"name": "Kashmiri", "native": "کٲشُر", "script": "Arabic"},
    "sd": {"name": "Sindhi", "native": "سنڌي", "script": "Arabic"},
    "doi": {"name": "Dogri", "native": "डोगरी", "script": "Devanagari"},
    "mni": {"name": "Manipuri", "native": "ꯃꯤꯇꯩꯂꯣꯟ", "script": "Meetei Mayek"},
    "bodo": {"name": "Bodo", "native": "बड़ो", "script": "Devanagari"},
    "san": {"name": "Santali", "native": "ᱥᱟᱱᱛᱟᱲᱤ", "script": "Ol Chiki"},
}

# Unicode blocks that identify a writing script. Checked in order; the first
# matching script wins. Latin alone cannot distinguish English from
# transliterated text, so it is reported as "Latin (transliterated?)".
_SCRIPT_RANGES: list[tuple[str, list[tuple[int, int]]]] = [
    ("Devanagari", [(0x0900, 0x097F)]),
    ("Bengali", [(0x0980, 0x09FF)]),
    ("Gurmukhi", [(0x0A00, 0x0A7F)]),
    ("Gujarati", [(0x0A80, 0x0AFF)]),
    ("Odia", [(0x0B00, 0x0B7F)]),
    ("Tamil", [(0x0B80, 0x0BFF)]),
    ("Telugu", [(0x0C00, 0x0C7F)]),
    ("Kannada", [(0x0C80, 0x0CFF)]),
    ("Malayalam", [(0x0D00, 0x0D7F)]),
    (
        "Arabic",
        [(0x0600, 0x06FF), (0x0750, 0x077F), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)],
    ),
    ("Meetei Mayek", [(0xAAE0, 0xAAFF)]),
    ("Ol Chiki", [(0x1C50, 0x1C7F)]),
]

_SCRIPT_TO_LANGS: dict[str, list[str]] = {}
for _code, _info in INDIAN_LANGUAGES.items():
    _SCRIPT_TO_LANGS.setdefault(_info["script"], []).append(_code)


def _is_latin_letter(ch: str) -> bool:
    name = unicodedata.name(ch, "")
    return "LATIN" in name


def detect_scripts(text: str) -> list[str]:
    """Scripts present in the text, ordered by share of letters (desc)."""
    if not text:
        return []
    counts: dict[str, int] = {}
    letters = 0
    for ch in text:
        if not ch.isalpha():
            continue
        letters += 1
        cp = ord(ch)
        for script, ranges in _SCRIPT_RANGES:
            if any(lo <= cp <= hi for lo, hi in ranges):
                counts[script] = counts.get(script, 0) + 1
                break
        else:
            if _is_latin_letter(ch):
                counts["Latin"] = counts.get("Latin", 0) + 1
    if letters < 6:  # too little signal
        return []
    ordered = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    # keep scripts covering ≥8% of letters
    return [s for s, n in ordered if n / letters >= 0.08]


def languages_for_scripts(scripts: list[str]) -> list[str]:
    """Indic language codes implied by the scripts found in a document."""
    out: list[str] = []
    for script in scripts:
        for code in _SCRIPT_TO_LANGS.get(script, []):
            if code not in out:
                out.append(code)
    return out


def script_report(text: str) -> dict:
    """Full language report for a document (scripts + probable languages)."""
    scripts = detect_scripts(text)
    codes = languages_for_scripts(scripts)
    return {
        "scripts": scripts,
        "languages": codes,
        "names": [INDIAN_LANGUAGES[c]["name"] for c in codes if c in INDIAN_LANGUAGES],
        "auto": len(scripts) > 0,
    }


# Tesseract packs usable per script (when Tesseract is actually installed).
TESSERACT_PACKS: dict[str, str] = {
    "Devanagari": "hin+mar+san+nep",
    "Bengali": "ben+asm",
    "Gurmukhi": "pan",
    "Gujarati": "guj",
    "Odia": "ori",
    "Tamil": "tam",
    "Telugu": "tel",
    "Kannada": "kan",
    "Malayalam": "mal",
    "Arabic": "urd+ara",
}


def tesseract_langs(scripts: list[str]) -> str:
    """Best-effort Tesseract `lang=` string for the scripts found."""
    packs: list[str] = []
    for s in scripts:
        for p in TESSERACT_PACKS.get(s, "").split("+"):
            if p and p not in packs:
                packs.append(p)
    packs.append("eng")
    return "+".join(packs)


_LABEL_WORD_RE = re.compile(
    r"[\w\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF"
    r"\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF"
    r"\u0D00-\u0D7F\u0600-\u06FF]+",
    re.UNICODE,
)
