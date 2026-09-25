import { customAlphabet } from 'nanoid';
import { badRequest } from './errors.js';

const idAlphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const nano = customAlphabet(idAlphabet, 20);
const refNano = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

export const newId = (prefix) => `${prefix}_${nano()}`;
export const newRefCode = () => refNano();

export const nowISO = () => new Date().toISOString();

/** Round to 2 decimals, guarding against float dust. */
export const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function assertPositiveNumber(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw badRequest(`${field} must be a positive number`);
  return n;
}

export function assertString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw badRequest(`${field} is invalid`);
  }
  return value.trim();
}

export function assertEmail(value) {
  const email = assertString(value, 'email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('email is invalid');
  return email;
}

export const pick = (obj, keys) =>
  keys.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});

export const paginate = (rows, { page = 1, limit = 20 } = {}) => {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const start = (p - 1) * l;
  return {
    data: rows.slice(start, start + l),
    meta: { page: p, limit: l, total: rows.length, pages: Math.ceil(rows.length / l) || 1 },
  };
};
