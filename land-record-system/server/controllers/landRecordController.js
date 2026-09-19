import LandRecord from '../models/LandRecord.js';
import AuditLog from '../models/AuditLog.js';
import { geocodeRecord } from '../services/geocoder.js';
import mongoose from 'mongoose';

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

    // Map support: ?hasLocation=true|false filters records with/without pins
    if (req.query.hasLocation === 'true') filter['gis.lat'] = { $ne: null };
    if (req.query.hasLocation === 'false') filter['gis.lat'] = null;

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

/**
 * GET /api/records/:id/map — map payload for one record.
 * If the record has no coordinates yet, attempts a live geocode first and
 * persists the result, so opening the detail modal fills the pin in.
 */
export async function getRecordMap(req, res, next) {
  try {
    const record = await LandRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Land record not found.' });

    if (record.gis?.lat == null) await geocodeRecord(record);

    res.json({
      gis: record.gis || null,
      address: {
        village: record.village,
        tehsil: record.tehsil,
        district: record.district,
        state: record.state,
      },
      queryUsed: [record.village, record.tehsil, record.district, record.state]
        .filter(Boolean)
        .join(', '),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/records/geo — GeoJSON FeatureCollection of all located records.
 * Powers the client-side "Map view" of the records page.
 */
export async function listRecordGeo(req, res, next) {
  try {
    const filter = { 'gis.lat': { $ne: null } };
    const recs = await LandRecord.find(filter)
      .select('ownerName khatianNumber plotNumber area areaUnit village district state landType gis')
      .limit(2000)
      .lean();

    const features = recs.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.gis.lng, r.gis.lat] },
      properties: {
        id: r._id,
        ownerName: r.ownerName,
        khatianNumber: r.khatianNumber,
        plotNumber: r.plotNumber,
        area: r.area,
        areaUnit: r.areaUnit,
        village: r.village,
        district: r.district,
        state: r.state,
        landType: r.landType,
        source: r.gis?.source || '',
        precision: r.gis?.precision || '',
      },
    }));
    res.json({ type: 'FeatureCollection', features, total: features.length });
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
    const addressChanged = ['village', 'tehsil', 'district', 'state'].some(
      (k) => req.body[k] !== undefined && String(req.body[k] ?? '') !== String(before[k] ?? ''),
    );
    Object.assign(record, updates);
    if (updates.area) record.areaValue = parseFloat(updates.area) || null;

    // Manual pin: officers can correct the exact location on the map.
    if (req.body.gis && typeof req.body.gis === 'object') {
      const lat = Number(req.body.gis.lat);
      const lng = Number(req.body.gis.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
        record.gis = {
          lat,
          lng,
          displayName: String(req.body.gis.displayName || record.gis?.displayName || ''),
          source: 'manual',
          precision: 'exact',
          geocodedAt: new Date(),
        };
      }
    } else if (addressChanged && record.gis?.source === 'nominatim') {
      record.gis.lat = null;
      record.gis.lng = null; // stale pin — re-geocode below
    }
    await record.save();

    // Re-geocode silently when the address changed (keeps map in sync)
    if (addressChanged && record.gis?.lat == null) {
      geocodeRecord(record).catch(() => {});
    }

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
