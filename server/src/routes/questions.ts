import { Router } from 'express';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { exec, one, query, tx } from '../db.js';
import { requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { badRequest, conflict, forbidden, h, notFound } from '../errors.js';
import { idParam, like, paging } from '../util.js';

// Students never reach this router: it exposes is_correct and model_answer.
export const questionsRouter = Router();
questionsRouter.use(requireRole('ADMIN', 'FACULTY'));

const qBody = z.object({
  subjectId: z.number().int().positive(),
  text: z.string().trim().min(5).max(4000),
  type: z.enum(['MCQ', 'TRUE_FALSE', 'SHORT', 'DESCRIPTIVE']),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  defaultMarks: z.number().positive().max(100),
  modelAnswer: z.string().max(4000).nullable().optional(),
  options: z.array(z.object({ text: z.string().trim().min(1).max(500), isCorrect: z.boolean() })).max(6).optional(),
  trueFalseAnswer: z.boolean().optional(),
}).strict();
type QBody = z.infer<typeof qBody>;

/** Cross-row rule that no CHECK can express: shape of the option set for each question type. */
function normalizeOptions(b: QBody): { text: string; isCorrect: boolean }[] {
  if (b.type === 'MCQ') {
    const o = b.options ?? [];
    if (o.length < 2) throw badRequest('An MCQ needs at least 2 options');
    if (o.filter((x) => x.isCorrect).length !== 1) throw badRequest('An MCQ needs exactly one correct option');
    if (new Set(o.map((x) => x.text.toLowerCase())).size !== o.length) throw badRequest('Options must be different');
    return o;
  }
  if (b.type === 'TRUE_FALSE') {
    if (typeof b.trueFalseAnswer !== 'boolean') throw badRequest('Say whether the statement is true or false');
    return [{ text: 'True', isCorrect: b.trueFalseAnswer }, { text: 'False', isCorrect: !b.trueFalseAnswer }];
  }
  if (b.options?.length) throw badRequest('Written questions do not have options');
  return [];
}

async function assertCanWriteSubject(userId: number, role: string, subjectId: number, c?: PoolConnection) {
  const s = await one('SELECT status FROM subjects WHERE subject_id = ?', [subjectId], c);
  if (!s) throw badRequest('Subject does not exist');
  if (s.status !== 'ACTIVE') throw conflict('Subject is archived');
  if (role === 'FACULTY' && !(await one('SELECT 1 AS x FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?', [userId, subjectId], c)))
    throw forbidden('You are not assigned to this subject');
}

async function insertQuestion(b: QBody, authorId: number, c: PoolConnection): Promise<number> {
  const opts = normalizeOptions(b);
  const r = await exec('INSERT INTO questions (subject_id, created_by, question_text, question_type, difficulty, default_marks, model_answer) VALUES (?,?,?,?,?,?,?)',
    [b.subjectId, authorId, b.text, b.type, b.difficulty, b.defaultMarks, b.type === 'SHORT' || b.type === 'DESCRIPTIVE' ? b.modelAnswer ?? null : null], c);
  for (const [i, o] of opts.entries())
    await exec('INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES (?,?,?,?)', [r.insertId, o.text, o.isCorrect ? 1 : 0, i + 1], c);
  return r.insertId;
}

questionsRouter.get('/', h(async (req, res) => {
  const { page, pageSize, offset } = paging(req.query);
  const where = ['1=1']; const args: unknown[] = [];
  if (req.user!.role === 'FACULTY') { where.push('q.subject_id IN (SELECT subject_id FROM faculty_subjects WHERE faculty_id = ?)'); args.push(req.user!.userId); }
  const s = z.string().max(100).optional().parse(req.query.search);
  if (s) { where.push('q.question_text LIKE ?'); args.push(like(s)); }
  if (req.query.subjectId) { where.push('q.subject_id = ?'); args.push(idParam.parse(req.query.subjectId)); }
  if (req.query.difficulty) { where.push('q.difficulty = ?'); args.push(z.enum(['EASY', 'MEDIUM', 'HARD']).parse(req.query.difficulty)); }
  if (req.query.type) { where.push('q.question_type = ?'); args.push(z.enum(['MCQ', 'TRUE_FALSE', 'SHORT', 'DESCRIPTIVE']).parse(req.query.type)); }
  if (req.query.marks) { where.push('q.default_marks = ?'); args.push(z.coerce.number().positive().parse(req.query.marks)); }
  where.push('q.status = ?'); args.push(z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE').parse(req.query.status));
  const from = `FROM questions q JOIN subjects s ON s.subject_id = q.subject_id JOIN users u ON u.user_id = q.created_by WHERE ${where.join(' AND ')}`;
  const total = (await one(`SELECT COUNT(*) AS n ${from}`, args))!.n;
  const items = await query(
    `SELECT q.question_id, q.question_text, q.question_type, q.difficulty, q.default_marks, q.status, q.created_at,
            s.code AS subject_code, u.full_name AS created_by_name,
            (SELECT COUNT(*) FROM examination_questions eq WHERE eq.question_id = q.question_id) AS used_in_exams
       ${from} ORDER BY q.question_id DESC LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
  res.json({ items, total, page, pageSize });
}));

questionsRouter.get('/:id', h(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const q = await one('SELECT q.*, s.code AS subject_code FROM questions q JOIN subjects s ON s.subject_id = q.subject_id WHERE q.question_id = ?', [id]);
  if (!q) throw notFound('Question not found');
  if (req.user!.role === 'FACULTY' && !(await one('SELECT 1 AS x FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?', [req.user!.userId, q.subject_id])))
    throw forbidden('You are not assigned to this subject');
  const options = await query('SELECT option_id, option_text, is_correct, display_order FROM question_options WHERE question_id = ? ORDER BY display_order', [id]);
  res.json({ question: q, options });   // preview for staff: includes the correct option and the model answer
}));

questionsRouter.post('/', requireRole('FACULTY'), h(async (req, res) => {
  const b = qBody.parse(req.body);
  const id = await tx(async (c) => {
    await assertCanWriteSubject(req.user!.userId, req.user!.role, b.subjectId, c);
    const qid = await insertQuestion(b, req.user!.userId, c);
    await audit(req.user!.userId, 'QUESTION_CREATED', 'question', qid, { type: b.type }, c);
    return qid;
  });
  res.status(201).json({ questionId: id });
}));

// Bulk import (the UI parses a CSV into this JSON). All rows or none: one transaction, row number reported on failure.
questionsRouter.post('/import', requireRole('FACULTY'), h(async (req, res) => {
  const rows = z.object({ questions: z.array(qBody).min(1).max(200) }).strict().parse(req.body).questions;
  const ids = await tx(async (c) => {
    const out: number[] = [];
    for (const [i, b] of rows.entries()) {
      try { await assertCanWriteSubject(req.user!.userId, req.user!.role, b.subjectId, c); out.push(await insertQuestion(b, req.user!.userId, c)); }
      catch (e) { throw badRequest(`Row ${i + 1}: ${(e as Error).message}`); }
    }
    await audit(req.user!.userId, 'QUESTIONS_IMPORTED', 'question', null, { count: out.length }, c);
    return out;
  });
  res.status(201).json({ imported: ids.length });
}));

questionsRouter.put('/:id', requireRole('FACULTY'), h(async (req, res) => {
  const id = idParam.parse(req.params.id); const b = qBody.parse(req.body);
  await tx(async (c) => {
    const q = await one('SELECT created_by, subject_id FROM questions WHERE question_id = ? FOR UPDATE', [id], c);
    if (!q) throw notFound('Question not found');
    if (q.created_by !== req.user!.userId) throw forbidden('Only the author can edit a question');
    await assertCanWriteSubject(req.user!.userId, req.user!.role, b.subjectId, c);
    // Safe-modification rule: once a question sits in a non-draft exam, changing it would alter what students already saw/answered.
    const used = await one(`SELECT COUNT(*) AS n FROM examination_questions eq JOIN examinations e ON e.exam_id = eq.exam_id
                             WHERE eq.question_id = ? AND e.status <> 'DRAFT'`, [id], c);
    if (used!.n > 0) throw conflict('This question is used in a scheduled or completed examination. Archive it and create a new one.');
    const opts = normalizeOptions(b);
    await exec('UPDATE questions SET subject_id=?, question_text=?, question_type=?, difficulty=?, default_marks=?, model_answer=? WHERE question_id=?',
      [b.subjectId, b.text, b.type, b.difficulty, b.defaultMarks, b.type === 'SHORT' || b.type === 'DESCRIPTIVE' ? b.modelAnswer ?? null : null, id], c);
    await exec('DELETE FROM question_options WHERE question_id = ?', [id], c);   // FK RESTRICT from student_answers protects answered options
    for (const [i, o] of opts.entries())
      await exec('INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES (?,?,?,?)', [id, o.text, o.isCorrect ? 1 : 0, i + 1], c);
    await audit(req.user!.userId, 'QUESTION_UPDATED', 'question', id, null, c);
  });
  res.json({ updated: true });
}));

questionsRouter.post('/:id/archive', requireRole('FACULTY'), h(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const q = await one('SELECT created_by FROM questions WHERE question_id = ?', [id]);
  if (!q) throw notFound('Question not found');
  if (q.created_by !== req.user!.userId) throw forbidden('Only the author can archive a question');
  await exec("UPDATE questions SET status = 'ARCHIVED' WHERE question_id = ?", [id]);
  await audit(req.user!.userId, 'QUESTION_ARCHIVED', 'question', id);
  res.json({ archived: true });
}));
