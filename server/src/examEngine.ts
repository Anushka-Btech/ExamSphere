/**
 * Exam engine: every rule about attempts lives here so routes stay thin and tests can call it directly.
 * The browser timer is cosmetic. Validity is decided here, from server time (UTC_TIMESTAMP()).
 */
import type { PoolConnection } from 'mysql2/promise';
import { exec, one, query, tx, type Row } from './db.js';
import { config } from './config.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';

// SQL fragment: the instant an attempt stops being valid = earlier of (start + duration) and the exam window end.
export const DEADLINE_SQL = 'LEAST(DATE_ADD(a.started_at, INTERVAL e.duration_minutes MINUTE), e.scheduled_end)';

/** Moves SCHEDULED -> LIVE -> COMPLETED purely from the clock. Idempotent; no cron needed for correctness. */
export async function syncExamStatuses() {
  await exec(`UPDATE examinations SET status = 'LIVE'
               WHERE status = 'SCHEDULED' AND scheduled_start <= UTC_TIMESTAMP() AND scheduled_end > UTC_TIMESTAMP()`);
  await exec(`UPDATE examinations SET status = 'COMPLETED'
               WHERE status IN ('SCHEDULED','LIVE') AND scheduled_end <= UTC_TIMESTAMP()`);
}

/**
 * Grades objective answers and zero-marks blank answers, inside the caller's transaction.
 * Single-table UPDATE with correlated subqueries (tested on the seeded DB): marks = the exam marks when the chosen
 * option is the correct option OF THAT QUESTION, else 0. Real written answers are left PENDING for faculty.
 */
async function gradeObjective(attemptId: number, c: PoolConnection) {
  await exec(
    `UPDATE student_answers sa
        SET sa.awarded_marks = COALESCE((SELECT eq.marks FROM examination_questions eq
                                           JOIN question_options o ON o.question_id = eq.question_id
                                          WHERE eq.exam_question_id = sa.exam_question_id
                                            AND o.option_id = sa.selected_option_id AND o.is_correct = 1), 0),
            sa.evaluation_status = 'EVALUATED', sa.evaluated_by = NULL, sa.evaluated_at = UTC_TIMESTAMP()
      WHERE sa.attempt_id = ?
        AND (sa.exam_question_id IN (SELECT eq.exam_question_id FROM examination_questions eq
                                       JOIN questions q ON q.question_id = eq.question_id
                                      WHERE q.question_type IN ('MCQ','TRUE_FALSE'))
             OR sa.answer_text IS NULL OR TRIM(sa.answer_text) = '')`,
    [attemptId], c);
}

/**
 * Finalise an attempt inside the caller's transaction (row must already be locked FOR UPDATE).
 * Idempotent: an attempt that is not IN_PROGRESS is left untouched.
 */
export async function finalizeLocked(attemptId: number, status: 'SUBMITTED' | 'AUTO_SUBMITTED', c: PoolConnection): Promise<boolean> {
  const a = await one(
    `SELECT a.status, ${DEADLINE_SQL} AS deadline FROM exam_attempts a JOIN examinations e ON e.exam_id = a.exam_id
      WHERE a.attempt_id = ?`, [attemptId], c);
  if (!a || a.status !== 'IN_PROGRESS') return false;
  await exec(`UPDATE exam_attempts SET status = ?, submitted_at = LEAST(UTC_TIMESTAMP(), ?) WHERE attempt_id = ?`,
    [status, a.deadline, attemptId], c);
  await gradeObjective(attemptId, c);
  return true;
}

/** Auto-submit every in-progress attempt whose deadline has passed (called on a timer and before reads). */
export async function finalizeExpiredAttempts(): Promise<number> {
  const due = await query(
    `SELECT a.attempt_id FROM exam_attempts a JOIN examinations e ON e.exam_id = a.exam_id
      WHERE a.status = 'IN_PROGRESS' AND ${DEADLINE_SQL} <= UTC_TIMESTAMP()`);
  let n = 0;
  for (const d of due) {
    n += (await tx(async (c) => {
      await one('SELECT attempt_id FROM exam_attempts WHERE attempt_id = ? FOR UPDATE', [d.attempt_id], c);
      return (await finalizeLocked(d.attempt_id, 'AUTO_SUBMITTED', c)) ? 1 : 0;
    }));
  }
  return n;
}

