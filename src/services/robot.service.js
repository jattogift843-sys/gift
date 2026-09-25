import { db } from '../db/store.js';
import { money, newId, nowISO } from '../utils/helpers.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { applyBalanceChange } from './ledger.service.js';
import { priceOf, getQuotes } from './market.service.js';
import { notify } from './notification.service.js';
import { sendEmail } from './email.service.js';
import { getSettings } from './settings.service.js';

const CONTRACT_SIZE = 1000;
const HOUR = 3600000;

/* ================= config ================= */

export async function getBotConfig() {
  const a = (await getSettings()).aiBot || {};
  return {
    enabled: a.enabled !== false,
    minStake: Number(a.minStake) || 100,
    maxStake: Number(a.maxStake) || 100000,
    winRate: Number(a.winRate) || 0.72,
    durationDays: (a.durationDays && a.durationDays.length ? a.durationDays : [1, 3, 7, 14, 30]).map(Number),
    profitTargets: (a.profitTargets && a.profitTargets.length ? a.profitTargets : [10, 20, 35, 50, 100]).map(Number),
    symbols: a.symbols && a.symbols.length ? a.symbols : (await getQuotes()).slice(0, 5).map((q) => q.symbol),
  };
}

/* ================= reads ================= */

async function withUser(r) {
  const u = await db.users.findById(r.userId);
  return decorate({ ...r, user: u ? { id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email } : null });
}

export function decorate(r) {
  const now = Date.now();
  const started = new Date(r.startedAt || r.createdAt).getTime();
  const ends = new Date(r.endsAt || r.createdAt).getTime();
  const timeProgress = ends > started ? Math.min(1, Math.max(0, (now - started) / (ends - started))) : 1;
  const profitProgress = r.targetProfit > 0 ? Math.min(1, Math.max(0, r.stats.netPnl / r.targetProfit)) : 0;
  return {
    ...r,
    timeProgressPercent: Math.round(timeProgress * 100),
    profitProgressPercent: Math.round(profitProgress * 100),
    currentProfitPercent: r.stake > 0 ? Math.round((r.stats.netPnl / r.stake) * 10000) / 100 : 0,
    projectedValue: money(r.stake + r.stats.netPnl),
  };
}

export async function listRobots(filter = {}) {
  const where = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.status) where.status = filter.status;
  const rows = await db.robots.find(Object.keys(where).length ? where : undefined);
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return Promise.all(rows.map(withUser));
}

export async function getRobotForUser(userId) {
  const r = await db.robots.findOne({ userId, status: 'active' });
  return r ? decorate(r) : null;
}

export async function robotHistory(userId) {
  const rows = await db.robots.find({ userId });
  return rows
    .filter((r) => r.status !== 'active')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(decorate);
}

export async function robotTrades(robotId) {
  const rows = await db.trades.find({ source: 'robot' });
  return rows
    .filter((t) => t.meta?.robotId === robotId || t.meta?.botId === robotId)
    .sort((a, b) => (a.closedAt < b.closedAt ? 1 : -1));
}

/* ================= lifecycle ================= */

