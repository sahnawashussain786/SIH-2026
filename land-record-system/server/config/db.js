import mongoose from 'mongoose';

let currentMode = null;

/**
 * Connect to MongoDB (idempotent). If MONGO_URI is not configured or
 * unreachable and no local mongod is running, fall back to an in-memory
 * MongoDB so the whole system still runs out of the box (dev/demo only —
 * data is not persisted).
 */
export async function connectDB() {
  if (mongoose.connection.readyState === 1 && currentMode) return currentMode;

  mongoose.set('strictQuery', true);
  const uri = process.env.MONGO_URI || '';

  if (uri) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
      console.log(`[db] MongoDB connected → ${mongoose.connection.name}`);
      currentMode = 'mongodb';
      return currentMode;
    } catch (err) {
      console.warn(`[db] Could not connect to MONGO_URI (${err.message})`);
    }
  }

  // Try default local mongod before giving up
  if (!uri) {
    try {
      await mongoose.connect('mongodb://127.0.0.1:27017/land_record_system', { serverSelectionTimeoutMS: 3000 });
      console.log('[db] MongoDB connected → local mongod /land_record_system');
      currentMode = 'mongodb';
      return currentMode;
    } catch {
      /* no local mongod — continue to memory server */
    }
  }

  console.warn('[db] No MongoDB available — starting in-memory MongoDB (dev/demo only, data is not persisted).');
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri('land_record_system'));
  console.log(`[db] In-memory MongoDB ready at ${mem.getUri()}`);
  currentMode = 'memory';
  return currentMode;
}
