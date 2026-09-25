import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config/index.js';
import { db } from '../db/store.js';
import { newId, nowISO } from '../utils/helpers.js';
import { notFound, forbidden, badRequest } from '../utils/errors.js';

const UP_DIR = config.paths.uploads;
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10).replace(/[^.\w]/g, '');
    cb(null, `${newId('file')}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxBytes, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!config.uploads.allowed.includes(file.mimetype)) {
      const err = new Error('Only images (JPG/PNG/WebP) and PDF files are allowed');
      err.code = 'UPLOAD_REJECTED';
      return cb(err);
    }
    cb(null, true);
  },
});

/** Persist multer file objects as file records owned by a user, tagged by purpose. */
export function recordFiles(files = [], { userId, purpose, meta = {} }) {
  return Promise.all(
    files.map((f) =>
      db.files.insert({
        id: newId('rec'),
        userId,
        purpose, // 'deposit_proof' | 'kyc_document' | 'avatar'
        storedName: f.filename,
        originalName: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        meta,
        createdAt: nowISO(),
      }),
    ),
  );
}

export async function getFileForDownload(recId, requester) {
  const rec = await db.files.findById(recId);
  if (!rec) throw notFound('File not found');
  if (requester.role !== 'admin' && rec.userId !== requester.id) throw forbidden();
  const abs = path.join(UP_DIR, rec.storedName);
  if (!fs.existsSync(abs)) throw notFound('File is missing from storage');
  return { rec, abs };
}

export function publicFileRef(rec) {
  if (!rec) return null;
  return {
    id: rec.id,
    originalName: rec.originalName,
    mimetype: rec.mimetype,
    size: rec.size,
    url: `/api/files/${rec.id}`,
    createdAt: rec.createdAt,
  };
}

export async function filesByIds(ids = []) {
  const recs = await Promise.all(ids.map((id) => db.files.findById(id)));
  return recs.filter(Boolean).map(publicFileRef);
}

export function assertUploadOk(files) {
  if (!files || !files.length) throw badRequest('At least one file is required');
}
