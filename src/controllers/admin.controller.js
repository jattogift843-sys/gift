import { asyncHandler, ok } from '../utils/http.js';
import { paginate } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { db } from '../db/store.js';
import { listUsers, getUserProfile, adminUpdateUser } from '../services/user.service.js';
import {
  listTransactions, getTransaction, decorateTransaction,
} from '../services/ledger.service.js';
import { platformStats, recentActivity } from '../services/stats.service.js';
import {
  listPlans, createPlan, updatePlan, deletePlan,
} from '../services/plan.service.js';
import {
  listInvestments, cancelInvestment, accrueDueInvestments,
} from '../services/investment.service.js';
import { listTrades, closeTrade, openTrade, adminAdjustTrade } from '../services/trade.service.js';
import {
  listRobots, startBot, stopRobot, runRobotOnce, getRobotForUser, robotTrades, decorate as decorateRobot,
} from '../services/robot.service.js';
import { listEmails } from '../services/email.service.js';
import {
  pendingRequests, approveDeposit, rejectDeposit, cancelDeposit,
  approveWithdrawal, rejectWithdrawal, cancelWithdrawal, adminAdjustBalance,
} from '../services/wallet.service.js';
import {
  getSettings, updateSettings, addCryptoMethod, updateCryptoMethod, removeCryptoMethod,
} from '../services/settings.service.js';
import {
  pendingUsers, approveUser, rejectUser, editTransaction, freezeUser, deleteUser,
} from '../services/admin.service.js';
import { listKycForReview, reviewKyc, kycCounts } from '../services/kyc.service.js';
import { setWalletVerified } from '../services/wallet-link.service.js';
import { broadcast } from '../services/notification.service.js';
import {
  createPopup, listPopups, setPopupActive, deletePopup,
} from '../services/popup.service.js';
import {
  listTestimonials, createTestimonial, updateTestimonial, deleteTestimonial,
} from '../services/testimonial.service.js';

const withUser = (rows) =>
  Promise.all(rows.map(async (r) => {
    const u = await db.users.findById(r.userId);
    return { ...r, user: u ? { id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email } : null };
  }));

/* ---- dashboard ---- */
export const stats = asyncHandler(async (_req, res) => ok(res, await platformStats()));
export const activity = asyncHandler(async (_req, res) => ok(res, await recentActivity(25)));

/* ---- users ---- */
export const users = asyncHandler(async (req, res) => {
  const rows = await listUsers({ search: req.query.search, role: req.query.role, status: req.query.status });
  ok(res, paginate(rows, { ...req.query, limit: req.query.limit || 100 }));
});
export const userDetail = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const [profile, txs, investments, trades, robotForUser, robotRows, walletRows, allKyc] = await Promise.all([
    getUserProfile(id),
    listTransactions({ userId: id }),
    listInvestments({ userId: id }),
    listTrades({ userId: id }),
    getRobotForUser(id),
    db.robots.find({ userId: id }),
    db.wallets.find({ userId: id }),
    listKycForReview('all'),
  ]);
  if (!profile) throw notFound('User not found');
  const open = trades.filter((t) => t.status === 'open');
  const closed = trades.filter((t) => t.status === 'closed');
  ok(res, {
    profile,
    transactions: await Promise.all(txs.slice(0, 50).map(decorateTransaction)),
    investments,
    trades,
    tradingAccount: {
      balance: profile.balance,
      openPositions: open.length,
      floatingPnl: Math.round(open.reduce((a, t) => a + (t.livePnl || 0), 0) * 100) / 100,
      realisedPnl: Math.round(closed.reduce((a, t) => a + t.pnl, 0) * 100) / 100,
      tradesTotal: trades.length,
      robot: robotForUser,
    },
    robots: robotRows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    wallets: walletRows,
    kyc: allKyc.filter((k) => k.user?.id === id || k.userId === id),
  });
});
export const updateUser = asyncHandler(async (req, res) => {
  if (!(await db.users.findById(req.params.id))) throw notFound('User not found');
  ok(res, await adminUpdateUser(req.params.id, req.body));
});
export const adjustBalance = asyncHandler(async (req, res) => {
  if (!(await db.users.findById(req.params.id))) throw notFound('User not found');
  const { direction, amount, note } = req.body;
  if (!['credit', 'debit'].includes(direction)) throw badRequest('direction must be credit or debit');
  ok(res, await adminAdjustBalance(req.params.id, { direction, amount, note }), 201);
});
export const freezeUserReq = asyncHandler(async (req, res) =>
  ok(res, await freezeUser(req.params.id, req.user.id, true, req.body.reason)),
);
export const unfreezeUserReq = asyncHandler(async (req, res) =>
  ok(res, await freezeUser(req.params.id, req.user.id, false)),
);
export const deleteUserReq = asyncHandler(async (req, res) =>
  ok(res, await deleteUser(req.params.id, req.user.id)),
);
export const openTradeForUser = asyncHandler(async (req, res) => {
  if (!(await db.users.findById(req.params.id))) throw notFound('User not found');
  ok(res, await openTrade(req.params.id, req.body, { asAdmin: true, source: 'admin' }), 201);
});

