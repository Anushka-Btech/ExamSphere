/** Evaluation, publication and corrections. Every write here is one transaction plus an audit row. */
import { audit } from './audit.js';
import { exec, one, query, tx } from './db.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';
import { syncExamStatuses } from './examEngine.js';

/** Write access to an exam: only its faculty owner (admins get read-only oversight, not write). */
export async function assertExamOwner(userId: number, examId: number, c?: Parameters<typeof one>[2]) {
  const e = await one('SELECT exam_id, created_by, status, title FROM examinations WHERE exam_id = ?', [examId], c);
  if (!e) throw notFound('Examination not found');
  if (e.created_by !== userId) throw forbidden('You can only manage your own examinations');
  return e;
}

const isPublished = async (examId: number, c?: Parameters<typeof one>[2]) =>
  !!(await one("SELECT 1 AS x FROM result_publications WHERE exam_id = ? AND action = 'PUBLISH' LIMIT 1", [examId], c));

/** Subjective answers still waiting for marks, for exams owned by this faculty member. */
export const pendingEvaluations = (facultyId: number, examId?: number) => query(
  `SELECT sa.attempt_id, sa.exam_question_id, e.exam_id, e.title, u.full_name AS student_name, sp.enrollment_no,
          q.question_text, q.question_type, q.model_answer, eq.marks AS max_marks, sa.answer_text, a.submitted_at
     FROM student_answers sa
     JOIN exam_attempts a ON a.attempt_id = sa.attempt_id AND a.status <> 'IN_PROGRESS'
     JOIN examinations e ON e.exam_id = a.exam_id
     JOIN examination_questions eq ON eq.exam_question_id = sa.exam_question_id
     JOIN questions q ON q.question_id = eq.question_id
     JOIN users u ON u.user_id = a.student_id
     JOIN student_profiles sp ON sp.user_id = a.student_id
    WHERE sa.evaluation_status = 'PENDING' AND e.created_by = ? ${examId ? 'AND e.exam_id = ?' : ''}
    ORDER BY e.exam_id, a.submitted_at, eq.display_order`, examId ? [facultyId, examId] : [facultyId]);

/** Faculty awards marks to one written answer. The client supplies only the number; limits come from the DB. */
export async function evaluateAnswer(facultyId: number, attemptId: number, examQuestionId: number, marks: number) {
  return tx(async (c) => {
    const r = await one(
      `SELECT e.exam_id, e.created_by, a.status AS attempt_status, q.question_type, eq.marks AS max_marks, sa.evaluation_status
         FROM student_answers sa
         JOIN exam_attempts a ON a.attempt_id = sa.attempt_id
         JOIN examinations e ON e.exam_id = a.exam_id
         JOIN examination_questions eq ON eq.exam_question_id = sa.exam_question_id
         JOIN questions q ON q.question_id = eq.question_id
        WHERE sa.attempt_id = ? AND sa.exam_question_id = ? FOR UPDATE`, [attemptId, examQuestionId], c);
    if (!r) throw notFound('Answer not found');
    if (r.created_by !== facultyId) throw forbidden('You can only evaluate your own examinations');
    if (r.attempt_status === 'IN_PROGRESS') throw conflict('The attempt has not been submitted yet');
    if (['MCQ', 'TRUE_FALSE'].includes(r.question_type)) throw badRequest('Objective answers are graded automatically');
    if (await isPublished(r.exam_id, c)) throw conflict('Results are published: use the correction workflow');
    if (!Number.isFinite(marks) || marks < 0 || marks > Number(r.max_marks)) throw badRequest(`Marks must be between 0 and ${r.max_marks}`);
    await exec(`UPDATE student_answers SET awarded_marks = ?, evaluation_status = 'EVALUATED', evaluated_by = ?, evaluated_at = UTC_TIMESTAMP()
                 WHERE attempt_id = ? AND exam_question_id = ?`, [marks, facultyId, attemptId, examQuestionId], c);
    await audit(facultyId, 'ANSWER_EVALUATED', 'attempt', attemptId, { examQuestionId, marks }, c);
    return { evaluated: true };
  });
}

