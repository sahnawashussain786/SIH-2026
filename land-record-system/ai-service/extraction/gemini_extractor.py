"""Gemini-based document understanding (OCR + field extraction).

Primary extraction brain. Gemini reads scanned images / PDFs directly
(multimodal), so no Tesseract install is needed, and it handles noisy,
skewed and handwritten records far better than plain regex over OCR text.

Set GEMINI_API_KEY in ai-service/.env to enable. Get a free key at
https://aistudio.google.com/apikey

Design:
- Strict JSON output, constrained to the known field names.
- Vision mode (image/PDF): Gemini does its own OCR + extraction.
- Text mode (plain text / PDF text layer): Gemini extracts fields from text.
- Output is ALWAYS merged with the deterministic regex extractor:
  regex wins only where Gemini found nothing, so a Gemini outage or a
  weird field can never make results worse than the old pipeline.
"""

from __future__ import annotations

import json
import os
import re
import time

from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()
# Preferred model for new keys (Sep 2026). The _call() fallback chain also tries
# well-known alternates automatically, so a retired pin never hard-breaks us.
GEMINI_MODEL = (os.getenv("GEMINI_MODEL") or "gemini-3.6-flash").strip()
# Verified-alive alternates (Sep 2026). The _call() chain retries transient
# errors per model and walks this list, so a busy or retired model never
# hard-breaks us. gemini-flash-lite is the lighter sibling — slightly lower
# quality but almost never capacity-limited.
FALLBACK_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"]
_ACTIVE_MODEL = GEMINI_MODEL
# Total wall-clock budget for one Gemini call across all retries and model
# fallbacks. Kept below the Node server's AI_TIMEOUT_MS (90s) with headroom
# for request upload/processing time.
_RETRY_BUDGET_S = 45.0

# Populated lazily so the service still boots without the SDK installed.
_genai = None
_MODEL = None
_INIT_ERROR: str | None = None


def _init():
    global _genai, _MODEL, _INIT_ERROR
    if _MODEL is not None or _INIT_ERROR is not None:
        return
    if not GEMINI_API_KEY:
        _INIT_ERROR = "GEMINI_API_KEY not set"
        return
    try:
        from google import genai  # google-genai SDK

        _genai = genai
        _MODEL = genai.Client(api_key=GEMINI_API_KEY)
    except ImportError:
        try:
            import google.generativeai as genai_legacy

            genai_legacy.configure(api_key=GEMINI_API_KEY)
            _genai = genai_legacy
            _MODEL = genai_legacy.GenerativeModel(GEMINI_MODEL)
        except ImportError:
            _INIT_ERROR = "google-genai package not installed"
    except Exception as e:  # bad key, network blocked at import, etc.
        _INIT_ERROR = str(e)


def gemini_available() -> bool:
    _init()
    return _MODEL is not None


def gemini_status() -> str:
    """Human-readable status for /health."""
    if GEMINI_API_KEY and gemini_available():
        return f"gemini ({globals().get('_ACTIVE_MODEL', GEMINI_MODEL)})"
    if GEMINI_API_KEY and _INIT_ERROR:
        return f"gemini error: {_INIT_ERROR}"
    return "gemini not configured"


