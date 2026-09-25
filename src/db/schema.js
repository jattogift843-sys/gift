/**
 * Drizzle schema for MT5 Smart Market — Postgres (Supabase).
 *
 * Mapping notes:
 *  - IDs stay as the app's prefixed strings (`usr_…`, `tx_…`) — text primary keys.
 *  - `seq` (bigserial) gives every table a stable insertion order; the store's
 *    `all()` orders by it, replacing the old "array order in the JSON file".
 *  - Money columns use `numeric(20,2)` but are read back as JS numbers (see
 *    `amount` custom type) so existing `balance + delta` arithmetic keeps working.
 *  - Timestamps are stored as ISO strings in `text` columns — identical semantics
 *    to the JSON store (lexical sort, `new Date(x)` parsing). Can move to
 *    `timestamptz` in a later cleanup pass.
 *  - `meta` and array-ish fields are `jsonb`.
 *
 * Column names are snake_case (via `casing: 'snake_case'` in drizzle config);
 * the JS property names below stay camelCase, matching the rest of the codebase.
 */
import {
  pgTable, text, boolean, integer, doublePrecision, jsonb, bigserial, customType, index,
} from 'drizzle-orm/pg-core';

/** numeric(20,2) in Postgres, plain JS number in application code. */
const amount = customType({
  dataType() {
    return 'numeric(20, 2)';
  },
  toDriver(value) {
    return value == null ? null : String(value);
  },
  fromDriver(value) {
    return value == null ? null : Number(value);
  },
});

const seq = () => bigserial('seq', { mode: 'number' }).notNull();
const isoText = (name) => text(name);

