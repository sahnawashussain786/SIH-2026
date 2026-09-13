"""OCR + handwriting recognition using Tesseract with automatic fallbacks."""

from __future__ import annotations

import shutil

import pytesseract
from PIL import Image

try:
    from langdetect import detect_langs, LangDetectException

    LANGDETECT_OK = True
except ImportError:  # pragma: no cover
    LANGDETECT_OK = False


def _resolve_tesseract() -> str | None:
    import os

    cmd = os.getenv("TESSERACT_CMD", "").strip()
    if cmd:
        return cmd
    found = shutil.which("tesseract")
    return found


TESSERACT_AVAILABLE = _resolve_tesseract() is not None
if TESSERACT_AVAILABLE:
    pytesseract.pytesseract.tesseract_cmd = _resolve_tesseract()

try:
    _langs = set(pytesseract.get_languages(config="")) if TESSERACT_AVAILABLE else set()
except Exception:  # pragma: no cover
    _langs = set()


def available_languages() -> set[str]:
    return _langs


def detect_language(text: str) -> list[str]:
    """Return probable languages of OCR text."""
    if not text or len(text.strip()) < 12:
        return []
    if LANGDETECT_OK:
        try:
            return [l.lang for l in detect_langs(text) if l.prob > 0.2][:3]
        except LangDetectException:
            return []
    # crude Devanagari/Bengali unicode heuristic
    codes = set()
    for ch in text:
        cp = ord(ch)
        if 0x0900 <= cp <= 0x097F:
            codes.add("hi")
        elif 0x0980 <= cp <= 0x09FF:
            codes.add("bn")
    return list(codes)


def ocr_image(data: bytes, langs: str = "eng") -> tuple[str, float, list[str]]:
    """Run Tesseract OCR. Returns (text, mean_confidence, warnings)."""
    warnings: list[str] = []
    if not TESSERACT_AVAILABLE:
        warnings.append(
            "Tesseract binary not available — OCR skipped, using fallback extraction."
        )
        return "", 0.0, warnings

    img = Image.open(__import__("io").BytesIO(data))
    langs_avail = available_languages()
    want = [l for l in langs.split("+") if l]
    usable = [l for l in want if l in langs_avail] or (
        ["eng"] if "eng" in langs_avail else []
    )

    try:
        data_out = pytesseract.image_to_data(
            img, lang="+".join(usable) or "eng", output_type=pytesseract.Output.DICT
        )
    except pytesseract.TesseractError as e:
        warnings.append(f"Tesseract error: {e}. Retrying with default language.")
        data_out = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        usable = ["eng"]

    words: list[str] = []
    confs: list[float] = []
    n = len(data_out["text"])
    for i in range(n):
        word = data_out["text"][i].strip()
        conf = (
            float(data_out["conf"][i])
            if data_out["conf"][i] not in ("-1", "-1.0")
            else -1
        )
        if word and conf >= 0:
            words.append(word)
            confs.append(conf)

    # Rebuild line structure from line numbers
    lines: dict[tuple, list[str]] = {}
    for i in range(n):
        word = data_out["text"][i].strip()
        if not word:
            continue
        key = (
            data_out["block_num"][i],
            data_out["par_num"][i],
            data_out["line_num"][i],
        )
        lines.setdefault(key, []).append(word)
    text = "\n".join(" ".join(ws) for ws in lines.values())

    mean_conf = sum(confs) / len(confs) if confs else 0.0
    return text, mean_conf, warnings
