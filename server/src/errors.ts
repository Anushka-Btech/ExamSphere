import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR', public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, 'BAD_REQUEST', d);
export const unauthorized = (m = 'Authentication required') => new HttpError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'You do not have permission for this action') => new HttpError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'NOT_FOUND');
export const conflict = (m: string) => new HttpError(409, m, 'CONFLICT');

/** Wraps an async route so rejected promises reach the error handler. */
export const h = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

// Centralised error handler: never leaks SQL text or stack traces.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid input', details: err.flatten().fieldErrors } });
  }
  const e = err as { code?: string; sqlMessage?: string };
  if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with these unique values already exists' } });
  if (e?.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: { code: 'BAD_REFERENCE', message: 'Referenced record does not exist' } });
  if (e?.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: { code: 'IN_USE', message: 'Record is referenced by other data and cannot be removed' } });
  if (e?.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return res.status(400).json({ error: { code: 'CONSTRAINT', message: 'Value violates a database constraint' } });
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
