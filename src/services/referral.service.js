import { db } from '../db/store.js';
import { money } from '../utils/helpers.js';

export async function getReferralOverview(userId) {
  const links = await db.referrals.find({ referrerId: userId });
  const referred = await Promise.all(links.map(async (r) => {
    const u = await db.users.findById(r.refereeId);
    return {
      id: r.id,
      email: r.refereeEmail,
      name: u ? `${u.firstName} ${u.lastName}`.trim() || r.refereeEmail : r.refereeEmail,
      joinedAt: r.createdAt,
      status: r.status,
      bonusAmount: r.bonusAmount,
    };
  }));
  return {
    totalReferred: links.length,
    paidCount: links.filter((r) => r.status === 'paid').length,
    pendingCount: links.filter((r) => r.status === 'pending').length,
    totalEarned: money(links.reduce((a, r) => a + r.bonusAmount, 0)),
    referred,
  };
}
