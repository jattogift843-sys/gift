import { asyncHandler, ok } from '../utils/http.js';
import { paginate } from '../utils/helpers.js';
import { getUserProfile, updateOwnProfile } from '../services/user.service.js';
import {
  getUserBalanceSummary, listTransactions, getTransaction,
} from '../services/ledger.service.js';
import { listPlans, publicPlan } from '../services/plan.service.js';
import {
  createInvestment, listInvestments, cancelInvestment,
} from '../services/investment.service.js';
import {
  submitCryptoDeposit, submitBankDeposit, attachDepositProof, cancelDeposit,
  requestWithdrawal, cancelWithdrawal,
} from '../services/wallet.service.js';
import { getSettings, activeCryptoMethods, publicConfig } from '../services/settings.service.js';
import { listTestimonials } from '../services/testimonial.service.js';
import {
  getRobotForUser, getBotConfig, startBot, stopBotForUser, robotHistory, robotTrades,
} from '../services/robot.service.js';
import { listEmails } from '../services/email.service.js';
import { getQuotes } from '../services/market.service.js';
import { listTrades, openTrade, closeTrade } from '../services/trade.service.js';
import { getReferralOverview } from '../services/referral.service.js';
import * as notifications from '../services/notification.service.js';
import { pendingPopupsForUser, acknowledgePopup } from '../services/popup.service.js';
import { getPortfolio } from '../services/portfolio.service.js';
import { getMyKyc, submitKyc } from '../services/kyc.service.js';
import {
  listWallets, addWallet, removeWallet, walletNetworks,
} from '../services/wallet-link.service.js';

async function walletContext() {
  const s = await getSettings();
  return {
    baseCurrency: s.baseCurrency,
    minDeposit: s.minDeposit,
    minWithdrawal: s.minWithdrawal,
    maxWithdrawal: s.maxWithdrawal || 0,
    withdrawalFeePercent: s.withdrawalFeePercent,
    requireKycForWithdrawal: s.requireKycForWithdrawal,
    cryptoMethods: await activeCryptoMethods(),
    bankDeposit: s.bankDeposit,
  };
}

export const config = asyncHandler(async (_req, res) => ok(res, await publicConfig()));

export const testimonials = asyncHandler(async (_req, res) => ok(res, await listTestimonials()));

export const rates = asyncHandler(async (_req, res) => {
  const plans = await listPlans();
  const daily = plans.map((p) => (p.roiPercent * 24) / p.periodHours);
  const bestDaily = daily.length ? Math.max(...daily) : 0;
  ok(res, {
    bestDailyReturn: Math.round(bestDaily * 100) / 100,
    bestMonthlyReturn: Math.round(bestDaily * 30 * 100) / 100,
    minStake: plans.length ? Math.min(...plans.map((p) => p.minAmount)) : 0,
    tiers: plans.map((p) => ({
      name: p.name,
      dailyReturn: Math.round(((p.roiPercent * 24) / p.periodHours) * 100) / 100,
      payoutEvery: `${p.periodHours}h`,
      term: `${p.durationDays} days`,
      from: p.minAmount,
    })),
    spreadFrom: 0.0,
    leverageUpTo: 100,
  });
});

export const dashboard = asyncHandler(async (req, res) => {
  const uid = req.user.id;
  const summary = await getUserBalanceSummary(uid);
  const [
    profile, investments, recentTransactions, openTrades, referrals,
    unreadNotifications, notifs, wallet, kyc, robot, popups,
  ] = await Promise.all([
    getUserProfile(uid, summary),
    listInvestments({ userId: uid, status: 'active' }),
    listTransactions({ userId: uid }),
    listTrades({ userId: uid, status: 'open' }),
    getReferralOverview(uid),
    notifications.unreadCount(uid),
    notifications.listNotifications(uid),
    walletContext(),
    getMyKyc(uid),
    getRobotForUser(uid),
    pendingPopupsForUser(uid),
  ]);
  ok(res, {
    profile,
    summary,
    investments,
    recentTransactions: recentTransactions.slice(0, 8),
    openTrades,
    referrals,
    unreadNotifications,
    notifications: notifs.slice(0, 6),
    wallet,
    kyc,
    robot,
    popups,
  });
});

export const listMyPopups = asyncHandler(async (req, res) =>
  ok(res, await pendingPopupsForUser(req.user.id)),
);
export const ackMyPopup = asyncHandler(async (req, res) =>
  ok(res, await acknowledgePopup(req.user.id, req.params.id)),
);

export const summary = asyncHandler(async (req, res) => ok(res, await getUserBalanceSummary(req.user.id)));
export const portfolio = asyncHandler(async (req, res) => ok(res, await getPortfolio(req.user.id)));
export const robot = asyncHandler(async (req, res) => ok(res, await getRobotForUser(req.user.id)));
export const aiBot = asyncHandler(async (req, res) => {
  const [cfg, active, balSummary, history] = await Promise.all([
    getBotConfig(),
    getRobotForUser(req.user.id),
    getUserBalanceSummary(req.user.id),
    robotHistory(req.user.id),
  ]);
  ok(res, {
    config: {
      enabled: cfg.enabled, minStake: cfg.minStake, maxStake: cfg.maxStake,
      durationDays: cfg.durationDays, profitTargets: cfg.profitTargets,
    },
    balance: balSummary.balance,
    active,
    trades: active ? (await robotTrades(active.id)).slice(0, 30) : [],
    history,
  });
});
export const startAiBot = asyncHandler(async (req, res) =>
  ok(res, await startBot(req.user.id, req.body, 'user'), 201),
);
export const stopAiBot = asyncHandler(async (req, res) => ok(res, await stopBotForUser(req.user.id)));
export const emails = asyncHandler(async (req, res) =>
  ok(res, await listEmails({ userId: req.user.id, limit: 100 })),
);

