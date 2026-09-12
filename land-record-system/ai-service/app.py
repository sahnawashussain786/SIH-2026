"""FastAPI application — OCR, preprocessing, extraction, validation.

The Node server calls POST /api/v1/process with multipart file + metadata
and receives structured extraction with per-field confidence scores.
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
PORT = int(os.getenv("PORT", "8001"))

app = FastAPI(title="Land Record AI Service", version="1.0.0")

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
from preprocessing.image_clean import preprocess  # noqa: E402
from ocr.recognize import detect_language, ocr_image, TESSERACT_AVAILABLE  # noqa: E402
from extraction.field_extractor import extract_fields, score_fields  # noqa: E402
from validation.rules import run_validation, confidence_route  # noqa: E402

OCR_LANGS = os.getenv("OCR_LANGS", "eng+hin+ben")


@app.get("/health")
async def health(_key: str = Depends(require_key)):
    return {
        "ok": True,
        "service": "land-record-ai",
        "ocr": "tesseract" if TESSERACT_AVAILABLE else "unavailable (fallback mode)",
    }


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

    suffix = os.path.splitext(file.filename or "")[1].lower()
    text = ""
    ocr_conf = 0.0

    if suffix in IMAGE_SUFFIXES:
        # 1. pre-process
        try:
            data, steps = preprocess(data)
            pipeline.extend(steps)
        except Exception as e:  # corrupt image etc.
            warnings.append(f"Preprocessing skipped: {e}")

        # 2. OCR
        langs = OCR_LANGS if language == "auto" else language
        text, ocr_conf, ocr_warnings = ocr_image(data, langs=langs)
        warnings.extend(ocr_warnings)
        pipeline.append("ocr")

    elif suffix == ".pdf":
        warnings.append("PDF: using embedded text layer if present (raster OCR for PDFs needs extra deps).")
        text = _extract_pdf_text(data)
        pipeline.append("pdf-text-layer")
    else:
        # Maybe a text file (sidecar / tests)
        try:
            text = data.decode("utf-8", errors="ignore")
            pipeline.append("plain-text")
        except Exception:
            raise HTTPException(status_code=400, detail="Unsupported file type")

    if not text.strip():
        warnings.append("No text could be extracted — treat as low confidence and verify manually.")

    # 3. language detection
    langs_detected = detect_language(text)
    pipeline.append("language-detection")

    # 4. extraction + scoring
    extracted = extract_fields(text)
    field_confidences = score_fields(extracted, ocr_conf, len(text))
    pipeline.append("field-extraction")

    # 5. validation + routing
    validation = run_validation(extracted)
    overall = (
        round(sum(f["confidence"] for f in field_confidences) / len(field_confidences), 1)
        if field_confidences
        else 0.0
    )
    route = confidence_route(overall, validation)
    pipeline.append("validation")

    return {
        "engine": "python-fastapi" + ("+tesseract" if TESSERACT_AVAILABLE else "+fallback"),
        "success": True,
        "extracted": extracted,
        "field_confidences": field_confidences,
        "overall_confidence": overall,
        "validation": {**validation, "duplicates": []},
        "ocr_text": text,
        "ai_meta": {
            "engine": "python-fastapi",
            "language": (langs_detected[0] if langs_detected else ("auto" if language == "auto" else language)),
            "languages": langs_detected,
            "documentType": document_type,
            "preprocessed": bool(pipeline),
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
