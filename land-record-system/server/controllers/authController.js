import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { signToken } from '../middleware/auth.js';

/** POST /api/auth/register — admin-only user creation (public bootstrap handled by seed) */
export async function register(req, res, next) {
  try {
    const { name, email, password, role, district, state, department } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'A user with this email already exists.' });

    const user = await User.create({ name, email, password, role, district, state, department });
    await AuditLog.log({
      actor: req.user?._id,
      actorName: req.user?.name || 'system',
      action: 'user.create',
      entityType: 'User',
      entityId: user._id,
      details: { email: user.email, role: user.role },
      ip: req.ip,
    });
    res.status(201).json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/login */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (!user.isActive) return res.status(403).json({ message: 'Account is deactivated. Contact the administrator.' });

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    await AuditLog.log({
      actor: user._id,
      actorName: user.name,
      action: 'auth.login',
      entityType: 'User',
      entityId: user._id,
      ip: req.ip,
    });
    res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/auth/me */
export async function me(req, res) {
  res.json({ user: req.user.toSafeJSON() });
}

/** PUT /api/auth/me — update own profile (name, password) */
export async function updateMe(req, res, next) {
  try {
    const { name, password } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (name) user.name = name;
    if (password) user.password = password;
    await user.save();
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}
