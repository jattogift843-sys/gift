import { db } from '../db/store.js';
import { money } from '../utils/helpers.js';
import { getUserBalanceSummary, listTransactions } from './ledger.service.js';
import { decorate as decorateInvestment } from './investment.service.js';
import { listTrades } from './trade.service.js';

export async function getPortfolio(userId) {
  const [summary, invRows, allTrades, txs] = await Promise.all([
    getUserBalanceSummary(userId),
    db.investments.find({ userId }),
    listTrades({ userId }),
    listTransactions({ userId }),
  ]);
  const investments = invRows.map(decorateInvestment);
  // AI-bot trades settle separately (stake + profit at completion); exclude them here
  const trades = allTrades.filter((t) => t.source !== 'robot');
  const openTrades = trades.filter((t) => t.status === 'open');

  const openTradeValue = money(openTrades.reduce((a, t) => a + t.margin + (t.livePnl || 0), 0));
  const activeInvestValue = summary.activeInvested;
  const totalEquity = money(summary.balance + activeInvestValue + openTradeValue);

  const allocation = [
    { label: 'Available cash', value: summary.balance },
    { label: 'Active investments', value: activeInvestValue },
    { label: 'Open trades (margin + P&L)', value: openTradeValue },
  ].filter((a) => a.value > 0);

  // equity curve from the running balanceAfter on completed ledger rows
  const curve = txs
    .filter((t) => t.balanceAfter !== null && t.balanceAfter !== undefined)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map((t) => ({ at: t.createdAt, balance: t.balanceAfter }));

  const realisedPnl = money(
    trades.filter((t) => t.status === 'closed').reduce((a, t) => a + t.pnl, 0),
  );

  return {
    totalEquity,
    summary,
    allocation,
    curve,
    performance: {
      roiEarned: summary.totalRoiEarned,
      referralEarned: summary.referralEarned,
      realisedTradePnl: realisedPnl,
      unrealisedTradePnl: money(openTrades.reduce((a, t) => a + (t.livePnl || 0), 0)),
      netContributions: money(summary.totalDeposited - summary.totalWithdrawn),
    },
    holdings: {
      investments: investments
        .filter((i) => i.status === 'active')
        .map((i) => ({
          id: i.id,
          name: i.planName,
          staked: i.amount,
          earned: i.accruedTotal,
          progressPercent: i.progressPercent,
          endsAt: i.endsAt,
        })),
      openTrades: openTrades.map((t) => ({
        id: t.id, symbol: t.symbol, side: t.side, lots: t.lots,
        entryPrice: t.entryPrice, livePrice: t.livePrice, livePnl: t.livePnl,
      })),
    },
  };
}
