import { AppError } from '../utils/errors.js';
import { config } from '../config/index.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}

export function errorHandler(err, req, res, next) {
  if (err && (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE' || err.code === 'UPLOAD_REJECTED')) {
    return res.status(400).json({ ok: false, error: { code: 'UPLOAD_REJECTED', message: err.message } });
  }
  const isApp = err instanceof AppError;
  const status = isApp ? err.status : 500;
  console.error('[error]', err);
  const body = {
    ok: false,
    error: {
      code: isApp ? err.code : 'INTERNAL_ERROR',
      message: err.message || 'Something went wrong',
    },
  };
  res.status(status).json(body);
}
