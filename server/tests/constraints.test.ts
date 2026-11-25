import { afterAll, describe, expect, it } from 'vitest';
import { exec, pool, query } from './helpers.js';

// Each statement must be rejected by MySQL itself, regardless of what the API does.
const rejects = async (sql: string, params: unknown[] = []) => {
  let code = '';
  try { await exec(sql, params); } catch (e) { code = (e as { code: string }).code; }
  return code;
};
afterAll(() => pool.end());

describe('database constraints', () => {
  it('foreign key rejects an unknown department', async () => {
    expect(await rejects("INSERT INTO subjects (code, name, credits, semester, department_id) VALUES ('T1','T',3,3,9999)")).toBe('ER_NO_REFERENCED_ROW_2');
  });
  it('unique constraint rejects a duplicate enrollment number', async () => {
    const u = await exec("INSERT INTO users (email, username, password_hash, full_name, role) VALUES ('c1@t.edu','c1','x','C One','STUDENT')");
    try {
      expect(await rejects('INSERT INTO student_profiles (user_id, enrollment_no, department_id, semester, enrollment_date) VALUES (?,?,?,?,?)',
        [u.insertId, 'EN2024001', 1, 3, '2024-08-01'])).toBe('ER_DUP_ENTRY');
    } finally { await exec('DELETE FROM users WHERE user_id = ?', [u.insertId]); }
  });
  it('unique constraint rejects a duplicate user email', async () => {
    expect(await rejects("INSERT INTO users (email, username, password_hash, full_name, role) VALUES ('admin@examsphere.edu','other','x','X','ADMIN')")).toBe('ER_DUP_ENTRY');
  });
  it('CHECK rejects passing marks above max marks', async () => {
    expect(await rejects(`INSERT INTO examinations (subject_id, created_by, title, scheduled_start, scheduled_end, duration_minutes, max_marks, passing_marks)
      VALUES (1,2,'bad','2030-01-01 10:00:00','2030-01-01 11:00:00',30,10,20)`)).toBe('ER_CHECK_CONSTRAINT_VIOLATED');
  });
  it('CHECK rejects an end time before the start time', async () => {
    expect(await rejects(`INSERT INTO examinations (subject_id, created_by, title, scheduled_start, scheduled_end, duration_minutes, max_marks, passing_marks)
      VALUES (1,2,'bad','2030-01-01 11:00:00','2030-01-01 10:00:00',30,10,5)`)).toBe('ER_CHECK_CONSTRAINT_VIOLATED');
  });
  it('a second correct option for the same question is rejected', async () => {
    expect(await rejects('INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES (1,\'dup\',1,9)')).toBe('ER_DUP_ENTRY');
  });
  it('a student cannot have two attempts at one exam', async () => {
    expect(await rejects('INSERT INTO exam_attempts (exam_id, student_id) VALUES (1, 5)')).toBe('ER_DUP_ENTRY');
  });
  it('the same attempt cannot hold two answers for one exam question', async () => {
    const row = (await query('SELECT attempt_id, exam_question_id FROM student_answers LIMIT 1'))[0];
    expect(await rejects("INSERT INTO student_answers (attempt_id, exam_question_id, answer_text) VALUES (?, ?, 'again')",
      [row.attempt_id, row.exam_question_id])).toBe('ER_DUP_ENTRY');
  });
  it('a subject referenced by exams cannot be deleted (ON DELETE RESTRICT)', async () => {
    expect(await rejects('DELETE FROM subjects WHERE subject_id = 1')).toBe('ER_ROW_IS_REFERENCED_2');
  });
});
