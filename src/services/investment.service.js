import { db } from '../db/store.js';
import { assertPositiveNumber, money, newId, nowISO } from '../utils/helpers.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { getPlan } from './plan.service.js';
import { applyBalanceChange, createTransaction } from './ledger.service.js';
import { notify } from './notification.service.js';

const HOUR_MS = 60 * 60 * 1000;

export async function listInvestments(filter = {}) {
  const where = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.status) where.status = filter.status;
  const rows = await db.investments.find(Object.keys(where).length ? where : undefined);
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(decorate);
}

export function decorate(inv) {
  const now = Date.now();
  const started = new Date(inv.startedAt).getTime();
  const ends = new Date(inv.endsAt).getTime();
  const progress = Math.min(1, Math.max(0, (now - started) / (ends - started)));
  const periodRoi = money((inv.amount * inv.roiPercent) / 100);
  const totalPeriods = Math.round((inv.durationDays * 24) / inv.periodHours);
  return {
    ...inv,
    periodRoi,
    projectedTotalRoi: money(periodRoi * totalPeriods),
    progressPercent: Math.round(progress * 100),
    nextAccrualAt: inv.status === 'active'
      ? new Date(new Date(inv.lastAccrualAt).getTime() + inv.periodHours * HOUR_MS).toISOString()
      : null,
  };
}

export async function createInvestment(userId, { planId, amount }) {
  const plan = await getPlan(planId);
  if (!plan.isActive) throw badRequest('This plan is not currently available');
  const amt = assertPositiveNumber(amount, 'amount');
  if (amt < plan.minAmount || amt > plan.maxAmount) {
    throw badRequest(`Amount must be between ${plan.minAmount} and ${plan.maxAmount}`);
  }
  const user = await db.users.findById(userId);
  if (!user) throw notFound('User not found');
  if (Number(user.balance) < amt) throw badRequest('Insufficient balance. Please make a deposit first.');

  const start = new Date();
  const end = new Date(start.getTime() + plan.durationDays * 24 * HOUR_MS);

  await applyBalanceChange(userId, -amt, {
    type: 'investment',
    status: 'completed',
    note: `Staked in ${plan.name}`,
    meta: { planId: plan.id, kind: 'stake' },
  });

  const investment = await db.investments.insert({
    id: newId('inv'),
    userId,
    planId: plan.id,
    planName: plan.name,
    amount: money(amt),
    roiPercent: plan.roiPercent,
    periodHours: plan.periodHours,
    durationDays: plan.durationDays,
    principalReturn: plan.principalReturn,
    status: 'active',
    startedAt: start.toISOString(),
    endsAt: end.toISOString(),
    lastAccrualAt: start.toISOString(),
    accruedTotal: 0,
    payoutsCount: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });

  return decorate(investment);
}

/**
 * The recurring engine. Walks every active investment, pays out each ROI
 * period that has fully elapsed, and closes matured investments (returning
 * principal when the plan allows). Safe to run repeatedly / on any interval.
 */
export async function accrueDueInvestments(reference = new Date()) {
  const now = reference.getTime();
  const active = await db.investments.find({ status: 'active' });
  const result = { checked: active.length, payouts: 0, paidAmount: 0, completed: 0 };

  for (const inv of active) {
    const periodMs = inv.periodHours * HOUR_MS;
    const endMs = new Date(inv.endsAt).getTime();
    let cursor = new Date(inv.lastAccrualAt).getTime();
    const periodRoi = money((inv.amount * inv.roiPercent) / 100);

    let paidPeriods = 0;
    let paidAmount = 0;
    while (cursor + periodMs <= Math.min(now, endMs)) {
      cursor += periodMs;
      paidPeriods += 1;
      paidAmount = money(paidAmount + periodRoi);
    }

    if (paidPeriods > 0) {
      await applyBalanceChange(inv.userId, paidAmount, {
        type: 'roi',
        status: 'completed',
        note: `ROI x${paidPeriods} from ${inv.planName}`,
        meta: { investmentId: inv.id, periods: paidPeriods },
      });
      await db.investments.update(inv.id, {
        lastAccrualAt: new Date(cursor).toISOString(),
        accruedTotal: money(inv.accruedTotal + paidAmount),
        payoutsCount: inv.payoutsCount + paidPeriods,
      });
      result.payouts += paidPeriods;
      result.paidAmount = money(result.paidAmount + paidAmount);
      notify(inv.userId, {
        type: 'roi',
        title: `ROI payout: +${paidAmount}`,
        body: `${inv.planName} paid ${paidPeriods} ROI period${paidPeriods > 1 ? 's' : ''} to your balance.`,
        level: 'success',
        meta: { investmentId: inv.id },
      });
    }

    if (now >= endMs) {
      const fresh = await db.investments.findById(inv.id);
      if (fresh.principalReturn) {
        await applyBalanceChange(inv.userId, fresh.amount, {
          type: 'investment',
          status: 'completed',
          note: `Principal returned from ${fresh.planName}`,
          meta: { investmentId: fresh.id, kind: 'principal_return' },
        });
      }
      await db.investments.update(inv.id, { status: 'completed', completedAt: new Date(endMs).toISOString() });
      result.completed += 1;
      notify(inv.userId, {
        type: 'investment',
        title: `${fresh.planName} completed`,
        body: `Your investment matured. Total ROI earned: ${fresh.accruedTotal}.${fresh.principalReturn ? ' Principal has been returned to your balance.' : ''}`,
        level: 'success',
        meta: { investmentId: fresh.id },
      });
    }
  }

  return result;
}

export async function cancelInvestment(userId, investmentId, { asAdmin = false } = {}) {
  const inv = await db.investments.findById(investmentId);
  if (!inv) throw notFound('Investment not found');
  if (!asAdmin && inv.userId !== userId) throw forbidden();
  if (inv.status !== 'active') throw badRequest('Only active investments can be cancelled');

  // Return remaining principal only (ROI already paid stays paid).
  await applyBalanceChange(inv.userId, inv.amount, {
    type: 'investment',
    status: 'completed',
    note: `Investment cancelled - principal returned (${inv.planName})`,
    meta: { investmentId: inv.id, kind: 'cancel_refund', byAdmin: asAdmin },
  });
  return db.investments.update(inv.id, { status: 'cancelled', cancelledAt: nowISO() });
}

export { createTransaction };
