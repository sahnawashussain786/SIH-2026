import Document from '../models/Document.js';
import LandRecord from '../models/LandRecord.js';
import AuditLog from '../models/AuditLog.js';
import { processDocument } from '../services/aiService.js';
import { runValidation, confidenceRoute, findDuplicates } from '../services/validator.js';
import { putFile, getFile, deleteFile } from '../services/fileStore.js';
import { storedFilename } from '../middleware/upload.js';

/** POST /api/documents/upload — upload + immediately run AI pipeline */
export async function uploadDocument(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    const { documentType = 'Khatian', language = 'auto', district = '', state = '', title } = req.body;

    // Persist the upload bytes in GridFS (works on any host — Vercel has no
    // writable persistent disk). A best-effort disk mirror keeps local dev
    // previews identical to before.
    const storedName = storedFilename(req.file.originalname);
    let gridFsId = null;
    try {
      gridFsId = await putFile(req.file.buffer, storedName, { mimeType: req.file.mimetype });
    } catch (err) {
      console.warn('[files] GridFS storage failed — continuing (disk mirror only):', err.message);
    }

    const doc = await Document.create({
      title: title || req.file.originalname,
      originalName: req.file.originalname,
      storedName,
      fileUrl: `/api/documents/${gridFsId || 'pending'}/file`,
      gridFsId,
      mimeType: req.file.mimetype,
      size: req.file.size,
      documentType,
      language,
      district,
      state,
      status: 'processing',
      stage: 'ai_pipeline',
      uploadedBy: req.user._id,
    });

    await AuditLog.log({
      actor: req.user._id,
      actorName: req.user.name,
      action: 'document.upload',
      entityType: 'Document',
      entityId: doc._id,
      details: { file: doc.originalName, size: doc.size },
      ip: req.ip,
    });

    // Fire the AI pipeline synchronously with the in-memory buffer
    // (nothing needs to exist on disk — works on serverless).
    let result;
    try {
      result = await processDocument(doc, req.file.buffer);
    } catch (err) {
      doc.status = 'failed';
      doc.stage = 'ai_failed';
      await doc.save();
      await AuditLog.log({
        actor: req.user._id,
        actorName: req.user.name,
        action: 'document.process.failed',
        entityType: 'Document',
        entityId: doc._id,
        details: { error: err.message },
      });
      return res.status(502).json({ message: `AI processing failed: ${err.message}`, documentId: doc._id });
    }

    // Merge AI district/state hints with the ones the officer chose
    const extracted = { ...result.extracted };
    if (district && !extracted.district) extracted.district = district;
    if (state && !extracted.state) extracted.state = state;

    // Validation + duplicates
    const validation = runValidation(extracted);
    const duplicates = await findDuplicates(extracted, doc._id);
    validation.duplicates = duplicates;

    const overall = result.overallConfidence || 0;
    const route = confidenceRoute(overall, validation);

    doc.extracted = extracted;
    doc.fieldConfidences = result.fieldConfidences || [];
    doc.overallConfidence = overall;
    doc.validation = validation;
    doc.ocrText = result.ocrText || '';
    doc.aiMeta = result.aiMeta || {};
    doc.status = route === 'auto_accept' ? 'processed' : 'processed';
    doc.stage = route; // auto_accept | manual_review | mandatory_verification
    await doc.save();

    // Auto-accept: create the digital record immediately, flagged for audit
    if (route === 'auto_accept') {
      const record = await LandRecord.create({
        ...extracted,
        areaValue: parseFloat(extracted.area) || null,
        sourceDocument: doc._id,
        approvedBy: null,
        approvedAutomatically: true,
        confidence: overall,
      });
      doc.recordId = record._id;
      await doc.save();
    }

    await AuditLog.log({
      actor: req.user._id,
      actorName: req.user.name,
      action: 'document.processed',
      entityType: 'Document',
      entityId: doc._id,
      details: { engine: result.engine, confidence: overall, route },
      ip: req.ip,
    });

    res.status(201).json({ document: doc, route });
  } catch (err) {
    next(err);
  }
}

/** GET /api/documents — list with filters (status, stage, district, search, pagination) */
export async function listDocuments(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(parseInt(req.query.limit || '12', 10), 100);
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.district) filter.district = new RegExp(escapeRegex(req.query.district), 'i');
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ title: rx }, { originalName: rx }, { 'extracted.ownerName': rx }, { 'extracted.village': rx }];
    }
    if (req.query.mine === 'true') filter.uploadedBy = req.user._id;

    const [items, total] = await Promise.all([
      Document.find(filter)
        .populate('uploadedBy', 'name role')
        .populate('recordId', 'ownerName plotNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Document.countDocuments(filter),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/documents/:id — :id may be a document id or a GridFS file id */
export async function getDocument(req, res, next) {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('uploadedBy', 'name role')
      .populate('reviewedBy', 'name role')
      .populate('recordId')
      .populate('validation.duplicates.recordId', 'ownerName khatianNumber plotNumber village district')
      .populate('validation.duplicates.documentId', 'title extracted status');
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    res.json({ document: doc });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/documents/file/:fileId — stream an uploaded file out of GridFS.
 * Used by the in-app viewer via doc.fileUrl; replaces serving from /uploads.
 */
export async function getFileById(req, res, next) {
  try {
    const { buffer, contentType } = await getFile(req.params.fileId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buffer);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ message: 'File not found.' });
    next(err);
  }
}

/** DELETE /api/documents/:id — admin or uploader */
export async function deleteDocument(req, res, next) {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    if (req.user.role !== 'admin' && doc.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own uploads.' });
    }
    await doc.deleteOne();
    if (doc.gridFsId) await deleteFile(doc.gridFsId);
    await AuditLog.log({
      actor: req.user._id,
      actorName: req.user.name,
      action: 'document.delete',
      entityType: 'Document',
      entityId: req.params.id,
      ip: req.ip,
    });
    res.json({ message: 'Document deleted.' });
  } catch (err) {
    next(err);
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
