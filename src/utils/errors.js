export class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

export const badRequest = (msg) => new AppError(msg, 400, 'BAD_REQUEST');
export const unauthorized = (msg = 'Not authenticated') => new AppError(msg, 401, 'UNAUTHORIZED');
export const forbidden = (msg = 'Not allowed') => new AppError(msg, 403, 'FORBIDDEN');
export const notFound = (msg = 'Not found') => new AppError(msg, 404, 'NOT_FOUND');
export const conflict = (msg) => new AppError(msg, 409, 'CONFLICT');
