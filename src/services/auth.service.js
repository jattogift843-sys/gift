import bcrypt from 'bcryptjs';
import { db } from '../db/store.js';
import { signToken } from '../utils/token.js';
import {
  assertEmail, assertString, newId, newRefCode, nowISO,
} from '../utils/helpers.js';
import { conflict, unauthorized, badRequest, forbidden, notFound } from '../utils/errors.js';
import { getUserByEmail, getUserByReferralCode, toPublicUser } from './user.service.js';
import { notify } from './notification.service.js';
import { sendEmail } from './email.service.js';
import {
  COUNTRIES, CURRENCY_CODES, ACCOUNT_TYPES, SECURITY_QUESTIONS,
} from '../data/reference.js';

async function uniqueReferralCode() {
  let code;
  do { code = newRefCode(); } while (await db.users.findOne({ referralCode: code }));
  return code;
}

const norm = (s) => String(s || '').trim().toLowerCase();

export async function register(input) {
  const firstName = assertString(input.firstName, 'first name', { min: 2, max: 60 });
  const lastName = assertString(input.lastName, 'last name', { min: 2, max: 60 });
  const email = assertEmail(input.email);
  const password = assertString(input.password, 'password', { min: 8, max: 128 });
  const confirmPassword = String(input.confirmPassword || '');
  if (password !== confirmPassword) throw badRequest('Password and confirm password do not match');

  const country = assertString(input.country, 'country', { max: 60 });
  if (!COUNTRIES.includes(country)) throw badRequest('Please choose a country from the list');

  const currency = assertString(input.currency, 'currency', { max: 8 }).toUpperCase();
  if (!CURRENCY_CODES.includes(currency)) throw badRequest('Please choose a currency from the list');

  const accountType = assertString(input.accountType, 'account type', { max: 40 });
  if (!ACCOUNT_TYPES.includes(accountType)) throw badRequest('Please choose an account type from the list');

  const securityQuestion = assertString(input.securityQuestion, 'security question', { max: 160 });
  if (!SECURITY_QUESTIONS.includes(securityQuestion)) throw badRequest('Please choose a security question from the list');
  const securityAnswer = assertString(input.securityAnswer, 'security answer', { min: 2, max: 120 });

  if (await getUserByEmail(email)) throw conflict('An account with that email already exists');

  const referrer = await getUserByReferralCode(input.referralCode);
  const [passwordHash, securityAnswerHash, referralCode] = await Promise.all([
    bcrypt.hash(password, 10),
    bcrypt.hash(norm(securityAnswer), 10),
    uniqueReferralCode(),
  ]);

  const user = await db.users.insert({
    id: newId('usr'),
    firstName,
    lastName,
    email,
    passwordHash,
    role: 'user',
    status: 'pending', // must be approved by MT5 Smart Market before first login
    balance: 0,
    currency,
    accountType,
    country,
    phone: input.phone ? assertString(input.phone, 'phone', { max: 40 }) : '',
    dateOfBirth: input.dateOfBirth ? assertString(input.dateOfBirth, 'date of birth', { max: 20 }) : '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    securityQuestion,
    securityAnswerHash,
    referralCode,
    referredBy: referrer ? referrer.id : null,
    kycStatus: 'unverified',
    twoFactorEnabled: false,
    avatarFileId: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    approvedAt: null,
    approvedBy: null,
    lastLoginAt: null,
  });

  if (referrer) {
    await db.referrals.insert({
      id: newId('ref'),
      referrerId: referrer.id,
      refereeId: user.id,
      refereeEmail: user.email,
      bonusAmount: 0,
      status: 'pending',
      createdAt: nowISO(),
    });
  }

  // tell every admin there is a new signup to review
  const admins = await db.users.find({ role: 'admin' });
  admins.forEach((admin) =>
    notify(admin.id, {
      type: 'signup_pending',
      title: 'New account awaiting approval',
      body: `${firstName} ${lastName} (${email}) just registered.`,
      level: 'warning',
      meta: { userId: user.id },
    }),
  );

  return { pending: true, email: user.email };
}

export async function login({ email, password }, ctx = {}) {
  const user = await getUserByEmail(assertEmail(email));
  const record = (result) =>
    db.loginEvents.insert({
      id: newId('lgn'),
      userId: user ? user.id : null,
      email: norm(email),
      result,
      ip: ctx.ip || null,
      userAgent: ctx.userAgent || null,
      at: nowISO(),
    }).catch((err) => console.error('[loginEvent] failed:', err?.message || err));

  if (!user) { record('invalid'); throw unauthorized('Invalid email or password'); }
  const match = await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!match) { record('invalid'); throw unauthorized('Invalid email or password'); }
  if (user.status === 'pending') {
    record('pending');
    throw forbidden('Your account is awaiting MT5 Smart Market approval. You will be notified by email once your account is approved.');
  }
  if (user.status === 'suspended') {
    record('suspended');
    throw forbidden(user.frozenReason
      ? `Your account is frozen: ${user.frozenReason}. Please contact support.`
      : 'Your account is frozen. Please contact support.');
  }

  record('success');
  await db.users.update(user.id, { lastLoginAt: nowISO() }).catch((err) => console.error('[lastLoginAt update] failed:', err?.message || err));
  notify(user.id, {
    type: 'login',
    title: 'New sign-in to your account',
    body: `Signed in${ctx.ip ? ` from ${ctx.ip}` : ''}. If this wasn't you, change your password immediately.`,
    level: 'info',
  });
  return issueSession(user);
}

