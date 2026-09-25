import { db } from '../db/store.js';
import { newId, nowISO, assertString } from '../utils/helpers.js';
import { notFound } from '../utils/errors.js';

const SEED = [
  { name: 'Daniel Osei', location: 'Accra, Ghana', rating: 5, plan: 'Gold', text: 'Withdrew my first profit in under an hour. I invested $2,000 and the ROI hit my wallet exactly on schedule. This is the real deal.' },
  { name: 'Priya Nair', location: 'Mumbai, India', rating: 5, plan: 'Silver', text: 'I was sceptical at first, but every payout has landed on time. Support answered me within minutes when I had a question about my withdrawal.' },
  { name: 'Marcus Bennett', location: 'Manchester, UK', rating: 5, plan: 'Platinum', text: 'Six months in. Payments always come through to my bank the same day they are approved. Clean dashboard, no games.' },
  { name: 'Sofia Almeida', location: 'Lisbon, Portugal', rating: 5, plan: 'Gold', text: 'Reinvested my returns twice already. The compounding on the Gold plan has genuinely changed how I save.' },
  { name: 'Kwame Mensah', location: 'Kumasi, Ghana', rating: 5, plan: 'Silver', text: 'Deposited with USDT, got credited after MT5 Smart Market confirmed it, and my daily ROI started the next cycle. Smooth from start to finish.' },
  { name: 'Elena Petrova', location: 'Sofia, Bulgaria', rating: 5, plan: 'Starter', text: 'Started small with the Starter plan to test it. Payout came through, so I upgraded. No regrets.' },
  { name: 'James Carter', location: 'Toronto, Canada', rating: 5, plan: 'Platinum', text: 'The withdrawal-to-linked-wallet feature is excellent. One click and my crypto is on its way. Funds have never been late.' },
  { name: 'Aisha Bello', location: 'Lagos, Nigeria', rating: 5, plan: 'Gold', text: 'My referral bonuses alone cover my monthly bills now. Everyone I invited has been paid too.' },
];

export async function ensureTestimonialSeed() {
  if ((await db.testimonials.count()) > 0) return;
  for (let i = 0; i < SEED.length; i += 1) {
    const t = SEED[i];
    await db.testimonials.insert({
      id: newId('tst'),
      name: t.name,
      location: t.location,
      rating: t.rating,
      plan: t.plan,
      text: t.text,
      active: true,
      order: i,
      createdAt: nowISO(),
    });
  }
}

export async function listTestimonials({ includeInactive = false } = {}) {
  const rows = await db.testimonials.all();
  return rows
    .filter((t) => includeInactive || t.active)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt < b.createdAt ? -1 : 1));
}

export async function createTestimonial(input) {
  return db.testimonials.insert({
    id: newId('tst'),
    name: assertString(input.name, 'name', { max: 80 }),
    location: input.location ? assertString(input.location, 'location', { max: 80 }) : '',
    rating: Math.min(5, Math.max(1, Number(input.rating) || 5)),
    plan: input.plan ? assertString(input.plan, 'plan', { max: 40 }) : '',
    text: assertString(input.text, 'text', { min: 10, max: 600 }),
    active: input.active !== false,
    order: Number(input.order) || (await db.testimonials.count()),
    createdAt: nowISO(),
  });
}

export async function updateTestimonial(id, patch) {
  if (!(await db.testimonials.findById(id))) throw notFound('Testimonial not found');
  const clean = {};
  for (const k of ['name', 'location', 'plan', 'text']) if (patch[k] !== undefined) clean[k] = String(patch[k]);
  if (patch.rating !== undefined) clean.rating = Math.min(5, Math.max(1, Number(patch.rating) || 5));
  if (patch.order !== undefined) clean.order = Number(patch.order);
  if (patch.active !== undefined) clean.active = Boolean(patch.active);
  return db.testimonials.update(id, clean);
}

export async function deleteTestimonial(id) {
  if (!(await db.testimonials.findById(id))) throw notFound('Testimonial not found');
  await db.testimonials.remove(id);
  return { id, deleted: true };
}