/* ---- trading robots ---- */
export const robots = asyncHandler(async (req, res) => ok(res, await listRobots({ status: req.query.status })));
export const startRobot = asyncHandler(async (req, res) =>
  ok(res, await startBot(req.params.id, req.body, 'admin'), 201),
);
export const stopRobotReq = asyncHandler(async (req, res) => ok(res, await stopRobot(req.params.id, 'admin')));
export const runRobotNow = asyncHandler(async (req, res) => {
  const robot = await db.robots.findById(req.params.id);
  if (!robot) throw notFound('Robot not found');
  if (robot.status !== 'active') throw badRequest('Robot is not active');
  ok(res, (await runRobotOnce(robot)) || { skipped: true });
});
export const robotDetail = asyncHandler(async (req, res) => {
  const robot = await db.robots.findById(req.params.id);
  if (!robot) throw notFound('Bot not found');
  const [u, trades] = await Promise.all([db.users.findById(robot.userId), robotTrades(robot.id)]);
  ok(res, {
    robot: { ...decorateRobot(robot), user: u ? { id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email } : null },
    trades: trades.slice(0, 200),
  });
});

/* ---- email alerts log ---- */
export const emails = asyncHandler(async (req, res) =>
  ok(res, await listEmails({ userId: req.query.userId, category: req.query.category, limit: 200 })),
);

/* ---- account approvals ---- */
export const pendingUserList = asyncHandler(async (_req, res) => ok(res, await pendingUsers()));
export const approveUserReq = asyncHandler(async (req, res) => ok(res, await approveUser(req.params.id, req.user.id)));
export const rejectUserReq = asyncHandler(async (req, res) => ok(res, await rejectUser(req.params.id, req.user.id, req.body.reason)));

/* ---- funding requests ---- */
export const requests = asyncHandler(async (_req, res) => ok(res, await pendingRequests()));
export const approveDepositReq = asyncHandler(async (req, res) => ok(res, await approveDeposit(req.params.id, req.user.id)));
export const rejectDepositReq = asyncHandler(async (req, res) => ok(res, await rejectDeposit(req.params.id, req.user.id, req.body.reason)));
export const cancelDepositReq = asyncHandler(async (req, res) => ok(res, await cancelDeposit(req.params.id, req.user.id, { asAdmin: true, reason: req.body.reason })));
export const approveWithdrawalReq = asyncHandler(async (req, res) => ok(res, await approveWithdrawal(req.params.id, req.user.id)));
export const rejectWithdrawalReq = asyncHandler(async (req, res) => ok(res, await rejectWithdrawal(req.params.id, req.user.id, req.body.reason)));
export const cancelWithdrawalReq = asyncHandler(async (req, res) => ok(res, await cancelWithdrawal(req.params.id, req.user.id, { asAdmin: true, reason: req.body.reason })));

/* ---- transactions (view + edit anything) ---- */
export const allTransactions = asyncHandler(async (req, res) => {
  const rows = await listTransactions({ type: req.query.type, status: req.query.status, userId: req.query.userId });
  ok(res, paginate(await withUser(rows), { ...req.query, limit: req.query.limit || 100 }));
});
export const transactionDetail = asyncHandler(async (req, res) => ok(res, await getTransaction(req.params.id, req.user)));
export const patchTransaction = asyncHandler(async (req, res) => ok(res, await editTransaction(req.params.id, req.body)));