/* ---- transactions ---- */
export const transactions = asyncHandler(async (req, res) => {
  const rows = await listTransactions({ userId: req.user.id, type: req.query.type, status: req.query.status });
  ok(res, paginate(rows, req.query));
});
export const transactionDetail = asyncHandler(async (req, res) =>
  ok(res, await getTransaction(req.params.id, req.user)),
);

/* ---- notifications ---- */
export const listNotifications = asyncHandler(async (req, res) => {
  const [unread, items] = await Promise.all([
    notifications.unreadCount(req.user.id),
    notifications.listNotifications(req.user.id, { unreadOnly: req.query.unread === '1' }),
  ]);
  ok(res, { unread, items });
});
export const markNotificationRead = asyncHandler(async (req, res) =>
  ok(res, await notifications.markRead(req.user.id, req.params.id)),
);
export const markAllNotificationsRead = asyncHandler(async (req, res) =>
  ok(res, { updated: await notifications.markAllRead(req.user.id) }),
);
export const deleteNotification = asyncHandler(async (req, res) =>
  ok(res, { removed: await notifications.removeNotification(req.user.id, req.params.id) }),
);

/* ---- plans / investments ---- */
export const plans = asyncHandler(async (_req, res) => ok(res, (await listPlans()).map(publicPlan)));
export const investments = asyncHandler(async (req, res) =>
  ok(res, await listInvestments({ userId: req.user.id, status: req.query.status })),
);
export const invest = asyncHandler(async (req, res) =>
  ok(res, await createInvestment(req.user.id, req.body), 201),
);
export const stopInvestment = asyncHandler(async (req, res) =>
  ok(res, await cancelInvestment(req.user.id, req.params.id)),
);

/* ---- deposits ---- */
export const walletInfo = asyncHandler(async (req, res) => {
  const [ctx, wallets, kyc] = await Promise.all([
    walletContext(), listWallets(req.user.id), getMyKyc(req.user.id),
  ]);
  ok(res, { ...ctx, wallets, kyc });
});
export const depositCrypto = asyncHandler(async (req, res) =>
  ok(res, await submitCryptoDeposit(req.user.id, { ...req.body, files: req.files }), 201),
);
export const depositBank = asyncHandler(async (req, res) =>
  ok(res, await submitBankDeposit(req.user.id, { ...req.body, files: req.files }), 201),
);
export const addDepositProof = asyncHandler(async (req, res) =>
  ok(res, await attachDepositProof(req.user.id, req.params.id, req.files)),
);
export const cancelOwnDeposit = asyncHandler(async (req, res) =>
  ok(res, await cancelDeposit(req.params.id, req.user.id)),
);

/* ---- withdrawals ---- */
export const withdraw = asyncHandler(async (req, res) =>
  ok(res, await requestWithdrawal(req.user.id, req.body), 201),
);
export const cancelOwnWithdrawal = asyncHandler(async (req, res) =>
  ok(res, await cancelWithdrawal(req.params.id, req.user.id)),
);

/* ---- market / trades ---- */
export const quotes = asyncHandler(async (_req, res) => ok(res, await getQuotes()));
export const trades = asyncHandler(async (req, res) => {
  // AI-bot trades are shown on the AI Trading Bot page, not the manual desk
  const rows = await listTrades({ userId: req.user.id, status: req.query.status });
  ok(res, rows.filter((t) => t.source !== 'robot'));
});
export const trade = asyncHandler(async (req, res) => ok(res, await openTrade(req.user.id, req.body), 201));
export const closePosition = asyncHandler(async (req, res) =>
  ok(res, await closeTrade(req.user.id, req.params.id)),
);

/* ---- referrals ---- */
export const referrals = asyncHandler(async (req, res) => ok(res, await getReferralOverview(req.user.id)));

/* ---- profile ---- */
export const profile = asyncHandler(async (req, res) => ok(res, await getUserProfile(req.user.id)));
export const updateProfile = asyncHandler(async (req, res) =>
  ok(res, await updateOwnProfile(req.user.id, req.body)),
);

/* ---- kyc ---- */
export const kyc = asyncHandler(async (req, res) => ok(res, await getMyKyc(req.user.id)));
export const submitKycDocs = asyncHandler(async (req, res) =>
  ok(res, await submitKyc(req.user.id, { ...req.body, files: req.files }), 201),
);

/* ---- linked wallets ---- */
export const wallets = asyncHandler(async (req, res) =>
  ok(res, { networks: walletNetworks(), items: await listWallets(req.user.id) }),
);
export const addLinkedWallet = asyncHandler(async (req, res) =>
  ok(res, await addWallet(req.user.id, req.body), 201),
);
export const removeLinkedWallet = asyncHandler(async (req, res) =>
  ok(res, await removeWallet(req.user.id, req.params.id)),
);
