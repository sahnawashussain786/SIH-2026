import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'text/plain', // OCR text transcripts / sidecar files (offline demo mode)
]);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60);
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

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
