import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { exec, one, query, tx } from '../db.js';
import { requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { h, notFound, badRequest } from '../errors.js';
import { idParam, like, paging, password } from '../util.js';

export const peopleRouter = Router();
peopleRouter.use(requireRole('ADMIN'));

const base = {
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(150),
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Letters, digits, . _ - only'),
  departmentId: z.number().int().positive(),
};
const studentCreate = z.object({ ...base, password, enrollmentNo: z.string().trim().min(4).max(20),
  semester: z.number().int().min(1).max(8), enrollmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();
const studentUpdate = studentCreate.omit({ password: true }).partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() }).strict();
const facultyCreate = z.object({ ...base, password, employeeCode: z.string().trim().min(3).max(20), designation: z.string().trim().min(2).max(60) }).strict();
const facultyUpdate = facultyCreate.omit({ password: true }).partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() }).strict();

// ---------- students
peopleRouter.get('/students', h(async (req, res) => {
  const { page, pageSize, offset } = paging(req.query);
  const where: string[] = ["u.role = 'STUDENT'"]; const args: unknown[] = [];
  const s = z.string().max(100).optional().parse(req.query.search);
  if (s) { where.push("(u.full_name LIKE ? OR u.email LIKE ? OR sp.enrollment_no LIKE ?)"); args.push(like(s), like(s), like(s)); }
  if (req.query.departmentId) { where.push('sp.department_id = ?'); args.push(idParam.parse(req.query.departmentId)); }
  if (req.query.semester) { where.push('sp.semester = ?'); args.push(z.coerce.number().int().min(1).max(8).parse(req.query.semester)); }
  if (req.query.status) { where.push('u.status = ?'); args.push(z.enum(['ACTIVE', 'INACTIVE']).parse(req.query.status)); }
  const from = `FROM users u JOIN student_profiles sp ON sp.user_id = u.user_id JOIN departments d ON d.department_id = sp.department_id WHERE ${where.join(' AND ')}`;
  const total = (await one(`SELECT COUNT(*) AS n ${from}`, args))!.n;
  const rows = await query(
    `SELECT u.user_id, u.full_name, u.email, u.username, u.status, sp.enrollment_no, sp.semester, sp.enrollment_date,
            d.department_id, d.code AS department_code, d.name AS department_name ${from} ORDER BY u.full_name LIMIT ? OFFSET ?`,
    [...args, pageSize, offset]);
  res.json({ items: rows, total, page, pageSize });
}));

peopleRouter.get('/students/:id', h(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const s = await one(`SELECT u.user_id, u.full_name, u.email, u.username, u.status, u.last_login_at, sp.enrollment_no, sp.semester,
         sp.enrollment_date, d.code AS department_code, d.name AS department_name
       FROM users u JOIN student_profiles sp ON sp.user_id = u.user_id JOIN departments d ON d.department_id = sp.department_id
      WHERE u.user_id = ?`, [id]);
  if (!s) throw notFound('Student not found');
  const history = await query(`SELECT exam_id, exam_title, total_marks, max_marks, percentage, result, result_state
                                 FROM student_result_summary WHERE student_id = ? ORDER BY exam_id DESC`, [id]);
  // Admin oversight: unpublished marks are shown with their state, never presented as final.
  res.json({ student: s, attempts: history });
}));

peopleRouter.post('/students', h(async (req, res) => {
  const b = studentCreate.parse(req.body);
  const id = await tx(async (c) => {
    const hash = await bcrypt.hash(b.password, 10);
    const u = await exec("INSERT INTO users (email, username, password_hash, full_name, role) VALUES (?,?,?,?, 'STUDENT')", [b.email, b.username, hash, b.fullName], c);
    await exec('INSERT INTO student_profiles (user_id, enrollment_no, department_id, semester, enrollment_date) VALUES (?,?,?,?,?)',
      [u.insertId, b.enrollmentNo, b.departmentId, b.semester, b.enrollmentDate], c);
    await audit(req.user!.userId, 'STUDENT_CREATED', 'user', u.insertId, { enrollmentNo: b.enrollmentNo }, c);
    return u.insertId;
  });                               // duplicate email / username / enrollment_no => ER_DUP_ENTRY => 409 via errorHandler
  res.status(201).json({ userId: id });
}));

peopleRouter.patch('/students/:id', h(async (req, res) => {
  const id = idParam.parse(req.params.id); const b = studentUpdate.parse(req.body);
  await tx(async (c) => {
    if (!(await one("SELECT user_id FROM users WHERE user_id = ? AND role = 'STUDENT' FOR UPDATE", [id], c))) throw notFound('Student not found');
    const u: [string, unknown][] = [['full_name', b.fullName], ['email', b.email], ['username', b.username], ['status', b.status]];
    const p: [string, unknown][] = [['enrollment_no', b.enrollmentNo], ['department_id', b.departmentId], ['semester', b.semester], ['enrollment_date', b.enrollmentDate]];
    for (const [tbl, cols] of [['users', u], ['student_profiles', p]] as const) {
      const set = cols.filter(([, v]) => v !== undefined);
      if (set.length) await exec(`UPDATE ${tbl} SET ${set.map(([k]) => `${k} = ?`).join(', ')} WHERE user_id = ?`, [...set.map(([, v]) => v), id], c);
    }
    if (b.status === 'INACTIVE') await exec('DELETE FROM sessions WHERE user_id = ?', [id], c);   // deactivation logs the user out
    await audit(req.user!.userId, b.status === 'INACTIVE' ? 'STUDENT_DEACTIVATED' : 'STUDENT_UPDATED', 'user', id, { fields: Object.keys(b) }, c);
  });
  res.json({ updated: true });
}));

