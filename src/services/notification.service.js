import { and, eq } from 'drizzle-orm';
import { db, orm } from '../db/store.js';
import { notifications as notifTable } from '../db/schema.js';
import { newId, nowISO } from '../utils/helpers.js';

/**
 * In-app notifications. Every meaningful account event writes one so the user's
 * notification bar and page always reflect what happened.
 */

export function notify(userId, { type, title, body = '', level = 'info', meta = {} }) {
  const p = db.notifications.insert({
    id: newId('ntf'),
    userId,
    type,
    title,
    body,
    level, // info | success | warning | danger
    meta,
    read: false,
    createdAt: nowISO(),
  });
  // callers may fire-and-forget; never let a notification write crash a request
  p.catch((err) => console.error('[notify] failed:', err?.message || err));
  return p;
}

export async function listNotifications(userId, { unreadOnly = false } = {}) {
  let rows = await db.notifications.find(unreadOnly ? { userId, read: false } : { userId });
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function unreadCount(userId) {
  return db.notifications.count({ userId, read: false });
}

export async function markRead(userId, id) {
  const n = await db.notifications.findById(id);
  if (!n || n.userId !== userId) return null;
  return db.notifications.update(id, { read: true });
}

export async function markAllRead(userId) {
  const rows = await orm.update(notifTable)
    .set({ read: true, updatedAt: nowISO() })
    .where(and(eq(notifTable.userId, userId), eq(notifTable.read, false)))
    .returning({ id: notifTable.id });
  return rows.length;
}

export async function removeNotification(userId, id) {
  const n = await db.notifications.findById(id);
  if (!n || n.userId !== userId) return false;
  return db.notifications.remove(id);
}

/** Admin broadcast to every active user (or a single user). */
export async function broadcast({ title, body, level = 'info', userId = null }) {
  const targets = userId
    ? [await db.users.findById(userId)].filter(Boolean)
    : await db.users.find({ role: 'user' });
  await Promise.all(targets.map((u) => notify(u.id, { type: 'admin_message', title, body, level })));
  return { sent: targets.length };
}
