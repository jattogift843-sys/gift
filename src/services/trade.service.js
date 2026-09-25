import { db } from '../db/store.js';
import { assertPositiveNumber, assertString, money, newId, nowISO } from '../utils/helpers.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { applyBalanceChange } from './ledger.service.js';
import { priceOf } from './market.service.js';
import { sendEmail } from './email.service.js';
import { getSettings } from './settings.service.js';

const CONTRACT_SIZE = 1000; // notional units per lot on the managed desk
const MAX_LEVERAGE = 100;

export async function listTrades(filter = {}) {
  const where = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.status) where.status = filter.status;
  const rows = await db.trades.find(Object.keys(where).length ? where : undefined);
  rows.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
  return Promise.all(rows.map(decorate));
}

export async function decorate(trade) {
  if (trade.status === 'closed') return { ...trade, livePrice: trade.exitPrice, livePnl: trade.pnl };
  const live = (await priceOf(trade.symbol)) ?? trade.entryPrice;
  return { ...trade, livePrice: live, livePnl: computePnl(trade, live) };
}

function computePnl(trade, price) {
  const dir = trade.side === 'buy' ? 1 : -1;
  return money(dir * (price - trade.entryPrice) * trade.lots * CONTRACT_SIZE);
}

async function maybeEmail(userId, subject, body, category = 'trade') {
  if (!(await getSettings()).emailAlertsEnabled) return;
  sendEmail({ userId, subject, body, category }).catch(() => {});
}

export async function openTrade(userId, { symbol, side, lots, leverage = 10 }, { asAdmin = false, source = 'user' } = {}) {
  const user = await db.users.findById(userId);
  if (!user) throw notFound('User not found');
  if (!asAdmin && user.status === 'suspended') throw forbidden('This account is frozen.');
  if (!asAdmin && Number(user.balance) <= 0) {
    throw badRequest('You need a funded balance to trade. Please make a deposit first.');
  }
  const sym = assertString(symbol, 'symbol', { max: 12 }).toUpperCase();
  const dir = String(side).toLowerCase();
  if (!['buy', 'sell'].includes(dir)) throw badRequest('side must be buy or sell');
  const size = assertPositiveNumber(lots, 'lots');
  if (size > 50) throw badRequest('Max 50 lots per position');
  const lev = Math.min(MAX_LEVERAGE, Math.max(1, Number(leverage) || 10));

  const price = await priceOf(sym);
  if (!price) throw badRequest(`Unknown symbol: ${sym}`);

  const notional = money(price * size * CONTRACT_SIZE);
  const margin = money(notional / lev);
  if (margin > Number(user.balance)) throw badRequest(`Not enough margin. This position needs ${margin}.`);

  await applyBalanceChange(userId, -margin, {
    type: 'trade_pnl',
    status: 'completed',
    note: '',
    meta: { kind: 'margin_hold', signedAmount: 0 },
  });

  const trade = await db.trades.insert({
    id: newId('trd'),
    userId,
    symbol: sym,
    side: dir,
    lots: size,
    leverage: lev,
    entryPrice: price,
    exitPrice: null,
    margin,
    notional,
    status: 'open',
    pnl: 0,
    source, // 'user' | 'admin' | 'robot'
    openedAt: nowISO(),
    closedAt: null,
  });

  maybeEmail(
    userId,
    `Trade opened: ${dir.toUpperCase()} ${size} ${sym}`,
    `A ${dir === 'buy' ? 'BUY' : 'SELL'} position on ${sym} (${size} lots @ ${price}, ${lev}x) was opened on your account${source === 'robot' ? ' by your MT5 trading robot' : source === 'admin' ? ' by the MT5 Smart Market desk' : ''}. Margin used: ${margin}.`,
  );
  return decorate(trade);
}

export async function closeTrade(userId, tradeId, { asAdmin = false, exitPrice } = {}) {
  const trade = await db.trades.findById(tradeId);
  if (!trade) throw notFound('Trade not found');
  if (!asAdmin && trade.userId !== userId) throw forbidden();
  if (trade.status !== 'open') throw badRequest('Trade already closed');

  const exit = asAdmin && Number.isFinite(Number(exitPrice)) && Number(exitPrice) > 0
    ? Number(exitPrice)
    : ((await priceOf(trade.symbol)) ?? trade.entryPrice);
  const pnl = computePnl(trade, exit);

  await applyBalanceChange(trade.userId, money(trade.margin + pnl), {
    type: 'trade_pnl',
    status: 'completed',
    note: `${trade.side.toUpperCase()} ${trade.lots} ${trade.symbol} closed @ ${exit}`,
    meta: { kind: 'settlement', tradeId: trade.id, signedAmount: pnl },
  });

  const updated = await db.trades.update(trade.id, {
    status: 'closed',
    exitPrice: exit,
    pnl,
    closedAt: nowISO(),
    closedBy: asAdmin ? 'admin' : 'user',
  });

  maybeEmail(
    trade.userId,
    `Trade closed: ${trade.symbol} ${pnl >= 0 ? '+' : ''}${pnl}`,
    `Your ${trade.side.toUpperCase()} ${trade.lots} ${trade.symbol} position closed at ${exit}. Realised P&L: ${pnl >= 0 ? '+' : ''}${pnl}. Margin ${trade.margin} returned to your balance.`,
  );
  return updated;
}

/** Admin nudges an open trade's running result (does not settle it). */
export async function adminAdjustTrade(tradeId, { pnl, entryPrice, lots }) {
  const trade = await db.trades.findById(tradeId);
  if (!trade) throw notFound('Trade not found');
  const patch = {};
  if (entryPrice !== undefined && Number(entryPrice) > 0) patch.entryPrice = Number(entryPrice);
  if (lots !== undefined && Number(lots) > 0) patch.lots = Number(lots);
  // if a target P&L is given, back-solve the entry price so the live P&L matches
  if (pnl !== undefined && Number.isFinite(Number(pnl)) && trade.status === 'open') {
    const price = (await priceOf(trade.symbol)) ?? trade.entryPrice;
    const dir = trade.side === 'buy' ? 1 : -1;
    const size = patch.lots || trade.lots;
    patch.entryPrice = money(price - (dir * Number(pnl)) / (size * CONTRACT_SIZE));
  }
  return decorate(await db.trades.update(tradeId, patch));
}

export { CONTRACT_SIZE };
