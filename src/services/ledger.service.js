import { db, orm } from '../db/store.js';
import { users as usersTable, transactions as txTable } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { money, newId, nowISO } from '../utils/helpers.js';
import { badRequest, notFound, forbidden } from '../utils/errors.js';
import { filesByIds } from './file.service.js';

export const TX_TYPES = [
  'deposit', 'withdrawal', 'investment', 'roi', 'referral', 'trade_pnl',
  'admin_credit', 'admin_debit',
];

export async function listTransactions(filter = {}) {
  const where = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.type) where.type = filter.type;
  if (filter.status) where.status = filter.status;
  const rows = await db.transactions.find(Object.keys(where).length ? where : undefined);
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function decorateTransaction(tx) {
  if (!tx) return null;
  const user = await db.users.findById(tx.userId);
  return {
    ...tx,
    proofFiles: await filesByIds(tx.meta?.proofFileIds || []),
    user: user ? { id: user.id, name: `${user.firstName} ${user.lastName}`, email: user.email } : null,
  };
}

export async function getTransaction(id, requester) {
  const tx = await db.transactions.findById(id);
  if (!tx) throw notFound('Transaction not found');
  if (requester.role !== 'admin' && tx.userId !== requester.id) throw forbidden();
  return decorateTransaction(tx);
}

function buildTxRow({
  userId, type, amount, status = 'completed', method = null, reference = null,
  note = null, meta = {}, balanceAfter = null,
}) {
  if (!TX_TYPES.includes(type)) throw badRequest(`Unknown transaction type: ${type}`);
  return {
    id: newId('tx'),
    userId,
    type,
    amount: money(amount),
    status,
    method,
    reference,
    note,
    meta,
    balanceAfter,
    createdAt: nowISO(),
    processedAt: status === 'completed' ? nowISO() : null,
  };
}

export async function createTransaction(input) {
  return db.transactions.insert(buildTxRow(input));
}

/** Move a user's balance without writing a new transaction row (used when an
 *  existing pending row is being settled in place). Returns the new balance. */
export async function mutateBalance(userId, delta) {
  return orm.transaction(async (t) => {
    const [user] = await t.select().from(usersTable).where(eq(usersTable.id, userId)).for('update');
    if (!user) throw notFound('User not found');
    const next = money(Number(user.balance) + delta);
    if (next < 0) throw badRequest('Insufficient balance for this operation');
    await t.update(usersTable)
      .set({ balance: next, updatedAt: nowISO() })
      .where(eq(usersTable.id, userId));
    return next;
  });
}

/** Apply a signed delta to a user's balance and record a completed transaction. */
export async function applyBalanceChange(userId, delta, txInput) {
  return orm.transaction(async (t) => {
    const [user] = await t.select().from(usersTable).where(eq(usersTable.id, userId)).for('update');
    if (!user) throw notFound('User not found');
    const next = money(Number(user.balance) + delta);
    if (next < 0) throw badRequest('Insufficient balance for this operation');
    await t.update(usersTable)
      .set({ balance: next, updatedAt: nowISO() })
      .where(eq(usersTable.id, userId));
    const row = buildTxRow({ ...txInput, userId, amount: Math.abs(delta), balanceAfter: next });
    const [inserted] = await t.insert(txTable).values(row).returning();
    return inserted;
  });
}

export async function getUserBalanceSummary(userId) {
  const [txs, invsAll, user] = await Promise.all([
    listTransactions({ userId }),
    db.investments.find({ userId }),
    db.users.findById(userId),
  ]);
  const sum = (pred) => money(txs.filter(pred).reduce((a, t) => a + t.amount, 0));
  return {
    balance: user ? Number(user.balance) : 0,
    totalDeposited: sum((t) => t.type === 'deposit' && t.status === 'completed'),
    totalWithdrawn: sum((t) => t.type === 'withdrawal' && t.status === 'completed'),
    pendingDeposits: sum((t) => t.type === 'deposit' && t.status === 'pending'),
    pendingWithdrawals: sum((t) => t.type === 'withdrawal' && t.status === 'pending'),
    totalInvested: money(invsAll.reduce((a, i) => a + i.amount, 0)),
    activeInvested: money(invsAll.filter((i) => i.status === 'active').reduce((a, i) => a + i.amount, 0)),
    totalRoiEarned: sum((t) => t.type === 'roi' && t.status === 'completed'),
    referralEarned: sum((t) => t.type === 'referral' && t.status === 'completed'),
    tradePnl: money(
      txs.filter((t) => t.type === 'trade_pnl').reduce((a, t) => a + (t.meta?.signedAmount ?? 0), 0),
    ),
    activeInvestments: invsAll.filter((i) => i.status === 'active').length,
  };
}
