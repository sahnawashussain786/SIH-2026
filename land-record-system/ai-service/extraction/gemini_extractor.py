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
FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-2.5-flash"]
_ACTIVE_MODEL = GEMINI_MODEL

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
(Khatian, Khasra, Patta, Jamabandi, etc.). Read the document and extract these fields.

Return ONLY a JSON object (no markdown, no explanation) with exactly these keys:
{field_list}

Rules:
- Copy values EXACTLY as written (do not translate or normalise names).
- Omit a key (or use "") only when it is genuinely not present in the document.
- For "area", capture the numeric value only (e.g. "2.50"); put the unit in "areaUnit"
  (acre, hectare, bigha, katha, decimal, guntha, sq_yard, sq_feet).
- Preserve Indic script text as-is (Hindi/Bengali etc.), do not transliterate.
- "confidence" is your 0-100 certainty for each extracted field.
- If the document is unreadable, return an empty "confidence" object and put the reason in "notes".

Also return a top-level "notes" key (string) with anything anomalous (torn page,
stamps overlapping text, missing sections)."""


FIELDS = [
    "ownerName", "fatherName", "khatianNumber", "plotNumber", "surveyNumber",
    "area", "areaUnit", "village", "tehsil", "district", "state",
    "landType", "mutationDetails",
]

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


def _is_transient(err: Exception) -> bool:
    """DNS blips / connection resets — worth retrying with backoff."""
    msg = str(err).lower()
    return any(t in msg for t in ("getaddrinfo", "temporary failure", "connection", "timed out", "timeout"))


def _call(parts: list, temperature: float = 0.0) -> str:
    """Call Gemini with retries for transient network errors, walking a
    fallback chain if a model version has been retired.

    Google retires old model versions periodically; GEMINI_MODEL from .env is
    tried first, then well-known current models, so an old pin never hard-breaks
    the pipeline (it just logs which model actually answered).
    """
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            return _call_once(parts, temperature)
        except Exception as e:
            last_err = e
            if attempt < 2 and _is_transient(e):
                time.sleep(1.5 * (attempt + 1))  # 1.5s, 3s
                continue
            raise
    raise last_err  # type: ignore[misc]


def _call_once(parts: list, temperature: float = 0.0) -> str:
    if hasattr(_MODEL, "models"):  # new google-genai SDK
        candidates = [GEMINI_MODEL] + [m for m in FALLBACK_MODELS if m != GEMINI_MODEL]
        last_err: Exception | None = None
        for model in candidates:
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
                # only fall through on model-availability problems
                if "404" not in msg and "NOT_FOUND" not in msg and "no longer available" not in msg.lower():
                    raise
        raise last_err  # type: ignore[misc]
    # legacy google.generativeai SDK
    resp = _MODEL.generate_content(parts, generation_config={"temperature": temperature})
    globals()["_ACTIVE_MODEL"] = GEMINI_MODEL
    return resp.text or ""


def gemini_extract_image(data: bytes, suffix: str) -> tuple[dict[str, str], list[dict], float, list[str]]:
    """Send an image/PDF straight to Gemini (it does its own OCR).

    Returns (fields, field_confidences, overall_confidence, warnings).
    """
    warnings: list[str] = []
    if not gemini_available():
        return {}, [], 0.0, ["Gemini not available"]
    mime = _MIME.get(suffix, "image/png")
    try:
        raw = _call([
            {"inline_data": {"mime_type": mime, "data": _b64(data)}},
            {"text": _prompt_with_fields()},
        ])
    except Exception as e:
        return {}, [], 0.0, [f"Gemini call failed: {e}"]

    parsed = _parse_json(raw)
    fields, conf_map, notes = _split_parsed(parsed)
    if notes:
        warnings.append(f"Gemini notes: {notes}")
    if not fields:
        warnings.append("Gemini returned no fields.")
        return {}, [], 0.0, warnings

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
    return fields, field_confidences, overall, warnings


def gemini_extract_text(text: str) -> tuple[dict[str, str], list[dict], float, list[str]]:
    """Extract fields from already-OCR'd/embedded text via Gemini."""
    if not gemini_available() or not text.strip():
        return {}, [], 0.0, ["Gemini not available"]
    try:
        raw = _call([
            {"text": _prompt_with_fields() + "\n\nDOCUMENT TEXT:\n" + text[:24000]},
        ])
    except Exception as e:
        return {}, [], 0.0, [f"Gemini call failed: {e}"]

    parsed = _parse_json(raw)
    fields, conf_map, _ = _split_parsed(parsed)
    confs, field_confidences = [], []
    for f in FIELDS:
        v = (fields.get(f) or "").strip()
        if not v:
            continue
        c = float(conf_map.get(f, 80))
        confs.append(c)
        field_confidences.append({"field": f, "value": v[:120], "confidence": round(max(0, min(100, c)), 1)})
    overall = round(sum(confs) / len(confs), 1) if confs else 0.0
    return fields, field_confidences, overall, []


def _split_parsed(parsed: dict):
    fields = {k: str(parsed.get(k, "") or "") for k in FIELDS}
    conf_map = parsed.get("confidence") if isinstance(parsed.get("confidence"), dict) else {}
    notes = str(parsed.get("notes", "") or "")
    return fields, conf_map, notes


def _b64(data: bytes) -> str:
    import base64
    return base64.b64encode(data).decode("ascii")