/* ------------------------------------------------------------------ users */
export const users = pgTable('users', {
  seq: seq(),
  id: text('id').primaryKey(),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull().default(''),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  status: text('status').notNull().default('pending'),
  balance: amount('balance').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  accountType: text('account_type').default(''),
  country: text('country').default(''),
  phone: text('phone').default(''),
  dateOfBirth: text('date_of_birth').default(''),
  addressLine1: text('address_line1').default(''),
  addressLine2: text('address_line2').default(''),
  city: text('city').default(''),
  stateProvince: text('state_province').default(''),
  postalCode: text('postal_code').default(''),
  securityQuestion: text('security_question').default(''),
  securityAnswerHash: text('security_answer_hash'),
  referralCode: text('referral_code').unique(),
  referredBy: text('referred_by'),
  kycStatus: text('kyc_status').notNull().default('unverified'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  avatarFileId: text('avatar_file_id'),
  rejectionReason: text('rejection_reason'),
  frozenReason: text('frozen_reason').default(''),
  frozenAt: isoText('frozen_at'),
  frozenBy: text('frozen_by'),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
  approvedAt: isoText('approved_at'),
  approvedBy: text('approved_by'),
  lastLoginAt: isoText('last_login_at'),
}, (t) => [
  index('users_role_idx').on(t.role),
  index('users_status_idx').on(t.status),
]);

/* ------------------------------------------------------------------ plans */
export const plans = pgTable('plans', {
  seq: seq(),
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  minAmount: amount('min_amount').notNull().default(0),
  maxAmount: amount('max_amount').notNull().default(0),
  roiPercent: doublePrecision('roi_percent').notNull().default(0),
  periodHours: doublePrecision('period_hours').notNull().default(24),
  durationDays: doublePrecision('duration_days').notNull().default(30),
  principalReturn: boolean('principal_return').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
});

/* ------------------------------------------------------------ investments */
export const investments = pgTable('investments', {
  seq: seq(),
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  planId: text('plan_id').notNull(),
  planName: text('plan_name').default(''),
  amount: amount('amount').notNull().default(0),
  roiPercent: doublePrecision('roi_percent').notNull().default(0),
  periodHours: doublePrecision('period_hours').notNull().default(24),
  durationDays: doublePrecision('duration_days').notNull().default(30),
  principalReturn: boolean('principal_return').notNull().default(true),
  status: text('status').notNull().default('active'),
  startedAt: isoText('started_at'),
  endsAt: isoText('ends_at'),
  lastAccrualAt: isoText('last_accrual_at'),
  accruedTotal: amount('accrued_total').notNull().default(0),
  payoutsCount: integer('payouts_count').notNull().default(0),
  completedAt: isoText('completed_at'),
  cancelledAt: isoText('cancelled_at'),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('investments_user_idx').on(t.userId),
  index('investments_status_idx').on(t.status),
]);

/* ----------------------------------------------------------- transactions */
export const transactions = pgTable('transactions', {
  seq: seq(),
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  amount: amount('amount').notNull().default(0),
  status: text('status').notNull().default('completed'),
  method: text('method'),
  reference: text('reference'),
  note: text('note'),
  meta: jsonb('meta').notNull().default({}),
  balanceAfter: amount('balance_after'),
  createdAt: isoText('created_at').notNull(),
  processedAt: isoText('processed_at'),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('transactions_user_idx').on(t.userId),
  index('transactions_type_status_idx').on(t.type, t.status),
  index('transactions_status_idx').on(t.status),
]);

/* ----------------------------------------------------------------- trades */
export const trades = pgTable('trades', {
  seq: seq(),
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  symbol: text('symbol'),
  side: text('side'),
  lots: doublePrecision('lots').default(0),
  leverage: doublePrecision('leverage').default(1),
  entryPrice: doublePrecision('entry_price').default(0),
  exitPrice: doublePrecision('exit_price'),
  margin: amount('margin').notNull().default(0),
  notional: amount('notional').notNull().default(0),
  status: text('status').notNull().default('open'),
  pnl: amount('pnl').notNull().default(0),
  source: text('source').notNull().default('user'),
  openedAt: isoText('opened_at'),
  closedAt: isoText('closed_at'),
  closedBy: text('closed_by'),
  meta: jsonb('meta').notNull().default({}),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('trades_user_idx').on(t.userId),
  index('trades_status_idx').on(t.status),
  index('trades_source_idx').on(t.source),
]);

/* -------------------------------------------------------------- referrals */
export const referrals = pgTable('referrals', {
  seq: seq(),
  id: text('id').primaryKey(),
  referrerId: text('referrer_id').notNull(),
  refereeId: text('referee_id').notNull(),
  refereeEmail: text('referee_email').default(''),
  bonusAmount: amount('bonus_amount').notNull().default(0),
  status: text('status').notNull().default('pending'),
  paidAt: isoText('paid_at'),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('referrals_referrer_idx').on(t.referrerId),
  index('referrals_referee_idx').on(t.refereeId),
]);

/* --------------------------------------------------------------- settings */
export const settings = pgTable('settings', {
  seq: seq(),
  id: text('id').primaryKey(),
  brandName: text('brand_name').default('MT5 Smart Market'),
  baseCurrency: text('base_currency').default('USD'),
  referralPercent: doublePrecision('referral_percent').default(5),
  withdrawalFeePercent: doublePrecision('withdrawal_fee_percent').default(2),
  minWithdrawal: amount('min_withdrawal').default(50),
  maxWithdrawal: amount('max_withdrawal').default(0),
  minDeposit: amount('min_deposit').default(20),
  requireKycForWithdrawal: boolean('require_kyc_for_withdrawal').default(true),
  emailAlertsEnabled: boolean('email_alerts_enabled').default(true),
  supportEmail: text('support_email').default(''),
  aiBot: jsonb('ai_bot').notNull().default({}),
  bankDeposit: jsonb('bank_deposit').notNull().default({}),
  cryptoMethods: jsonb('crypto_methods').notNull().default([]),
  marketSymbols: jsonb('market_symbols').notNull().default([]),
  createdAt: isoText('created_at'),
  updatedAt: isoText('updated_at'),
});

/* ---------------------------------------------------------- notifications */
export const notifications = pgTable('notifications', {
  seq: seq(),
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').default(''),
  level: text('level').notNull().default('info'),
  meta: jsonb('meta').notNull().default({}),
  read: boolean('read').notNull().default(false),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('notifications_user_read_idx').on(t.userId, t.read),
]);

/* ----------------------------------------------------------------- popups */
export const popups = pgTable('popups', {
  seq: seq(),
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').default(''),
  level: text('level').notNull().default('info'),
  ctaLabel: text('cta_label').default(''),
  ctaUrl: text('cta_url').default(''),
  audience: text('audience').notNull().default('all'),
  userId: text('user_id'),
  active: boolean('active').notNull().default(true),
  createdBy: text('created_by'),
  seenBy: jsonb('seen_by').notNull().default([]),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
});

/* ----------------------------------------------------------- testimonials */
export const testimonials = pgTable('testimonials', {
  seq: seq(),
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  location: text('location').default(''),
  rating: integer('rating').notNull().default(5),
  plan: text('plan').default(''),
  text: text('text').notNull(),
  active: boolean('active').notNull().default(true),
  order: integer('sort_order').notNull().default(0),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
});

/* -------------------------------------------------------------------- kyc */
export const kyc = pgTable('kyc', {
  seq: seq(),
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  documentType: text('document_type').default(''),
  documentNumber: text('document_number').default(''),
  documentFileIds: jsonb('document_file_ids').notNull().default([]),
  status: text('status').notNull().default('pending'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: isoText('reviewed_at'),
  reviewNote: text('review_note').default(''),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('kyc_user_idx').on(t.userId),
  index('kyc_status_idx').on(t.status),
]);

/* ---------------------------------------------------------------- wallets */
export const wallets = pgTable('wallets', {
  seq: seq(),
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  label: text('label').default(''),
  network: text('network').default(''),
  asset: text('asset').default(''),
  address: text('address').notNull(),
  verified: boolean('verified').notNull().default(false),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('wallets_user_idx').on(t.userId),
]);

/* ------------------------------------------------------------------ files */
export const files = pgTable('files', {
  seq: seq(),
  id: text('id').primaryKey(),
  userId: text('user_id'),
  purpose: text('purpose').default(''),
  storedName: text('stored_name').notNull(),
  originalName: text('original_name').default(''),
  mimetype: text('mimetype').default(''),
  size: integer('size').default(0),
  meta: jsonb('meta').notNull().default({}),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('files_user_idx').on(t.userId),
]);

/* ------------------------------------------------------------ loginEvents */
export const loginEvents = pgTable('login_events', {
  seq: seq(),
  id: text('id').primaryKey(),
  userId: text('user_id'),
  email: text('email').default(''),
  result: text('result').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  at: isoText('at').notNull(),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('login_events_user_idx').on(t.userId),
]);

/* ----------------------------------------------------------------- robots */
export const robots = pgTable('robots', {
  seq: seq(),
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').default(''),
  status: text('status').notNull().default('active'),
  stake: amount('stake').notNull().default(0),
  durationDays: doublePrecision('duration_days').default(0),
  profitTargetPercent: doublePrecision('profit_target_percent').default(0),
  targetProfit: amount('target_profit').notNull().default(0),
  symbols: jsonb('symbols').notNull().default([]),
  winRate: doublePrecision('win_rate').default(0.72),
  intervalMinutes: doublePrecision('interval_minutes').default(5),
  startedBy: text('started_by'),
  createdBy: text('created_by'),
  startedAt: isoText('started_at'),
  endsAt: isoText('ends_at'),
  lastRunAt: isoText('last_run_at'),
  completedAt: isoText('completed_at'),
  completionReason: text('completion_reason'),
  stats: jsonb('stats').notNull().default({ trades: 0, wins: 0, losses: 0, netPnl: 0 }),
  stoppedAt: isoText('stopped_at'),
  stoppedBy: text('stopped_by'),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('robots_user_idx').on(t.userId),
  index('robots_status_idx').on(t.status),
]);

/* ----------------------------------------------------------------- emails */
export const emails = pgTable('emails', {
  seq: seq(),
  id: text('id').primaryKey(),
  userId: text('user_id'),
  to: text('to'),
  subject: text('subject').default(''),
  body: text('body').default(''),
  category: text('category').default('general'),
  delivery: text('delivery').default('pending'),
  provider: text('provider').default('log'),
  error: text('error'),
  createdAt: isoText('created_at').notNull(),
  updatedAt: isoText('updated_at'),
}, (t) => [
  index('emails_user_idx').on(t.userId),
]);

/** name → table, for the generic store layer */
export const tables = {
  users, plans, investments, transactions, trades, referrals, settings,
  notifications, popups, testimonials, kyc, wallets, files, loginEvents,
  robots, emails,
};
