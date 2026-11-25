import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app, asAdmin, asFaculty, asStudent, correctOption, createOpenExam, eqId, exec, iso, login, one, pool, query, wrongOption } from './helpers.js';

afterAll(() => pool.end());

describe('authentication', () => {
  it('rejects a wrong password with a generic message', async () => {
    const r = await request(app).post('/api/auth/login').send({ identifier: 'admin', password: 'nope' });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe('Invalid credentials');
  });
  it('rejects an unknown user with the same message (no account enumeration)', async () => {
    const r = await request(app).post('/api/auth/login').send({ identifier: 'ghost', password: 'nope' });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe('Invalid credentials');
  });
  it('validates input on the server', async () => {
    expect((await request(app).post('/api/auth/login').send({ identifier: '', password: '' })).status).toBe(400);
  });
  it('logs in, serves /me, and logout invalidates the session server-side', async () => {
    const login = await request(app).post('/api/auth/login').send({ identifier: 'admin', password: 'Admin@123' }).expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    expect(login.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).body.user.role).toBe('ADMIN');
    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    // replaying the OLD cookie must fail: the session row is deleted, not merely the browser cookie
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
  it('stores only a hash of the session token', async () => {
    const r = await one('SELECT COUNT(*) AS n FROM sessions WHERE CHAR_LENGTH(token_hash) <> 64');
    expect(r!.n).toBe(0);
  });
});

describe('role-based authorization (server side)', () => {
  it('anonymous users get 401', async () => {
    expect((await request(app).get('/api/exams')).status).toBe(401);
  });
  it('a student cannot reach admin or faculty APIs', async () => {
    const s = await asStudent();
    expect((await s.get('/api/admin/students')).status).toBe(403);
    expect((await s.get('/api/exams')).status).toBe(403);
    expect((await s.get('/api/questions')).status).toBe(403);
    expect((await s.get('/api/dashboard/admin')).status).toBe(403);
  });
  it('faculty cannot manage users', async () => {
    const f = await asFaculty();
    expect((await f.post('/api/admin/students').send({})).status).toBe(403);
  });
  it('faculty cannot read or modify another faculty member\'s exam', async () => {
    const other = await asFaculty('rohan.verma');              // owns exam 2; exam 1 belongs to meera.iyer
    expect((await other.get('/api/exams/1')).status).toBe(403);
    expect((await other.post('/api/exams/1/publish-results')).status).toBe(403);
  });
  it('a deactivated user cannot use an existing session', async () => {
    const hash = (await one('SELECT password_hash FROM users WHERE user_id = 5'))!.password_hash;
    const u = await exec("INSERT INTO users (email, username, password_hash, full_name, role) VALUES ('tmp@t.edu','tmpuser',?,'Tmp','ADMIN')", [hash]);
    try {
      const a = await login('tmpuser', 'Student@123');
      expect((await a.get('/api/auth/me')).status).toBe(200);
      await exec("UPDATE users SET status = 'INACTIVE' WHERE user_id = ?", [u.insertId]);
      expect((await a.get('/api/auth/me')).status).toBe(401);
    } finally { await exec('DELETE FROM users WHERE user_id = ?', [u.insertId]); }
  });
});

describe('student management', () => {
  it('rejects a duplicate enrollment number with 409', async () => {
    const a = await asAdmin();
    const r = await a.post('/api/admin/students').send({ fullName: 'Dup Student', email: 'dup.student@t.edu', username: 'dup.student', password: 'Passw0rd!',
      departmentId: 1, enrollmentNo: 'EN2024001', semester: 3, enrollmentDate: '2024-08-01' });
    expect(r.status).toBe(409);
    expect(await one("SELECT user_id FROM users WHERE username = 'dup.student'")).toBeUndefined();   // transaction rolled back the user row
  });
  it('rejects a duplicate email with 409', async () => {
    const a = await asAdmin();
    const r = await a.post('/api/admin/students').send({ fullName: 'Dup Email', email: 'aarav.sharma@student.examsphere.edu', username: 'dup.email', password: 'Passw0rd!',
      departmentId: 1, enrollmentNo: 'EN9999001', semester: 3, enrollmentDate: '2024-08-01' });
    expect(r.status).toBe(409);
  });
  it('validates fields (bad email, short password)', async () => {
    const a = await asAdmin();
    const r = await a.post('/api/admin/students').send({ fullName: 'X', email: 'nope', username: 'x', password: '123', departmentId: 1, enrollmentNo: 'E', semester: 3, enrollmentDate: '2024-08-01' });
    expect(r.status).toBe(400);
  });
});

describe('examination scheduling validation', () => {
  const ok = { subjectId: 1, title: 'Validation exam', scheduledStart: iso(60), scheduledEnd: iso(120), durationMinutes: 30, maxMarks: 10, passingMarks: 4 };
  it('rejects end before start', async () => {
    expect((await (await asFaculty()).post('/api/exams').send({ ...ok, scheduledEnd: iso(30) })).status).toBe(400);
  });
  it('rejects non-positive duration', async () => {
    expect((await (await asFaculty()).post('/api/exams').send({ ...ok, durationMinutes: 0 })).status).toBe(400);
  });
  it('rejects a duration longer than the window', async () => {
    expect((await (await asFaculty()).post('/api/exams').send({ ...ok, durationMinutes: 90 })).status).toBe(400);
  });
  it('rejects passing marks above maximum marks', async () => {
    expect((await (await asFaculty()).post('/api/exams').send({ ...ok, passingMarks: 11 })).status).toBe(400);
  });
  it('rejects a start time in the past', async () => {
    expect((await (await asFaculty()).post('/api/exams').send({ ...ok, scheduledStart: iso(-30), scheduledEnd: iso(30) })).status).toBe(400);
  });
  it('refuses to schedule when question marks do not add up to the maximum', async () => {
    const f = await asFaculty();
    const { body } = await f.post('/api/exams').send(ok).expect(201);
    await f.put(`/api/exams/${body.examId}/questions`).send({ questions: [{ questionId: 1, marks: 2 }] }).expect(200);
    const r = await f.post(`/api/exams/${body.examId}/schedule`);
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/add up to 2/);
  });
  it('refuses questions from another subject', async () => {
    const f = await asFaculty();
    const { body } = await f.post('/api/exams').send(ok).expect(201);
    const r = await f.put(`/api/exams/${body.examId}/questions`).send({ questions: [{ questionId: 10, marks: 2 }] });  // question 10 = DSA
    expect(r.status).toBe(400);
  });
  it('a faculty member cannot create an exam for a subject they are not assigned to', async () => {
    expect((await (await asFaculty()).post('/api/exams').send({ ...ok, subjectId: 3 })).status).toBe(403);
  });
});

