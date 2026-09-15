# Deploying BHOOMI-AI to Vercel

## ✅ LIVE DEPLOYMENT (deployed Sep 15, 2026 via Vercel CLI)

| What | URL |
|---|---|
| **Website** | https://bhoomi-ai.vercel.app |
| **API** | https://bhoomi-ai-api.vercel.app/api |
| Health check | https://bhoomi-ai-api.vercel.app/api/health |
| Login | `officer@lrs.gov.in` / `Officer@123` |

- Vercel projects: `bhoomi-ai` (client) and `bhoomi-ai-api` (server), account `sahnawashussain786`
- Env vars were set via CLI and are stored as hidden secrets
- **SSO Deployment Protection was disabled on both projects** via the API (Vercel's
  new-project default gates every URL behind a Vercel login — re-enable only if you
  want a private demo)
- ⚠️ Production currently **shares the same MongoDB Atlas database as local dev**
  (the local `MONGO_URI` was reused). Create a separate cluster/database for real
  production data if needed.
- **To ship an update:** `npx vercel --prod` inside `server/` (API) or `client/` (site).
  The projects were linked via CLI, so pushes to GitHub do NOT auto-deploy — either
  run the CLI command or connect the projects to the GitHub repo in the Vercel
  dashboard (Settings → Git) to enable auto-deploys.
- **Upload flow on Vercel is async**: `POST /api/documents/upload` returns **202
  immediately** (Gemini vision on scans can exceed the 60s function limit) and the
  pipeline finishes in the background via `waitUntil`; the client polls
  `GET /api/documents/:id/status` until `status` leaves `processing`. Local dev
  stays synchronous (201). Max upload is **~4.5 MB** on Vercel (platform request
  body cap) — the client enforces 4 MB on production builds.

---

The project deploys as **two Vercel projects** from this one repo:

| Project | Root | Framework | What it is |
|---|---|---|---|
| **Web app** | `client` | Vite (React) | Static SPA + `vercel.json` SPA rewrite |
| **API** | `server` | Node.js | Express exported as a serverless function (`api/index.js`) |

The Python AI service (`ai-service/`) is **local-dev only** — Vercel serverless
can't run Tesseract/uvicorn. It is NOT needed in production: the Node API now
calls **Gemini directly** (`services/geminiClient.js`), with the same retry +
model-fallback chain, so extraction works with zero extra infrastructure.

---

## 0. Prerequisites

1. A free **MongoDB Atlas** cluster (M0) — https://www.mongodb.com/cloud/atlas
   - Create a database user; allow access from anywhere (0.0.0.0/0) — serverless
     IPs are dynamic.
   - Copy the connection string: `mongodb+srv://<user>:<pass>@cluster0.xxxx.mongodb.net/land_record_system`
2. A **Gemini API key** (free) — https://aistudio.google.com/apikey
3. Vercel account + the repo pushed to GitHub/GitLab/Bitbucket.

> MongoDB Atlas is **required**. On serverless there is no local mongod and no
> writable disk — the app will refuse to start without `MONGO_URI`.

---

## 1. Deploy the API (server project)

Vercel → **Add New Project** → import the repo → set:

- **Root Directory:** `server`
- **Framework Preset:** Other
- **Build Command:** (leave empty)
- **Output Directory:** (leave empty)

**Environment Variables** (Project → Settings → Environment Variables):

| Key | Value | Notes |
|---|---|---|
| `MONGO_URI` | `mongodb+srv://…/land_record_system` | REQUIRED — Atlas connection string |
| `GEMINI_API_KEY` | `AIza…` | REQUIRED — direct Gemini extraction |
| `GEMINI_MODEL` | `gemini-3.6-flash` | optional (has fallback chain) |
| `GEMINI_DIRECT` | `true` | optional, default true |
| `JWT_SECRET` | long random string | **required in production** |
| `JWT_EXPIRES_IN` | `7d` | optional |
| `CLIENT_URL` | `https://<your-web-app>.vercel.app` | CORS allow-list (add both URLs, comma-separated, if you have a custom domain) |
| `AI_FALLBACK` | `true` | keep — lets regex extractor cover Gemini outages |
| `MAX_UPLOAD_MB` | `15` | optional |
| `NODE_ENV` | `production` | optional |

Deploy → note the URL, e.g. `https://bhoomi-ai-api.vercel.app`.

The API auto-seeds demo data (users + sample records) the first time it runs
against an empty database. Log in with `officer@lrs.gov.in` / `Officer@123`.

---

## 2. Deploy the Web app (client project)

Vercel → **Add New Project** → import the same repo → set:

- **Root Directory:** `client`
- **Framework Preset:** Vite
- **Build Command:** `npm run build` (default)
- **Output Directory:** `dist` (default)

**Environment Variable:**

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://bhoomi-ai-api.vercel.app/api` (the API URL from step 1 + `/api`) |

Deploy → open `https://<your-web-app>.vercel.app` → log in. Done.

`vercel.json` in `client/` rewrites all routes to `index.html`, so deep links
like `/records` survive a hard refresh.

---

## 3. How it works on Vercel (what changed for deployment)

- **`server/api/index.js`** — serverless entry that exports the Express app;
  `app.listen()` only runs outside Vercel (local dev unchanged).
- **Lazy DB connect** — first request connects to MongoDB (memoised per
  instance); `MONGO_URI` is mandatory there (no embedded/in-memory fallback).
- **Uploads → GridFS** — files are stored **inside MongoDB** (no disk needed)
  and served from `GET /api/documents/:fileId/file`. DocumentViewer uses
  `doc.fileUrl`, so previews work identically in dev and prod.
- **Gemini direct** — extraction path is Node → Gemini (vision for images/PDFs,
  text for .txt) with retry/backoff and a model fallback chain
  (`gemini-3.6-flash` → `gemini-flash-latest` → `gemini-flash-lite-latest`).
  The Python service remains tier 2 in local dev; the Node regex extractor
  remains tier 3 everywhere.
- **`maxDuration: 60`** — the function waits for Gemini retries (bounded at
  ~55s) instead of timing out on transient 503 "high demand" spikes.
- **CORS allow-list** — set `CLIENT_URL` to your Vercel app URL(s).

> **Note (free plan):** Hobby functions cap at 10s; Gemini retries are tuned to
> fit, but for the full 60s budget use the Pro plan — or simply keep `AI_FALLBACK=true`
> so uploads never hard-fail.

---

## 4. Local development (unchanged)

```bash
npm run dev            # AI service + API + client together (scripts/dev.mjs)
npm run dev:no-ai      # skip the Python service — Gemini-direct handles uploads
npm run check          # pre-flight checks
```

Local dev keeps its friendly fallbacks (embedded MongoDB, disk uploads,
Tesseract) — none of them activate on Vercel.

---

## 5. Post-deploy checklist

- [ ] `https://<api>/api/health` → `"db":"connected"`, `"extraction":"gemini-direct (…)"`, `ok:true`
- [ ] Log in at the web app URL (officer@lrs.gov.in / Officer@123)
- [ ] Upload a document → extraction engine `gemini-direct`, file preview opens
- [ ] Hard-refresh a deep link like `/records` → page loads (SPA rewrite)
- [ ] If CORS errors appear: re-check `CLIENT_URL` on the API project includes the exact web URL, then redeploy the API
