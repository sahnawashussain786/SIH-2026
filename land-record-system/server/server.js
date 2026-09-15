import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { connectDB, stopDB } from './config/db.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { UPLOAD_DIR } from './middleware/upload.js';

import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import verificationRoutes from './routes/verificationRoutes.js';
import landRecordRoutes from './routes/landRecordRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { pingAI, geminiStatus } from './services/aiService.js';
import { seedDatabase } from './scripts/seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/* ---------- security & parsing ---------- */
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// Comma-separated allow-list — set CLIENT_URL to your Vercel app URL in prod
const ORIGINS = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || ORIGINS.includes(origin) || ORIGINS.includes('*')) return cb(null, true);
    cb(null, false); // non-allow-listed origins get no CORS headers
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(compression());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

/* ---------- static: uploaded documents (demo mode) ---------- */
app.use('/uploads', express.static(UPLOAD_DIR));

/* ---------- basic rate limiting on auth ---------- */
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });

/* ---------- routes ---------- */
app.get('/api/health', async (_req, res) => {
  let ai = { online: false, url: process.env.AI_SERVICE_URL || 'http://localhost:8001' };
  try {
    const h = await pingAI();
    ai = { online: true, ...h };
  } catch {
    /* Python AI service offline — extraction still works via Gemini-direct */
  }
  res.json({
    ok: true,
    service: 'bhomii-ai-api',
    time: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    extraction: geminiStatus(),
    ai,
  });
});

/* ---------- serverless-safe DB init ----------
 * On Vercel there is no long-running process: each invocation connects
 * lazily (memoised) before the first route that needs the DB.
 */
const IS_SERVERLESS = Boolean(process.env.VERCEL);
let dbReadyPromise = null;

async function ensureDB(_req, _res, next) {
  if (!IS_SERVERLESS || mongoose.connection.readyState === 1) return next();
  try {
    dbReadyPromise = dbReadyPromise || connectDB().then(autoSeedIfEmpty);
    await dbReadyPromise;
    next();
  } catch (err) {
    console.error('[api] DB init failed:', err.message);
    _res.status(503).json({ message: 'Database unavailable — check MONGO_URI.' });
  }
}
app.use(ensureDB);

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/records', landRecordRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);

/* ---------- 404 + errors ---------- */
app.use(notFound);
app.use(errorHandler);

/* ---------- boot (long-running / local only) ---------- */
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 5000;

/** Seed demo data whenever the database has no users yet (fresh DB of any kind). */
async function autoSeedIfEmpty(mode) {
  try {
    const User = (await import('./models/User.js')).default;
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log(`[api] Database empty (${mode}) — seeding demo data…`);
      await seedDatabase();
    }
    console.log('[api] Ready — log in with officer@lrs.gov.in / Officer@123');
  } catch (err) {
    console.error('[api] Auto-seed failed:', err.message);
  }
}

if (IS_SERVERLESS) {
  console.log('[api] Serverless mode (Vercel) — DB connects lazily per invocation.');
} else {
  connectDB()
    .then(async (mode) => {
      await autoSeedIfEmpty(mode);
      const server = app.listen(PORT, () => {
      console.log(`[api] Land Record API listening on http://localhost:${PORT}`);
      console.log(`[api] AI service: ${process.env.AI_SERVICE_URL || 'http://localhost:8001'} (fallback extraction ${process.env.AI_FALLBACK !== 'false' ? 'enabled' : 'disabled'})`);
    });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`\n[api] Port ${PORT} is already in use — another copy of this API is probably already running.`);
          console.error(`[api] Check it:   open http://localhost:${PORT}/api/health`);
          console.error(`[api] Free it:    close the other terminal running the server, or run:  npx kill-port ${PORT}`);
          console.error(`[api] Or use another port:  PORT=5001 npm run dev`);
          process.exit(1);
        }
        throw err;
      });
    })
    .catch((err) => {
      console.error('[api] Failed to connect to MongoDB:', err.message);
      console.error('[api] Start MongoDB locally or set MONGO_URI in server/.env');
      process.exit(1);
    });
}

/* ---------- clean shutdown: free the DB, never leave mongod zombies ---------- */
let closing = false;
async function gracefulExit(code) {
  if (closing) return;
  closing = true;
  try { await stopDB(); } catch { /* best effort */ }
  process.exit(code);
}
process.on('SIGINT', () => gracefulExit(0));
process.on('SIGTERM', () => gracefulExit(0));
process.on('SIGBREAK', () => gracefulExit(0)); // Windows Ctrl+Break / launcher tree-kill
process.on('exit', () => { try { stopDB(); } catch { /* sync best effort */ } });

export default app;
