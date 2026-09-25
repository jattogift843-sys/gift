import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { db } from '../db/store.js';
import { newId, nowISO } from '../utils/helpers.js';
import { notify } from './notification.service.js';

/**
 * Email alerts. If SMTP is configured in .env we send for real; otherwise every
 * message is logged to the `emails` collection (visible to the admin) so the
 * feature is fully wired and testable without a mail server. Every email also
 * raises an in-app notification with an 📧 marker.
 */

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host) return null;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

export async function sendEmail({ userId, to, subject, body, category = 'general', alsoNotify = true }) {
  const user = userId ? await db.users.findById(userId) : null;
  const address = to || user?.email;
  const record = await db.emails.insert({
    id: newId('eml'),
    userId: userId || null,
    to: address || null,
    subject,
    body,
    category, // 'trade' | 'deposit' | 'withdrawal' | 'account' | 'robot' | 'general'
    delivery: 'pending',
    provider: config.smtp.host ? 'smtp' : 'log',
    error: null,
    createdAt: nowISO(),
  });

  const tx = getTransporter();
  if (tx && address) {
    try {
      await tx.sendMail({ from: config.smtp.from, to: address, subject, text: body });
      await db.emails.update(record.id, { delivery: 'sent' });
    } catch (err) {
      await db.emails.update(record.id, { delivery: 'failed', error: err.message });
      console.error('[email] send failed:', err.message);
    }
  } else {
    await db.emails.update(record.id, { delivery: 'logged' });
    if (config.env !== 'test') console.log(`[email→${address || '?'}] ${subject}`);
  }

  if (alsoNotify && userId) {
    notify(userId, {
      type: 'email',
      title: `📧 ${subject}`,
      body,
      level: category === 'trade' || category === 'robot' ? 'info' : 'info',
      meta: { emailId: record.id, category },
    });
  }
  return record;
}

export async function listEmails({ userId, category, limit = 100 } = {}) {
  const where = {};
  if (userId) where.userId = userId;
  if (category) where.category = category;
  const rows = await db.emails.find(Object.keys(where).length ? where : undefined);
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}
