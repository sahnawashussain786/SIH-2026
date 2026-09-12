import LandRecord from '../models/LandRecord.js';
import AuditLog from '../models/AuditLog.js';

/** GET /api/records — search & filter approved records (public for citizens, scoped) */
export async function listRecords(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(parseInt(req.query.limit || '12', 10), 100);
    const filter = {};

    for (const f of ['district', 'state', 'village', 'landType']) {
      if (req.query[f]) filter[f] = new RegExp(escapeRegex(req.query[f]), 'i');
    }
    if (req.query.khatianNumber) filter.khatianNumber = String(req.query.khatianNumber);
    if (req.query.plotNumber) filter.plotNumber = String(req.query.plotNumber);
    if (req.query.owner) filter.ownerName = new RegExp(escapeRegex(req.query.owner), 'i');
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(req.query.q), 'i');
      filter.$or = [{ ownerName: rx }, { village: rx }, { district: rx }, { khatianNumber: rx }, { plotNumber: rx }];
    }

    const [items, total] = await Promise.all([
      LandRecord.find(filter)
        .populate('sourceDocument', 'title originalName')
        .sort({ verifiedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LandRecord.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/records/:id */
export async function getRecord(req, res, next) {
  try {
    const record = await LandRecord.findById(req.params.id).populate('sourceDocument', 'title originalName filePath mimeType');
    if (!record) return res.status(404).json({ message: 'Land record not found.' });
    res.json({ record });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/records/:id — correct an approved record (revenue_officer/admin) */
export async function updateRecord(req, res, next) {
  try {
    const allowed = ['ownerName', 'khatianNumber', 'plotNumber', 'surveyNumber', 'area', 'areaUnit', 'village', 'tehsil', 'district', 'state', 'landType', 'mutationDetails'];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

    const record = await LandRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Land record not found.' });

    const before = record.toObject();
    Object.assign(record, updates);
    if (updates.area) record.areaValue = parseFloat(updates.area) || null;
    await record.save();

    await AuditLog.log({
      actor: req.user._id,
      actorName: req.user.name,
      action: 'record.update',
      entityType: 'LandRecord',
      entityId: record._id,
      details: { changed: Object.keys(updates), before: Object.fromEntries(Object.keys(updates).map((k) => [k, before[k]])) },
      ip: req.ip,
    });

    res.json({ record });
  } catch (err) {
    next(err);
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
