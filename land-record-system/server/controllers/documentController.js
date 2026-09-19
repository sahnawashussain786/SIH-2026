import Document from "../models/Document.js";
import LandRecord from "../models/LandRecord.js";
import AuditLog from "../models/AuditLog.js";
import { processDocument } from "../services/aiService.js";
import { analyzeImage } from "../services/imageForensics.js";
import {
  runValidation,
  confidenceRoute,
  findDuplicates,
} from "../services/validator.js";
import { putFile, getFile, deleteFile } from "../services/fileStore.js";
import { geocodeRecord } from "../services/geocoder.js";
import { storedFilename } from "../middleware/upload.js";

/** POST /api/documents/upload — store the file, then run the AI pipeline.
 *
 * On Vercel (serverless) the request must return in seconds — Gemini vision on
 * a scanned image can take up to a minute, which hits the 60s function limit
 * (HTTP 504, the browser shows "Cannot reach the API server"). So there the
 * response is sent immediately (202) and the pipeline finishes in the
 * background via `waitUntil`; the client polls GET /:id/status for the result.
 * On a long-running local server the flow stays synchronous (201).
 */
export async function uploadDocument(req, res, next) {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No file uploaded." });

    const {
      documentType = "Khatian",
      language = "auto",
      district = "",
      state = "",
      title,
    } = req.body;

    // Persist the upload bytes in GridFS (works on any host — Vercel has no
    // writable persistent disk). A best-effort disk mirror keeps local dev
    // previews identical to before.
    const storedName = storedFilename(req.file.originalname);
    let gridFsId = null;
    try {
      gridFsId = await putFile(req.file.buffer, storedName, {
        mimeType: req.file.mimetype,
      });
    } catch (err) {
      console.warn(
        "[files] GridFS storage failed — continuing (disk mirror only):",
        err.message,
      );
    }

    const doc = await Document.create({
      title: title || req.file.originalname,
      originalName: req.file.originalname,
      storedName,
      fileUrl: `/api/documents/${gridFsId || "pending"}/file`,
      gridFsId,
      mimeType: req.file.mimetype,
      size: req.file.size,
      documentType,
      language,
      district,
      state,
      status: "processing",
      stage: "ai_pipeline",
      uploadedBy: req.user._id,
    });

    await AuditLog.log({
      actor: req.user._id,
      actorName: req.user.name,
      action: "document.upload",
      entityType: "Document",
      entityId: doc._id,
      details: { file: doc.originalName, size: doc.size },
      ip: req.ip,
    });

    // Early authenticity probe (pure metadata forensics) so the UI can show a
    // verdict instantly, even before the AI pipeline finishes. The metadata
    // score also feeds the final verdict in the processing pipeline.
    const probe = analyzeImage(req.file.buffer, doc.mimeType, doc.originalName);
    if (probe.width > 0) {
      doc.authenticity = {
        verdict:
          probe.score >= 45
            ? "ai_generated"
            : probe.score >= 20
              ? "suspicious"
              : "likely_authentic",
        score: probe.score,
        geminiAssessment: "",
        geminiConfidence: 0,
        reasons: probe.signals,
        assessedAt: new Date(),
      };
      await doc.save().catch(() => {}); // best-effort
    }

    // Fire the AI pipeline with the in-memory buffer (nothing needs to exist
    // on disk — works on serverless).
    if (process.env.VERCEL) {
      // Serverless: answer now, finish processing in the background.
      try {
        const { waitUntil } = await import("@vercel/functions");
        const buf = req.file.buffer;
        waitUntil(
          finalizeDocument(doc, buf, req.user).catch((err) =>
            console.error(
              "[documents] background processing failed:",
              err.message,
            ),
          ),
        );
      } catch (err) {
        console.error(
          "[documents] could not schedule background processing:",
          err.message,
        );
      }
      return res
        .status(202)
        .json({ document: doc, route: null, pending: true });
    }

    // Long-running server (local dev): process synchronously as before.
    await finalizeDocument(doc, req.file.buffer, req.user);
    const fresh = await Document.findById(doc._id);
    res
      .status(201)
      .json({
        document: fresh,
        route: fresh.stage === "ai_failed" ? "failed" : fresh.stage,
      });
  } catch (err) {
    next(err);
  }
}

/**
 * Run the AI pipeline + validation + auto-accept for a created document.
 * Self-contained and safe to run in the background: catches its own errors
 * and marks the document failed. Returns the routing decision.
 */