export async function startBot(userId, input, actor = 'user') {
  const cfg = await getBotConfig();
  if (!cfg.enabled) throw badRequest('The AI trading bot is not available right now.');
  const user = await db.users.findById(userId);
  if (!user) throw notFound('User not found');
  if (user.status === 'suspended') throw forbidden('This account is frozen.');
  if (await getRobotForUser(userId)) throw badRequest('You already have an AI bot running — stop it before starting a new one.');

  const durationDays = Number(input.durationDays);
  const targetPct = Number(input.profitTargetPercent);
  const stake = money(input.stake);

  if (!cfg.durationDays.includes(durationDays)) throw badRequest('Choose a trading duration from the list');
  if (!cfg.profitTargets.includes(targetPct)) throw badRequest('Choose a profit target from the list');
  if (!(stake > 0)) throw badRequest('Enter a stake amount');
  if (stake < cfg.minStake || stake > cfg.maxStake) {
    throw badRequest(`Stake must be between ${cfg.minStake} and ${cfg.maxStake}`);
  }
  if (stake > Number(user.balance)) throw badRequest('Stake exceeds your available balance. Make a deposit first.');

  const id = newId('bot');
  const start = new Date();
  const endsAt = new Date(start.getTime() + durationDays * 24 * HOUR);
  const targetProfit = money((stake * targetPct) / 100);
  // ~120 trades over the life of the session, min one every 5 minutes
  const intervalMinutes = Math.max(5, Math.round((durationDays * 24 * 60) / 120));

  // lock the stake out of the spendable balance
  await applyBalanceChange(userId, -stake, {
    type: 'investment',
    status: 'completed',
    note: `AI bot stake — ${durationDays}d / ${targetPct}% target`,
    meta: { kind: 'bot_stake', botId: id },
  });

  const robot = await db.robots.insert({
    id,
    userId,
    name: `MT5 AI Bot · ${durationDays}-day · ${targetPct}%`,
    status: 'active',
    stake,
    durationDays,
    profitTargetPercent: targetPct,
    targetProfit,
    symbols: cfg.symbols,
    winRate: cfg.winRate,
    intervalMinutes,
    startedBy: actor,
    createdBy: actor === 'admin' ? 'admin' : userId,
    startedAt: start.toISOString(),
    endsAt: endsAt.toISOString(),
    createdAt: nowISO(),
    lastRunAt: null,
    completedAt: null,
    completionReason: null,
    stats: { trades: 0, wins: 0, losses: 0, netPnl: 0 },
  });

  notify(userId, {
    type: 'robot',
    title: 'AI trading bot activated 🤖',
    body: `Your MT5 AI bot is now trading a ${stake} stake for ${durationDays} day(s), aiming for a ${targetPct}% (${targetProfit}) profit. Profit and your stake are returned when it finishes.`,
    level: 'success',
  });
  emailUser(userId, 'Your MT5 AI trading bot is now active',
    `Your MT5 AI bot has started.\n\nStake: ${stake}\nDuration: ${durationDays} day(s)\nProfit target: ${targetPct}% (${targetProfit})\n\nIt will place trades automatically across ${robot.symbols.join(', ')}. You'll get an alert for each trade, and your stake plus any profit is credited to your balance when the bot completes.`,
    'robot');
  return decorate(robot);
}

async function emailUser(userId, subject, body, category) {
  if ((await getSettings()).emailAlertsEnabled) sendEmail({ userId, subject, body, category }).catch(() => {});
}

export async function completeBot(id, reason = 'duration') {
  const robot = await db.robots.findById(id);
  if (!robot) throw notFound('Bot not found');
  if (robot.status !== 'active') return decorate(robot);

  const profit = robot.stats.netPnl;
  const payout = money(Math.max(0, robot.stake + profit));

  await applyBalanceChange(robot.userId, payout, {
    type: 'investment',
    status: 'completed',
    note: `AI bot ${reason === 'stopped' ? 'stopped early' : reason === 'target' ? 'hit its target' : 'completed'} — stake + ${profit >= 0 ? 'profit' : 'result'} returned`,
    meta: { kind: 'bot_return', botId: id, profit, reason },
  });

  const updated = await db.robots.update(id, {
    status: 'completed',
    completedAt: nowISO(),
    completionReason: reason,
  });

  const pct = robot.stake > 0 ? Math.round((profit / robot.stake) * 10000) / 100 : 0;
  notify(robot.userId, {
    type: 'robot',
    title: profit >= 0 ? `AI bot finished: +${money(profit)} profit 🎉` : `AI bot finished: ${money(profit)}`,
    body: `Your MT5 AI bot ${reason === 'target' ? 'reached its profit target' : reason === 'stopped' ? 'was stopped early' : 'ran for its full duration'}. ${payout} (${robot.stake} stake ${profit >= 0 ? '+' : ''}${money(profit)} · ${pct}%) has been credited to your balance across ${robot.stats.trades} trades.`,
    level: profit >= 0 ? 'success' : 'warning',
    meta: { botId: id },
  });
  emailUser(robot.userId, `Your MT5 AI bot has finished — ${payout} credited`,
    `Your MT5 AI trading bot has finished (${reason}).\n\nTrades: ${robot.stats.trades} (${robot.stats.wins} winning / ${robot.stats.losses} losing)\nStake: ${robot.stake}\nProfit: ${money(profit)} (${pct}%)\nCredited to balance: ${payout}`,
    'robot');
  return decorate(updated);
}

export async function stopRobot(id, actor = 'admin') {
  const robot = await db.robots.findById(id);
  if (!robot) throw notFound('Bot not found');
  if (robot.status !== 'active') throw badRequest('This bot is not running');
  return completeBot(id, actor === 'system' ? 'duration' : 'stopped');
}

/** allow a user to stop only their own active bot */
export async function stopBotForUser(userId) {
  const robot = await db.robots.findOne({ userId, status: 'active' });
  if (!robot) throw badRequest('You have no active AI bot');
  return stopRobot(robot.id, 'user');
}

/* ================= trading engine ================= */

