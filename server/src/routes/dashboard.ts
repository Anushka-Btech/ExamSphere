import { Router } from 'express';
import { one, query } from '../db.js';
import { requireRole } from '../auth.js';
import { h } from '../errors.js';
import { syncExamStatuses } from '../examEngine.js';

export const dashboardRouter = Router();

// ---------- admin dashboard: every number below is a SQL aggregate
dashboardRouter.get('/admin', requireRole('ADMIN'), h(async (_req, res) => {
  await syncExamStatuses();
  const totals = await one(`SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND status = 'ACTIVE') AS students,
      (SELECT COUNT(*) FROM users WHERE role = 'FACULTY' AND status = 'ACTIVE') AS faculty,
      (SELECT COUNT(*) FROM subjects WHERE status = 'ACTIVE') AS subjects,
      (SELECT COUNT(*) FROM examinations) AS exams,
      (SELECT COUNT(*) FROM published_exams) AS published_exams,
      (SELECT COUNT(*) FROM exam_attempts) AS attempts`);
  const enrollment = await query(`SELECT DATE_FORMAT(enrollment_date, '%Y-%m') AS month, COUNT(*) AS students
                                    FROM student_profiles GROUP BY month ORDER BY month`);
  const byDepartment = await query(`SELECT d.code, COUNT(sp.user_id) AS students FROM departments d
                                      LEFT JOIN student_profiles sp ON sp.department_id = d.department_id GROUP BY d.department_id, d.code ORDER BY d.code`);
  const activity = await query(`SELECT e.status, COUNT(*) AS exams, COALESCE(SUM(st.attempts_total), 0) AS attempts
                                  FROM examinations e LEFT JOIN examination_statistics st ON st.exam_id = e.exam_id GROUP BY e.status`);
  const subjectPerformance = await query(`SELECT code, name, published_exams, attempts, avg_percentage, pass_percentage
                                            FROM subject_performance_summary WHERE attempts > 0 ORDER BY code`);
  const recentActivity = await query(`SELECT a.action, a.entity_type, a.created_at, u.full_name AS actor
                                        FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_user_id ORDER BY a.created_at DESC, a.log_id DESC LIMIT 8`);
  const upcoming = await query(`SELECT e.exam_id, e.title, e.scheduled_start, s.code AS subject_code FROM examinations e JOIN subjects s ON s.subject_id = e.subject_id
                                 WHERE e.status IN ('SCHEDULED','LIVE') AND e.scheduled_end > UTC_TIMESTAMP() ORDER BY e.scheduled_start LIMIT 5`);
  const recentPublications = await query(`SELECT p.published_at, p.action, e.title, u.full_name AS by_name FROM result_publications p
                                            JOIN examinations e ON e.exam_id = p.exam_id JOIN users u ON u.user_id = p.published_by ORDER BY p.published_at DESC LIMIT 5`);
  res.json({ totals, enrollment, byDepartment, activity, subjectPerformance, recentActivity, upcoming, recentPublications });
}));

// ---------- faculty dashboard (own exams only)
dashboardRouter.get('/faculty', requireRole('FACULTY'), h(async (req, res) => {
  await syncExamStatuses();
  const uid = req.user!.userId;
  const totals = await one(`SELECT COUNT(*) AS exams, COALESCE(SUM(status = 'DRAFT'), 0) AS drafts,
        COALESCE(SUM(status IN ('SCHEDULED','LIVE')), 0) AS upcoming FROM examinations WHERE created_by = ?`, [uid]);
  const pending = await one(`SELECT COUNT(*) AS n FROM student_answers sa JOIN exam_attempts a ON a.attempt_id = sa.attempt_id
                              JOIN examinations e ON e.exam_id = a.exam_id WHERE e.created_by = ? AND sa.evaluation_status = 'PENDING' AND a.status <> 'IN_PROGRESS'`, [uid]);
  const questions = await one("SELECT COUNT(*) AS n FROM questions WHERE created_by = ? AND status = 'ACTIVE'", [uid]);
  const exams = await query('SELECT exam_id, title, status, attempts_total, attempts_pending, avg_marks, pass_percentage, is_published FROM examination_statistics WHERE created_by = ? ORDER BY exam_id DESC LIMIT 8', [uid]);
  // Question-bank insights for the faculty dashboard (additive field; existing fields are unchanged).
  const qbType = await query("SELECT question_type AS type, COUNT(*) AS n FROM questions WHERE created_by = ? AND status = 'ACTIVE' GROUP BY question_type ORDER BY n DESC", [uid]);
  const qbDifficulty = await query("SELECT difficulty, COUNT(*) AS n FROM questions WHERE created_by = ? AND status = 'ACTIVE' GROUP BY difficulty", [uid]);
  const qbSubject = await query(`SELECT s.code, COUNT(*) AS n FROM questions q JOIN subjects s ON s.subject_id = q.subject_id
                                  WHERE q.created_by = ? AND q.status = 'ACTIVE' GROUP BY s.subject_id, s.code ORDER BY n DESC, s.code LIMIT 6`, [uid]);
  res.json({ totals: { ...totals, pendingEvaluations: pending!.n, questions: questions!.n }, exams,
    questionBank: { byType: qbType, byDifficulty: qbDifficulty, bySubject: qbSubject } });
}));