async function finalizeDocument(doc, buffer, user) {
  let result;
  try {
    result = await processDocument(doc, buffer);
  } catch (err) {
    doc.status = "failed";
    doc.stage = "ai_failed";
    await doc.save();
    await AuditLog.log({
      actor: user._id,
      actorName: user.name,
      action: "document.process.failed",
      entityType: "Document",
      entityId: doc._id,
      details: { error: err.message },
    });
    return "failed";
  }

  // Merge AI district/state hints with the ones the officer chose
  const extracted = { ...result.extracted };
  if (doc.district && !extracted.district) extracted.district = doc.district;
  if (doc.state && !extracted.state) extracted.state = doc.state;

  // Validation + duplicates
  const validation = runValidation(extracted);
  const duplicates = await findDuplicates(extracted, doc._id);
  validation.duplicates = duplicates;

  const overall = result.overallConfidence || 0;
  let route = confidenceRoute(overall, validation);

  // Authenticity guard: an image flagged as AI-generated (or suspicious) must
  // never be auto-accepted into a land record, no matter how confident the
  // extraction was — a human always reviews it.
  if (
    route === "auto_accept" &&
    doc.authenticity &&
    doc.authenticity.verdict !== "likely_authentic"
  ) {
    route = "manual_review";
  }

  doc.extracted = extracted;
  doc.fieldConfidences = result.fieldConfidences || [];
  doc.overallConfidence = overall;
  doc.validation = validation;
  doc.ocrText = result.ocrText || "";
  doc.aiMeta = result.aiMeta || {};
  doc.authenticity = result.authenticity || doc.authenticity || undefined;
  doc.status = "processed";
  doc.stage = route; // auto_accept | manual_review | mandatory_verification
  await doc.save();

  // Auto-accept: create the digital record immediately, flagged for audit
  if (route === "auto_accept") {
    const record = await LandRecord.create({
      ...extracted,
      areaValue: parseFloat(extracted.area) || null,
      sourceDocument: doc._id,
      approvedBy: null,
      approvedAutomatically: true,
      confidence: overall,
    });      doc.recordId = record._id;
      await doc.save();
      geocodeRecord(record).catch(() => {}); // best-effort map pin (async, non-blocking)
  }

  await AuditLog.log({
    actor: user._id,
    actorName: user.name,
    action: "document.processed",
    entityType: "Document",
    entityId: doc._id,
    details: { engine: result.engine, confidence: overall, route },
    ip: undefined,
  });

  return route;
}

/** GET /api/documents — list with filters (status, stage, district, search, pagination) */
export async function listDocuments(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(parseInt(req.query.limit || "12", 10), 100);
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.district)
      filter.district = new RegExp(escapeRegex(req.query.district), "i");
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), "i");
      filter.$or = [
        { title: rx },
        { originalName: rx },
        { "extracted.ownerName": rx },
        { "extracted.village": rx },
      ];
    }
    if (req.query.mine === "true") filter.uploadedBy = req.user._id;

    const [items, total] = await Promise.all([
      Document.find(filter)
        .populate("uploadedBy", "name role")
        .populate("recordId", "ownerName plotNumber")
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

/**
 * GET /api/documents/:id/status — lightweight poll endpoint for background
 * processing. Returns only the fields the uploader UI needs.
 */
export async function getDocumentStatus(req, res, next) {
  try {
    const doc = await Document.findById(req.params.id)
      .select(
        "title originalName status stage overallConfidence recordId mimeType updatedAt aiMeta.engine",
      )
      .lean();
    if (!doc) return res.status(404).json({ message: "Document not found." });
    res.json({ document: doc });
  } catch (err) {
    next(err);
  }
}

/** GET /api/documents/:id — :id may be a document id or a GridFS file id */
export async function getDocument(req, res, next) {
  try {
    const doc = await Document.findById(req.params.id)
      .populate("uploadedBy", "name role")
      .populate("reviewedBy", "name role")
      .populate("recordId")
      .populate(
        "validation.duplicates.recordId",
        "ownerName khatianNumber plotNumber village district",
      )
      .populate("validation.duplicates.documentId", "title extracted status");
    if (!doc) return res.status(404).json({ message: "Document not found." });
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
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(buffer);
  } catch (err) {
    if (err.status === 404)
      return res.status(404).json({ message: "File not found." });
    next(err);
  }
}

/** DELETE /api/documents/:id — admin or uploader */
export async function deleteDocument(req, res, next) {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found." });
    if (
      req.user.role !== "admin" &&
      doc.uploadedBy.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "You can only delete your own uploads." });
    }
    await doc.deleteOne();
    if (doc.gridFsId) await deleteFile(doc.gridFsId);
    await AuditLog.log({
      actor: req.user._id,
      actorName: req.user.name,
      action: "document.delete",
      entityType: "Document",
      entityId: req.params.id,
      ip: req.ip,
    });
    res.json({ message: "Document deleted." });
  } catch (err) {
    next(err);
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
