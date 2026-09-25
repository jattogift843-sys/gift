import { db } from '../db/store.js';
import { assertPositiveNumber, assertString, money, nowISO } from '../utils/helpers.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { applyBalanceChange, createTransaction, mutateBalance } from './ledger.service.js';
import { getSettings, activeCryptoMethods } from './settings.service.js';
import { recordFiles } from './file.service.js';
import { notify } from './notification.service.js';
import { sendEmail } from './email.service.js';

const adminIds = async () => (await db.users.find({ role: 'admin' })).map((u) => u.id);
const notifyAdmins = async (payload) => {
  const ids = await adminIds();
  ids.forEach((id) => notify(id, payload));
};
const alert = async (userId, subject, body, category) => {
  if ((await getSettings()).emailAlertsEnabled) sendEmail({ userId, subject, body, category }).catch(() => {});
};

/* ============================ DEPOSITS ============================ */

export async function submitCryptoDeposit(userId, { methodId, amount, fromAddress, txHash, files }) {
  const user = await db.users.findById(userId);
  if (!user) throw notFound('User not found');
  const method = (await activeCryptoMethods()).find((m) => m.id === methodId);
  if (!method) throw badRequest('Choose a deposit method');
  if (!method.address) throw badRequest('This deposit method is not available yet. Please pick another.');
  const amt = assertPositiveNumber(amount, 'amount');
  if (amt < (method.minDeposit || (await getSettings()).minDeposit)) {
    throw badRequest(`Minimum deposit for ${method.symbol} is ${method.minDeposit}`);
  }
  const proof = files && files.length ? await recordFiles(files, { userId, purpose: 'deposit_proof' }) : [];

  const tx = await createTransaction({
    userId,
    type: 'deposit',
    amount: amt,
    status: 'pending',
    method: `${method.symbol} (${method.network})`,
    reference: txHash ? assertString(txHash, 'transaction hash', { max: 200 }) : null,
    note: '',
    meta: {
      channel: 'crypto',
      methodId: method.id,
      symbol: method.symbol,
      network: method.network,
      depositAddress: method.address,
      memo: method.memo || '',
      fromAddress: fromAddress ? String(fromAddress).slice(0, 200) : '',
      proofFileIds: proof.map((p) => p.id),
    },
  });

  notify(userId, {
    type: 'deposit',
    title: 'Deposit received — Pending',
    body: `Your ${money(amt)} ${method.symbol} deposit is Pending. You'll be notified once it's processed.`,
    level: 'warning',
    meta: { txId: tx.id },
  });
  await notifyAdmins({
    type: 'deposit_review',
    title: 'New deposit to review',
    body: `${user.firstName} ${user.lastName} submitted a ${money(amt)} ${method.symbol} deposit.`,
    level: 'warning',
    meta: { txId: tx.id, userId },
  });
  return tx;
}

export async function submitBankDeposit(userId, { amount, reference, files }) {
  const s = await getSettings();
  if (!s.bankDeposit?.enabled) throw badRequest('Bank deposits are currently disabled');
  const user = await db.users.findById(userId);
  const amt = assertPositiveNumber(amount, 'amount');
  if (amt < s.minDeposit) throw badRequest(`Minimum deposit is ${s.minDeposit} ${s.baseCurrency}`);
  const proof = files && files.length ? await recordFiles(files, { userId, purpose: 'deposit_proof' }) : [];
  const tx = await createTransaction({
    userId,
    type: 'deposit',
    amount: amt,
    status: 'pending',
    method: 'Bank Transfer',
    reference: reference ? assertString(reference, 'reference', { max: 160 }) : null,
    note: '',
    meta: { channel: 'bank', proofFileIds: proof.map((p) => p.id) },
  });
  notify(userId, { type: 'deposit', title: 'Deposit received — Pending', body: `Your ${money(amt)} bank transfer is Pending. You'll be notified once it's processed.`, level: 'warning', meta: { txId: tx.id } });
  await notifyAdmins({ type: 'deposit_review', title: 'New bank deposit to review', body: `${user.firstName} ${user.lastName} submitted ${money(amt)}.`, level: 'warning', meta: { txId: tx.id, userId } });
  return tx;
}

