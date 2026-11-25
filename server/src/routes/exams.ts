import { Router } from 'express';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { exec, one, query, tx } from '../db.js';
import { requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { badRequest, conflict, forbidden, h, notFound } from '../errors.js';
import { idParam, like, paging } from '../util.js';
import { syncExamStatuses } from '../examEngine.js';
import { assertExamOwner, correctMarks, evaluateAnswer, pendingEvaluations, publishResults } from '../resultEngine.js';

export const examsRouter = Router();
examsRouter.use(requireRole('ADMIN', 'FACULTY'));
const faculty = requireRole('FACULTY');

const toSql = (iso: string) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');   // UTC 'YYYY-MM-DD HH:MM:SS'

const examBody = z.object({
  subjectId: z.number().int().positive(),
  title: z.string().trim().min(3).max(150),
  description: z.string().max(2000).nullable().optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  durationMinutes: z.number().int().positive().max(600),
  maxMarks: z.number().positive().max(1000),
  passingMarks: z.number().min(0),
}).strict();

/** Business rules a CHECK cannot express (they span two columns through functions, or depend on "now"). */
function validateExam(b: z.infer<typeof examBody>) {
  const start = new Date(b.scheduledStart).getTime(), end = new Date(b.scheduledEnd).getTime();
  if (end <= start) throw badRequest('End time must be after start time');
  if (b.durationMinutes > (end - start) / 60000) throw badRequest('Duration cannot be longer than the exam window');
  if (b.passingMarks > b.maxMarks) throw badRequest('Passing marks cannot exceed maximum marks');
  if (start <= Date.now()) throw badRequest('Start time must be in the future');
}

async function assertAssigned(userId: number, subjectId: number, c?: PoolConnection) {
  const s = await one('SELECT status FROM subjects WHERE subject_id = ?', [subjectId], c);
  if (!s) throw badRequest('Subject does not exist');
  if (s.status !== 'ACTIVE') throw conflict('Subject is archived');
  if (!(await one('SELECT 1 AS x FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?', [userId, subjectId], c))) throw forbidden('You are not assigned to this subject');
}

// Read access: owner or admin. Write access: owner only (assertExamOwner).
async function assertCanRead(req: { user?: { userId: number; role: string } }, examId: number) {
  const e = await one('SELECT exam_id, created_by FROM examinations WHERE exam_id = ?', [examId]);
  if (!e) throw notFound('Examination not found');
  if (req.user!.role === 'FACULTY' && e.created_by !== req.user!.userId) throw forbidden('You can only view your own examinations');
}

// ---- static paths first (before /:id)
examsRouter.get('/pending-evaluations', faculty, h(async (req, res) => {
  res.json({ items: await pendingEvaluations(req.user!.userId, req.query.examId ? idParam.parse(req.query.examId) : undefined) });
}));

examsRouter.put('/evaluations', faculty, h(async (req, res) => {
  const b = z.object({ attemptId: z.number().int().positive(), examQuestionId: z.number().int().positive(), marks: z.number().min(0) }).strict().parse(req.body);
  res.json(await evaluateAnswer(req.user!.userId, b.attemptId, b.examQuestionId, b.marks));   // only the number is client-supplied
}));

examsRouter.get('/', h(async (req, res) => {
  await syncExamStatuses();
  const { page, pageSize, offset } = paging(req.query);
  const where = ['1=1']; const args: unknown[] = [];
  if (req.user!.role === 'FACULTY') { where.push('e.created_by = ?'); args.push(req.user!.userId); }
  const s = z.string().max(100).optional().parse(req.query.search);
  if (s) { where.push('e.title LIKE ?'); args.push(like(s)); }
  if (req.query.status) { where.push('e.status = ?'); args.push(z.enum(['DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED']).parse(req.query.status)); }
  if (req.query.subjectId) { where.push('e.subject_id = ?'); args.push(idParam.parse(req.query.subjectId)); }
  const from = `FROM examinations e JOIN subjects s ON s.subject_id = e.subject_id JOIN users u ON u.user_id = e.created_by
                LEFT JOIN examination_statistics st ON st.exam_id = e.exam_id WHERE ${where.join(' AND ')}`;
  const total = (await one(`SELECT COUNT(*) AS n ${from}`, args))!.n;
  const items = await query(
    `SELECT e.exam_id, e.title, e.status, e.scheduled_start, e.scheduled_end, e.duration_minutes, e.max_marks, e.passing_marks,
            s.code AS subject_code, u.full_name AS owner, st.attempts_total, st.attempts_pending, st.avg_marks, st.pass_percentage, st.is_published
       ${from} ORDER BY e.scheduled_start DESC LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
  res.json({ items, total, page, pageSize });
}));

examsRouter.post('/', faculty, h(async (req, res) => {
  const b = examBody.parse(req.body); validateExam(b);
  await assertAssigned(req.user!.userId, b.subjectId);
  const r = await exec(`INSERT INTO examinations (subject_id, created_by, title, description, scheduled_start, scheduled_end, duration_minutes, max_marks, passing_marks)
                         VALUES (?,?,?,?,?,?,?,?,?)`,
    [b.subjectId, req.user!.userId, b.title, b.description ?? null, toSql(b.scheduledStart), toSql(b.scheduledEnd), b.durationMinutes, b.maxMarks, b.passingMarks]);
  await audit(req.user!.userId, 'EXAM_CREATED', 'examination', r.insertId, { title: b.title });
  res.status(201).json({ examId: r.insertId });
}));

examsRouter.get('/:id', h(async (req, res) => {
  const id = idParam.parse(req.params.id); await syncExamStatuses(); await assertCanRead(req, id);
  const exam = await one(`SELECT e.*, s.code AS subject_code, s.name AS subject_name, u.full_name AS owner,
                                 EXISTS(SELECT 1 FROM result_publications p WHERE p.exam_id = e.exam_id AND p.action = 'PUBLISH') AS results_published
                            FROM examinations e JOIN subjects s ON s.subject_id = e.subject_id JOIN users u ON u.user_id = e.created_by WHERE e.exam_id = ?`, [id]);
  const questions = await query(`SELECT eq.exam_question_id, eq.question_id, eq.display_order, eq.marks, q.question_text, q.question_type, q.difficulty
                                   FROM examination_questions eq JOIN questions q ON q.question_id = eq.question_id WHERE eq.exam_id = ? ORDER BY eq.display_order`, [id]);
  const assigned = questions.reduce((t, q) => t + Number(q.marks), 0);
  res.json({ exam, questions, assignedMarks: assigned, marksBalanced: assigned === Number(exam!.max_marks) });
}));

examsRouter.put('/:id', faculty, h(async (req, res) => {
  const id = idParam.parse(req.params.id); const b = examBody.parse(req.body); validateExam(b);
  await tx(async (c) => {
    await one('SELECT exam_id FROM examinations WHERE exam_id = ? FOR UPDATE', [id], c);
    const e = await assertExamOwner(req.user!.userId, id, c);
    if (e.status !== 'DRAFT') throw conflict('Only draft examinations can be edited. Move it back to draft first.');
    await assertAssigned(req.user!.userId, b.subjectId, c);
    await exec(`UPDATE examinations SET subject_id=?, title=?, description=?, scheduled_start=?, scheduled_end=?, duration_minutes=?, max_marks=?, passing_marks=? WHERE exam_id=?`,
      [b.subjectId, b.title, b.description ?? null, toSql(b.scheduledStart), toSql(b.scheduledEnd), b.durationMinutes, b.maxMarks, b.passingMarks, id], c);
    await audit(req.user!.userId, 'EXAM_UPDATED', 'examination', id, null, c);
  });
  res.json({ updated: true });
}));

// Replace the question set of a DRAFT exam. Subject match + ACTIVE status are enforced; the marks total is enforced at scheduling.
examsRouter.put('/:id/questions', faculty, h(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const b = z.object({ questions: z.array(z.object({ questionId: z.number().int().positive(), marks: z.number().positive().max(100) })).max(200) }).strict().parse(req.body);
  if (new Set(b.questions.map((q) => q.questionId)).size !== b.questions.length) throw badRequest('A question can be added only once');
  await tx(async (c) => {
    await one('SELECT exam_id FROM examinations WHERE exam_id = ? FOR UPDATE', [id], c);
    const e = await assertExamOwner(req.user!.userId, id, c);
    if (e.status !== 'DRAFT') throw conflict('The question set can only change while the examination is a draft');
    const ex = await one('SELECT subject_id FROM examinations WHERE exam_id = ?', [id], c);
    if (b.questions.length) {
      const ok = await query(`SELECT question_id FROM questions WHERE question_id IN (?) AND subject_id = ? AND status = 'ACTIVE'`, [b.questions.map((q) => q.questionId), ex!.subject_id], c);
      if (ok.length !== b.questions.length) throw badRequest("Every question must be active and belong to the examination's subject");
    }
    await exec('DELETE FROM examination_questions WHERE exam_id = ?', [id], c);
    for (const [i, q] of b.questions.entries())
      await exec('INSERT INTO examination_questions (exam_id, question_id, marks, display_order) VALUES (?,?,?,?)', [id, q.questionId, q.marks, i + 1], c);
    await audit(req.user!.userId, 'EXAM_QUESTIONS_SET', 'examination', id, { count: b.questions.length }, c);
  });
  res.json({ updated: true });
}));

// DRAFT -> SCHEDULED. Cross-row validation runs here, under a row lock, in one transaction.
examsRouter.post('/:id/schedule', faculty, h(async (req, res) => {
  const id = idParam.parse(req.params.id);
  await tx(async (c) => {
    await one('SELECT exam_id FROM examinations WHERE exam_id = ? FOR UPDATE', [id], c);
    const e = await assertExamOwner(req.user!.userId, id, c);
    if (e.status !== 'DRAFT') throw conflict('Only a draft can be scheduled');
    const ex = await one('SELECT max_marks, scheduled_start FROM examinations WHERE exam_id = ?', [id], c);
    if (new Date(ex!.scheduled_start.replace(' ', 'T') + 'Z').getTime() <= Date.now()) throw badRequest('Start time has already passed: edit the schedule first');
    const t = await one('SELECT COUNT(*) AS n, COALESCE(SUM(marks), 0) AS total FROM examination_questions WHERE exam_id = ?', [id], c);
    if (t!.n === 0) throw badRequest('Assign at least one question first');
    if (Number(t!.total) !== Number(ex!.max_marks)) throw badRequest(`Question marks add up to ${t!.total} but the exam is out of ${ex!.max_marks}`);
    // every objective question must have exactly one correct option
    const bad = await one(`SELECT COUNT(*) AS n FROM examination_questions eq JOIN questions q ON q.question_id = eq.question_id
                            WHERE eq.exam_id = ? AND q.question_type IN ('MCQ','TRUE_FALSE')
                              AND (SELECT COUNT(*) FROM question_options o WHERE o.question_id = q.question_id AND o.is_correct = 1) <> 1`, [id], c);
    if (bad!.n > 0) throw badRequest('Some objective questions do not have exactly one correct option');
    await exec("UPDATE examinations SET status = 'SCHEDULED' WHERE exam_id = ?", [id], c);
    await audit(req.user!.userId, 'EXAM_SCHEDULED', 'examination', id, null, c);
  });
  res.json({ status: 'SCHEDULED' });
}));

// SCHEDULED -> DRAFT, only while nobody has started it.
examsRouter.post('/:id/unschedule', faculty, h(async (req, res) => {
  const id = idParam.parse(req.params.id); await syncExamStatuses();
  await tx(async (c) => {
    await one('SELECT exam_id FROM examinations WHERE exam_id = ? FOR UPDATE', [id], c);
    const e = await assertExamOwner(req.user!.userId, id, c);
    if (e.status !== 'SCHEDULED') throw conflict('Only a scheduled (not yet started) examination can return to draft');
    if ((await one('SELECT COUNT(*) AS n FROM exam_attempts WHERE exam_id = ?', [id], c))!.n > 0) throw conflict('Students have already attempted it');
    await exec("UPDATE examinations SET status = 'DRAFT' WHERE exam_id = ?", [id], c);
    await audit(req.user!.userId, 'EXAM_UNSCHEDULED', 'examination', id, null, c);
  });
  res.json({ status: 'DRAFT' });
}));

// Cancel: DRAFT or SCHEDULED, or LIVE with no attempts. COMPLETED exams keep their records.
examsRouter.post('/:id/cancel', faculty, h(async (req, res) => {
  const id = idParam.parse(req.params.id); await syncExamStatuses();
  await tx(async (c) => {
    await one('SELECT exam_id FROM examinations WHERE exam_id = ? FOR UPDATE', [id], c);
    const e = await assertExamOwner(req.user!.userId, id, c);
    if (!['DRAFT', 'SCHEDULED', 'LIVE'].includes(e.status)) throw conflict('This examination can no longer be cancelled');
    if ((await one('SELECT COUNT(*) AS n FROM exam_attempts WHERE exam_id = ?', [id], c))!.n > 0) throw conflict('Students have already attempted it');
    await exec("UPDATE examinations SET status = 'CANCELLED' WHERE exam_id = ?", [id], c);
    await audit(req.user!.userId, 'EXAM_CANCELLED', 'examination', id, null, c);
  });
  res.json({ status: 'CANCELLED' });
}));

examsRouter.get('/:id/results', h(async (req, res) => {
  const id = idParam.parse(req.params.id); await assertCanRead(req, id);
  const stats = await one('SELECT * FROM examination_statistics WHERE exam_id = ?', [id]);
  const rows = await query(`SELECT attempt_id, student_id, student_name, enrollment_no, total_marks, max_marks, percentage, result, result_state, dense_rank_in_exam
                              FROM student_result_summary WHERE exam_id = ? ORDER BY dense_rank_in_exam IS NULL, dense_rank_in_exam, student_name`, [id]);
  res.json({ statistics: stats, results: rows });
}));

// One student's answers for marking and corrections. Staff only (owner or admin); includes the model answer.
examsRouter.get('/:id/attempts/:attemptId', h(async (req, res) => {
  const id = idParam.parse(req.params.id), attemptId = idParam.parse(req.params.attemptId); await assertCanRead(req, id);
  const a = await one(`SELECT a.attempt_id, a.status, a.submitted_at, u.full_name AS student_name, sp.enrollment_no
                         FROM exam_attempts a JOIN users u ON u.user_id = a.student_id JOIN student_profiles sp ON sp.user_id = a.student_id
                        WHERE a.attempt_id = ? AND a.exam_id = ?`, [attemptId, id]);
  if (!a) throw notFound('Attempt not found in this examination');
  const answers = await query(
    `SELECT eq.exam_question_id, eq.display_order, eq.marks AS max_marks, q.question_text, q.question_type, q.model_answer,
            sa.awarded_marks, sa.evaluation_status, sa.answer_text,
            (SELECT o.option_text FROM question_options o WHERE o.option_id = sa.selected_option_id) AS selected_option,
            (SELECT o.option_text FROM question_options o WHERE o.question_id = q.question_id AND o.is_correct = 1) AS correct_option
       FROM examination_questions eq JOIN questions q ON q.question_id = eq.question_id
       LEFT JOIN student_answers sa ON sa.exam_question_id = eq.exam_question_id AND sa.attempt_id = ?
      WHERE eq.exam_id = ? ORDER BY eq.display_order`, [attemptId, id]);
  res.json({ attempt: a, answers });
}));

examsRouter.post('/:id/publish-results', faculty, h(async (req, res) => { res.json(await publishResults(req.user!.userId, idParam.parse(req.params.id))); }));

examsRouter.post('/:id/corrections', faculty, h(async (req, res) => {
  const b = z.object({ attemptId: z.number().int().positive(), examQuestionId: z.number().int().positive(), marks: z.number().min(0), note: z.string().max(300) }).strict().parse(req.body);
  res.json(await correctMarks(req.user!.userId, idParam.parse(req.params.id), b.attemptId, b.examQuestionId, b.marks, b.note));
}));

examsRouter.get('/:id/publications', h(async (req, res) => {
  const id = idParam.parse(req.params.id); await assertCanRead(req, id);
  res.json({ items: await query(`SELECT p.publication_id, p.action, p.note, p.published_at, u.full_name AS by_name
                                   FROM result_publications p JOIN users u ON u.user_id = p.published_by WHERE p.exam_id = ? ORDER BY p.published_at`, [id]) });
}));
