/**
 * GridFS file storage — uploads persist inside MongoDB itself.
 *
 * Serverless hosts (Vercel) have an ephemeral, read-only filesystem: files
 * written to disk vanish between requests and can't be served back. Storing
 * the bytes in GridFS makes the whole app work on any host with nothing but
 * the MONGO_URI.
 */
import mongoose from 'mongoose';

const BUCKET = 'uploads';

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
}

/** Store a buffer under `filename`. Resolves with the GridFS _id (string). */
export async function putFile(buffer, filename, metadata = {}) {
  return new Promise((resolve, reject) => {
    try {
      const stream = bucket().openUploadStream(filename, { metadata });
      stream.on('finish', () => resolve(String(stream.id)));
      stream.on('error', reject);
      stream.end(buffer);
    } catch (err) {
      reject(err);
    }
  });
}

/** Read a stored file. Resolves with { buffer, filename, contentType, length }. */
export async function getFile(fileId) {
  const b = bucket();
  // NOTE: mongodb driver v6 removed callback support — always await promises.
  const files = await b.find({ _id: toId(fileId) }).toArray();
  if (!files?.length) {
    throw Object.assign(new Error('File not found.'), { status: 404 });
  }
  const meta = files[0];
  const chunks = [];
  await new Promise((resolve, reject) => {
    const stream = b.openDownloadStream(meta._id);
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return {
    buffer: Buffer.concat(chunks),
    filename: meta.filename,
    contentType: meta.contentType || meta.metadata?.mimeType || 'application/octet-stream',
    length: meta.length,
  };
}

/** Delete a stored file (best effort — never blocks record deletion). */
export async function deleteFile(fileId) {
  try {
    await bucket().delete(toId(fileId));
  } catch { /* already gone */ }
}

function toId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return id;
  }
}