/** Publish results: all-or-nothing. Refuses while anything is unfinished. */
export async function publishResults(facultyId: number, examId: number) {
  await syncExamStatuses();
  return tx(async (c) => {
    await one('SELECT exam_id FROM examinations WHERE exam_id = ? FOR UPDATE', [examId], c);   // serialises concurrent publishes
    const e = await assertExamOwner(facultyId, examId, c);
    if (e.status !== 'COMPLETED') throw conflict('Results can be published only after the examination has completed');
    if (await isPublished(examId, c)) throw conflict('Results are already published');
    const s = await one(
      `SELECT COUNT(a.attempt_id) AS attempts,
              COALESCE(SUM(a.status = 'IN_PROGRESS'), 0) AS running,
              (SELECT COUNT(*) FROM student_answers sa JOIN exam_attempts a2 ON a2.attempt_id = sa.attempt_id
                WHERE a2.exam_id = ? AND sa.evaluation_status = 'PENDING') AS pending
         FROM exam_attempts a WHERE a.exam_id = ?`, [examId, examId], c);
    if (!s || s.attempts === 0) throw conflict('There are no attempts to publish');
    if (Number(s.running) > 0) throw conflict('Some attempts are still in progress');
    if (Number(s.pending) > 0) throw conflict(`${s.pending} answer(s) still need evaluation`);
    await exec("INSERT INTO result_publications (exam_id, published_by, action, note) VALUES (?, ?, 'PUBLISH', NULL)", [examId, facultyId], c);
    await audit(facultyId, 'RESULTS_PUBLISHED', 'examination', examId, { attempts: s.attempts }, c);
    return { published: true, attempts: Number(s.attempts) };
  });
}

/** After publication, changing any mark needs a written reason and leaves a CORRECTION row + audit trail with old/new value. */
export async function correctMarks(facultyId: number, examId: number, attemptId: number, examQuestionId: number, marks: number, note: string) {
  if (note.trim().length < 5) throw badRequest('A reason of at least 5 characters is required');
  return tx(async (c) => {
    const e = await assertExamOwner(facultyId, examId, c);
    if (!(await isPublished(examId, c))) throw conflict('Results are not published yet: evaluate normally');
    const r = await one(
      `SELECT sa.awarded_marks, eq.marks AS max_marks FROM student_answers sa
         JOIN exam_attempts a ON a.attempt_id = sa.attempt_id
         JOIN examination_questions eq ON eq.exam_question_id = sa.exam_question_id
        WHERE sa.attempt_id = ? AND sa.exam_question_id = ? AND a.exam_id = ? FOR UPDATE`, [attemptId, examQuestionId, examId], c);
    if (!r) throw notFound('Answer not found in this examination');
    if (!Number.isFinite(marks) || marks < 0 || marks > Number(r.max_marks)) throw badRequest(`Marks must be between 0 and ${r.max_marks}`);
    await exec(`UPDATE student_answers SET awarded_marks = ?, evaluation_status = 'EVALUATED', evaluated_by = ?, evaluated_at = UTC_TIMESTAMP()
                 WHERE attempt_id = ? AND exam_question_id = ?`, [marks, facultyId, attemptId, examQuestionId], c);
    await exec("INSERT INTO result_publications (exam_id, published_by, action, note) VALUES (?, ?, 'CORRECTION', ?)", [examId, facultyId, note.trim().slice(0, 300)], c);
    await audit(facultyId, 'RESULT_CORRECTED', 'examination', e.exam_id, { attemptId, examQuestionId, from: r.awarded_marks, to: marks, note }, c);
    return { corrected: true, from: r.awarded_marks, to: marks };
  });
}
