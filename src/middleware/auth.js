import { verifyToken } from '../utils/token.js';
import { db } from '../db/store.js';
import { unauthorized, forbidden } from '../utils/errors.js';

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

export async function authenticate(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(unauthorized());
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(unauthorized('Session expired, please sign in again'));
  }
  try {
    const user = await db.users.findById(payload.sub);
    if (!user) return next(unauthorized('Account no longer exists'));
    if (user.status === 'suspended') return next(forbidden('Your account is frozen. Please contact support.'));
    if (user.status === 'pending') return next(forbidden('Your account is awaiting MT5 Smart Market approval.'));
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') return next(forbidden('Admin access required'));
  return next();
}