PROMPT = """You are an expert digitization assistant for Indian land revenue records
(Khatian, Khasra, Patta, Jamabandi, FIR, Form-1, pahani, adangal, etc.).

MULTILINGUAL READING: the document may be in ANY Indian language and script —
Devanagari (Hindi, Marathi, Sanskrit, Konkani, Nepali, Maithili, Dogri, Bodo),
Bengali (Bengali, Assamese, Manipuri), Gurmukhi (Punjabi), Gujarati, Odia,
Tamil, Telugu, Kannada, Malayalam, Arabic script (Urdu, Kashmiri, Sindhi),
Ol Chiki (Santali), Meetei Mayek — or English, or several mixed on one page.
Read every script natively. Do NOT transliterate or translate: copy every
value EXACTLY as written, in whatever script it appears.

Labels may appear in any of these languages. Common equivalents to match on:
- owner name: खातेदार / मालिक का नाम / খতিয়ান দাবিদার / குதிரையாளர் / కౌలుదారు / ಸ್ವಾಮ್ಯದಾರ / ഉടമസ്ഥൻ / ખેતુનાર / ରାଇଯତ / ਕਬਜ਼ਾਕਾਰ / پٹادار and "Name of Tenant / Khatedar / Pattadar / Raiyat"
- father's name: पिता का नाम / পিতার নাম / தந்தை பெயர் / తండ్రి పేరు / ತಂದೆಯ ಹೆಸರು / അച്ഛന്റെ പേര് / والد کا نام and "Father's Name / S/o"
- khatian/khata: खाता / खसरा / দাগ নম্বর / கதா / ఖాతా / ಖಾತಾ / ખાતા and "Khatian No / Khata No / Khasra No / Patta No"
- village: ग्राम / मौजा / গ্রাম / মৌজা / கிராமம் / గ్రామం / ಗ್ರಾಮ / ഗ്രാമം / ગામડું / పట్టణం and "Village / Mouza"
- tehsil: तहसील / तेहसिल / সার্কেল / தாலுகா / మండలం / ಹೋಬಳಿ / താലൂക്ക് / તહસીલ and "Tehsil / Taluk / Mandal / Circle / Block"
- district: जिला / জেলা / மாவட்டம் / జిల్లా / ಜಿಲ್ಲೆ / ജില്ല / જિલ્લો / ଜିଲ୍ଲା and "District / Zilla"
- area: रकबा / क्षेत्रफल / এরিয়া / রাজস্ব / பரப்பு / విస్తీర్ణం / ವಿಸ್ತೀರ್ಣ / വിസ്തീർണ്ണം / ஏக்கர் / हेक्टेयर / বিঘা / কাঠা and "Area / Rageba / Extent"
- land type: भूमि का प्रकार / জমির ধরন / భూమి రకం / ಭೂಮಿಯ ವಿಧ and "Land Type / Nature of Land / Class of Land"
(These are hints, not an exhaustive list — match semantically, not literally.)

Return ONLY a JSON object (no markdown, no explanation) with exactly these keys:
{field_list}

Rules:
- Copy values EXACTLY as written (do not translate, transliterate or normalise names).
- Omit a key (or use "") only when it is genuinely not present in the document.
- For "area", capture the numeric value only (e.g. "2.50"); put the unit in "areaUnit"
  (acre, hectare, bigha, katha, decimal, guntha, cent, sq_yard, sq_feet — use the
  English name of whatever unit is written, incl. regional units like bigha/katha/cent).
- Numbers may be written in Indic digits (०१२३४५६७८९, ০১২৩৪৫৬৭৮৯, etc.) or
  Arabic-Indic (٠١٢٣٤٥٦٧٨٩) — convert them to ASCII digits (e.g. ०१२ → 012).
- "confidence" is your 0-100 certainty for each extracted field.
- Also return "documentLanguage": the ISO 639 code (or comma-separated codes if
  mixed, e.g. "hi,en") of the document's main language, and
  "documentScript": the script name (e.g. Devanagari, Bengali, Tamil, Latin).
- If the document is unreadable, return an empty "confidence" object and put the reason in "notes".

Also return a top-level "notes" key (string) with anything anomalous (torn page,
stamps overlapping text, missing sections)."""


FIELDS = [
    "ownerName", "fatherName", "khatianNumber", "plotNumber", "surveyNumber",
    "area", "areaUnit", "village", "tehsil", "district", "state",
    "landType", "mutationDetails",
]

_EXTRA_KEYS = ("documentLanguage", "documentScript")

_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".bmp": "image/bmp", ".tif": "image/tiff",
    ".tiff": "image/tiff", ".gif": "image/gif", ".pdf": "application/pdf",
}


def _prompt_with_fields() -> str:
    # .replace() instead of .format(): the prompt itself contains literal JSON braces
    return PROMPT.replace("{field_list}", json.dumps(FIELDS, indent=2))