describe('attempt lifecycle, grading and result publication', () => {
  it('runs the full workflow with the expected rules at every step', async () => {
    const { examId, f } = await createOpenExam('Workflow exam');
    const aarav = await asStudent('aarav.sharma');
    const diya = await asStudent('diya.patel');
    const tara = await asStudent('tara.bose');                      // IT department: not eligible for a CSE subject

    // eligibility
    expect((await tara.post(`/api/student/exams/${examId}/start`)).status).toBe(403);

    // a DRAFT exam cannot be attempted
    const draft = await f.post('/api/exams').send({ subjectId: 1, title: 'draft only', scheduledStart: iso(60), scheduledEnd: iso(120), durationMinutes: 30, maxMarks: 5, passingMarks: 2 });
    expect((await aarav.post(`/api/student/exams/${draft.body.examId}/start`)).status).toBe(409);

    // start, then resume (no duplicate active attempt)
    const s1 = await aarav.post(`/api/student/exams/${examId}/start`);
    expect(s1.status).toBe(201);
    const attemptId = s1.body.attemptId as number;
    const s2 = await aarav.post(`/api/student/exams/${examId}/start`);
    expect(s2.status).toBe(200);
    expect(s2.body.attemptId).toBe(attemptId);
    expect((await query('SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = 5', [examId])).length).toBe(1);

    // the paper never leaks correct answers or model answers
    const paper = await aarav.get(`/api/student/attempts/${attemptId}`).expect(200);
    const text = JSON.stringify(paper.body);
    expect(text).not.toMatch(/is_correct|isCorrect|model_answer|correct_flag/);
    expect(paper.body.questions).toHaveLength(3);

    // another student cannot read or write this attempt (404, indistinguishable from "missing")
    expect((await diya.get(`/api/student/attempts/${attemptId}`)).status).toBe(404);
    const eq1 = await eqId(examId, 1), eq6 = await eqId(examId, 6), eq8 = await eqId(examId, 8);
    expect((await diya.put(`/api/student/attempts/${attemptId}/answers`).send({ examQuestionId: eq1, selectedOptionId: await correctOption(1) })).status).toBe(404);

    // save answers; saving twice must overwrite, not duplicate
    const right = await correctOption(1), wrong = await wrongOption(1);
    await aarav.put(`/api/student/attempts/${attemptId}/answers`).send({ examQuestionId: eq1, selectedOptionId: wrong }).expect(200);
    await aarav.put(`/api/student/attempts/${attemptId}/answers`).send({ examQuestionId: eq1, selectedOptionId: right }).expect(200);
    await aarav.put(`/api/student/attempts/${attemptId}/answers`).send({ examQuestionId: eq6, selectedOptionId: await wrongOption(6) }).expect(200);
    await aarav.put(`/api/student/attempts/${attemptId}/answers`).send({ examQuestionId: eq8, answerText: 'A minimal set of attributes that identifies a row.' }).expect(200);
    expect((await query('SELECT * FROM student_answers WHERE attempt_id = ?', [attemptId])).length).toBe(3);

    // invalid inputs
    expect((await aarav.put(`/api/student/attempts/${attemptId}/answers`).send({ examQuestionId: 999999, selectedOptionId: right })).status).toBe(400);   // unknown exam question
    expect((await aarav.put(`/api/student/attempts/${attemptId}/answers`).send({ examQuestionId: eq1, selectedOptionId: await correctOption(2) })).status).toBe(400); // option of another question
    expect((await aarav.put(`/api/student/attempts/${attemptId}/answers`).send({ examQuestionId: eq1, selectedOptionId: right, awardedMarks: 100 })).status).toBe(400); // client-supplied marks

    // progress for the confirm dialog
    expect((await aarav.get(`/api/student/attempts/${attemptId}/progress`)).body).toEqual({ total: 3, answered: 3, unanswered: 0 });

    // submit: objective graded now (MCQ right = 2, TF wrong = 0), written answer stays pending
    expect((await aarav.post(`/api/student/attempts/${attemptId}/submit`)).body).toMatchObject({ alreadySubmitted: false, status: 'SUBMITTED' });
    const marks = async () => (await query('SELECT exam_question_id, awarded_marks, evaluation_status FROM student_answers WHERE attempt_id = ? ORDER BY exam_question_id', [attemptId]));
    const after1 = await marks();
    expect(after1.find((r) => r.exam_question_id === eq1)!.awarded_marks).toBe(2);
    expect(after1.find((r) => r.exam_question_id === eq6)!.awarded_marks).toBe(0);
    expect(after1.find((r) => r.exam_question_id === eq8)!.evaluation_status).toBe('PENDING');

    // idempotent submit; no change after submission
    expect((await aarav.post(`/api/student/attempts/${attemptId}/submit`)).body).toMatchObject({ alreadySubmitted: true });
    expect(await marks()).toEqual(after1);
    expect((await aarav.put(`/api/student/attempts/${attemptId}/answers`).send({ examQuestionId: eq1, selectedOptionId: wrong })).status).toBe(409);
    expect((await aarav.post(`/api/student/exams/${examId}/start`)).status).toBe(409);        // no second attempt

    // incomplete subjective evaluation is never a final score
    const sum = await one('SELECT total_marks, result, result_state FROM student_result_summary WHERE exam_id = ? AND student_id = 5', [examId]);
    expect(sum).toMatchObject({ result: null, result_state: 'PENDING_EVALUATION' });

    // results unpublished: invisible to the student
    expect((await aarav.get(`/api/results/${examId}`)).status).toBe(404);
    expect((await aarav.get('/api/results')).body.items.find((r: { exam_id: number }) => r.exam_id === examId)).toBeUndefined();

    // the exam has not completed yet, so publishing is refused; then close it
    expect((await f.post(`/api/exams/${examId}/publish-results`)).status).toBe(409);
    await exec('UPDATE examinations SET scheduled_start = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 MINUTE), scheduled_end = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE exam_id = ?', [examId]);
    // pending evaluation blocks publication
    const blocked = await f.post(`/api/exams/${examId}/publish-results`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/need evaluation/);

    // evaluation: only the owner, only within the question's marks
    const rohan = await asFaculty('rohan.verma');
    expect((await rohan.put('/api/exams/evaluations').send({ attemptId, examQuestionId: eq8, marks: 2 })).status).toBe(403);
    expect((await f.put('/api/exams/evaluations').send({ attemptId, examQuestionId: eq8, marks: 99 })).status).toBe(400);
    expect((await f.put('/api/exams/evaluations').send({ attemptId, examQuestionId: eq1, marks: 1 })).status).toBe(400);         // objective: auto-graded only
    await f.put('/api/exams/evaluations').send({ attemptId, examQuestionId: eq8, marks: 2.5 }).expect(200);

    // publish: 2 + 0 + 2.5 = 4.5 of 6, passing 2 -> PASS
    expect((await f.post(`/api/exams/${examId}/publish-results`)).body).toMatchObject({ published: true, attempts: 1 });
    expect((await f.post(`/api/exams/${examId}/publish-results`)).status).toBe(409);       // not twice
    expect((await query("SELECT * FROM result_publications WHERE exam_id = ? AND action = 'PUBLISH'", [examId])).length).toBe(1);
    expect((await query("SELECT * FROM audit_logs WHERE action = 'RESULTS_PUBLISHED' AND entity_id = ?", [examId])).length).toBe(1);

    // visibility after publication: owner student sees marks and correct answers; others do not
    const mine = await aarav.get(`/api/results/${examId}`).expect(200);
    expect(mine.body.summary).toMatchObject({ total_marks: 4.5, result: 'PASS', result_state: 'PUBLISHED' });
    expect(mine.body.answers.find((a: { question_type: string }) => a.question_type === 'MCQ').correct_option).toBeTruthy();
    expect((await diya.get(`/api/results/${examId}`)).status).toBe(404);                     // diya never attempted it

    // after publication, evaluation is locked; changes need the correction workflow with a reason
    expect((await f.put('/api/exams/evaluations').send({ attemptId, examQuestionId: eq8, marks: 3 })).status).toBe(409);
    expect((await f.post(`/api/exams/${examId}/corrections`).send({ attemptId, examQuestionId: eq8, marks: 3, note: 'no' })).status).toBe(400);
    expect((await rohan.post(`/api/exams/${examId}/corrections`).send({ attemptId, examQuestionId: eq8, marks: 3, note: 'Re-evaluated on request' })).status).toBe(403);
    const fix = await f.post(`/api/exams/${examId}/corrections`).send({ attemptId, examQuestionId: eq8, marks: 3, note: 'Re-evaluated on request' });
    expect(fix.body).toMatchObject({ corrected: true, from: 2.5, to: 3 });
    expect((await query("SELECT * FROM result_publications WHERE exam_id = ? AND action = 'CORRECTION'", [examId])).length).toBe(1);
    expect((await aarav.get(`/api/results/${examId}`)).body.summary.total_marks).toBe(5);
  });

  it('auto-submits an attempt whose deadline has passed and refuses late answers', async () => {
    const { examId } = await createOpenExam('Deadline exam', { withShort: false });
    const kabir = await asStudent('kabir.singh');
    const { body } = await kabir.post(`/api/student/exams/${examId}/start`).expect(201);
    // pretend the student started 2 hours ago (beyond duration and window)
    await exec('UPDATE exam_attempts SET started_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR) WHERE attempt_id = ?', [body.attemptId]);
    await exec('UPDATE examinations SET scheduled_start = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR), scheduled_end = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE exam_id = ?', [examId]);
    const late = await kabir.put(`/api/student/attempts/${body.attemptId}/answers`).send({ examQuestionId: await eqId(examId, 1), selectedOptionId: await correctOption(1) });
    expect(late.status).toBe(409);
    const a = await one('SELECT status, submitted_at FROM exam_attempts WHERE attempt_id = ?', [body.attemptId]);
    expect(a!.status).toBe('AUTO_SUBMITTED');
    expect(await query('SELECT * FROM student_answers WHERE attempt_id = ?', [body.attemptId])).toHaveLength(0);   // the late answer was NOT stored
  });
});