export async function startAttempt(studentId: number, examId: number) {
  await syncExamStatuses();
  await finalizeExpiredAttempts();
  return tx(async (c) => {
    const exam = await one(
      `SELECT e.exam_id, e.status, s.department_id, s.semester,
              (UTC_TIMESTAMP() >= e.scheduled_start AND UTC_TIMESTAMP() < e.scheduled_end) AS in_window
         FROM examinations e JOIN subjects s ON s.subject_id = e.subject_id
        WHERE e.exam_id = ? FOR SHARE`, [examId], c);
    if (!exam) throw notFound('Examination not found');
    const st = await one('SELECT department_id, semester FROM student_profiles WHERE user_id = ?', [studentId], c);
    if (!st) throw forbidden('Only students can attempt examinations');
    // Eligibility rule: same department and semester as the subject.
    if (st.department_id !== exam.department_id || st.semester !== exam.semester) throw forbidden('You are not eligible for this examination');
    if (!['SCHEDULED', 'LIVE'].includes(exam.status)) throw conflict('This examination is not open for attempts');
    if (!exam.in_window) throw conflict('This examination is outside its permitted time window');

    const existing = await one('SELECT attempt_id, status FROM exam_attempts WHERE exam_id = ? AND student_id = ? FOR UPDATE', [examId, studentId], c);
    if (existing) {
      if (existing.status === 'IN_PROGRESS') return { attemptId: existing.attempt_id as number, resumed: true };
      throw conflict('You have already attempted this examination');
    }
    // uq_attempt_exam_student is the backstop if two requests race past the SELECT above.
    const r = await exec('INSERT INTO exam_attempts (exam_id, student_id, started_at) VALUES (?, ?, UTC_TIMESTAMP())', [examId, studentId], c);
    return { attemptId: r.insertId, resumed: false };
  });
}

async function ownedAttempt(attemptId: number, studentId: number, c?: PoolConnection) {
  const a = await one(
    `SELECT a.attempt_id, a.exam_id, a.student_id, a.status, a.started_at, a.submitted_at,
            ${DEADLINE_SQL} AS deadline, UTC_TIMESTAMP() AS server_now,
            (UTC_TIMESTAMP() > DATE_ADD(${DEADLINE_SQL}, INTERVAL ${config.deadlineGraceSeconds} SECOND)) AS expired
       FROM exam_attempts a JOIN examinations e ON e.exam_id = a.exam_id
      WHERE a.attempt_id = ?${c ? ' FOR UPDATE' : ''}`, [attemptId], c);
  // Same response for "missing" and "someone else's": do not reveal that other attempts exist.
  if (!a || a.student_id !== studentId) throw notFound('Attempt not found');
  return a;
}

/** Paper for the exam screen. Never contains is_correct or model_answer. */
export async function getPaper(studentId: number, attemptId: number) {
  await finalizeExpiredAttempts();
  const a = await ownedAttempt(attemptId, studentId);
  const exam = await one(`SELECT e.title, e.duration_minutes, e.max_marks, s.name AS subject_name, s.code AS subject_code
                            FROM examinations e JOIN subjects s ON s.subject_id = e.subject_id WHERE e.exam_id = ?`, [a.exam_id]);
  const qs = await query(
    `SELECT eq.exam_question_id, eq.question_id, eq.display_order, eq.marks, q.question_text, q.question_type,
            sa.selected_option_id, sa.answer_text, sa.marked_for_review
       FROM examination_questions eq JOIN questions q ON q.question_id = eq.question_id
       LEFT JOIN student_answers sa ON sa.exam_question_id = eq.exam_question_id AND sa.attempt_id = ?
      WHERE eq.exam_id = ? ORDER BY eq.display_order`, [attemptId, a.exam_id]);
  const opts = await query(
    `SELECT o.question_id, o.option_id, o.option_text FROM question_options o
       JOIN examination_questions eq ON eq.question_id = o.question_id
      WHERE eq.exam_id = ? ORDER BY o.question_id, o.display_order`, [a.exam_id]);
  return {
    // deadline/serverNow let the UI draw a countdown; the server re-checks time on every save and submit.
    attempt: { attemptId: a.attempt_id, status: a.status, startedAt: a.started_at, deadline: a.deadline, serverNow: a.server_now },
    exam,
    questions: qs.map((q) => ({
      examQuestionId: q.exam_question_id, order: q.display_order, marks: q.marks, text: q.question_text, type: q.question_type,
      options: opts.filter((o) => o.question_id === q.question_id).map((o) => ({ optionId: o.option_id, text: o.option_text })),
      answer: { selectedOptionId: q.selected_option_id, text: q.answer_text, markedForReview: !!q.marked_for_review },
    })),
  };
}