// ---------- student dashboard
dashboardRouter.get('/student', requireRole('STUDENT'), h(async (req, res) => {
  await syncExamStatuses();
  const uid = req.user!.userId;
  const upcoming = await query(
    `SELECT e.exam_id, e.title, e.status, e.scheduled_start, e.scheduled_end, s.code AS subject_code, a.attempt_id, a.status AS attempt_status
       FROM student_profiles sp JOIN subjects s ON s.department_id = sp.department_id AND s.semester = sp.semester
       JOIN examinations e ON e.subject_id = s.subject_id AND e.status IN ('SCHEDULED','LIVE')
       LEFT JOIN exam_attempts a ON a.exam_id = e.exam_id AND a.student_id = sp.user_id
      WHERE sp.user_id = ? ORDER BY e.scheduled_start LIMIT 5`, [uid]);
  const trend = await query(`SELECT r.exam_title, r.percentage, r.result FROM student_result_summary r JOIN examinations e ON e.exam_id = r.exam_id
                              WHERE r.student_id = ? AND r.result_state = 'PUBLISHED' ORDER BY e.scheduled_start`, [uid]);
  const awaiting = await one(`SELECT COUNT(*) AS n FROM student_result_summary WHERE student_id = ? AND result_state <> 'PUBLISHED'`, [uid]);
  res.json({ upcoming, trend, awaitingResults: awaiting!.n });
}));

// ---------- analytics. Admin sees everything, faculty only their own exams. PUBLISHED results only, so no half-marked numbers.
export const analyticsRouter = Router();
analyticsRouter.get('/', requireRole('ADMIN', 'FACULTY'), h(async (req, res) => {
  const scope = req.user!.role === 'FACULTY' ? 'AND e.created_by = ?' : '';
  const p = req.user!.role === 'FACULTY' ? [req.user!.userId] : [];
  const base = `FROM student_result_summary r JOIN examinations e ON e.exam_id = r.exam_id WHERE r.result_state = 'PUBLISHED' ${scope}`;
  // Definitions: pass% = PASS / published attempts; average = mean percentage of published attempts. Zero rows => NULL, never 0%.
  const overall = await one(`SELECT COUNT(*) AS attempts, ROUND(100 * SUM(r.result = 'PASS') / NULLIF(COUNT(*), 0), 2) AS pass_percentage,
       ROUND(AVG(r.percentage), 2) AS avg_percentage, MAX(r.percentage) AS highest_percentage, MIN(r.percentage) AS lowest_percentage ${base}`, p);
  const distribution = await query(`SELECT CASE WHEN r.percentage < 40 THEN '0-39' WHEN r.percentage < 60 THEN '40-59' WHEN r.percentage < 80 THEN '60-79' ELSE '80-100' END AS band,
       COUNT(*) AS students ${base} GROUP BY band ORDER BY band`, p);
  const bySubject = await query(`SELECT r.subject_name, ROUND(AVG(r.percentage), 2) AS avg_percentage,
       ROUND(100 * SUM(r.result = 'PASS') / COUNT(*), 2) AS pass_percentage, COUNT(*) AS attempts ${base} GROUP BY r.subject_id, r.subject_name ORDER BY r.subject_name`, p);
  // Participation = attempts / eligible students (same department + semester as the subject).
  const participation = await query(`SELECT e.exam_id, e.title,
       (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id = e.exam_id AND a.status <> 'IN_PROGRESS') AS attempted,
       (SELECT COUNT(*) FROM student_profiles sp JOIN users u ON u.user_id = sp.user_id AND u.status = 'ACTIVE'
         WHERE sp.department_id = s.department_id AND sp.semester = s.semester) AS eligible
     FROM examinations e JOIN subjects s ON s.subject_id = e.subject_id
    WHERE e.status IN ('COMPLETED') ${scope} ORDER BY e.scheduled_start`, p);
  // Question-level correctness over objective answers in published exams.
  const questionRates = await query(`SELECT q.question_id, LEFT(q.question_text, 80) AS question, s.code AS subject_code,
       COUNT(sa.attempt_id) AS answered, SUM(sa.awarded_marks = eq.marks) AS correct,
       ROUND(100 * SUM(sa.awarded_marks = eq.marks) / NULLIF(COUNT(sa.attempt_id), 0), 1) AS correct_percentage
     FROM examination_questions eq JOIN questions q ON q.question_id = eq.question_id AND q.question_type IN ('MCQ','TRUE_FALSE')
     JOIN subjects s ON s.subject_id = q.subject_id JOIN examinations e ON e.exam_id = eq.exam_id
     JOIN published_exams pe ON pe.exam_id = e.exam_id
     JOIN student_answers sa ON sa.exam_question_id = eq.exam_question_id AND sa.selected_option_id IS NOT NULL
    WHERE 1=1 ${scope} GROUP BY q.question_id, q.question_text, s.code HAVING COUNT(sa.attempt_id) >= 3
    ORDER BY correct_percentage, q.question_id LIMIT 10`, p);
  res.json({ overall, distribution, bySubject, participation, hardestQuestions: questionRates });
}));
