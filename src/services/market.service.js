import { getSettings } from './settings.service.js';

/**
 * Lightweight market feed. Prices random-walk from the seed prices stored in
 * settings so the trading desk always has live-looking quotes without an
 * external feed. The live drift is kept **in memory only** — the persisted seed
 * prices are the admin's editable baseline and are never rewritten by the feed.
 */

const TICK_MS = 4000;
let lastTick = 0;
let live = new Map(); // symbol -> { price, change }
let seedKey = '';

function volFor(kind) {
  return { crypto: 0.0015, index: 0.0009, metal: 0.0008, forex: 0.00035 }[kind] || 0.0006;
}
function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export async function getQuotes() {
  const symbols = (await getSettings()).marketSymbols || [];
  const key = symbols.map((s) => `${s.symbol}:${s.price}`).join('|');

  // reset the live map whenever the admin edits the seed prices / symbol list
  if (key !== seedKey) {
    seedKey = key;
    live = new Map(symbols.map((s) => [s.symbol, { price: s.price, change: 0 }]));
  }

  const now = Date.now();
  const doTick = now - lastTick > TICK_MS;
  if (doTick) lastTick = now;

  return symbols.map((s) => {
    let cur = live.get(s.symbol) || { price: s.price, change: 0 };
    if (doTick) {
      const drift = (Math.random() - 0.5) * 2 * volFor(s.kind);
      const price = round(Math.max(0.0001, cur.price * (1 + drift)), s.price >= 100 ? 2 : 5);
      cur = { price, change: drift };
      live.set(s.symbol, cur);
    }
    return { ...s, price: cur.price, change: doTick ? cur.change : 0, updatedAt: new Date().toISOString() };
  });
}

export async function priceOf(symbol) {
  const quotes = await getQuotes();
  const q = quotes.find((s) => s.symbol === String(symbol).toUpperCase());
  return q ? q.price : null;
}
