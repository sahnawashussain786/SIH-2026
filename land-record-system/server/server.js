import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { UPLOAD_DIR } from './middleware/upload.js';

import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import verificationRoutes from './routes/verificationRoutes.js';
import landRecordRoutes from './routes/landRecordRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { pingAI } from './services/aiService.js';
import { seedDatabase } from './scripts/seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/* ---------- security & parsing ---------- */
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
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
    /* AI offline — server still runs with fallback extraction */
  }
  res.json({ ok: true, service: 'land-record-api', time: new Date().toISOString(), ai });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/records', landRecordRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);

/* ---------- 404 + errors ---------- */
app.use(notFound);
app.use(errorHandler);

/* ---------- boot ---------- */
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 5000;

connectDB()
  .then(async (mode) => {
    // Auto-seed whenever the database has no users yet (fresh DB of any kind),
    // so a clean install never ends up with un-loggable accounts.
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

export default app;
