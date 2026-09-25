import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { config } from './config/index.js';
import api from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

/**
 * Cross-origin support. Only active when CORS_ORIGINS is set — used when the
 * frontend bundles (frontend/site, frontend/app) are hosted on a different
 * domain than this API. With no origins configured this is a no-op and the
 * server behaves exactly as a same-origin app.
 */
function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
}

const mp4Cache = (res, filePath) => {
  if (filePath.endsWith('.mp4')) res.setHeader('Cache-Control', 'public, max-age=86400');
};

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // behind a proxy/load balancer (Render, nginx, …) so req.ip / rate limiting
  // read X-Forwarded-For. TRUST_PROXY = number of hops to trust (Render = 1).
  app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
  if (config.corsOrigins.length) app.use(cors);
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use((req, _res, next) => {
    req.log = () => console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    if (config.env !== 'test') req.log();
    next();
  });

  // API responses must never be cached — balances, approvals etc. change often
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, service: 'mt5-smart-market', time: new Date().toISOString() }),
  );

  app.use('/api', api);

  /* -------------------------------------------------------------------------
   * Frontend — two independently deployable bundles, also served here so that
   * `npm start` gives a working whole. `frontend/site` wins any path it has;
   * `frontend/app` serves what's left (its HTML entry points + app-only assets).
   * ---------------------------------------------------------------------- */
  app.use(express.static(config.paths.site, { extensions: ['html'], setHeaders: mp4Cache }));
  app.use(express.static(config.paths.app, { extensions: ['html'], setHeaders: mp4Cache }));

  // unknown non-API GET → the public-site landing page
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    return res.sendFile(path.join(config.paths.site, 'index.html'));
  });

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
