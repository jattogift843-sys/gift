import { db } from '../db/store.js';
import { newId, nowISO } from '../utils/helpers.js';
import {
  COUNTRIES,
  CURRENCIES,
  CURRENCY_CODES,
  ACCOUNT_TYPES,
  SECURITY_QUESTIONS,
  DEFAULT_CRYPTO_METHODS,
  KYC_DOCUMENT_TYPES,
} from '../data/reference.js';

export const SETTINGS_ID = 'settings_singleton';

const DEFAULTS = {
  id: SETTINGS_ID,
  brandName: 'MT5 Smart Market',
  baseCurrency: 'USD', // ledger accounting currency
  referralPercent: 5,
  withdrawalFeePercent: 2,
  minWithdrawal: 50,
  maxWithdrawal: 0, // 0 = no per-request cap
  minDeposit: 20,
  requireKycForWithdrawal: true,
  emailAlertsEnabled: true,
  supportEmail: 'support@mt5smartmarket.com',
  aiBot: {
    enabled: true,
    minStake: 100,
    maxStake: 100000,
    winRate: 0.72,
    durationDays: [1, 3, 7, 14, 30],
    profitTargets: [10, 20, 35, 50, 100],
    symbols: [],
  },
  bankDeposit: {
    enabled: true,
    bankName: '',
    accountName: '',
    accountNumber: '',
    iban: '',
    swift: '',
    reference: 'Use your account email as the payment reference',
    instructions: '',
  },
  cryptoMethods: DEFAULT_CRYPTO_METHODS.map((m) => ({ id: newId('cm'), ...m })),
  marketSymbols: [
    { symbol: 'EURUSD', name: 'Euro / US Dollar', price: 1.0875, kind: 'forex' },
    { symbol: 'GBPUSD', name: 'British Pound / US Dollar', price: 1.2712, kind: 'forex' },
    { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', price: 147.85, kind: 'forex' },
    { symbol: 'XAUUSD', name: 'Gold / US Dollar', price: 2338.4, kind: 'metal' },
    { symbol: 'BTCUSD', name: 'Bitcoin / US Dollar', price: 63120.0, kind: 'crypto' },
    { symbol: 'ETHUSD', name: 'Ethereum / US Dollar', price: 3280.5, kind: 'crypto' },
    { symbol: 'US30', name: 'Dow Jones 30', price: 39120.0, kind: 'index' },
    { symbol: 'NAS100', name: 'Nasdaq 100', price: 18240.0, kind: 'index' },
  ],
  updatedAt: nowISO(),
};

/**
 * The settings row is read on almost every request (wallet context, market feed,
 * bot config…) but changes only when an admin edits it. Cache it briefly and
 * bust the cache on every write.
 */
let cache = null;
let cacheAt = 0;
const CACHE_MS = 15000;
export function invalidateSettingsCache() { cache = null; }

export async function getSettings() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;

  let s = await db.settings.findById(SETTINGS_ID);
  if (!s) {
    try {
      s = await db.settings.insert({ ...DEFAULTS });
    } catch {
      s = await db.settings.findById(SETTINGS_ID); // lost a race — re-read
    }
  }
  // forward-fill any keys added after the row was first created
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined || s[k] === null) patch[k] = v;
  if (Object.keys(patch).length) s = await db.settings.update(SETTINGS_ID, patch);

  cache = s;
  cacheAt = Date.now();
  return s;
}

const EDITABLE = [
  'brandName', 'baseCurrency', 'referralPercent', 'withdrawalFeePercent', 'minWithdrawal',
  'maxWithdrawal', 'minDeposit', 'requireKycForWithdrawal', 'emailAlertsEnabled', 'supportEmail',
  'bankDeposit', 'cryptoMethods', 'marketSymbols', 'aiBot',
];

export async function updateSettings(patch) {
  await getSettings();
  const clean = {};
  for (const key of EDITABLE) if (patch[key] !== undefined) clean[key] = patch[key];
  const row = await db.settings.update(SETTINGS_ID, clean);
  invalidateSettingsCache();
  return row;
}

/* ---- crypto method CRUD (admin) ---- */
export async function addCryptoMethod(input) {
  const s = await getSettings();
  const method = {
    id: newId('cm'),
    symbol: (input.symbol || 'BTC').toUpperCase(),
    name: input.name || input.symbol || 'Crypto',
    network: input.network || 'Mainnet',
    address: input.address || '',
    memo: input.memo || '',
    minDeposit: Number(input.minDeposit) || 20,
    confirmations: Number(input.confirmations) || 1,
    instructions: input.instructions || '',
    rank: Number(input.rank) || s.cryptoMethods.length + 1,
    active: input.active !== false,
  };
  await db.settings.update(SETTINGS_ID, { cryptoMethods: [...s.cryptoMethods, method] });
  invalidateSettingsCache();
  return method;
}

export async function updateCryptoMethod(id, patch) {
  const s = await getSettings();
  const next = s.cryptoMethods.map((m) =>
    m.id === id
      ? {
          ...m,
          ...['symbol', 'name', 'network', 'address', 'memo', 'instructions'].reduce((a, k) => {
            if (patch[k] !== undefined) a[k] = patch[k];
            return a;
          }, {}),
          ...(patch.minDeposit !== undefined ? { minDeposit: Number(patch.minDeposit) } : {}),
          ...(patch.confirmations !== undefined ? { confirmations: Number(patch.confirmations) } : {}),
          ...(patch.rank !== undefined ? { rank: Number(patch.rank) } : {}),
          ...(patch.active !== undefined ? { active: Boolean(patch.active) } : {}),
        }
      : m,
  );
  await db.settings.update(SETTINGS_ID, { cryptoMethods: next });
  invalidateSettingsCache();
  return next.find((m) => m.id === id) || null;
}

export async function removeCryptoMethod(id) {
  const s = await getSettings();
  await db.settings.update(SETTINGS_ID, { cryptoMethods: s.cryptoMethods.filter((m) => m.id !== id) });
  invalidateSettingsCache();
  return { id, removed: true };
}

export async function activeCryptoMethods() {
  const s = await getSettings();
  return [...s.cryptoMethods]
    .filter((m) => m.active)
    .sort((a, b) => a.rank - b.rank || a.symbol.localeCompare(b.symbol));
}

/** What the public / signup pages need. */
export async function publicConfig() {
  const s = await getSettings();
  return {
    brandName: s.brandName,
    baseCurrency: s.baseCurrency,
    supportEmail: s.supportEmail,
    referralPercent: s.referralPercent,
    withdrawalFeePercent: s.withdrawalFeePercent,
    minWithdrawal: s.minWithdrawal,
    minDeposit: s.minDeposit,
    requireKycForWithdrawal: s.requireKycForWithdrawal,
    maxWithdrawal: s.maxWithdrawal || 0,
    aiBot: {
      enabled: s.aiBot?.enabled !== false,
      minStake: s.aiBot?.minStake ?? 100,
      maxStake: s.aiBot?.maxStake ?? 100000,
      durationDays: s.aiBot?.durationDays?.length ? s.aiBot.durationDays : [1, 3, 7, 14, 30],
      profitTargets: s.aiBot?.profitTargets?.length ? s.aiBot.profitTargets : [10, 20, 35, 50, 100],
    },
    countries: COUNTRIES,
    currencies: CURRENCIES,
    currencyCodes: CURRENCY_CODES,
    accountTypes: ACCOUNT_TYPES,
    securityQuestions: SECURITY_QUESTIONS,
    kycDocumentTypes: KYC_DOCUMENT_TYPES,
  };
}
