import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { exec, one } from '../db.js';
import { COOKIE, cookieOptions, createSession, destroySession, requireAuth } from '../auth.js';
import { HttpError, h } from '../errors.js';

export const authRouter = Router();

const loginSchema = z.object({ identifier: z.string().trim().min(1, 'Email or username is required').max(150),
                               password: z.string().min(1, 'Password is required').max(200) });

// Tiny in-memory limiter: 10 failed attempts / 15 min per identifier+IP.
const fails = new Map<string, { n: number; until: number }>();
// A hash of a random string, compared when the user does not exist, so timing does not reveal valid accounts.
const DUMMY = bcrypt.hashSync('not-a-real-password', 10);

authRouter.post('/login', h(async (req, res) => {
  const { identifier, password } = loginSchema.parse(req.body);
  const key = `${identifier.toLowerCase()}|${req.ip}`;
  const f = fails.get(key);
  if (f && f.n >= 10 && f.until > Date.now()) throw new HttpError(429, 'Too many attempts. Try again later.', 'RATE_LIMIT');

  const u = await one('SELECT user_id, password_hash, role, full_name, email, status FROM users WHERE email = ? OR username = ?',
    [identifier, identifier]);
  const ok = await bcrypt.compare(password, u?.password_hash ?? DUMMY);
  if (!u || !ok || u.status !== 'ACTIVE') {
    fails.set(key, { n: (f?.n ?? 0) + 1, until: Date.now() + 15 * 60_000 });
    throw new HttpError(401, 'Invalid credentials', 'INVALID_CREDENTIALS'); // same message for every cause
  }
  fails.delete(key);
  await exec('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE user_id = ?', [u.user_id]);
  res.cookie(COOKIE, await createSession(u.user_id), cookieOptions());
  res.json({ user: { userId: u.user_id, role: u.role, fullName: u.full_name, email: u.email } });
}));

authRouter.post('/logout', h(async (req, res) => {
  const t = req.cookies?.[COOKIE];
  if (t) await destroySession(t);          // server-side invalidation, not just cookie removal
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}));

authRouter.get('/me', requireAuth, (req, res) => { res.json({ user: req.user }); });
