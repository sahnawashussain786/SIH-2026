# 🗂️ Intelligent Land Record Digitization & Validation System

**SIH-2026 · MERN + Python AI microservice**

A government-facing web platform that uses AI/OCR to convert old scanned or handwritten land documents into structured digital records, automatically validates the extracted information, and sends uncertain records to officials for manual verification.

```
Old Land Record → Upload PDF/Image → Pre-processing → OCR → AI Extraction
   → Structured Record → Validation & Duplicate Detection → Confidence Score
   → Human Verification → Approved Digital Record → MongoDB / LRMS / GIS
```

## Architecture

```
                 FRONTEND
              React + Tailwind
                     │
                     ▼
               Node + Express  (REST API)
                     │
        ┌────────────┼─────────────┐
        ▼            ▼             ▼
    MongoDB      File Storage   Python AI
    (Mongoose)   (Multer)       Microservice (FastAPI)
                                  │
                         ┌────────┴────────┐
                         ▼                 ▼
                  Gemini (vision/text)   Regex cross-check
                 primary extraction      + confidence scoring
```

- **client/** — React 18 + Vite + Tailwind CSS + Recharts (dashboard, upload, verification split-screen, records search, admin)
- **server/** — Node + Express + MongoDB (JWT auth, RBAC, upload, AI orchestration, validation, audit logs)
- **ai-service/** — Python FastAPI (**Google Gemini** vision/text extraction, OpenCV pre-processing, Tesseract cross-check OCR, regex fallback, validation rules)

### AI extraction engine

| Mode | Trigger | Quality |
|---|---|---|
| **Gemini vision** | `GEMINI_API_KEY` set in `ai-service/.env` → images/scanned PDFs sent straight to Gemini (free key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)) | Best — reads noisy scans & handwriting, no Tesseract needed |
| **Gemini text** | same key, text/PDF-text input | Very good — LLM field extraction |
| **Regex engine** | no key / `GEMINI_ENABLED=false` / Gemini outage | Good on printed label-style records |

Gemini and the regex extractor run **in parallel and are merged**: Gemini fills what regex misses, regex fills what Gemini misses, and fields both agree on get a confidence boost.

## Features

| Module | What it does |
|---|---|
| **1 · Digitization** | Upload → image enhancement (grayscale, deskew, denoise, adaptive threshold) → OCR → field extraction (owner, khatian, plot, survey, area, village, tehsil, district, land type, mutation) |
| **2 · Validation** | Rule validation (formats, required fields, area sanity, district plausibility), duplicate detection (approved records + other uploads), per-field + overall confidence score |
| **3 · Administration** | JWT auth with 6 roles (RBAC), user management, verification workflow, full audit trail, dashboard analytics (Recharts) |

### Confidence routing (per spec)

| Overall confidence | Route |
|---|---|
| **> 90%** | Auto-accept → saved as digital land record (flagged in audit log) |
| **70 – 90%** | Officer review queue |
| **< 70%** | Mandatory verification — must be corrected before approval |

## Quick start

### 0. Prerequisites
- Node 18+, npm
- MongoDB (local `mongod` or an Atlas URI)
- Python 3.10+ (optional but recommended — enables real OCR)
- Tesseract OCR binary ([Windows installer](https://github.com/UB-Mannheim/tesseract/wiki)) — optional; add Hindi/Bengali language packs for vernacular records

### 1. Install
```bash
npm run install:all                 # server + client + root tooling
pip install -r ai-service/requirements.txt   # AI service (optional)
```

### 2. Configure
```bash
cp server/.env.example server/.env        # set MONGO_URI, JWT_SECRET
cp ai-service/.env.example ai-service/.env  # set TESSERACT_CMD if on Windows
```

### 3. Seed demo data (users + documents + records)
```bash
npm run seed
```

### 4. Run everything
```bash
# Option A — all three services at once:
npm run dev:all

# Option B — separately:
npm run dev          # Express API (5000) + React client (5173)
npm run dev:ai       # FastAPI AI service (8001)
```

Open **http://localhost:5173**

### Demo accounts (after seeding)

| Role | Email | Password |
|---|---|---|
| Administrator | admin@lrs.gov.in | Admin@123 |
| Data Entry Officer | officer@lrs.gov.in | Officer@123 |
| Revenue Officer | reviewer@lrs.gov.in | Reviewer@123 |
| Senior Officer | senior@lrs.gov.in | Senior@123 |
| Digitization Operator | operator@lrs.gov.in | Operator@123 |
| Citizen | citizen@lrs.gov.in | Citizen@123 |

## Graceful degradation (offline demo mode)

The system works **even without** Gemini/Tesseract/Python installed:

1. **Gemini key configured** → scans/PDFs are read directly by the multimodal model — best results, no OCR install needed.
2. **Python AI service running + Tesseract installed** → full OCR pipeline with image enhancement and real recognition.
3. **Python AI service running, no Gemini/Tesseract** → text-layer extraction for PDFs/text files, warnings added, low-confidence routing.
4. **AI service unreachable** → the Node server falls back to a heuristic extractor that reads a `.txt` sidecar next to the upload (see `sample-documents/`) or synthesizes a plausible record, clearly flagged with `engine: node-fallback` and a warning in the UI.

This lets you demo the complete workflow (upload → extract → validate → verify → records → analytics) on any machine.

## API overview

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | JWT | Current user |
| POST | `/api/documents/upload` | JWT (officer roles) | Upload + run AI pipeline |
| GET | `/api/documents` | JWT | List/filter documents |
| GET | `/api/documents/:id` | JWT | Document with extraction + validation |
| DELETE | `/api/documents/:id` | JWT | Delete (owner or admin) |
| GET | `/api/verification/queue` | JWT | Confidence-routed review queue |
| PUT | `/api/verification/:id` | JWT | Save edits / approve / reject |
| GET | `/api/records` | public | Search approved land records (citizen portal) |
| PUT | `/api/records/:id` | revenue/admin | Correct an approved record |
| GET | `/api/dashboard/stats` | JWT | KPIs, state progress, confidence buckets, trend |
| GET | `/api/admin/users` | admin | User management |
| GET | `/api/admin/audit-logs` | admin | Audit trail |

AI microservice (internal): `GET /health`, `POST /api/v1/process` — authenticated with `X-API-Key`.

## Testing the pipeline quickly

```bash
npm run seed                          # demo data
npm run smoke-test                    # end-to-end API smoke test (needs server running)
```

Or manually: log in as the officer → Upload → drop `sample-documents/khatian_1245_rampur.txt` (rename to `.jpg` if you want the drag-drop preview; a real scan image works too) → watch the pipeline panel → review in Verification → approve → see it in Land Records and Dashboard analytics.

## Production notes

- Set strong `JWT_SECRET`, restrict `CLIENT_URL` CORS origin, put the API behind HTTPS.
- Swap local `uploads/` for Cloudinary/S3 (`File Storage` in the stack) — only `middleware/upload.js` and `DocumentViewer` need changes.
- For air-gapped deployments, set `GEMINI_ENABLED=false` and rely on Tesseract + regex — no data ever leaves the server.
- Deploy: client → Vercel, server + AI service → Render/Railway, DB → MongoDB Atlas.
