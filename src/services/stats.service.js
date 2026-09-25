import { db } from '../db/store.js';
import { money } from '../utils/helpers.js';

export async function platformStats() {
  const [users, txs, invs, trades, robots, kycRows] = await Promise.all([
    db.users.all(),
    db.transactions.all(),
    db.investments.all(),
    db.trades.all(),
    db.robots.all(),
    db.kyc.all(),
  ]);

  const sum = (rows, pred) => money(rows.filter(pred).reduce((a, t) => a + t.amount, 0));

  return {
    users: {
      total: users.filter((u) => u.role === 'user').length,
      active: users.filter((u) => u.role === 'user' && u.status === 'active').length,
      pending: users.filter((u) => u.status === 'pending').length,
      suspended: users.filter((u) => u.status === 'suspended').length,
      admins: users.filter((u) => u.role === 'admin').length,
    },
    money: {
      totalBalances: money(users.reduce((a, u) => a + Number(u.balance), 0)),
      deposits: sum(txs, (t) => t.type === 'deposit' && t.status === 'completed'),
      withdrawals: sum(txs, (t) => t.type === 'withdrawal' && t.status === 'completed'),
      roiPaid: sum(txs, (t) => t.type === 'roi' && t.status === 'completed'),
      referralPaid: sum(txs, (t) => t.type === 'referral' && t.status === 'completed'),
    },
    investments: {
      total: invs.length,
      active: invs.filter((i) => i.status === 'active').length,
      completed: invs.filter((i) => i.status === 'completed').length,
      capitalActive: money(
        invs.filter((i) => i.status === 'active').reduce((a, i) => a + i.amount, 0),
      ),
    },
    trades: {
      total: trades.length,
      open: trades.filter((t) => t.status === 'open').length,
      realisedPnl: money(
        trades.filter((t) => t.status === 'closed').reduce((a, t) => a + t.pnl, 0),
      ),
    },
    robots: {
      active: robots.filter((r) => r.status === 'active').length,
      total: robots.length,
    },
    pending: {
      deposits: txs.filter((t) => t.type === 'deposit' && t.status === 'pending').length,
      withdrawals: txs.filter((t) => t.type === 'withdrawal' && t.status === 'pending').length,
      users: users.filter((u) => u.status === 'pending').length,
      kyc: kycRows.filter((k) => k.status === 'pending').length,
    },
  };
}

export async function recentActivity(limit = 12) {
  const rows = await db.transactions.all();
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return Promise.all(rows.slice(0, limit).map(async (t) => {
    const u = await db.users.findById(t.userId);
    return {
      id: t.id,
      type: t.type,
      amount: t.amount,
      status: t.status,
      createdAt: t.createdAt,
      user: u ? { name: `${u.firstName} ${u.lastName}`.trim() || u.email, email: u.email } : null,
    };
  }));
}