export async function runRobotOnce(robot) {
  const user = await db.users.findById(robot.userId);
  if (!user || user.status === 'suspended') return null;

  const symbol = robot.symbols[Math.floor(Math.random() * robot.symbols.length)] || 'EURUSD';
  const price = (await priceOf(symbol)) || 1;
  const side = Math.random() > 0.5 ? 'buy' : 'sell';

  // size each trade so ~120 winning-biased trades reach the target
  const step = robot.targetProfit / 78;
  const win = Math.random() < (robot.winRate || 0.72);
  let pnl = win
    ? money(step * 1.4 * (0.7 + Math.random() * 0.6))
    : -money(step * 0.9 * (0.7 + Math.random() * 0.6));

  // the session can never lose more than the staked amount
  if (robot.stats.netPnl + pnl < -robot.stake) pnl = money(-robot.stake - robot.stats.netPnl);

  // NOTE: trade P&L is accumulated in robot.stats only and is settled to the
  // user's balance once, in completeBot() (stake + net profit). It is deliberately
  // NOT written to the ledger per trade, to avoid double-counting the profit.

  const lots = Math.max(0.01, money((robot.stake / (price * CONTRACT_SIZE)) * 3) || 0.1);
  await db.trades.insert({
    id: newId('trd'),
    userId: robot.userId,
    symbol,
    side,
    lots,
    leverage: 20,
    entryPrice: price,
    exitPrice: money(price * (1 + (pnl >= 0 ? 1 : -1) * (0.0002 + Math.random() * 0.0006))),
    margin: 0,
    notional: money(robot.stake * 3),
    status: 'closed',
    pnl,
    source: 'robot',
    openedAt: nowISO(),
    closedAt: nowISO(),
    closedBy: 'robot',
    meta: { botId: robot.id },
  });

  const stats = {
    trades: robot.stats.trades + 1,
    wins: robot.stats.wins + (pnl >= 0 ? 1 : 0),
    losses: robot.stats.losses + (pnl < 0 ? 1 : 0),
    netPnl: money(robot.stats.netPnl + pnl),
  };
  await db.robots.update(robot.id, { lastRunAt: nowISO(), stats });

  notify(robot.userId, {
    type: 'robot',
    title: `🤖 AI bot: ${symbol} ${pnl >= 0 ? '+' : ''}${money(pnl)}`,
    body: `${pnl >= 0 ? 'Winning' : 'Losing'} ${side.toUpperCase()} trade on ${symbol}. Session total: ${stats.netPnl >= 0 ? '+' : ''}${money(stats.netPnl)} of ${money(robot.targetProfit)} target (${stats.trades} trades).`,
    level: pnl >= 0 ? 'success' : 'info',
    meta: { botId: robot.id },
  });
  // email only every 10th trade to avoid spamming the inbox
  if (stats.trades % 10 === 0) {
    emailUser(robot.userId, `AI bot update — ${stats.trades} trades, ${money(stats.netPnl)} so far`,
      `Your MT5 AI bot has now placed ${stats.trades} trades (${stats.wins} winning / ${stats.losses} losing). Running profit: ${money(stats.netPnl)} of a ${money(robot.targetProfit)} target.`,
      'trade');
  }

  // completion checks
  if (stats.netPnl >= robot.targetProfit) { await completeBot(robot.id, 'target'); return { robotId: robot.id, symbol, pnl, completed: 'target' }; }
  if (stats.netPnl <= -robot.stake) { await completeBot(robot.id, 'stopped'); return { robotId: robot.id, symbol, pnl, completed: 'drawdown' }; }
  return { robotId: robot.id, symbol, pnl };
}

/** Scheduler entry point. */
export async function runDueRobots(reference = new Date()) {
  const now = reference.getTime();
  const active = await db.robots.find({ status: 'active' });
  const result = { checked: active.length, ran: 0, completed: 0, netPnl: 0 };
  for (const robot of active) {
    if (new Date(robot.endsAt).getTime() <= now) {
      await completeBot(robot.id, 'duration');
      result.completed += 1;
      continue;
    }
    const due = !robot.lastRunAt || now - new Date(robot.lastRunAt).getTime() >= robot.intervalMinutes * 60000;
    if (!due) continue;
    const r = await runRobotOnce(robot);
    if (r) { result.ran += 1; result.netPnl = money(result.netPnl + (r.pnl || 0)); if (r.completed) result.completed += 1; }
  }
  return result;
}

// kept for backwards-compatible imports
export const createRobot = (userId, input, adminId) => startBot(userId, {
  durationDays: input.durationDays, profitTargetPercent: input.profitTargetPercent, stake: input.stake,
}, adminId ? 'admin' : 'user');
