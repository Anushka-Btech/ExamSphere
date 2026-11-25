import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { exec, one } from './db.js';
import { config } from './config.js';
import { forbidden, h, unauthorized } from './errors.js';

export type Role = 'ADMIN' | 'FACULTY' | 'STUDENT';
export interface SessionUser { userId: number; role: Role; fullName: string; email: string }
declare module 'express-serve-static-core' { interface Request { user?: SessionUser } }

export const COOKIE = 'es_sid';
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Creates a session; the cookie holds a random token, the DB holds only its SHA-256. */
export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await exec('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))',
    [sha256(token), userId, config.sessionHours]);
  return token;
}
export const destroySession = (token: string) => exec('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);

export const cookieOptions = () => ({
  httpOnly: true, sameSite: 'lax' as const, secure: config.isProd, path: '/', maxAge: config.sessionHours * 3600_000,
});

/** Server-side session validation on EVERY request. The role always comes from the DB, never from the client. */
export const loadUser = h(async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.[COOKIE];
  if (token) {
    const u = await one(
      `SELECT u.user_id, u.role, u.full_name, u.email FROM sessions s JOIN users u ON u.user_id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.status = 'ACTIVE'`, [sha256(token)]);
    if (u) req.user = { userId: u.user_id, role: u.role, fullName: u.full_name, email: u.email };
  }
  next();
});

export const requireAuth = (req: Request, _res: Response, next: NextFunction) =>
  req.user ? next() : next(unauthorized());

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

/** A mutating request that carries a body must be JSON. A cross-site HTML form cannot send application/json,
 *  which together with SameSite=Lax cookies blocks CSRF. Body-less POSTs (logout, submit) get no cookie cross-site. */
export function requireJson(req: Request, _res: Response, next: NextFunction) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0;
  if (mutating && hasBody && !req.is('application/json')) return next(forbidden('JSON body required'));
  next();
}
