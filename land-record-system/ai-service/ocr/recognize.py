"""OCR + handwriting recognition using Tesseract with automatic fallbacks.

Language handling:
- `langs="auto"` (default): detects the writing script via Tesseract's
  orientation-and-script detection (OSD) and selects matching language packs.
  Falls back to Unicode-block analysis on the OCR text itself when OSD is
  unavailable. Covers every scheduled Indian language whose script is
  Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada,
  Malayalam, Arabic or Latin.
"""

from __future__ import annotations

import io
import os
import shutil

import pytesseract
from PIL import Image

try:
    from langdetect import detect_langs, LangDetectException

    LANGDETECT_OK = True
except ImportError:  # pragma: no cover
    LANGDETECT_OK = False

from languages import INDIAN_LANGUAGES, TESSERACT_PACKS, script_report

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass


_WIN_TESSERACT_PATHS = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
)


def _resolve_tesseract() -> str | None:
    cmd = os.getenv("TESSERACT_CMD", "").strip()
    if cmd:
        return cmd
    found = shutil.which("tesseract")
    if found:
        return found
    # Fresh winget/UB-Mannheim installs aren't on PATH until a new shell —
    # probe the standard Windows locations so no manual setup is needed.
    for p in _WIN_TESSERACT_PATHS:
        if os.path.isfile(p):
            return p
    return None


# Language packs shipped with the project (ai-service/tessdata/) — Indic
# traineddata the installer doesn't include. Used when present so the
# service is self-contained; falls back to the system tessdata otherwise.
_PROJECT_TESSDATA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tessdata"
)


def _resolve_tessdata() -> str:
    """Return the tessdata dir to use, or '' for the system default.

    Honours an explicit TESSDATA_DIR override from .env, else uses the
    project-local pack folder when it looks complete (has eng.traineddata).
    """
    explicit = os.getenv("TESSDATA_DIR", "").strip()
    if explicit and os.path.isfile(os.path.join(explicit, "eng.traineddata")):
        return explicit
    if os.path.isfile(os.path.join(_PROJECT_TESSDATA, "eng.traineddata")):
        return _PROJECT_TESSDATA
    return ""


TESSERACT_AVAILABLE = _resolve_tesseract() is not None
if TESSERACT_AVAILABLE:
    pytesseract.pytesseract.tesseract_cmd = _resolve_tesseract()
_TESSDATA_DIR = _resolve_tessdata()
if _TESSDATA_DIR:
    os.environ["TESSDATA_PREFIX"] = _TESSDATA_DIR

try:
    _langs = set(pytesseract.get_languages(config="")) if TESSERACT_AVAILABLE else set()
except Exception:  # pragma: no cover
    _langs = set()


def available_languages() -> set[str]:
    return _langs


def detect_language(text: str) -> list[str]:
    """Return probable languages of text.

    Unicode-block analysis handles every Indic script deterministically;
    langdetect refines Latin-script text (and is the fallback when the
    langdetect package is available but text is transliterated).
    """
    if not text or len(text.strip()) < 12:
        return []

    scripts = script_report(text)
    if scripts["languages"]:
        return scripts["languages"]

    if LANGDETECT_OK:
        try:
            return [l.lang for l in detect_langs(text) if l.prob > 0.2][:3]
        except LangDetectException:
            return []
    return []


def _pick_ocr_langs(img, requested: str) -> tuple[str, list[str]]:
    """Resolve the Tesseract `lang=` string for this image.

    Returns (lang_string, notes) where notes explain the choice.
    """
    notes: list[str] = []
    avail = available_languages()
    if not avail:
        return "eng", notes

    if requested and requested != "auto":
        want = [l for l in requested.replace(" ", "").split("+") if l]
        usable = [l for l in want if l in avail]
        if usable:
            return "+".join(usable), notes
        notes.append(f"Requested OCR language(s) {requested} not installed — using auto detection.")
        requested = "auto"

    # auto: OSD first, then Unicode-block analysis on a quick OCR pass
    script_name = _osd_script_from_image(img)
    packs: list[str] = []
    if script_name:
        packs = _packs_for_osd_script(script_name)
        notes.append(f"OSD script: {script_name}")
    if not packs:
        quick = _quick_text(img)
        if quick:
            scripts = script_report(quick)
            for s in scripts["scripts"]:
                for p in TESSERACT_PACKS.get(s, "").split("+"):
                    if p and p not in packs:
                        packs.append(p)
            if scripts["scripts"]:
                notes.append(f"Script analysis: {', '.join(scripts['scripts'])}")
    usable = [p for p in packs if p in avail]
    if not usable or set(usable) <= {"eng"}:
        # Script detection is unreliable on small/synthetic pages (OSD needs
        # ~300px of text). Widen to the most common scripts in Indian land
        # records — Tesseract scores packs per word, so extra packs cost a
        # little speed but stop Latin-only misreads of Devanagari pages.
        broad = [l for l in ("eng", "hin", "ben") if l in avail]
        usable = broad + [p for p in usable if p not in broad]
    return "+".join(usable) or "eng", notes


def _osd_script_from_image(img):
    try:
        osd = pytesseract.image_to_osd(img, output_type=pytesseract.Output.DICT)
        names = osd.get("script_name") or []
        return names[0] if names else None
    except Exception:
        return None


_OSD_TO_PACK_SCRIPT = {
    "Devanagari": "Devanagari",
    "Bengali": "Bengali",
    "Gurmukhi": "Gurmukhi",
    "Gujarati": "Gujarati",
    "Oriya": "Odia",
    "Odia": "Odia",
    "Tamil": "Tamil",
    "Telugu": "Telugu",
    "Kannada": "Kannada",
    "Malayalam": "Malayalam",
    "Arabic": "Arabic",
    "Latin": "Latin",
}


def _packs_for_osd_script(script_name: str) -> list[str]:
    script = _OSD_TO_PACK_SCRIPT.get(script_name)
    if not script:
        return []
    if script == "Latin":
        return ["eng"]
    return [p for p in TESSERACT_PACKS.get(script, "").split("+") if p]


def _quick_text(img) -> str:
    """Fast low-cost OCR pass used only for script detection."""
    try:
        small = img.copy()
        small.thumbnail((1200, 1200))
        return pytesseract.image_to_string(small, lang="eng") or ""
    except Exception:
        return ""


def ocr_image(
    data: bytes, langs: str = "auto"
) -> tuple[str, float, list[str]]:
    """Run Tesseract OCR. Returns (text, mean_confidence, warnings).

    `langs` may be an explicit "hin+ben" style string or "auto", which
    detects the script and picks matching installed language packs.
    """
    warnings: list[str] = []
    if not TESSERACT_AVAILABLE:
        warnings.append(
            "Tesseract binary not available — OCR skipped, using fallback extraction."
        )
        return "", 0.0, warnings

    try:
        img = Image.open(io.BytesIO(data))
    except Exception as e:
        warnings.append(f"Could not open image for OCR: {e}")
        return "", 0.0, warnings

    lang_string, pick_notes = _pick_ocr_langs(img, langs)
    warnings.extend(pick_notes)

    try:
        data_out = pytesseract.image_to_data(
            img, lang=lang_string or "eng", output_type=pytesseract.Output.DICT
        )
    except pytesseract.TesseractError as e:
        warnings.append(f"Tesseract error ({lang_string}): {e}. Retrying with default language.")
        data_out = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

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
