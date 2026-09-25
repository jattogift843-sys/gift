import { db } from '../db/store.js';
import { assertPositiveNumber, assertString, newId, nowISO, pick } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';

export async function listPlans({ includeInactive = false } = {}) {
  const rows = await db.plans.all();
  return rows
    .filter((p) => includeInactive || p.isActive)
    .sort((a, b) => a.minAmount - b.minAmount);
}

export async function getPlan(id) {
  const plan = await db.plans.findById(id);
  if (!plan) throw notFound('Investment plan not found');
  return plan;
}

function validatePlanInput(input, partial = false) {
  const out = {};
  if (!partial || input.name !== undefined) out.name = assertString(input.name, 'name', { max: 60 });
  if (!partial || input.description !== undefined)
    out.description = assertString(input.description || '-', 'description', { max: 400 });
  if (!partial || input.minAmount !== undefined)
    out.minAmount = assertPositiveNumber(input.minAmount, 'minAmount');
  if (!partial || input.maxAmount !== undefined)
    out.maxAmount = assertPositiveNumber(input.maxAmount, 'maxAmount');
  if (!partial || input.roiPercent !== undefined)
    out.roiPercent = assertPositiveNumber(input.roiPercent, 'roiPercent');
  if (!partial || input.periodHours !== undefined)
    out.periodHours = assertPositiveNumber(input.periodHours, 'periodHours');
  if (!partial || input.durationDays !== undefined)
    out.durationDays = assertPositiveNumber(input.durationDays, 'durationDays');
  if (input.principalReturn !== undefined) out.principalReturn = Boolean(input.principalReturn);
  if (input.isActive !== undefined) out.isActive = Boolean(input.isActive);
  if (out.minAmount && out.maxAmount && out.maxAmount < out.minAmount)
    throw badRequest('maxAmount must be greater than or equal to minAmount');
  return out;
}

export async function createPlan(input) {
  const data = validatePlanInput(input);
  return db.plans.insert({
    id: newId('plan'),
    principalReturn: true,
    isActive: true,
    ...data,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });
}

export async function updatePlan(id, input) {
  await getPlan(id);
  const data = validatePlanInput(input, true);
  return db.plans.update(id, data);
}

export async function deletePlan(id) {
  await getPlan(id);
  const inUse = await db.investments.findOne({ planId: id, status: 'active' });
  if (inUse) {
    // keep history intact - just deactivate
    return db.plans.update(id, { isActive: false });
  }
  await db.plans.remove(id);
  return { id, deleted: true };
}

export const publicPlan = (p) =>
  pick(p, [
    'id',
    'name',
    'description',
    'minAmount',
    'maxAmount',
    'roiPercent',
    'periodHours',
    'durationDays',
    'principalReturn',
    'isActive',
  ]);
