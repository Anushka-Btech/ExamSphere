import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireRole } from '../auth.js';
import { h } from '../errors.js';
import { getPaper, progress, saveAnswer, startAttempt, submitAttempt, syncExamStatuses } from '../examEngine.js';

export const attemptsRouter = Router();
attemptsRouter.use(requireRole('STUDENT'));

const id = z.coerce.number().int().positive();

// Exams this student is eligible for (same department + semester as the subject), never DRAFT/CANCELLED.
attemptsRouter.get('/exams', h(async (req, res) => {
  await syncExamStatuses();
  const rows = await query(
    `SELECT e.exam_id, e.title, e.status, e.scheduled_start, e.scheduled_end, e.duration_minutes, e.max_marks,
            s.code AS subject_code, s.name AS subject_name,
            a.attempt_id, a.status AS attempt_status
       FROM student_profiles sp
       JOIN subjects s ON s.department_id = sp.department_id AND s.semester = sp.semester
       JOIN examinations e ON e.subject_id = s.subject_id AND e.status IN ('SCHEDULED','LIVE','COMPLETED')
       LEFT JOIN exam_attempts a ON a.exam_id = e.exam_id AND a.student_id = sp.user_id
      WHERE sp.user_id = ? ORDER BY e.scheduled_start DESC`, [req.user!.userId]);
  res.json({ exams: rows });
}));

attemptsRouter.post('/exams/:examId/start', h(async (req, res) => {
  const r = await startAttempt(req.user!.userId, id.parse(req.params.examId));
  res.status(r.resumed ? 200 : 201).json(r);
}));

attemptsRouter.get('/attempts/:attemptId', h(async (req, res) => {
  res.json(await getPaper(req.user!.userId, id.parse(req.params.attemptId)));
}));

const saveSchema = z.object({
  examQuestionId: z.number().int().positive(),
  selectedOptionId: z.number().int().positive().nullable().optional(),
  answerText: z.string().max(10000).nullable().optional(),
  markedForReview: z.boolean().optional(),
}).strict();   // unknown keys (e.g. a client-supplied "marks") are rejected, not ignored

attemptsRouter.put('/attempts/:attemptId/answers', h(async (req, res) => {
  res.json(await saveAnswer(req.user!.userId, id.parse(req.params.attemptId), saveSchema.parse(req.body)));
}));

attemptsRouter.get('/attempts/:attemptId/progress', h(async (req, res) => {
  res.json(await progress(req.user!.userId, id.parse(req.params.attemptId)));
}));

attemptsRouter.post('/attempts/:attemptId/submit', h(async (req, res) => {
  res.json(await submitAttempt(req.user!.userId, id.parse(req.params.attemptId)));
}));
