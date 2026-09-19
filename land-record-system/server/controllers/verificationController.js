import Document from "../models/Document.js";
import LandRecord from "../models/LandRecord.js";
import AuditLog from "../models/AuditLog.js";
import {
  runValidation,
  confidenceRoute,
  findDuplicates,
} from "../services/validator.js";
import { geocodeRecord } from "../services/geocoder.js";

/**
 * PUT /api/verification/:id
 * Body: { action: 'approve' | 'reject', extracted?: {...}, note?: string }
 * Revenue Officer / Senior Officer / Admin can approve; Data Entry / Operator can save edits.
 */
export async function reviewDocument(req, res, next) {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found." });

    const { action = "save", extracted, note = "" } = req.body;
    const canApprove = ["revenue_officer", "senior_officer", "admin"].includes(
      req.user.role,
    );

    // Merge any officer edits into the extracted payload
    if (extracted) {
      doc.extracted = { ...doc.extracted.toObject(), ...extracted };
      // Re-run validation on the corrected data
      const validation = runValidation(doc.extracted);
      const duplicates = await findDuplicates(doc.extracted, doc._id);
      validation.duplicates = duplicates;
      doc.validation = validation;
      // Officer-corrected data is high confidence by definition
      doc.overallConfidence = Math.max(doc.overallConfidence, 95);
      doc.fieldConfidences = doc.fieldConfidences.map((fc) => ({
        ...(fc.toObject?.() ?? fc),
        confidence: Math.max(fc.confidence || 0, 95),
      }));
    }

    if (action === "approve") {
      if (!canApprove)
        return res
          .status(403)
          .json({ message: "Your role cannot approve records." });
      if (doc.validation.errors.length > 0) {
        return res
          .status(400)
          .json({
            message: "Cannot approve — validation errors must be fixed first.",
            errors: doc.validation.errors,
          });
      }

      let record = doc.recordId
        ? await LandRecord.findById(doc.recordId)
        : null;
      const payload = {
        ...doc.extracted.toObject(),
        areaValue: parseFloat(doc.extracted.area) || null,
        sourceDocument: doc._id,
        approvedBy: req.user._id,
        approvedAutomatically: false,
        confidence: doc.overallConfidence,
        verifiedAt: new Date(),
      };

      if (record) {
        Object.assign(record, payload);
      } else {
        record = await LandRecord.create(payload);
      }
      doc.recordId = record._id;
      // Best-effort map pin: geocode the approved record's address (async,
      // non-blocking — approval latency must not depend on a map API).
      geocodeRecord(record).catch(() => {});
      doc.status = "verified";
      doc.stage = "approved";
      doc.reviewedBy = req.user._id;
      doc.reviewNote = note;
      doc.reviewedAt = new Date();

      await AuditLog.log({
        actor: req.user._id,
        actorName: req.user.name,
        action: "verification.approve",
        entityType: "Document",
        entityId: doc._id,
        details: { recordId: record._id, note },
        ip: req.ip,
      });
    } else if (action === "reject") {
      if (!canApprove)
        return res
          .status(403)
          .json({ message: "Your role cannot reject records." });
      doc.status = "rejected";
      doc.stage = "rejected";
      doc.reviewedBy = req.user._id;
      doc.reviewNote = note;
      doc.reviewedAt = new Date();
      await AuditLog.log({
        actor: req.user._id,
        actorName: req.user.name,
        action: "verification.reject",
        entityType: "Document",
        entityId: doc._id,
        details: { note },
        ip: req.ip,
      });
    } else {
      // save edits only
      doc.reviewedBy = doc.reviewedBy || req.user._id;
      doc.reviewNote = note || doc.reviewNote;
      await AuditLog.log({
        actor: req.user._id,
        actorName: req.user.name,
        action: "verification.edit",
        entityType: "Document",
        entityId: doc._id,
        details: { fields: extracted ? Object.keys(extracted) : [] },
        ip: req.ip,
      });
    }

    await doc.save();
    res.json({ document: doc });
  } catch (err) {
    next(err);
  }
}

/** GET /api/verification/queue — documents routed for review */
export async function getQueue(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(parseInt(req.query.limit || "12", 10), 100);
    const filter = {
      status: { $in: ["processed", "failed"] },
      stage: { $in: ["manual_review", "mandatory_verification"] },
    };
    if (req.query.priority === "high") filter.stage = "mandatory_verification";

    const [items, total] = await Promise.all([
      Document.find(filter)
        .populate("uploadedBy", "name role")
        .sort({ overallConfidence: 1, createdAt: -1 })
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
