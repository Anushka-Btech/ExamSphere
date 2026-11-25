import request from 'supertest';
import { createApp } from '../src/app.js';
import { exec, one, pool, query } from '../src/db.js';

export const app = createApp();
export { exec, one, pool, query };

export const PASSWORDS = { admin: 'Admin@123', faculty: 'Faculty@123', student: 'Student@123' };

/** A logged-in supertest agent (keeps the session cookie). */
export async function login(identifier: string, password: string) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').send({ identifier, password });
  if (r.status !== 200) throw new Error(`login failed for ${identifier}: ${r.status}`);
  return agent;
}
export const asAdmin = () => login('admin', PASSWORDS.admin);
export const asFaculty = (u = 'meera.iyer') => login(u, PASSWORDS.faculty);        // DBMS owner (user 2)
export const asStudent = (u = 'aarav.sharma') => login(u, PASSWORDS.student);      // CSE sem 3

export const iso = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString();

/**
 * Builds a SCHEDULED exam owned by meera.iyer on subject 1 (DBMS) with questions 1 (MCQ, 2m), 6 (TRUE_FALSE, 1m) and
 * 8 (SHORT, 3m) = 6 marks, then moves its window so it is open now. Returns its id.
 */
export async function createOpenExam(title: string, opts: { withShort?: boolean } = {}) {
  const f = await asFaculty();
  const withShort = opts.withShort ?? true;
  const qs = withShort ? [{ questionId: 1, marks: 2 }, { questionId: 6, marks: 1 }, { questionId: 8, marks: 3 }]
                       : [{ questionId: 1, marks: 2 }, { questionId: 6, marks: 1 }];
  const max = qs.reduce((t, q) => t + q.marks, 0);
  const created = await f.post('/api/exams').send({ subjectId: 1, title, scheduledStart: iso(60), scheduledEnd: iso(120),
    durationMinutes: 30, maxMarks: max, passingMarks: 2 });
  if (created.status !== 201) throw new Error('exam create failed: ' + JSON.stringify(created.body));
  const examId = created.body.examId as number;
  await f.put(`/api/exams/${examId}/questions`).send({ questions: qs }).expect(200);
  await f.post(`/api/exams/${examId}/schedule`).expect(200);
  // Open the window now (direct SQL stands in for "time passing").
  await exec(`UPDATE examinations SET scheduled_start = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE),
                                      scheduled_end   = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 50 MINUTE) WHERE exam_id = ?`, [examId]);
  return { examId, f };
}

export const correctOption = async (questionId: number) =>
  (await one('SELECT option_id FROM question_options WHERE question_id = ? AND is_correct = 1', [questionId]))!.option_id as number;
export const wrongOption = async (questionId: number) =>
  (await one('SELECT option_id FROM question_options WHERE question_id = ? AND is_correct = 0 LIMIT 1', [questionId]))!.option_id as number;
export const eqId = async (examId: number, questionId: number) =>
  (await one('SELECT exam_question_id FROM examination_questions WHERE exam_id = ? AND question_id = ?', [examId, questionId]))!.exam_question_id as number;

/** Test setup: verify the existing demo seed without dropping or recreating the database. */
export async function reseed() {
  const requiredUsers = await query(
    "SELECT username FROM users WHERE username IN ('admin', 'meera.iyer', 'rohan.verma', 'aarav.sharma')"
  );
  const names = new Set(requiredUsers.map((u) => String(u.username)));
  for (const name of ['admin', 'meera.iyer', 'rohan.verma', 'aarav.sharma']) {
    if (!names.has(name)) throw new Error(`Required demo user missing: ${name}. Check the existing database seed.`);
  }

  // Restore the account deactivated by the authentication test.
  await exec("UPDATE users SET status = 'ACTIVE' WHERE username = 'diya.patel'");
  // Remove any leftover temporary account from an interrupted test.
  await exec("DELETE FROM users WHERE username = 'tmpuser'");
}

export const asMeera = () => asFaculty('meera.iyer');
export const asRohan = () => asFaculty('rohan.verma');

/** Pool shutdown is handled once after the complete Vitest run. */
export async function closeDb() {
  // Intentionally do not close the shared pool between test files.
}
