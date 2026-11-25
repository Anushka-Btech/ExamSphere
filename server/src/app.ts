import express from 'express';
import cookieParser from 'cookie-parser';
import { loadUser, requireAuth, requireJson } from './auth.js';
import { errorHandler } from './errors.js';
import { authRouter } from './routes/auth.js';
import { peopleRouter } from './routes/people.js';
import { subjectsRouter } from './routes/subjects.js';
import { questionsRouter } from './routes/questions.js';
import { examsRouter } from './routes/exams.js';
import { attemptsRouter } from './routes/attempts.js';
import { resultsRouter } from './routes/results.js';
import { analyticsRouter, dashboardRouter } from './routes/dashboard.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');      // API responses can contain private marks
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requireJson);
  app.use(loadUser);

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/api/auth', authRouter);
  // Everything below needs a valid session; each router then enforces its role.
  app.use('/api', requireAuth);
  app.use('/api/admin', peopleRouter);              // students + faculty management (ADMIN)
  app.use('/api/subjects', subjectsRouter);
  app.use('/api/questions', questionsRouter);       // ADMIN | FACULTY
  app.use('/api/exams', examsRouter);               // ADMIN | FACULTY
  app.use('/api/student', attemptsRouter);          // STUDENT: exams, attempts
  app.use('/api/results', resultsRouter);           // STUDENT: published results only
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }); });
  app.use(errorHandler);
  return app;
}
