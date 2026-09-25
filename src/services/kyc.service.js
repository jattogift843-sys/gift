import { db } from '../db/store.js';
import { newId, nowISO, assertString } from '../utils/helpers.js';
import { badRequest, notFound, conflict } from '../utils/errors.js';
import { recordFiles, filesByIds } from './file.service.js';
import { notify } from './notification.service.js';
import { KYC_DOCUMENT_TYPES } from '../data/reference.js';

export async function getMyKyc(userId) {
  const rows = await db.kyc.find({ userId });
  const sub = rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!sub) return { status: 'unverified', submission: null };
  return { status: sub.status, submission: await decorate(sub) };
}

async function decorate(sub) {
  return { ...sub, documents: await filesByIds(sub.documentFileIds || []) };
}

export async function submitKyc(userId, { documentType, documentNumber, files }) {
  const user = await db.users.findById(userId);
  if (!user) throw notFound('User not found');
  if (user.kycStatus === 'verified') throw conflict('Your identity is already verified');
  const existingPending = await db.kyc.findOne({ userId, status: 'pending' });
  if (existingPending) throw conflict('You already have a verification under review');

  const type = assertString(documentType, 'document type', { max: 80 });
  if (!KYC_DOCUMENT_TYPES.includes(type)) throw badRequest('Choose a document type from the list');
  if (!files || !files.length) throw badRequest('Upload at least one document image or PDF');

  const recs = await recordFiles(files, { userId, purpose: 'kyc_document', meta: { type } });
  const sub = await db.kyc.insert({
    id: newId('kyc'),
    userId,
    documentType: type,
    documentNumber: documentNumber ? assertString(documentNumber, 'document number', { max: 60 }) : '',
    documentFileIds: recs.map((r) => r.id),
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: '',
    createdAt: nowISO(),
  });
  await db.users.update(userId, { kycStatus: 'pending' });
  notify(userId, {
    type: 'kyc',
    title: 'Identity documents submitted',
    body: 'Your documents are under review. This usually takes a short while.',
    level: 'info',
  });
  const admins = await db.users.find({ role: 'admin' });
  admins.forEach((a) =>
    notify(a.id, { type: 'kyc_review', title: 'KYC submission to review', body: `${user.firstName} ${user.lastName} submitted ${type}.`, level: 'warning', meta: { userId, kycId: sub.id } }),
  );
  return decorate(sub);
}

/**
 * Every KYC submission ever made stays here permanently, whatever its status —
 * pass status='all' (or nothing) to see the full history, or a specific status
 * to filter. Documents are always attached and are never removed on review.
 */
export async function listKycForReview(status = 'all') {
  const filter = !status || status === 'all' ? null : status;
  const rows = await db.kyc.find(filter ? { status: filter } : undefined);
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return Promise.all(rows.map(async (k) => {
    const [u, reviewer, decorated] = await Promise.all([
      db.users.findById(k.userId),
      k.reviewedBy ? db.users.findById(k.reviewedBy) : Promise.resolve(null),
      decorate(k),
    ]);
    return {
      ...decorated,
      reviewerName: reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : null,
      user: u ? { id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email } : { id: k.userId, name: 'Deleted user', email: '—' },
    };
  }));
}

export async function kycCounts() {
  const [all, pending, verified, rejected] = await Promise.all([
    db.kyc.count(),
    db.kyc.count({ status: 'pending' }),
    db.kyc.count({ status: 'verified' }),
    db.kyc.count({ status: 'rejected' }),
  ]);
  return { all, pending, verified, rejected };
}

export async function reviewKyc(kycId, adminId, { decision, note }) {
  const sub = await db.kyc.findById(kycId);
  if (!sub) throw notFound('Submission not found');
  if (!['verified', 'rejected'].includes(decision)) throw badRequest('decision must be verified or rejected');
  await db.kyc.update(kycId, { status: decision, reviewedBy: adminId, reviewedAt: nowISO(), reviewNote: note || '' });
  await db.users.update(sub.userId, { kycStatus: decision });
  notify(sub.userId, {
    type: 'kyc',
    title: decision === 'verified' ? 'Identity verified ✓' : 'Identity verification rejected',
    body: decision === 'verified'
      ? 'Your identity has been verified. All withdrawal limits are now lifted.'
      : (note || 'Your documents could not be verified. Please resubmit clear, valid documents.'),
    level: decision === 'verified' ? 'success' : 'danger',
  });
  return db.kyc.findById(kycId);
}
