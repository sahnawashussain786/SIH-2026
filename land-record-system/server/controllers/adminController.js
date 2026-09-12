import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

/** GET /api/admin/users — admin only */
export async function listUsers(req, res, next) {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    res.json({ items: users.map((u) => ({ ...u, password: undefined })) });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/users/:id — role / active / details */
export async function updateUser(req, res, next) {
  try {
    const allowed = ['name', 'role', 'isActive', 'district', 'state', 'department'];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user._id.toString() === req.user._id.toString() && updates.isActive === false) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    Object.assign(user, updates);
    await user.save();

    await AuditLog.log({
      actor: req.user._id,
      actorName: req.user.name,
      action: 'user.update',
      entityType: 'User',
      entityId: user._id,
      details: updates,
      ip: req.ip,
    });

    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/users — create user (admin) */
export async function createUser(req, res, next) {
  try {
    const { name, email, password, role, district, state, department } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'A user with this email already exists.' });
    const user = await User.create({ name, email, password, role, district, state, department });
    await AuditLog.log({
      actor: req.user._id,
      actorName: req.user.name,
      action: 'user.create',
      entityType: 'User',
      entityId: user._id,
      details: { email, role },
      ip: req.ip,
    });
    res.status(201).json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/audit-logs — paginated audit trail */
export async function listAuditLogs(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.entityType) filter.entityType = req.query.entityType;

    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}
