"""Business-rule validation and duplicate detection."""

from __future__ import annotations

import re

REQUIRED = ["ownerName", "khatianNumber", "plotNumber", "area", "village", "district"]

KNOWN_DISTRICTS = {
    "burdwan",
    "bardhaman",
    "nadia",
    "murshidabad",
    "birbhum",
    "bankura",
    "purulia",
    "hooghly",
    "howrah",
    "24 parganas",
    "muzaffarpur",
    "patna",
    "gaya",
    "darbhanga",
    "kishanganj",
    "rewa",
    "sitapur",
    "lucknow",
    "kanpur",
    "varanasi",
    "allahabad",
    "indore",
    "bhopal",
    "jabalpur",
    "ranchi",
    "rampur",
}

KNOWN_LAND_TYPES = {
    "agricultural",
    "residential",
    "commercial",
    "wasteland",
    "homestead",
    "pond",
    "orchard",
}


def run_validation(extracted: dict[str, str]) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    for f in REQUIRED:
        if not extracted.get(f, "").strip():
            errors.append(f"Missing required field: {f}")

    plot = extracted.get("plotNumber", "")
    if plot and not re.fullmatch(r"[0-9]+(?:[\/\-][0-9]+)?", plot):
        errors.append(f'Plot number "{plot}" is not in a valid format')

    khatian = extracted.get("khatianNumber", "")
    if khatian and not khatian.isdigit():
        errors.append(f'Khatian number "{khatian}" is not numeric')

    area = extracted.get("area", "")
    if area:
        try:
            a = float(area)
            if a <= 0:
                errors.append(f'Area "{area}" is not a valid positive number')
            elif a > 500:
                warnings.append(f"Area {a} seems unusually large — please verify")
        except ValueError:
            errors.append(f'Area "{area}" is not a valid number')

    district = extracted.get("district", "").lower().strip()
    if district and district not in KNOWN_DISTRICTS:
        warnings.append(
            f'District "{extracted["district"]}" is not in the known districts list — please verify'
        )

    land_type = extracted.get("landType", "").lower().strip()
    if land_type and land_type not in KNOWN_LAND_TYPES:
        warnings.append(
            f'Land type "{extracted["landType"]}" is unusual — please verify'
        )

    return {"errors": errors, "warnings": warnings}


def confidence_route(overall: float, validation: dict[str, list[str]]) -> str:
    """>90 auto-accept, 70–90 manual review, <70 mandatory verification."""
    if validation["errors"]:
        return "mandatory_verification"
    if overall >= 90:
        return "auto_accept"
    if overall >= 70:
        return "manual_review"
    return "mandatory_verification"
