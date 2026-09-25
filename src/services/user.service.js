import { db } from '../db/store.js';
import { getUserBalanceSummary } from './ledger.service.js';
import { assertString } from '../utils/helpers.js';
import { CURRENCY_CODES, COUNTRIES, ACCOUNT_TYPES } from '../data/reference.js';
import { badRequest } from '../utils/errors.js';

const PUBLIC_FIELDS = [
  'id', 'firstName', 'lastName', 'email', 'role', 'status', 'balance', 'currency',
  'accountType', 'country', 'phone', 'dateOfBirth', 'addressLine1', 'addressLine2',
  'city', 'stateProvince', 'postalCode', 'referralCode', 'referredBy', 'kycStatus',
  'twoFactorEnabled', 'avatarFileId', 'securityQuestion', 'createdAt', 'approvedAt',
  'lastLoginAt',
];

export function toPublicUser(user) {
  if (!user) return null;
  const out = PUBLIC_FIELDS.reduce((acc, k) => {
    acc[k] = user[k];
    return acc;
  }, {});
  out.name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  out.hasSecurityQuestion = Boolean(user.securityAnswerHash);
  return out;
}

export const getUserById = (id) => db.users.findById(id);
export const getUserByEmail = (email) =>
  db.users.findOne({ email: String(email || '').toLowerCase() });
export const getUserByReferralCode = (code) =>
  code ? db.users.findOne({ referralCode: String(code).toUpperCase() }) : Promise.resolve(null);

export async function listUsers({ search = '', role, status } = {}) {
  let rows = await db.users.all();
  if (role) rows = rows.filter((u) => u.role === role);
  if (status) rows = rows.filter((u) => u.status === status);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        (u.email || '').includes(q),
    );
  }
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return Promise.all(
    rows.map(async (u) => ({ ...toPublicUser(u), summary: await getUserBalanceSummary(u.id) })),
  );
}

export async function getUserProfile(id, summary) {
  const user = await db.users.findById(id);
  if (!user) return null;
  return { ...toPublicUser(user), summary: summary ?? await getUserBalanceSummary(id) };
}

const SELF_EDITABLE = [
  'firstName', 'lastName', 'phone', 'dateOfBirth', 'addressLine1', 'addressLine2',
  'city', 'stateProvince', 'postalCode',
];

/** Fields the user may change about themselves (not email, balance, status, currency*). */
export async function updateOwnProfile(id, patch) {
  const clean = {};
  for (const key of SELF_EDITABLE) {
    if (patch[key] !== undefined) clean[key] = assertString(String(patch[key] ?? ''), key, { min: 0, max: 120 });
  }
  if (patch.country !== undefined) {
    if (patch.country && !COUNTRIES.includes(patch.country)) throw badRequest('Unknown country');
    clean.country = patch.country;
  }
  if (patch.currency !== undefined) {
    const cur = String(patch.currency || '').toUpperCase();
    if (!CURRENCY_CODES.includes(cur)) throw badRequest('Unsupported currency');
    clean.currency = cur;
  }
  if (patch.accountType !== undefined) {
    if (patch.accountType && !ACCOUNT_TYPES.includes(patch.accountType)) throw badRequest('Unknown account type');
    clean.accountType = patch.accountType;
  }
  await db.users.update(id, clean);
  return getUserProfile(id);
}

/** Everything an admin may change about a user. */
const ADMIN_EDITABLE = [
  ...SELF_EDITABLE, 'country', 'city', 'stateProvince', 'postalCode',
];
export async function adminUpdateUser(id, patch) {
  const clean = {};
  for (const key of ADMIN_EDITABLE) if (patch[key] !== undefined) clean[key] = patch[key];
  if (patch.email !== undefined) {
    const email = String(patch.email).toLowerCase();
    const clash = await db.users.findOne({ email });
    if (clash && clash.id !== id) throw badRequest('Another account already uses that email');
    clean.email = email;
  }
  if (patch.currency !== undefined) {
    const cur = String(patch.currency).toUpperCase();
    if (!CURRENCY_CODES.includes(cur)) throw badRequest('Unsupported currency');
    clean.currency = cur;
  }
  if (patch.accountType !== undefined) clean.accountType = patch.accountType;
  if (patch.status !== undefined && ['pending', 'active', 'suspended'].includes(patch.status)) clean.status = patch.status;
  if (patch.role !== undefined && ['user', 'admin'].includes(patch.role)) clean.role = patch.role;
  if (patch.kycStatus !== undefined && ['unverified', 'pending', 'verified', 'rejected'].includes(patch.kycStatus)) clean.kycStatus = patch.kycStatus;
  if (patch.twoFactorEnabled !== undefined) clean.twoFactorEnabled = Boolean(patch.twoFactorEnabled);
  if (patch.referralCode !== undefined) clean.referralCode = String(patch.referralCode).toUpperCase();
  await db.users.update(id, clean);
  return getUserProfile(id);
}
