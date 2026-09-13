import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let currentMode = null;
let memServer = null; // embedded instance (for clean shutdown)

/**
 * Connect to MongoDB (idempotent). Strategy, in order:
 *   1. MONGO_URI (e.g. MongoDB Atlas) — best, data in the cloud
 *   2. Local mongod on 127.0.0.1:27017 (only when MONGO_URI is not set)
 *   3. Embedded MongoDB with a PERSISTENT data dir (server/data/mongodb) —
 *      survives restarts, works fully offline. Its server binary is
 *      downloaded once on first use (see the TLS note below).
 *   4. Last resort: throwaway in-memory MongoDB (demo only, never persisted).
 */
export async function connectDB() {
  if (mongoose.connection.readyState === 1 && currentMode) return currentMode;

  mongoose.set('strictQuery', true);
  const uri = process.env.MONGO_URI || '';

  if (uri) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
      console.log(`[db] MongoDB connected → ${mongoose.connection.name}`);
      currentMode = 'mongodb';
      return currentMode;
    } catch (err) {
      console.warn(`[db] Could not connect to MONGO_URI (${err.message})`);
      console.warn('[db] Falling back to the embedded database (data will be LOCAL, not cloud).');
    }
  } else {
    try {
      await mongoose.connect('mongodb://127.0.0.1:27017/land_record_system', { serverSelectionTimeoutMS: 3000 });
      console.log('[db] MongoDB connected → local mongod /land_record_system');
      currentMode = 'mongodb';
      return currentMode;
    } catch {
      /* no local mongod — continue to embedded server */
    }
  }

  try {
    await startEmbedded();
    currentMode = 'embedded';
    return currentMode;
  } catch (err) {
    console.warn(`[db] Embedded MongoDB unavailable (${err.message.split('\n')[0]})`);
  }

  console.warn('[db] LAST RESORT: throwaway in-memory MongoDB — data will NOT persist.');
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memServer = await MongoMemoryServer.create({ instance: { storageEngine: 'wiredTiger' } });
  await mongoose.connect(memServer.getUri('land_record_system'));
  currentMode = 'memory';
  return currentMode;
}

async function startEmbedded() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');

  const dbPath = path.join(__dirname, '..', 'data', 'mongodb');
  fs.mkdirSync(dbPath, { recursive: true });

  // If an embedded/local mongod from a previous run is STILL listening on
  // 27017 (crash, kill -9, launcher shutdown gap), just attach to it — the
  // persistent data dir is ours, so this is exactly the database we want.
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/land_record_system', { serverSelectionTimeoutMS: 2000 });
    console.log('[db] Attached to already-running MongoDB on 127.0.0.1:27017 (data kept).');
    return;
  } catch { /* nothing on 27017 — spawn our own below */ }

  // NOTE: some networks (college/office firewalls) intercept TLS with their own
  // certificate, which breaks the ONE-TIME download of the embedded mongod
  // binary. We relax certificate validation for the download window only, then
  // restore normal validation. App traffic is unaffected (plain HTTP on
  // localhost), and once the binary is cached this block is a no-op.
  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    try {
      memServer = await MongoMemoryServer.create({
        instance: {
          port: 27017, // fixed port: behaves like a normal local mongod
          dbPath,      // PERSISTENT — data survives restarts
          storageEngine: 'wiredTiger',
        },
      });
    } catch {
      // Port 27017 taken (e.g. a real local mongod appeared) — any free port.
      memServer = await MongoMemoryServer.create({
        instance: { dbPath, storageEngine: 'wiredTiger' },
      });
    }
  } finally {
    if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
  }

  await mongoose.connect(memServer.getUri('land_record_system'));
  console.log(`[db] Embedded MongoDB ready (persistent) → ${dbPath}`);
  console.log('[db] Tip: set MONGO_URI in server/.env to switch to MongoDB Atlas/cloud later.');
}

/** Stop the embedded server cleanly (called on process shutdown). */
export async function stopDB() {
  try {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  } catch { /* already down */ }
  try {
    if (memServer) await memServer.stop();
  } catch { /* already down */ }
  memServer = null;
  currentMode = null;
}
