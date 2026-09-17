import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const ROLE_LABELS = {
  data_entry_officer: 'Data Entry Officer',
  digitization_operator: 'Digitization Operator',
  revenue_officer: 'Revenue Officer',
  senior_officer: 'Senior Officer',
  admin: 'Administrator',
  citizen: 'Citizen',
};

const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '6h';

export function signToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET || 'dev-secret', {
    expiresIn: TOKEN_TTL,
  });
}

/** Decode without verifying — used to read exp for session-expiry UX */
export function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}

/** Verify JWT and attach req.user */
export async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: 'Not authenticated. Please log in.' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Account not found or deactivated.' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Your session has expired. Please log in again.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

/** Restrict route to certain roles. Usage: authorize('admin', 'revenue_officer') */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated.' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Forbidden — requires role: ${roles.map((r) => ROLE_LABELS[r] || r).join(', ')}`,
      });
    }
    next();
  };
}

export const ROLES = Object.keys(ROLE_LABELS);
export const ROLE_MAP = ROLE_LABELS;
