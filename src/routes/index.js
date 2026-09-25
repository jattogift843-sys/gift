import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { upload, getFileForDownload } from '../services/file.service.js';
import { config } from '../config/index.js';
import * as auth from '../controllers/auth.controller.js';
import * as acc from '../controllers/account.controller.js';
import * as admin from '../controllers/admin.controller.js';

const api = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 50),
  standardHeaders: true,
  legacyHeaders: false,
  // no limit under NODE_ENV=test (end-to-end suites make hundreds of auth calls)
  skip: () => config.env === 'test',
});

/* ---------------- auth ---------------- */
api.post('/auth/register', authLimiter, auth.register);
api.post('/auth/login', authLimiter, auth.login);
api.post('/auth/logout', auth.logout);
api.post('/auth/forgot/start', authLimiter, auth.forgotStart);
api.post('/auth/forgot/complete', authLimiter, auth.forgotComplete);
api.get('/auth/me', authenticate, auth.me);
api.post('/auth/change-password', authenticate, auth.changePassword);
api.post('/auth/change-email', authenticate, auth.changeEmail);
api.post('/auth/security-question', authenticate, auth.updateSecurityQuestion);
api.post('/auth/two-factor', authenticate, auth.setTwoFactor);
api.get('/auth/login-history', authenticate, auth.loginHistory);

/* ---------------- public ---------------- */
api.get('/config', acc.config);
api.get('/market/quotes', acc.quotes);
api.get('/plans', acc.plans);
api.get('/testimonials', acc.testimonials);
api.get('/rates', acc.rates);

/* ---------------- files (owner or admin) ---------------- */
api.get('/files/:id', authenticate, asyncHandler(async (req, res) => {
  const { rec, abs } = await getFileForDownload(req.params.id, req.user);
  res.setHeader('Content-Type', rec.mimetype);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(rec.originalName || 'file')}"`);
  res.sendFile(abs);
}));

/* ---------------- authenticated user ---------------- */
api.use(authenticate);

api.get('/me/dashboard', acc.dashboard);
api.get('/me/summary', acc.summary);
api.get('/me/portfolio', acc.portfolio);
api.get('/me/profile', acc.profile);
api.patch('/me/profile', acc.updateProfile);
api.get('/me/referrals', acc.referrals);

api.get('/me/transactions', acc.transactions);
api.get('/me/transactions/:id', acc.transactionDetail);

api.get('/me/notifications', acc.listNotifications);
api.post('/me/notifications/read-all', acc.markAllNotificationsRead);
api.post('/me/notifications/:id/read', acc.markNotificationRead);
api.delete('/me/notifications/:id', acc.deleteNotification);

api.get('/me/popups', acc.listMyPopups);
api.post('/me/popups/:id/ack', acc.ackMyPopup);

api.get('/investments', acc.investments);
api.post('/investments', acc.invest);
api.post('/investments/:id/cancel', acc.stopInvestment);

api.get('/wallet/info', acc.walletInfo);
api.post('/wallet/deposit/crypto', upload.array('proof', 6), acc.depositCrypto);
api.post('/wallet/deposit/bank', upload.array('proof', 6), acc.depositBank);
api.post('/wallet/deposit/:id/proof', upload.array('proof', 6), acc.addDepositProof);
api.post('/wallet/deposit/:id/cancel', acc.cancelOwnDeposit);
api.post('/wallet/withdraw', acc.withdraw);
api.post('/wallet/withdraw/:id/cancel', acc.cancelOwnWithdrawal);

api.get('/wallets', acc.wallets);
api.post('/wallets', acc.addLinkedWallet);
api.delete('/wallets/:id', acc.removeLinkedWallet);

api.get('/kyc', acc.kyc);
api.post('/kyc', upload.array('documents', 6), acc.submitKycDocs);

api.get('/trades', acc.trades);
api.post('/trades', acc.trade);
api.post('/trades/:id/close', acc.closePosition);

api.get('/me/robot', acc.robot);
api.get('/me/ai-bot', acc.aiBot);
api.post('/me/ai-bot', acc.startAiBot);
api.post('/me/ai-bot/stop', acc.stopAiBot);
api.get('/me/emails', acc.emails);

/* ---------------- admin ---------------- */
const a = Router();
a.use(requireAdmin);

a.get('/stats', admin.stats);
a.get('/activity', admin.activity);

a.get('/users', admin.users);
a.get('/users/pending', admin.pendingUserList);
a.get('/users/:id', admin.userDetail);
a.patch('/users/:id', admin.updateUser);
a.delete('/users/:id', admin.deleteUserReq);
a.post('/users/:id/balance', admin.adjustBalance);
a.post('/users/:id/approve', admin.approveUserReq);
a.post('/users/:id/reject', admin.rejectUserReq);
a.post('/users/:id/freeze', admin.freezeUserReq);
a.post('/users/:id/unfreeze', admin.unfreezeUserReq);
a.post('/users/:id/trade', admin.openTradeForUser);
a.post('/users/:id/robot', admin.startRobot);

a.get('/requests', admin.requests);
a.post('/deposits/:id/approve', admin.approveDepositReq);
a.post('/deposits/:id/reject', admin.rejectDepositReq);
a.post('/deposits/:id/cancel', admin.cancelDepositReq);
a.post('/withdrawals/:id/approve', admin.approveWithdrawalReq);
a.post('/withdrawals/:id/reject', admin.rejectWithdrawalReq);
a.post('/withdrawals/:id/cancel', admin.cancelWithdrawalReq);

a.get('/transactions', admin.allTransactions);
a.get('/transactions/:id', admin.transactionDetail);
a.patch('/transactions/:id', admin.patchTransaction);

a.get('/plans', admin.adminPlans);
a.post('/plans', admin.addPlan);
a.patch('/plans/:id', admin.editPlan);
a.delete('/plans/:id', admin.removePlan);

a.get('/investments', admin.allInvestments);
a.post('/investments/:id/cancel', admin.stopInvestment);
a.get('/trades', admin.allTrades);
a.patch('/trades/:id', admin.patchTrade);
a.post('/trades/:id/close', admin.forceCloseTrade);

a.get('/robots', admin.robots);
a.get('/robots/:id', admin.robotDetail);
a.post('/robots/:id/stop', admin.stopRobotReq);
a.post('/robots/:id/run', admin.runRobotNow);

a.get('/emails', admin.emails);

a.get('/settings', admin.getConfig);
a.put('/settings', admin.putConfig);
a.post('/settings/crypto', admin.createCrypto);
a.patch('/settings/crypto/:id', admin.patchCrypto);
a.delete('/settings/crypto/:id', admin.deleteCrypto);

a.get('/kyc', admin.kycQueue);
a.post('/kyc/:id/review', admin.kycReview);

a.get('/wallets', admin.allWallets);
a.post('/wallets/:id/verify', admin.verifyWallet);

a.post('/notifications/broadcast', admin.sendBroadcast);

a.get('/popups', admin.popups);
a.post('/popups', admin.sendPopup);
a.patch('/popups/:id', admin.togglePopup);
a.delete('/popups/:id', admin.removePopup);

a.get('/testimonials', admin.testimonials);
a.post('/testimonials', admin.addTestimonial);
a.patch('/testimonials/:id', admin.editTestimonial);
a.delete('/testimonials/:id', admin.removeTestimonial);

a.post('/accrual/run', admin.runAccrual);

api.use('/admin', a);

export default api;