export async function attachDepositProof(userId, txId, files) {
  const tx = await db.transactions.findById(txId);
  if (!tx || tx.userId !== userId) throw notFound('Deposit not found');
  if (tx.status !== 'pending') throw badRequest('Proof can only be added while the deposit is pending');
  if (!files || !files.length) throw badRequest('No files uploaded');
  const recs = await recordFiles(files, { userId, purpose: 'deposit_proof' });
  const ids = [...(tx.meta?.proofFileIds || []), ...recs.map((r) => r.id)];
  return db.transactions.update(txId, { meta: { ...tx.meta, proofFileIds: ids } });
}

async function payReferralIfFirstDeposit(user) {
  if (!user?.referredBy) return;
  const confirmed = await db.transactions.find({ userId: user.id, type: 'deposit', status: 'completed' });
  if (confirmed.length !== 1) return; // only on the very first confirmed deposit
  const link = await db.referrals.findOne({ refereeId: user.id, status: 'pending' });
  if (!link) return;
  const s = await getSettings();
  const bonus = money((confirmed[0].amount * s.referralPercent) / 100);
  if (bonus <= 0) return;
  await applyBalanceChange(user.referredBy, bonus, {
    type: 'referral',
    status: 'completed',
    note: `Referral bonus — ${user.email} funded their account`,
    meta: { refereeId: user.id },
  });
  await db.referrals.update(link.id, { status: 'paid', bonusAmount: bonus, paidAt: nowISO() });
  notify(user.referredBy, { type: 'referral', title: 'Referral bonus paid', body: `You earned ${money(bonus)} because ${user.email} made their first deposit.`, level: 'success' });
}

export async function approveDeposit(txId, adminId) {
  const tx = await db.transactions.findById(txId);
  if (!tx || tx.type !== 'deposit') throw notFound('Deposit request not found');
  if (tx.status !== 'pending') throw badRequest('This deposit is not pending');
  // settle the same row in place — no duplicate transaction
  const balanceAfter = await mutateBalance(tx.userId, tx.amount);
  const updated = await db.transactions.update(tx.id, {
    status: 'completed',
    processedAt: nowISO(),
    balanceAfter,
    note: '',
    meta: { ...tx.meta, approvedBy: adminId },
  });
  notify(tx.userId, { type: 'deposit', title: 'Deposit processed', body: `${money(tx.amount)} has been added to your balance.`, level: 'success', meta: { txId: tx.id } });
  await alert(tx.userId, `Deposit processed: ${money(tx.amount)}`, `Your ${money(tx.amount)} deposit has been processed and added to your balance. New balance: ${money(balanceAfter)}.`, 'deposit');
  await payReferralIfFirstDeposit(await db.users.findById(tx.userId));
  return updated;
}

export function rejectDeposit(txId, adminId, reason) {
  return closeDepositRequest(txId, adminId, 'rejected', reason);
}
export async function cancelDeposit(txId, actorId, { asAdmin = false, reason } = {}) {
  const tx = await db.transactions.findById(txId);
  if (!tx || tx.type !== 'deposit') throw notFound('Deposit request not found');
  if (!asAdmin && tx.userId !== actorId) throw forbidden();
  return closeDepositRequest(txId, actorId, 'cancelled', reason);
}
async function closeDepositRequest(txId, actorId, status, reason) {
  const tx = await db.transactions.findById(txId);
  if (!tx || tx.type !== 'deposit') throw notFound('Deposit request not found');
  if (tx.status !== 'pending') throw badRequest('This deposit is not pending');
  const note = reason ? String(reason).slice(0, 200) : '';
  const updated = await db.transactions.update(tx.id, { status, processedAt: nowISO(), note, meta: { ...tx.meta, closedBy: actorId } });
  notify(tx.userId, {
    type: 'deposit',
    title: `Deposit ${status}`,
    body: `Your ${money(tx.amount)} deposit was ${status}. No funds were credited.${note ? ` Reason: ${note}` : ''}`,
    level: status === 'rejected' ? 'danger' : 'warning',
    meta: { txId: tx.id },
  });
  return updated;
}

