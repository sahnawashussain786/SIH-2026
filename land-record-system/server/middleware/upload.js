import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');

// Best-effort disk mirror for local serving/preview. On Vercel the filesystem
// is read-only outside /tmp and ephemeral, so failures are silently ignored —
// the authoritative copy of every upload lives in GridFS (the database).
try {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch { /* read-only FS (serverless) — GridFS handles persistence */ }

const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'text/plain', // OCR text transcripts / sidecar files (offline demo mode)
]);

// Memory storage: works on any host (Vercel serverless has an ephemeral FS).
// The buffer feeds the AI pipeline directly; persistence is via GridFS.
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_MB || '15', 10) || 15) * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const isTxt = /\.txt$/i.test(file.originalname || '');
    if (!ALLOWED.has(file.mimetype) && !isTxt) {
      return cb(new Error('Only PDF, PNG, JPG, WEBP, TIFF or plain-text transcript files are allowed.'));
    }
    cb(null, true);
  },
});

/** Canonical stored filename for an upload (GridFS + disk mirror + DB). */
export function storedFilename(originalName) {
  const ext = path.extname(originalName || '') || '';
  const base = path.basename(originalName || 'file', ext).replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60);
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base}${ext}`;
}