/* ---- plans ---- */
export const adminPlans = asyncHandler(async (_req, res) => ok(res, await listPlans({ includeInactive: true })));
export const addPlan = asyncHandler(async (req, res) => ok(res, await createPlan(req.body), 201));
export const editPlan = asyncHandler(async (req, res) => ok(res, await updatePlan(req.params.id, req.body)));
export const removePlan = asyncHandler(async (req, res) => ok(res, await deletePlan(req.params.id)));

/* ---- investments / trades ---- */
export const allInvestments = asyncHandler(async (req, res) =>
  ok(res, paginate(await withUser(await listInvestments({ status: req.query.status })), { ...req.query, limit: req.query.limit || 100 })),
);
export const stopInvestment = asyncHandler(async (req, res) => ok(res, await cancelInvestment(null, req.params.id, { asAdmin: true })));
export const allTrades = asyncHandler(async (req, res) =>
  ok(res, paginate(await withUser(await listTrades({ status: req.query.status })), { ...req.query, limit: req.query.limit || 100 })),
);
export const forceCloseTrade = asyncHandler(async (req, res) =>
  ok(res, await closeTrade(null, req.params.id, { asAdmin: true, exitPrice: req.body.exitPrice })),
);
export const patchTrade = asyncHandler(async (req, res) => ok(res, await adminAdjustTrade(req.params.id, req.body)));

/* ---- settings + crypto rails ---- */
export const getConfig = asyncHandler(async (_req, res) => ok(res, await getSettings()));
export const putConfig = asyncHandler(async (req, res) => ok(res, await updateSettings(req.body)));
export const createCrypto = asyncHandler(async (req, res) => ok(res, await addCryptoMethod(req.body), 201));
export const patchCrypto = asyncHandler(async (req, res) => ok(res, await updateCryptoMethod(req.params.id, req.body)));
export const deleteCrypto = asyncHandler(async (req, res) => ok(res, await removeCryptoMethod(req.params.id)));

/* ---- KYC ---- */
export const kycQueue = asyncHandler(async (req, res) => {
  const [counts, items] = await Promise.all([kycCounts(), listKycForReview(req.query.status || 'all')]);
  ok(res, { counts, items });
});
export const kycReview = asyncHandler(async (req, res) => ok(res, await reviewKyc(req.params.id, req.user.id, req.body)));

/* ---- wallets ---- */
export const allWallets = asyncHandler(async (_req, res) => {
  const rows = await db.wallets.all();
  ok(res, await withUser(rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))));
});
export const verifyWallet = asyncHandler(async (req, res) => ok(res, await setWalletVerified(req.params.id, req.body.verified !== false)));

/* ---- notifications ---- */
export const sendBroadcast = asyncHandler(async (req, res) => {
  const { title, body, level, userId } = req.body;
  if (!title) throw badRequest('title is required');
  ok(res, await broadcast({ title, body, level, userId }), 201);
});

/* ---- pop-up messages ---- */
export const popups = asyncHandler(async (_req, res) => ok(res, await listPopups()));
export const sendPopup = asyncHandler(async (req, res) => ok(res, await createPopup(req.body, req.user.id), 201));
export const togglePopup = asyncHandler(async (req, res) => ok(res, await setPopupActive(req.params.id, req.body.active)));
export const removePopup = asyncHandler(async (req, res) => ok(res, await deletePopup(req.params.id)));

/* ---- testimonials ---- */
export const testimonials = asyncHandler(async (_req, res) => ok(res, await listTestimonials({ includeInactive: true })));
export const addTestimonial = asyncHandler(async (req, res) => ok(res, await createTestimonial(req.body), 201));
export const editTestimonial = asyncHandler(async (req, res) => ok(res, await updateTestimonial(req.params.id, req.body)));
export const removeTestimonial = asyncHandler(async (req, res) => ok(res, await deleteTestimonial(req.params.id)));

/* ---- scheduler ---- */
export const runAccrual = asyncHandler(async (_req, res) => ok(res, await accrueDueInvestments()));
