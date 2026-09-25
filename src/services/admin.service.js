import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/store.js';
import { nowISO } from '../utils/helpers.js';
import { badRequest, notFound, forbidden } from '../utils/errors.js';
import { config } from '../config/index.js';
import { notify } from './notification.service.js';
import { getUserProfile } from './user.service.js';
import { sendEmail } from './email.service.js';
import { getSettings } from './settings.service.js';
import { completeBot } from './robot.service.js';

export async function pendingUsers() {
  const rows = await db.users.find({ status: 'pending' });
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return Promise.all(rows.map((u) => getUserProfile(u.id)));
}

export async function approveUser(id, adminId) {
  const user = await db.users.findById(id);
  if (!user) throw notFound('User not found');
  if (user.status === 'active') throw badRequest('User is already active');
  await db.users.update(id, { status: 'active', approvedAt: nowISO(), approvedBy: adminId });
  notify(id, {
    type: 'account',
    title: 'Account approved 🎉',
    body: 'MT5 Smart Market approved your account. You can now sign in and start using the platform.',
    level: 'success',
  });
  return getUserProfile(id);
}

export async function rejectUser(id, adminId, reason) {
  const user = await db.users.findById(id);
  if (!user) throw notFound('User not found');
  await db.users.update(id, { status: 'suspended', approvedBy: adminId, rejectionReason: reason || 'Not approved' });
  notify(id, {
    type: 'account',
    title: 'Account not approved',
    body: reason || 'Your account could not be approved at this time. Contact support for details.',
    level: 'danger',
  });
  return getUserProfile(id);
}

export async function freezeUser(id, adminId, frozen, reason) {
  const user = await db.users.findById(id);
  if (!user) throw notFound('User not found');
  if (user.role === 'admin') throw forbidden('Cannot freeze an admin account');
  await db.users.update(id, {
    status: frozen ? 'suspended' : 'active',
    frozenReason: frozen ? (reason || 'Account frozen by MT5 Smart Market') : '',
    frozenAt: frozen ? nowISO() : null,
    frozenBy: frozen ? adminId : null,
  });
  // stop any running AI bot when freezing — settle it so the stake + profit is returned
  if (frozen) {
    const running = await db.robots.find({ userId: id, status: 'active' });
    for (const r of running) {
      try { await completeBot(r.id, 'stopped'); } catch { /* leave the row as-is if settlement fails */ }
    }
  }
  notify(id, {
    type: 'account',
    title: frozen ? 'Account frozen' : 'Account unfrozen',
    body: frozen
      ? (reason || 'Your account has been temporarily frozen. Please contact support.')
      : 'Your account has been reactivated. You can sign in and trade again.',
    level: frozen ? 'danger' : 'success',
  });
  if ((await getSettings()).emailAlertsEnabled) {
    sendEmail({
      userId: id,
      subject: frozen ? 'Your MT5 Smart Market account has been frozen' : 'Your MT5 Smart Market account has been reactivated',
      body: frozen
        ? `Your account has been frozen${reason ? `: ${reason}` : ''}. While frozen you cannot sign in, trade or withdraw. Contact support to resolve this.`
        : 'Your account has been reactivated. Full access has been restored.',
      category: 'account',
    }).catch(() => {});
  }
  return getUserProfile(id);
}

/**
 * Hard-delete a user and everything attached to them — EXCEPT their KYC
 * submissions and the identity documents they uploaded, which are retained
 * permanently for the admin (compliance / audit). Admins / self cannot be deleted.
 */
export async function deleteUser(id, adminId) {
  const user = await db.users.findById(id);
  if (!user) throw notFound('User not found');
  if (user.role === 'admin') throw forbidden('Admin accounts cannot be deleted here');
  if (id === adminId) throw forbidden('You cannot delete your own account');

  // file ids referenced by KYC submissions are kept; everything else is unlinked
  const kycRows = await db.kyc.find({ userId: id });
  const keepFileIds = new Set(kycRows.flatMap((k) => k.documentFileIds || []));
  const userFiles = (await db.files.find({ userId: id })).filter((f) => !keepFileIds.has(f.id));
  userFiles.forEach((f) => {
    try { fs.unlinkSync(path.join(config.paths.uploads, f.storedName)); } catch { /* ignore */ }
  });

  const wipeByUser = async (col) => {
    const rows = await col.find({ userId: id });
    for (const row of rows) await col.remove(row.id);
  };
  await wipeByUser(db.transactions);
  await wipeByUser(db.investments);
  await wipeByUser(db.trades);
  await wipeByUser(db.robots);
  await wipeByUser(db.notifications);
  await wipeByUser(db.emails);
  await wipeByUser(db.wallets);
  await wipeByUser(db.loginEvents);
  for (const f of userFiles) await db.files.remove(f.id);
  const refLinks = (await db.referrals.all()).filter((r) => r.referrerId === id || r.refereeId === id);
  for (const r of refLinks) await db.referrals.remove(r.id);
  // db.kyc rows and their document files are deliberately kept
  await db.users.remove(id);
  return { id, deleted: true, email: user.email, kycRetained: keepFileIds.size > 0 };
}

/** Admin edits a single transaction (amount / status / notes / method / address). */
export async function editTransaction(txId, patch) {
  const tx = await db.transactions.findById(txId);
  if (!tx) throw notFound('Transaction not found');
  const clean = {};
  for (const k of ['note', 'method', 'reference', 'status']) if (patch[k] !== undefined) clean[k] = patch[k];
  if (patch.amount !== undefined) {
    const amt = Number(patch.amount);
    if (!Number.isFinite(amt) || amt < 0) throw badRequest('amount must be a non-negative number');
    clean.amount = Math.round(amt * 100) / 100;
  }
  if (patch.meta && typeof patch.meta === 'object') clean.meta = { ...tx.meta, ...patch.meta };
  return db.transactions.update(txId, clean);
}
