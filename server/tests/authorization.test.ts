import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, asAdmin, asMeera, asRohan, asStudent, closeDb, reseed } from './helpers.js';

beforeAll(reseed);
afterAll(closeDb);

describe('role-based authorization (enforced on the backend)', () => {
  const adminOnly = ['/api/admin/students', '/api/admin/faculty'];
  const staffOnly = ['/api/questions', '/api/exams', '/api/analytics', '/api/dashboard/admin'];

  it('anonymous requests get 401 everywhere', async () => {
    for (const p of [...adminOnly, ...staffOnly, '/api/student/exams', '/api/results']) expect((await request(app).get(p)).status, p).toBe(401);
  });
  it('students get 403 on every admin/staff API', async () => {
    const s = await asStudent();
    for (const p of [...adminOnly, ...staffOnly]) expect((await s.get(p)).status, p).toBe(403);
  });
  it('faculty cannot use admin APIs; admin cannot use student APIs', async () => {
    const f = await asMeera(); const a = await asAdmin();
    for (const p of adminOnly) expect((await f.get(p)).status, p).toBe(403);
    expect((await a.get('/api/student/exams')).status).toBe(403);
    expect((await a.get('/api/results')).status).toBe(403);
  });
  it('faculty cannot publish or evaluate another faculty member\'s exam', async () => {
    const rohan = await asRohan();                       // exam 1 belongs to Meera
    expect((await rohan.post('/api/exams/1/publish-results')).status).toBe(403);
    expect((await rohan.put('/api/exams/evaluations').send({ attemptId: 1, examQuestionId: 8, marks: 1 })).status).toBe(403);
    expect((await rohan.get('/api/exams/1')).status).toBe(403);
  });
  it('admin may read an exam but not write to it', async () => {
    const a = await asAdmin();
    expect((await a.get('/api/exams/1')).status).toBe(200);
    expect((await a.post('/api/exams/1/cancel')).status).toBe(403);
  });
  it('a student cannot read staff views that expose correct answers', async () => {
    expect((await (await asStudent()).get('/api/questions/1')).status).toBe(403);
  });
});
