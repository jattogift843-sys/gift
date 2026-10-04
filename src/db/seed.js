import bcrypt from 'bcryptjs';
import { db } from './store.js';
import { config } from '../config/index.js';
import { newId, newRefCode, nowISO } from '../utils/helpers.js';
import { getSettings } from '../services/settings.service.js';
import { ensureTestimonialSeed } from '../services/testimonial.service.js';

/**
 * Seeds:
 *  - one admin account (credentials from .env)
 *  - one approved member account for signing in and exploring the dashboard
 *  - the settings singleton
 *  - the investment-plan catalogue (fully editable by the admin afterwards)
 *  - the starter testimonials
 * No transactions or ledger data. Rename or delete the member from the admin
 * console once you have your own accounts.
 */

const MEMBER = {
  email: (process.env.MEMBER_EMAIL || 'member@mt5smartmarket.com').toLowerCase(),
  password: process.env.MEMBER_PASSWORD || 'Member@12345',
};

const DEFAULT_PLANS = [
  { name: 'Starter', description: 'Entry tier for new investors. Daily ROI, capital returned at term end.', minAmount: 100, maxAmount: 999, roiPercent: 3, periodHours: 24, durationDays: 7, principalReturn: true },
  { name: 'Silver', description: 'Balanced growth plan with twice-daily ROI payouts.', minAmount: 1000, maxAmount: 4999, roiPercent: 2.5, periodHours: 12, durationDays: 14, principalReturn: true },
  { name: 'Gold', description: 'High-yield managed portfolio across FX majors and metals.', minAmount: 5000, maxAmount: 24999, roiPercent: 3.2, periodHours: 12, durationDays: 21, principalReturn: true },
  { name: 'Platinum', description: 'Institutional desk allocation with frequent compounding-style payouts.', minAmount: 25000, maxAmount: 250000, roiPercent: 0.9, periodHours: 6, durationDays: 30, principalReturn: true },
];

async function seedAdmin() {
  const existing = await db.users.findOne({ email: config.admin.email });
  if (existing) {
    if (existing.role !== 'admin' || existing.status !== 'active') {
      await db.users.update(existing.id, { role: 'admin', status: 'active' });
    }
    return existing;
  }
  const passwordHash = await bcrypt.hash(config.admin.password, 10);
  return db.users.insert({
    id: newId('usr'),
    firstName: 'Platform',
    lastName: 'Admin',
    email: config.admin.email,
    passwordHash,
    role: 'admin',
    status: 'active',
    balance: 0,
    currency: 'USD',
    accountType: 'Investment',
    country: 'United States',
    phone: '',
    dateOfBirth: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    securityQuestion: 'In what city were you born?',
    securityAnswerHash: await bcrypt.hash('admin', 10),
    referralCode: newRefCode(),
    referredBy: null,
    kycStatus: 'verified',
    twoFactorEnabled: false,
    avatarFileId: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    approvedAt: nowISO(),
    approvedBy: 'system',
    lastLoginAt: null,
  });
}

async function seedMember() {
  if (await db.users.findOne({ email: MEMBER.email })) return;
  const passwordHash = await bcrypt.hash(MEMBER.password, 10);
  await db.users.insert({
    id: newId('usr'),
    firstName: 'Sample',
    lastName: 'Member',
    email: MEMBER.email,
    passwordHash,
    role: 'user',
    status: 'active', // pre-approved so it can sign in immediately
    balance: 0,
    currency: 'USD',
    accountType: 'Investment',
    country: 'United Kingdom',
    phone: '',
    dateOfBirth: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    securityQuestion: 'What is the name of your first pet?',
    securityAnswerHash: await bcrypt.hash('rex', 10),
    referralCode: newRefCode(),
    referredBy: null,
    kycStatus: 'unverified',
    twoFactorEnabled: false,
    avatarFileId: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    approvedAt: nowISO(),
    approvedBy: 'system',
    lastLoginAt: null,
  });
}

async function seedPlans() {
  if ((await db.plans.count()) > 0) return;
  for (const p of DEFAULT_PLANS) {
    await db.plans.insert({ id: newId('plan'), isActive: true, ...p, createdAt: nowISO(), updatedAt: nowISO() });
  }
}

export async function ensureSeed() {
  await getSettings();
  await seedAdmin();
  await seedMember();
  await seedPlans();
  await ensureTestimonialSeed();
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed.js')) {
  ensureSeed()
    .then(() => { console.log('Seed complete (admin + member + settings + plans + testimonials).'); process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}