/**
 * Admins manage their own credentials without re-entering the current password;
 * every other account must confirm it.
 */
async function assertCurrentPassword(user, currentPassword) {
  if (user.role === 'admin') return;
  const match = await bcrypt.compare(String(currentPassword || ''), user.passwordHash);
  if (!match) throw badRequest('Current password is incorrect');
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await db.users.findById(userId);
  if (!user) throw unauthorized();
  await assertCurrentPassword(user, currentPassword);
  const clean = assertString(newPassword, 'new password', { min: 8, max: 128 });
  await db.users.update(userId, { passwordHash: await bcrypt.hash(clean, 10), updatedAt: nowISO() });
  notify(userId, { type: 'security', title: 'Password changed', body: 'Your sign-in password was updated. If this wasn\'t you, contact support immediately.', level: 'warning' });
  return true;
}

export async function changeEmail(userId, { currentPassword, newEmail }) {
  const user = await db.users.findById(userId);
  if (!user) throw unauthorized();
  await assertCurrentPassword(user, currentPassword);
  const email = assertEmail(newEmail);
  if (email === user.email) throw badRequest('That is already your sign-in email');
  const clash = await db.users.findOne({ email });
  if (clash && clash.id !== userId) throw conflict('Another account already uses that email');
  const previous = user.email;
  await db.users.update(userId, { email, updatedAt: nowISO() });
  notify(userId, {
    type: 'security',
    title: 'Sign-in email changed',
    body: `Your sign-in email is now ${email}. Use it next time you log in.`,
    level: 'warning',
  });
  // warn the old address in case this wasn't the account owner
  sendEmail({
    to: previous,
    subject: 'Your MT5 Smart Market sign-in email was changed',
    body: `The email used to sign in to your MT5 Smart Market account was changed from ${previous} to ${email}.\n\nIf you did not make this change, contact support right away.`,
    category: 'account',
  }).catch(() => {});
  return { email };
}

export async function updateSecurityQuestion(userId, { currentPassword, securityQuestion, securityAnswer }) {
  const user = await db.users.findById(userId);
  if (!user) throw unauthorized();
  await assertCurrentPassword(user, currentPassword);
  if (!SECURITY_QUESTIONS.includes(securityQuestion)) throw badRequest('Choose a security question from the list');
  const answer = assertString(securityAnswer, 'security answer', { min: 2, max: 120 });
  await db.users.update(userId, {
    securityQuestion,
    securityAnswerHash: await bcrypt.hash(norm(answer), 10),
  });
  notify(userId, { type: 'security', title: 'Security question updated', body: 'Your security question and answer were changed.', level: 'warning' });
  return true;
}

export async function setTwoFactor(userId, enabled) {
  const user = await db.users.findById(userId);
  if (!user) throw unauthorized();
  await db.users.update(userId, { twoFactorEnabled: Boolean(enabled) });
  notify(userId, {
    type: 'security',
    title: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`,
    body: enabled ? 'An email code will be required on your next sign-ins.' : 'Two-factor authentication is now off.',
    level: enabled ? 'success' : 'warning',
  });
  return true;
}

/* ---- forgot password via security question ---- */
export async function startPasswordReset(email) {
  const user = await getUserByEmail(norm(email));
  if (!user || !user.securityAnswerHash) throw notFound('No account with a security question was found for that email');
  return { email: user.email, securityQuestion: user.securityQuestion };
}

export async function completePasswordReset({ email, securityAnswer, newPassword }) {
  const user = await getUserByEmail(norm(email));
  if (!user || !user.securityAnswerHash) throw notFound('Account not found');
  const ok = await bcrypt.compare(norm(securityAnswer), user.securityAnswerHash);
  if (!ok) throw badRequest('That answer does not match our records');
  const clean = assertString(newPassword, 'new password', { min: 8, max: 128 });
  await db.users.update(user.id, { passwordHash: await bcrypt.hash(clean, 10) });
  notify(user.id, { type: 'security', title: 'Password reset', body: 'Your password was reset using your security question.', level: 'warning' });
  return true;
}

export async function loginHistory(userId, limit = 25) {
  const rows = await db.loginEvents.find({ userId });
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

function issueSession(user) {
  return { token: signToken({ sub: user.id, role: user.role }), user: toPublicUser(user) };
}

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}