/* ============================ WITHDRAWALS ============================ */

function buildBankDetails(input = {}) {
  const req = (v, name) => assertString(v, name, { min: 2, max: 140 });
  const opt = (v, name, max = 200) => (v ? assertString(v, name, { min: 0, max }) : '');
  const bank = {
    accountHolder: req(input.accountHolder, 'account holder name'),
    bankName: req(input.bankName, 'bank name'),
    bankCountry: req(input.bankCountry, 'bank country'),
    accountNumber: req(input.accountNumber, 'account number / IBAN'),
    swift: req(input.swiftRouting || input.swift, 'SWIFT/BIC or routing number'),
    iban: opt(input.iban, 'IBAN'),
    bankAddress: opt(input.bankAddress, 'bank address', 240),
    currency: opt(input.bankCurrency, 'account currency', 8).toUpperCase(),
    reference: opt(input.reference, 'reference', 140),
  };
  const summary = `${bank.accountHolder} · ${bank.bankName}, ${bank.bankCountry} · Acct ${bank.accountNumber}`
    + ` · SWIFT/Routing ${bank.swift}${bank.iban ? ` · IBAN ${bank.iban}` : ''}`;
  return { bank, summary };
}

export async function requestWithdrawal(userId, { amount, method, network, destination, walletId, bank }) {
  const s = await getSettings();
  const user = await db.users.findById(userId);
  if (!user) throw notFound('User not found');
  if (s.requireKycForWithdrawal && user.kycStatus !== 'verified') {
    throw badRequest('Identity verification is required before you can withdraw. Complete verification first.');
  }
  const amt = assertPositiveNumber(amount, 'amount');
  if (amt < s.minWithdrawal) throw badRequest(`Minimum withdrawal is ${s.minWithdrawal} ${s.baseCurrency}`);
  if (s.maxWithdrawal > 0 && amt > s.maxWithdrawal) {
    throw badRequest(`Maximum withdrawal per request is ${s.maxWithdrawal} ${s.baseCurrency}`);
  }
  if (amt > Number(user.balance)) throw badRequest('Amount exceeds your available balance');

  const cleanMethod = assertString(method, 'method', { max: 40 });
  const isBank = /bank/i.test(cleanMethod);
  let dest = destination;
  let net = network || '';
  let bankDetails = null;

  if (walletId) {
    const w = await db.wallets.findById(walletId);
    if (!w || w.userId !== userId) throw badRequest('Linked wallet not found');
    dest = w.address;
    net = w.network;
  } else if (isBank) {
    const built = buildBankDetails(bank || {});
    bankDetails = built.bank;
    dest = built.summary;
    net = 'SWIFT / wire';
  }
  dest = assertString(dest, 'destination', { min: 6, max: 500 });

  const fee = money((amt * s.withdrawalFeePercent) / 100);
  // Reserve funds immediately; refunded if the request is rejected/cancelled.
  const tx = await applyBalanceChange(userId, -amt, {
    type: 'withdrawal',
    status: 'pending',
    method: isBank ? 'Bank transfer' : cleanMethod,
    reference: dest,
    note: '',
    meta: {
      fee, netAmount: money(amt - fee), network: net,
      channel: isBank ? 'bank' : (walletId ? 'wallet' : 'crypto'),
      walletId: walletId || null, destination: dest,
      bank: bankDetails,
    },
  });
  notify(userId, { type: 'withdrawal', title: 'Withdrawal received — Pending', body: `Your ${money(amt)} withdrawal is Pending. You'll be notified once it's processed.`, level: 'warning', meta: { txId: tx.id } });
  await notifyAdmins({ type: 'withdrawal_review', title: 'New withdrawal to review', body: `${user.firstName} ${user.lastName} requested ${money(amt)} via ${cleanMethod}.`, level: 'warning', meta: { txId: tx.id, userId } });
  return tx;
}