// ---------- faculty
peopleRouter.get('/faculty', h(async (req, res) => {
  const { page, pageSize, offset } = paging(req.query);
  const where: string[] = ["u.role = 'FACULTY'"]; const args: unknown[] = [];
  const s = z.string().max(100).optional().parse(req.query.search);
  if (s) { where.push('(u.full_name LIKE ? OR u.email LIKE ? OR fp.employee_code LIKE ?)'); args.push(like(s), like(s), like(s)); }
  if (req.query.departmentId) { where.push('fp.department_id = ?'); args.push(idParam.parse(req.query.departmentId)); }
  if (req.query.status) { where.push('u.status = ?'); args.push(z.enum(['ACTIVE', 'INACTIVE']).parse(req.query.status)); }
  const from = `FROM users u JOIN faculty_profiles fp ON fp.user_id = u.user_id JOIN departments d ON d.department_id = fp.department_id WHERE ${where.join(' AND ')}`;
  const total = (await one(`SELECT COUNT(*) AS n ${from}`, args))!.n;
  const rows = await query(
    `SELECT u.user_id, u.full_name, u.email, u.status, fp.employee_code, fp.designation, d.code AS department_code,
            (SELECT COUNT(*) FROM faculty_subjects fs WHERE fs.faculty_id = u.user_id) AS subjects,
            (SELECT COUNT(*) FROM examinations e WHERE e.created_by = u.user_id) AS exams
       ${from} ORDER BY u.full_name LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
  res.json({ items: rows, total, page, pageSize });
}));

peopleRouter.get('/faculty/:id', h(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const f = await one(`SELECT u.user_id, u.full_name, u.email, u.status, fp.employee_code, fp.designation, d.name AS department_name
                         FROM users u JOIN faculty_profiles fp ON fp.user_id = u.user_id JOIN departments d ON d.department_id = fp.department_id
                        WHERE u.user_id = ?`, [id]);
  if (!f) throw notFound('Faculty member not found');
  const subjects = await query('SELECT s.subject_id, s.code, s.name FROM faculty_subjects fs JOIN subjects s ON s.subject_id = fs.subject_id WHERE fs.faculty_id = ?', [id]);
  const stats = await query('SELECT exam_id, title, status, attempts_total, avg_marks, pass_percentage, is_published FROM examination_statistics WHERE created_by = ?', [id]);
  res.json({ faculty: f, subjects, exams: stats });
}));

peopleRouter.post('/faculty', h(async (req, res) => {
  const b = facultyCreate.parse(req.body);
  const id = await tx(async (c) => {
    const hash = await bcrypt.hash(b.password, 10);
    const u = await exec("INSERT INTO users (email, username, password_hash, full_name, role) VALUES (?,?,?,?, 'FACULTY')", [b.email, b.username, hash, b.fullName], c);
    await exec('INSERT INTO faculty_profiles (user_id, employee_code, department_id, designation) VALUES (?,?,?,?)', [u.insertId, b.employeeCode, b.departmentId, b.designation], c);
    await audit(req.user!.userId, 'FACULTY_CREATED', 'user', u.insertId, { employeeCode: b.employeeCode }, c);
    return u.insertId;
  });
  res.status(201).json({ userId: id });
}));

peopleRouter.patch('/faculty/:id', h(async (req, res) => {
  const id = idParam.parse(req.params.id); const b = facultyUpdate.parse(req.body);
  await tx(async (c) => {
    if (!(await one("SELECT user_id FROM users WHERE user_id = ? AND role = 'FACULTY' FOR UPDATE", [id], c))) throw notFound('Faculty member not found');
    const u: [string, unknown][] = [['full_name', b.fullName], ['email', b.email], ['username', b.username], ['status', b.status]];
    const p: [string, unknown][] = [['employee_code', b.employeeCode], ['department_id', b.departmentId], ['designation', b.designation]];
    for (const [tbl, cols] of [['users', u], ['faculty_profiles', p]] as const) {
      const set = cols.filter(([, v]) => v !== undefined);
      if (set.length) await exec(`UPDATE ${tbl} SET ${set.map(([k]) => `${k} = ?`).join(', ')} WHERE user_id = ?`, [...set.map(([, v]) => v), id], c);
    }
    if (b.status === 'INACTIVE') await exec('DELETE FROM sessions WHERE user_id = ?', [id], c);
    await audit(req.user!.userId, 'FACULTY_UPDATED', 'user', id, { fields: Object.keys(b) }, c);
  });
  res.json({ updated: true });
}));

// faculty <-> subject assignment (composite PK makes a repeat assignment a 409, not a duplicate row)
peopleRouter.put('/faculty/:id/subjects/:subjectId', h(async (req, res) => {
  const f = idParam.parse(req.params.id), s = idParam.parse(req.params.subjectId);
  await exec('INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (?, ?)', [f, s]);
  await audit(req.user!.userId, 'FACULTY_SUBJECT_ASSIGNED', 'user', f, { subjectId: s });
  res.status(201).json({ assigned: true });
}));
peopleRouter.delete('/faculty/:id/subjects/:subjectId', h(async (req, res) => {
  const f = idParam.parse(req.params.id), s = idParam.parse(req.params.subjectId);
  const r = await exec('DELETE FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?', [f, s]);
  if (!r.affectedRows) throw badRequest('That assignment does not exist');
  await audit(req.user!.userId, 'FACULTY_SUBJECT_REMOVED', 'user', f, { subjectId: s });
  res.json({ removed: true });
}));