def _parse_json(raw: str) -> dict:
    """Tolerant JSON extraction — models sometimes wrap in ```json fences."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {}


def _is_retryable(err: Exception) -> bool:
    """Should this error be retried? Covers network blips AND Google-side
    transient unavailability (429 rate-limit, 500, 503 'high demand').

    503 'model is currently experiencing high demand' is a *capacity* error,
    not a config error — it usually clears in seconds, so backoff + retry
    (and fall across models) rather than failing the whole upload.
    """
    msg = str(err).lower()
    network = ("getaddrinfo", "temporary failure", "connection", "timed out", "timeout")
    http_transient = ("503", "429", "500", "unavailable", "resource_exhausted",
                      "rate limit", "overloaded", "high demand", "internal error")
    return any(t in msg for t in network + http_transient)


def _call(parts: list, temperature: float = 0.0) -> str:
    """Call Gemini with retries on transient errors (network blips, 429
    rate-limits, 500/503 capacity overloads), walking a fallback chain of
    models so a busy or retired model never hard-breaks the pipeline.

    Total wall-clock time is capped (see _call_once deadline) so the Node
    server's AI timeout (AI_TIMEOUT_MS) never fires while we are still
    legitimately retrying.
    """
    return _call_once(parts, temperature, deadline=time.time() + _RETRY_BUDGET_S)


def _call_once(parts: list, temperature: float = 0.0, deadline: float | None = None) -> str:
    """Walk the model chain with limited per-model retries.

    Retry policy per model: 2 attempts with a 2s pause. Transient errors
    (503 high-demand, 429, network) retry / move to the next model; retired
    models (404) move on immediately; everything else (bad key, bad request)
    fails fast. The deadline keeps total time bounded so callers never wait
    longer than they were configured to.
    """
    if hasattr(_MODEL, "models"):  # new google-genai SDK
        candidates = [GEMINI_MODEL] + [m for m in FALLBACK_MODELS if m != GEMINI_MODEL]
        last_err: Exception | None = None
        for model in candidates:
            for attempt in range(2):
                try:
                    resp = _MODEL.models.generate_content(
                        model=model,
                        contents=[{"role": "user", "parts": parts}],
                        config={"temperature": temperature},
                    )
                    globals()["_ACTIVE_MODEL"] = model
                    return resp.text or ""
                except Exception as e:
                    last_err = e
                    msg = str(e)
                    if not _is_retryable(e):
                        if "404" in msg or "NOT_FOUND" in msg or "no longer available" in msg.lower():
                            break  # retired model — try the next one now
                        raise  # bad key / bad request — no point retrying
                    if deadline is not None and time.time() > deadline:
                        raise
                    if attempt < 1:
                        time.sleep(2)  # let the capacity spike pass
        raise last_err  # type: ignore[misc]
    # legacy google.generativeai SDK
    resp = _MODEL.generate_content(parts, generation_config={"temperature": temperature})
    globals()["_ACTIVE_MODEL"] = GEMINI_MODEL
    return resp.text or ""


def gemini_extract_image(data: bytes, suffix: str) -> tuple[dict[str, str], list[dict], float, list[str], dict]:
    """Send an image/PDF straight to Gemini (it does its own OCR).

    Returns (fields, field_confidences, overall_confidence, warnings, lang_info).
    """
    warnings: list[str] = []
    lang_info: dict = {}
    if not gemini_available():
        return {}, [], 0.0, ["Gemini not available"], lang_info
    mime = _MIME.get(suffix, "image/png")
    try:
        raw = _call([
            {"inline_data": {"mime_type": mime, "data": _b64(data)}},
            {"text": _prompt_with_fields()},
        ])
    except Exception as e:
        return {}, [], 0.0, [f"Gemini call failed: {e}"], lang_info

    parsed = _parse_json(raw)
    fields, conf_map, notes, lang_info = _split_parsed(parsed, want_lang=True)
    if lang_info.get("language"):
        warnings.append(f"documentLanguage={lang_info['language']}")
    if lang_info.get("script"):
        warnings.append(f"documentScript={lang_info['script']}")
    if notes:
        warnings.append(f"Gemini notes: {notes}")
    if not fields:
        warnings.append("Gemini returned no fields.")
        return {}, [], 0.0, warnings, lang_info

    confs = []
    field_confidences = []
    for f in FIELDS:
        v = (fields.get(f) or "").strip()
        if not v:
            continue
        c = float(conf_map.get(f, 80))
        confs.append(c)
        field_confidences.append({"field": f, "value": v[:120], "confidence": round(max(0, min(100, c)), 1)})
    overall = round(sum(confs) / len(confs), 1) if confs else 0.0
    return fields, field_confidences, overall, warnings, lang_info


def gemini_extract_text(text: str) -> tuple[dict[str, str], list[dict], float, list[str], dict]:
    """Extract fields from already-OCR'd/embedded text via Gemini.

    Returns (fields, field_confidences, overall_confidence, warnings, lang_info).
    """
    warnings: list[str] = []
    lang_info: dict = {}
    if not gemini_available() or not text.strip():
        return {}, [], 0.0, ["Gemini not available"], lang_info
    try:
        raw = _call([
            {"text": _prompt_with_fields() + "\n\nDOCUMENT TEXT:\n" + text[:24000]},
        ])
    except Exception as e:
        return {}, [], 0.0, [f"Gemini call failed: {e}"], lang_info

    parsed = _parse_json(raw)
    fields, conf_map, _, lang_info = _split_parsed(parsed, want_lang=True)
    confs, field_confidences = [], []
    for f in FIELDS:
        v = (fields.get(f) or "").strip()
        if not v:
            continue
        c = float(conf_map.get(f, 80))
        confs.append(c)
        field_confidences.append({"field": f, "value": v[:120], "confidence": round(max(0, min(100, c)), 1)})
    overall = round(sum(confs) / len(confs), 1) if confs else 0.0
    return fields, field_confidences, overall, warnings, lang_info


def _split_parsed(parsed: dict, want_lang: bool = False):
    fields = {k: str(parsed.get(k, "") or "") for k in FIELDS}
    conf_map = parsed.get("confidence") if isinstance(parsed.get("confidence"), dict) else {}
    notes = str(parsed.get("notes", "") or "")
    lang_info = {
        "language": str(parsed.get("documentLanguage", "") or "").strip().lower(),
        "script": str(parsed.get("documentScript", "") or "").strip(),
    }
    if want_lang:
        return fields, conf_map, notes, lang_info
    return fields, conf_map, notes
    fields = {k: str(parsed.get(k, "") or "") for k in FIELDS}
    conf_map = parsed.get("confidence") if isinstance(parsed.get("confidence"), dict) else {}
    notes = str(parsed.get("notes", "") or "")
    return fields, conf_map, notes


def _b64(data: bytes) -> str:
    import base64
    return base64.b64encode(data).decode("ascii")
