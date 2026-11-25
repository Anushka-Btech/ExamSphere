import { Router } from 'express';
import { z } from 'zod';
import { exec, one, query } from '../db.js';
import { requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { h, notFound } from '../errors.js';
import { idParam, like, paging } from '../util.js';

export const subjectsRouter = Router();

const body = z.object({
  code: z.string().trim().min(2).max(15), name: z.string().trim().min(2).max(120), description: z.string().max(2000).nullable().optional(),
  credits: z.number().int().min(1).max(10), semester: z.number().int().min(1).max(8), departmentId: z.number().int().positive(),
}).strict();

subjectsRouter.get('/departments', requireRole('ADMIN', 'FACULTY'), h(async (_req, res) => {
  res.json({ items: await query('SELECT department_id, code, name FROM departments ORDER BY name') });
}));

subjectsRouter.get('/', requireRole('ADMIN', 'FACULTY'), h(async (req, res) => {
  const { page, pageSize, offset } = paging(req.query);
  const where = ['1=1']; const args: unknown[] = [];
  const s = z.string().max(100).optional().parse(req.query.search);
  if (s) { where.push('(sub.code LIKE ? OR sub.name LIKE ?)'); args.push(like(s), like(s)); }
  if (req.query.departmentId) { where.push('sub.department_id = ?'); args.push(idParam.parse(req.query.departmentId)); }
  if (req.query.semester) { where.push('sub.semester = ?'); args.push(z.coerce.number().int().min(1).max(8).parse(req.query.semester)); }
  if (req.query.status) { where.push('sub.status = ?'); args.push(z.enum(['ACTIVE', 'ARCHIVED']).parse(req.query.status)); }
  if (req.user!.role === 'FACULTY' && req.query.mine === '1') { where.push('sub.subject_id IN (SELECT subject_id FROM faculty_subjects WHERE faculty_id = ?)'); args.push(req.user!.userId); }
  const from = `FROM subjects sub JOIN departments d ON d.department_id = sub.department_id WHERE ${where.join(' AND ')}`;
  const total = (await one(`SELECT COUNT(*) AS n ${from}`, args))!.n;
  const items = await query(
    `SELECT sub.subject_id, sub.code, sub.name, sub.credits, sub.semester, sub.status, d.code AS department_code,
            (SELECT GROUP_CONCAT(u.full_name ORDER BY u.full_name SEPARATOR ', ') FROM faculty_subjects fs JOIN users u ON u.user_id = fs.faculty_id WHERE fs.subject_id = sub.subject_id) AS faculty,
            (SELECT COUNT(*) FROM examinations e WHERE e.subject_id = sub.subject_id) AS exams
       ${from} ORDER BY sub.code LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
  res.json({ items, total, page, pageSize });
}));

subjectsRouter.get('/:id', requireRole('ADMIN', 'FACULTY'), h(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const s = await one('SELECT sub.*, d.name AS department_name FROM subjects sub JOIN departments d ON d.department_id = sub.department_id WHERE sub.subject_id = ?', [id]);
  if (!s) throw notFound('Subject not found');
  const exams = await query('SELECT exam_id, title, status, attempts_total, avg_marks, pass_percentage, is_published FROM examination_statistics WHERE subject_id = ? ORDER BY exam_id DESC', [id]);
  const perf = await one('SELECT published_exams, attempts, avg_percentage, pass_percentage FROM subject_performance_summary WHERE subject_id = ?', [id]);
  res.json({ subject: s, exams, performance: perf });
}));

subjectsRouter.post('/', requireRole('ADMIN'), h(async (req, res) => {
  const b = body.parse(req.body);
  const r = await exec('INSERT INTO subjects (code, name, description, credits, semester, department_id) VALUES (?,?,?,?,?,?)',
    [b.code.toUpperCase(), b.name, b.description ?? null, b.credits, b.semester, b.departmentId]);
  await audit(req.user!.userId, 'SUBJECT_CREATED', 'subject', r.insertId, { code: b.code });
  res.status(201).json({ subjectId: r.insertId });
}));

subjectsRouter.put('/:id', requireRole('ADMIN'), h(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const b = body.extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE') }).parse(req.body);
  const r = await exec('UPDATE subjects SET code=?, name=?, description=?, credits=?, semester=?, department_id=?, status=? WHERE subject_id=?',
    [b.code.toUpperCase(), b.name, b.description ?? null, b.credits, b.semester, b.departmentId, b.status, id]);
  if (!r.affectedRows && !(await one('SELECT 1 AS x FROM subjects WHERE subject_id = ?', [id]))) throw notFound('Subject not found');
  await audit(req.user!.userId, 'SUBJECT_UPDATED', 'subject', id, { status: b.status });
  res.json({ updated: true });
}));

// Deleting a subject that has exams/questions is blocked by ON DELETE RESTRICT (409 IN_USE); archive instead.
subjectsRouter.delete('/:id', requireRole('ADMIN'), h(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const r = await exec('DELETE FROM subjects WHERE subject_id = ?', [id]);
  if (!r.affectedRows) throw notFound('Subject not found');
  await audit(req.user!.userId, 'SUBJECT_DELETED', 'subject', id);
  res.json({ deleted: true });
}));
