# Tesseract language data

`ocr/recognize.py` points Tesseract at this folder when it contains
`eng.traineddata` (see `TESSDATA_PREFIX` handling there), so the AI service
ships with every Indian-language OCR pack without bloating git.

If this folder is empty (fresh clone), fetch the packs (tessdata_fast, ~53 MB):

```bash
cd ai-service/tessdata
for L in eng osd hin mar san nep ben asm pan guj ori tam tel kan mal urd ara; do
  curl -fsSLO "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/$L.traineddata"
done
```

Packs: `eng` English · `osd` script detection · Devanagari `hin mar san nep` ·
Bengali `ben asm` · `pan` Punjabi · `guj` Gujarati · `ori` Odia · `tam` Tamil ·
`tel` Telugu · `kan` Kannada · `mal` Malayalam · Arabic script `urd ara`.

Gemini extraction does not need these — they power the Tesseract OCR
cross-check path when Gemini is unreachable.
