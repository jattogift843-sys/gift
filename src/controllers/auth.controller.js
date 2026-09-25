import { asyncHandler, ok } from '../utils/http.js';
import * as authService from '../services/auth.service.js';
import { getUserProfile, toPublicUser } from '../services/user.service.js';
import { config } from '../config/index.js';

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.env === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const reqCtx = (req) => ({
  ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim(),
  userAgent: req.headers['user-agent'] || '',
});

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  ok(res, result, 201); // { pending: true } — no session until MT5 Smart Market approves
});

export const login = asyncHandler(async (req, res) => {
  const session = await authService.login(req.body, reqCtx(req));
  res.cookie('token', session.token, cookieOpts);
  ok(res, session);
});

export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie('token');
  ok(res, { loggedOut: true });
});

export const me = asyncHandler(async (req, res) => {
  const user = (await getUserProfile(req.user.id)) || toPublicUser(req.user);
  ok(res, { user });
});

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  ok(res, { updated: true });
});

export const changeEmail = asyncHandler(async (req, res) => {
  const result = await authService.changeEmail(req.user.id, req.body);
  ok(res, { updated: true, ...result });
});

export const updateSecurityQuestion = asyncHandler(async (req, res) => {
  await authService.updateSecurityQuestion(req.user.id, req.body);
  ok(res, { updated: true });
});

export const setTwoFactor = asyncHandler(async (req, res) => {
  await authService.setTwoFactor(req.user.id, Boolean(req.body.enabled));
  ok(res, { twoFactorEnabled: Boolean(req.body.enabled) });
});

export const loginHistory = asyncHandler(async (req, res) => {
  ok(res, await authService.loginHistory(req.user.id));
});

export const forgotStart = asyncHandler(async (req, res) => {
  ok(res, await authService.startPasswordReset(req.body.email));
});

export const forgotComplete = asyncHandler(async (req, res) => {
  await authService.completePasswordReset(req.body);
  ok(res, { reset: true });
});