export async function approveWithdrawal(txId, adminId) {
  const tx = await db.transactions.findById(txId);
  if (!tx || tx.type !== 'withdrawal') throw notFound('Withdrawal request not found');
  if (tx.status !== 'pending') throw badRequest('This withdrawal is not pending');
  const updated = await db.transactions.update(tx.id, { status: 'completed', processedAt: nowISO(), note: '', meta: { ...tx.meta, approvedBy: adminId } });
  const net = money(tx.meta?.netAmount ?? tx.amount);
  const dest = tx.meta?.destination || tx.reference;
  notify(tx.userId, { type: 'withdrawal', title: 'Withdrawal processed', body: `${net} has been sent to ${dest}.`, level: 'success', meta: { txId: tx.id } });
  await alert(tx.userId, `Withdrawal processed: ${net}`, `Your withdrawal has been processed. ${net} has been sent to ${dest}.`, 'withdrawal');
  return updated;
}

export function rejectWithdrawal(txId, adminId, reason) {
  return refundWithdrawal(txId, adminId, 'rejected', reason);
}
export async function cancelWithdrawal(txId, actorId, { asAdmin = false, reason } = {}) {
  const tx = await db.transactions.findById(txId);
  if (!tx || tx.type !== 'withdrawal') throw notFound('Withdrawal request not found');
  if (!asAdmin && tx.userId !== actorId) throw forbidden();
  return refundWithdrawal(txId, actorId, 'cancelled', reason);
}
async function refundWithdrawal(txId, actorId, status, reason) {
  const tx = await db.transactions.findById(txId);
  if (!tx || tx.type !== 'withdrawal') throw notFound('Withdrawal request not found');
  if (tx.status !== 'pending') throw badRequest('This withdrawal is not pending');
  // refund the reserved amount by settling the same row in place
  const balanceAfter = await mutateBalance(tx.userId, tx.amount);
  const note = reason ? String(reason).slice(0, 200) : '';
  const updated = await db.transactions.update(tx.id, {
    status, processedAt: nowISO(), balanceAfter, note,
    meta: { ...tx.meta, closedBy: actorId, refunded: true },
  });
  notify(tx.userId, { type: 'withdrawal', title: `Withdrawal ${status}`, body: `Your ${money(tx.amount)} withdrawal was ${status} and returned to your balance.${note ? ` Reason: ${note}` : ''}`, level: status === 'rejected' ? 'danger' : 'warning', meta: { txId: tx.id } });
  await alert(tx.userId, `Withdrawal ${status}`, `Your ${money(tx.amount)} withdrawal was ${status} and the full amount returned to your balance.${note ? ` Reason: ${note}` : ''}`, 'withdrawal');
  return updated;
}

/* ============================ ADMIN BALANCE ============================ */

export async function adminAdjustBalance(userId, { direction, amount, note }) {
  const amt = assertPositiveNumber(amount, 'amount');
  const delta = direction === 'debit' ? -amt : amt;
  const tx = await applyBalanceChange(userId, delta, {
    type: direction === 'debit' ? 'admin_debit' : 'admin_credit',
    status: 'completed',
    note: note ? assertString(note, 'note', { max: 200 }) : '',
  });
  notify(userId, {
    type: 'balance',
    title: direction === 'debit' ? 'Balance adjusted (debit)' : 'Funds added to your balance',
    body: `${direction === 'debit' ? '−' : '+'}${money(amt)}${note ? ` — ${note}` : ''}. New balance: ${money(tx.balanceAfter)}.`,
    level: direction === 'debit' ? 'warning' : 'success',
  });
  await alert(
    userId,
    direction === 'debit' ? `Adjustment to your balance: −${money(amt)}` : `Funds added to your balance: +${money(amt)}`,
    `${direction === 'debit' ? money(amt) + ' was deducted from' : money(amt) + ' was added to'} your account balance by the MT5 Smart Market desk${note ? ` (${note})` : ''}. New balance: ${money(tx.balanceAfter)}.`,
    'account',
  );
  return tx;
}

export async function pendingRequests() {
  const rows = (await db.transactions.find({ status: 'pending' }))
    .filter((t) => t.type === 'deposit' || t.type === 'withdrawal');
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return Promise.all(rows.map(async (t) => {
    const u = await db.users.findById(t.userId);
    return { ...t, user: u ? { id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email } : null };
  }));
}
