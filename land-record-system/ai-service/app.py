"""FastAPI application — OCR, preprocessing, extraction, validation.

The Node server calls POST /api/v1/process with multipart file + metadata
and receives structured extraction with per-field confidence scores.

Extraction order:
1. Gemini (if GEMINI_API_KEY is set) — vision mode for images/PDFs,
   text mode for plain text. Handles noisy scans & handwriting well.
2. Deterministic regex extractor — always runs as cross-check and
   fills any field Gemini missed (never overwrites a Gemini hit).
"""

from __future__ import annotations

import io
import os
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader

load_dotenv()

API_KEY = os.getenv("API_KEY", "dev-ai-key")

app = FastAPI(title="Land Record AI Service", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_key(key: str | None = Depends(_api_key_header)):
    if key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return key


# ---------------- pipeline imports ----------------
from common.utils import IMAGE_SUFFIXES  # noqa: E402
from languages import INDIAN_LANGUAGES, script_report  # noqa: E402
from preprocessing.image_clean import preprocess  # noqa: E402
from ocr.recognize import detect_language, ocr_image, TESSERACT_AVAILABLE  # noqa: E402
from extraction.field_extractor import extract_fields, score_fields  # noqa: E402
from extraction.gemini_extractor import (  # noqa: E402
    gemini_available,
    gemini_extract_image,
    gemini_extract_text,
    gemini_status,
)
from validation.rules import run_validation, confidence_route  # noqa: E402

OCR_LANGS = os.getenv("OCR_LANGS", "eng+hin+ben")
GEMINI_ENABLED = os.getenv("GEMINI_ENABLED", "true") == "true"


@app.get("/health")
async def health(_key: str = Depends(require_key)):
    return {
        "ok": True,
        "service": "land-record-ai",
        "extraction": gemini_status(),
        "ocr": "tesseract" if TESSERACT_AVAILABLE else "unavailable (fallback mode)",
    }


def _merge_extraction(
    regex_fields: dict,
    gem_fields: dict,
    gem_confs: list[dict],
    regex_scores: list[dict],
):
    """Merge Gemini and regex extractions: Gemini first, regex fills gaps.

    Returns (merged_fields, field_confidences).
    """
    merged = dict(regex_fields)
    used_gemini_for = []
    for k, v in (gem_fields or {}).items():
        v = (v or "").strip()
        if v and not merged.get(k, "").strip():
            merged[k] = v
            used_gemini_for.append(k)

    conf_by_field = {c["field"]: c["confidence"] for c in (gem_confs or [])}
    regex_conf = {c["field"]: c["confidence"] for c in (regex_scores or [])}
    field_confidences: list[dict] = []
    for k, v in merged.items():
        if not v:
            continue
        if k in used_gemini_for:
            c = conf_by_field.get(k, 80.0)
        elif k in conf_by_field:  # both agreed — bump confidence
            c = min(99.0, conf_by_field[k] + 3.0)
        else:
            c = regex_conf.get(k, 85.0)
        field_confidences.append(
            {"field": k, "value": v[:120], "confidence": round(float(c), 1)}
        )
    return merged, field_confidences


@app.post("/api/v1/process")
async def process(
    file: UploadFile = File(...),
    document_type: str = Form("Khatian"),
    language: str = Form("auto"),
    district_hint: str = Form(""),
    _key: str = Depends(require_key),
):
    started = time.time()
    data = await file.read()
    warnings: list[str] = []
    pipeline: list[str] = []
    engine_tag = "regex"

    suffix = os.path.splitext(file.filename or "")[1].lower()
    text = ""
    ocr_conf = 0.0
    steps: list[str] = []
    gem_fields: dict[str, str] = {}
    gem_confs: list[dict] = []
    gem_overall = 0.0
    gem_lang: dict = {}  # Gemini's own language/script report

    if suffix in IMAGE_SUFFIXES:
        # 0. Gemini vision path — reads the scan directly (best quality).
        # Gemini reads ALL Indian scripts natively (Devanagari, Bengali, Tamil,
        # Telugu, Kannada, Malayalam, Gujarati, Odia, Gurmukhi, Urdu, ...).
        if GEMINI_ENABLED and gemini_available():
            gem_fields, gem_confs, gem_overall, gem_warn, gem_lang = gemini_extract_image(
                data, suffix
            )
            warnings.extend(gem_warn)
            pipeline.append("gemini-vision")
            if gem_fields:
                engine_tag = "gemini-vision"
        else:
            gem_fields, gem_confs, gem_overall = {}, [], 0.0

        # Preprocess + Tesseract for the cross-check text (and as the only
        # path when Gemini is not configured).
        try:
            data_pp, steps = preprocess(data)
            pipeline.extend(steps)
        except Exception as e:  # corrupt image etc.
            data_pp, steps = data, []
            warnings.append(f"Preprocessing skipped: {e}")

        # Script-aware OCR: an explicit language choice is honoured; "auto"
        # detects the writing system and picks the right Tesseract packs.
        ocr_langs = language if language and language != "auto" else "auto"
        text, ocr_conf, ocr_warnings = ocr_image(data_pp, langs=ocr_langs)
        warnings.extend(ocr_warnings)
        if text.strip():
            pipeline.append("ocr")
        elif not gem_fields:
            warnings.append("No text could be extracted — verify manually.")

    elif suffix == ".pdf":
        text = _extract_pdf_text(data)
        pipeline.append("pdf-text-layer")
        if GEMINI_ENABLED and gemini_available() and not text.strip():
            # Scanned PDF without a text layer — let Gemini read the pages
            gem_fields, gem_confs, gem_overall, gem_warn, gem_lang = gemini_extract_image(
                data, suffix
            )
            warnings.extend(gem_warn)
            pipeline.append("gemini-vision-pdf")
            if gem_fields:
                engine_tag = "gemini-vision-pdf"
        else:
            gem_fields, gem_confs, gem_overall = {}, [], 0.0

    else:
        # Maybe a text file (sidecar / tests)
        try:
            text = data.decode("utf-8", errors="ignore")
            pipeline.append("plain-text")
        except Exception:
            raise HTTPException(status_code=400, detail="Unsupported file type")

    # Language detection — three sources, best available wins:
    #   1. Gemini's own report (it read the actual document)
    #   2. Unicode-script analysis (works for every Indic script, no extra deps)
    #   3. langdetect (statistical, helps separate Latin-script languages)
    script_info = script_report(text)
    langdetect_langs = detect_language(text) if text.strip() else []
    langs_detected: list[str] = []
    gem_lang_code = (gem_lang or {}).get("language", "").split(",")[0].strip()
    if gem_lang_code:
        langs_detected = [gem_lang_code] + [
            c for c in script_info["languages"] if c != gem_lang_code
        ]
        pipeline.append("language-detection (gemini)")
    elif script_info["scripts"]:
        langs_detected = script_info["languages"] or ["en"]
        pipeline.append("language-detection (script)")
    elif langdetect_langs:
        langs_detected = langdetect_langs
        pipeline.append("language-detection (statistical)")
    primary_lang = langs_detected[0] if langs_detected else (
        "auto" if language == "auto" else language
    )
    lang_names = [INDIAN_LANGUAGES[c]["name"] for c in langs_detected if c in INDIAN_LANGUAGES]
    if lang_names:
        warnings.append(f"Detected language: {' + '.join(lang_names)}")

    # ----- extraction -----
    if (
        suffix not in IMAGE_SUFFIXES
        and suffix != ".pdf"
        and GEMINI_ENABLED
        and gemini_available()
    ):
        # Text input: Gemini extracts from the text itself
        g_fields, g_confs, g_overall, g_warn, g_lang = gemini_extract_text(text)
        warnings.extend(g_warn)
        if g_fields:
            pipeline.append("gemini-text")
            gem_fields, gem_confs, gem_overall = g_fields, g_confs, g_overall
            gem_lang = g_lang
            engine_tag = "gemini-text"

    extracted_regex = extract_fields(text)
    regex_scores = score_fields(extracted_regex, ocr_conf, len(text))
    extracted, field_confidences = _merge_extraction(
        extracted_regex, gem_fields, gem_confs, regex_scores
    )
    pipeline.append("field-extraction")

    # district/state hints only when still unknown
    if district_hint and not extracted.get("district", "").strip():
        extracted["district"] = district_hint

    # ----- validation + routing -----
    validation = run_validation(extracted)
    overall = (
        round(
            sum(f["confidence"] for f in field_confidences) / len(field_confidences), 1
        )
        if field_confidences
        else (gem_overall if gem_overall else 0.0)
    )
    route = confidence_route(overall, validation)
    pipeline.append("validation")

    return {
        "engine": "python-fastapi+" + engine_tag,
        "success": True,
        "extracted": extracted,
        "field_confidences": field_confidences,
        "overall_confidence": overall,
        "validation": {**validation, "duplicates": []},
        "ocr_text": text,
        "ai_meta": {
            "engine": engine_tag,
            "gemini": gemini_status(),
            "language": primary_lang,
            "languageName": (
                INDIAN_LANGUAGES[primary_lang]["name"]
                if primary_lang in INDIAN_LANGUAGES
                else (gem_lang or {}).get("language", primary_lang)
            ),
            "languages": langs_detected,
            "script": (gem_lang or {}).get("script", "") or (
                script_info["scripts"][0] if script_info["scripts"] else ""
            ),
            "documentType": document_type,
            "preprocessed": bool(steps),
            "pageTexts": [text[:2000]] if text else [],
            "pipeline": pipeline,
            "warnings": warnings,
            "processingMs": int((time.time() - started) * 1000),
        },
        "route": route,
    }


def _extract_pdf_text(data: bytes) -> str:
    """Try pypdf if installed; else return empty (warnings raised upstream)."""
    try:
        import pypdf  # type: ignore

        reader = pypdf.PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""
