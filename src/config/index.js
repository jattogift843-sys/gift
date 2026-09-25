import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  jwt: {
    secret: process.env.JWT_SECRET || 'insecure-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  accrualIntervalMinutes: Number(process.env.ACCRUAL_INTERVAL_MINUTES || 60),
  robotTickMinutes: Number(process.env.ROBOT_TICK_MINUTES || 1),
  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@mt5smartmarket.com').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin@12345',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'MT5 Smart Market <no-reply@mt5smartmarket.com>',
  },
  paths: {
    root: ROOT_DIR,
    uploads: path.join(ROOT_DIR, 'src', 'db', 'uploads'),
    // the two independently deployable frontend bundles
    site: path.join(ROOT_DIR, 'frontend', 'site'),
    app: path.join(ROOT_DIR, 'frontend', 'app'),
  },
  // comma-separated origins allowed to call the API from a browser (CORS).
  // empty = same-origin only (no CORS headers, current behaviour)
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  uploads: {
    maxBytes: 8 * 1024 * 1024, // 8 MB per file
    allowed: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
  },
};
