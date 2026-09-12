"""Image pre-processing: deskew, denoise, adaptive threshold, upscale.

If OpenCV is not installed, falls back to Pillow-only operations.
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter

try:
    import cv2
    CV2_OK = True
except ImportError:  # pragma: no cover
    CV2_OK = False

from common.utils import to_bytes


def preprocess(data: bytes) -> tuple[bytes, list[str]]:
    """Return (enhanced_png_bytes, list_of_steps_applied)."""
    steps: list[str] = []

    if not CV2_OK:
        img = Image.open(__import__("io").BytesIO(data)).convert("L")
        img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
        img = img.filter(ImageFilter.SHARPEN)
        steps.extend(["upscale-x2", "grayscale", "sharpen"])
        return to_bytes(img), steps

    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Unsupported or corrupt image data")

    # 1. grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    steps.append("grayscale")

    # 2. upscale small scans (helps OCR a lot)
    h, w = gray.shape
    if max(h, w) < 1600:
        scale = 2.0 if max(h, w) < 900 else 1.5
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        steps.append(f"upscale-x{scale}")

    # 3. denoise (old scans are speckled)
    gray = cv2.fastNlMeansDenoising(gray, h=10)
    steps.append("denoise")

    # 4. deskew via min-area rect of text pixels
    thr = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thr > 0))
    if coords.size and coords.shape[0] > 100:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) > 0.5 and abs(angle) < 15:
            (h2, w2) = gray.shape[:2]
            M = cv2.getRotationMatrix2D((w2 // 2, h2 // 2), angle, 1.0)
            gray = cv2.warpAffine(gray, M, (w2, h2), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            steps.append(f"deskew({angle:.1f}°)")

    # 5. adaptive threshold — evens out stained/uneven paper
    gray = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)
    steps.append("adaptive-threshold")

    ok, buf = cv2.imencode(".png", gray)
    if not ok:
        raise ValueError("PNG encoding failed")
    return buf.tobytes(), steps
