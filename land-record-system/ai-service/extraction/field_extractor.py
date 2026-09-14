"""Field extraction from OCR text with per-field confidence scoring."""

from __future__ import annotations

import re

# Label patterns → canonical field. Ordered by specificity.
PATTERNS: dict[str, list[str]] = {
    "ownerName": [
        r"name\s+of\s+(?:the\s+)?tenant[:\-]?\s*(.+)",
        r"owner(?:'s)?\s*name[:\-]?\s*(.+)",
        r"name[:\-]\s*(.+)",
        r"malik\s*ka\s*naam[:\-]?\s*(.+)",
        r"khatedar[:\-]?\s*(.+)",
        r"pattdar[:\-]?\s*(.+)",
    ],
    "khatianNumber": [
        r"khatian\s*(?:no|number|#)?[:\-]?\s*([0-9]{1,6})",
        r"khata\s*(?:no|number|#)?[:\-]?\s*([0-9]{1,6})",
    ],
    "plotNumber": [
        r"plot\s*(?:no|number|#)?[:\-]?\s*([0-9]{1,6})",
        r"dag\s*(?:no|number|#)?[:\-]?\s*([0-9]{1,6})",
    ],
    "surveyNumber": [
        # value must start with a digit — otherwise "Survey No.: No" style
        # label noise matches and "No" gets stored as the survey number
        r"survey\s*(?:no|number|#)?[:\-]?\s*([0-9][0-9a-z\-\/]{0,11})",
        r"khasra\s*(?:no|number|#)?[:\-]?\s*([0-9][0-9a-z\-\/]{0,11})",
    ],
    "area": [
        r"area[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(acre|hectare|hect|bigha|katha|decimal|guntha|sq\.?\s*(?:yards?|feet?|meters?))?"
    ],
    "village": [r"village[:\-]?\s*(.+)", r"mouza[:\-]?\s*(.+)", r"gaon[:\-]?\s*(.+)"],
    "tehsil": [
        r"tehsil[:\-]?\s*(.+)",
        r"tahsil[:\-]?\s*(.+)",
        r"block[:\-]?\s*(.+)",
        r"thana[:\-]?\s*(.+)",
    ],
    "district": [r"district[:\-]?\s*(.+)", r"zilla[:\-]?\s*(.+)"],
    "state": [r"state[:\-]?\s*(.+)"],
    "landType": [
        r"land\s*type[:\-]?\s*(.+)",
        r"nature\s*of\s*land[:\-]?\s*(.+)",
        r"class\s*of\s*land[:\-]?\s*(.+)",
    ],
    "mutationDetails": [r"mutation[:\-]?\s*(.+)"],
}


# A known label repeated INSIDE a captured value means the OCR ran lines
# together ("Village: : Khasra No.: : 78/3 Tehsil: : Asansol"). The value is
# only kept up to that embedded label — or rejected outright when the value
# starts with one (meaning this line had no real value of its own).
_EMBEDDED_LABEL = re.compile(
    r"\b(?:khasra|khata|khatian|khatiyan|plot|dag|survey|tehsil|tahsil|"
    r"district|zilla|village|mouza|block|circle|area|rageba|mutation|"
    r"father|tenant)\s*(?:no\.?|number|#)?\s*[:\-–—]",
    re.IGNORECASE,
)


def _clean(value: str | None) -> str:
    if not value:
        return ""
    # Collapse whitespace, then strip stray separators (":" and friends) that
    # leak in when a document repeats the label, e.g. "Tehsil: : Asansol".
    value = re.sub(r"\s{2,}", " ", value.replace("\n", " "))
    value = re.sub(r"^\s*[:\-–—;,|]+\s*", "", value)  # leading separators
    value = re.sub(r"\s*[:\-–—;,|]+\s*$", "", value)  # trailing separators
    value = value.strip()
    m = _EMBEDDED_LABEL.search(value)
    if m:
        if m.start() == 0:
            return ""
        value = value[: m.start()].strip(" ,;|-–—")
    return value[:120]


def _first(text: str, patterns: list[str]) -> str:
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            # first non-empty capture group = the value (later groups may be units)
            val = next((g for g in m.groups() if g), "")
            v = _clean(val)
            if v:
                return v
    return ""


def extract_fields(text: str) -> dict[str, str]:
    out = {k: "" for k in PATTERNS}
    out["areaUnit"] = ""
    if not text:
        return out

    for field, patterns in PATTERNS.items():
        if field == "area":
            # special-case: capture number AND unit together
            m = re.search(patterns[0], text, re.IGNORECASE)
            if m:
                out["area"] = m.group(1)
                unit = (m.group(2) or "").lower().replace(".", "")
                if unit:
                    out["areaUnit"] = "hectare" if unit.startswith("hect") else unit
            continue
        v = _first(text, patterns)
        if v:
            out[field] = v

    # Area: split value and unit
    if out["area"]:
        m = re.search(
            r"([0-9]+(?:\.[0-9]+)?)\s*(acre|hectare|hect|bigha|katha|decimal|guntha|sq\.?\s*(?:yards?|feet?))?",
            out["area"],
            re.IGNORECASE,
        )
        if m:
            out["area"] = m.group(1)
            unit = (m.group(2) or "").lower().replace(".", "")
            if unit:
                out["areaUnit"] = "hectare" if unit.startswith("hect") else unit

    # Normalise
    for k in ("ownerName", "village", "tehsil", "district", "state", "landType"):
        out[k] = re.sub(r"\s*,\s*$", "", out[k]).strip()
    return out


def score_fields(
    extracted: dict[str, str], ocr_conf: float, text_len: int
) -> list[dict]:
    """Per-field confidence: label-match quality + OCR confidence blend."""
    result: list[dict] = []
    label_strength = {
        "ownerName": 0.94,
        "khatianNumber": 0.97,
        "plotNumber": 0.95,
        "surveyNumber": 0.92,
        "area": 0.93,
        "village": 0.86,
        "tehsil": 0.88,
        "district": 0.9,
        "state": 0.9,
        "landType": 0.85,
        "mutationDetails": 0.8,
    }
    for field, value in extracted.items():
        if not value:
            continue
        base = label_strength.get(field, 0.85)
        # blend with OCR confidence when we have it; text length nudges upward
        conf = base * 100
        if ocr_conf > 0:
            conf = (0.45 * conf) + (0.55 * ocr_conf)
        if text_len > 200:
            conf += 1.5
        result.append(
            {
                "field": field,
                "value": value,
                "confidence": round(max(0, min(100, conf)), 1),
            }
        )
    return result
