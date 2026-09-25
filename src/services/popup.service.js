import { db } from '../db/store.js';
import { newId, nowISO } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { notify } from './notification.service.js';

/**
 * Admin pop-up messages. Unlike an announcement (a quiet notification in the
 * bell), a pop-up is shown as a modal dialog on the member dashboard the next
 * time the user loads or polls it, and stays queued until they acknowledge it.
 * Each pop-up records who has seen it so the admin can track delivery.
 */

const LEVELS = ['info', 'success', 'warning', 'danger'];

export async function createPopup(input, adminId) {
  const title = String(input.title || '').trim();
  if (!title) throw badRequest('A title is required');
  const body = String(input.body || '').trim();
  const level = LEVELS.includes(input.level) ? input.level : 'info';
  const ctaLabel = String(input.ctaLabel || '').trim().slice(0, 40);
  const ctaUrl = String(input.ctaUrl || '').trim().slice(0, 300);
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
    throw badRequest('The button link must start with http:// or https://');
  }

  let userId = null;
  if (input.audience === 'user' || input.userId) {
    const u = await db.users.findById(input.userId);
    if (!u || u.role !== 'user') throw badRequest('Choose a valid recipient');
    userId = u.id;
  }

  const popup = await db.popups.insert({
    id: newId('pop'),
    title,
    body,
    level,
    ctaLabel: ctaUrl ? (ctaLabel || 'Learn more') : '',
    ctaUrl,
    audience: userId ? 'user' : 'all',
    userId,
    active: true,
    createdBy: adminId,
    createdAt: nowISO(),
    seenBy: [],
  });

  // also drop a matching notification so it lives in the user's history
  const recipients = userId
    ? [await db.users.findById(userId)].filter(Boolean)
    : await db.users.find({ role: 'user' });
  recipients.forEach((u) =>
    notify(u.id, { type: 'admin_message', title, body, level, meta: { popupId: popup.id } }),
  );

  return decorate(popup);
}

async function decorate(p, totalUsers) {
  const total = totalUsers ?? await db.users.count({ role: 'user' });
  return {
    ...p,
    audienceCount: p.audience === 'user' ? 1 : total,
    seenCount: (p.seenBy || []).length,
  };
}

export async function listPopups() {
  const [rows, totalUsers] = await Promise.all([db.popups.all(), db.users.count({ role: 'user' })]);
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return Promise.all(rows.map(async (p) => {
    const d = await decorate(p, totalUsers);
    if (p.audience === 'user') {
      const u = await db.users.findById(p.userId);
      d.recipientEmail = u ? u.email : '(deleted user)';
    }
    return d;
  }));
}

export async function setPopupActive(id, active) {
  if (!(await db.popups.findById(id))) throw notFound('Pop-up not found');
  return decorate(await db.popups.update(id, { active: Boolean(active) }));
}

export async function deletePopup(id) {
  if (!(await db.popups.findById(id))) throw notFound('Pop-up not found');
  await db.popups.remove(id);
  return { removed: true };
}

/** Active pop-ups this user has not yet acknowledged, oldest first. */
export async function pendingPopupsForUser(userId) {
  const rows = await db.popups.all();
  return rows
    .filter(
      (p) =>
        p.active &&
        (p.audience === 'all' || p.userId === userId) &&
        !(p.seenBy || []).includes(userId),
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      level: p.level,
      ctaLabel: p.ctaLabel,
      ctaUrl: p.ctaUrl,
      createdAt: p.createdAt,
    }));
}

export async function acknowledgePopup(userId, id) {
  const p = await db.popups.findById(id);
  if (!p) return { acknowledged: true };
  if (!(p.seenBy || []).includes(userId)) {
    await db.popups.update(id, { seenBy: [...(p.seenBy || []), userId] });
  }
  return { acknowledged: true };
}