export interface SaveInput { examQuestionId: number; selectedOptionId?: number | null; answerText?: string | null; markedForReview?: boolean }

/** Upsert one answer. Rejects if the attempt is not the caller's, not in progress, or past its deadline. */
export async function saveAnswer(studentId: number, attemptId: number, input: SaveInput) {
  const outcome = await tx(async (c) => {
    const a = await ownedAttempt(attemptId, studentId, c);
    if (a.status !== 'IN_PROGRESS') return { kind: 'closed' as const };
    if (a.expired) {                       // deadline passed: close the attempt (commit) instead of accepting the answer
      await finalizeLocked(attemptId, 'AUTO_SUBMITTED', c);
      return { kind: 'expired' as const };
    }
    // The question must be part of THIS attempt's exam (blocks invalid / foreign question ids).
    const q = await one(
      `SELECT eq.exam_question_id, q.question_id, q.question_type FROM examination_questions eq
         JOIN questions q ON q.question_id = eq.question_id WHERE eq.exam_question_id = ? AND eq.exam_id = ?`,
      [input.examQuestionId, a.exam_id], c);
    if (!q) throw badRequest('Question does not belong to this examination');

    let optionId: number | null = null, text: string | null = null;
    if (q.question_type === 'MCQ' || q.question_type === 'TRUE_FALSE') {
      if (input.answerText) throw badRequest('Objective questions take an option, not text');
      if (input.selectedOptionId != null) {
        const ok = await one('SELECT option_id FROM question_options WHERE option_id = ? AND question_id = ?', [input.selectedOptionId, q.question_id], c);
        if (!ok) throw badRequest('Option does not belong to this question');
        optionId = input.selectedOptionId;
      }
    } else {
      if (input.selectedOptionId != null) throw badRequest('Written questions take text, not an option');
      text = input.answerText ?? null;
      if (text !== null && text.length > 10000) throw badRequest('Answer is too long (max 10000 characters)');
    }
    // Composite PK (attempt_id, exam_question_id) => exactly one row per answer; upsert never duplicates.
    await exec(
      `INSERT INTO student_answers (attempt_id, exam_question_id, selected_option_id, answer_text, marked_for_review, saved_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE selected_option_id = VALUES(selected_option_id), answer_text = VALUES(answer_text),
                               marked_for_review = VALUES(marked_for_review), saved_at = VALUES(saved_at)`,
      [attemptId, input.examQuestionId, optionId, text, input.markedForReview ? 1 : 0], c);
    return { kind: 'saved' as const };
  });
  if (outcome.kind === 'closed') throw conflict('This attempt is already submitted');
  if (outcome.kind === 'expired') throw conflict('Time is up: your attempt was submitted automatically');
  return { saved: true };
}

/** Final submission. Idempotent: repeating it returns the same result and never re-grades or duplicates rows. */
export async function submitAttempt(studentId: number, attemptId: number) {
  return tx(async (c) => {
    const a = await ownedAttempt(attemptId, studentId, c);
    if (a.status !== 'IN_PROGRESS') return { alreadySubmitted: true, status: a.status as string };
    // Past the deadline the status is AUTO_SUBMITTED and submitted_at is capped at the deadline.
    const status = a.expired ? 'AUTO_SUBMITTED' : 'SUBMITTED';
    await finalizeLocked(attemptId, status, c);
    return { alreadySubmitted: false, status };
  });
}

/** Counts for the pre-submit confirmation dialog. */
export async function progress(studentId: number, attemptId: number) {
  const a = await ownedAttempt(attemptId, studentId);
  const r = await one(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(sa.selected_option_id IS NOT NULL OR (sa.answer_text IS NOT NULL AND TRIM(sa.answer_text) <> '')), 0) AS answered
       FROM examination_questions eq
       LEFT JOIN student_answers sa ON sa.exam_question_id = eq.exam_question_id AND sa.attempt_id = ?
      WHERE eq.exam_id = ?`, [attemptId, a.exam_id]);
  return { total: r!.total as number, answered: Number(r!.answered), unanswered: (r!.total as number) - Number(r!.answered) };
}
