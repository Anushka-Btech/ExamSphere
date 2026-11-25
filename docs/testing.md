# Testing

## Honest status
| Area | Status |
|---|---|
| Database schema, seed, views, 26 SQL demos | **Executed** on Dolt (MySQL-compatible engine), outputs captured in [sql-demonstrations.md](sql-demonstrations.md). **Not run on MySQL 8.** |
| Server TypeScript code | Syntax-parsed only. **Never executed.** |
| Client React code | Syntax-parsed only. **Never built or opened in a browser.** |
| Vitest suite (45 tests) | **Written, not run** (npm packages could not be installed in the build sandbox). |

Nothing in this file should be read as "tests pass". Expect small first-run fixes after `npm install`.

## How to run (on your machine)
```bash
mysql -u root -p < database/01_schema.sql
mysql -u root -p < database/00_create_app_user.sql   # edit the password first
cd server && cp .env.example .env                    # fill DB_PASSWORD, SESSION_SECRET
npm install
npm run db:setup      # loads seed with real bcrypt hashes and views
npm run typecheck
npm test              # needs the seeded database; tests write rows, use a throwaway DB
```
SQL demos: `mysql -u root -p examsphere_db < sql/demos/01_*.sql` and so on, or `python3 sql/run_demos.py` (adapt the connection if not using Dolt).

## Test list (45)
**`constraints.test.ts` (9)** - database rules directly: unknown department rejected (FK); duplicate enrollment / email rejected (UNIQUE); passing marks above max and end before start rejected (CHECK); second correct option rejected; second attempt per exam rejected; duplicate answer per question rejected; a subject used by exams cannot be deleted (RESTRICT).

**`auth.test.ts` (7)** - login sets an HttpOnly cookie and returns the DB role; email accepted as well as username; wrong password and unknown user give the same message; validation runs before the DB; a client-supplied role is ignored; inactive accounts blocked; `/me` needs a session and logout invalidates it server-side.

**`authorization.test.ts` (6)** - anonymous 401; students 403 on staff/admin APIs; faculty cannot use admin APIs and admin cannot use student APIs; faculty cannot publish or evaluate another's exam; admin can read but not write exams; students cannot read views exposing correct answers.

**`api.test.ts` (23)** - overlaps auth/authorization above, plus: duplicate enrollment/email give 409; field validation; scheduling rejects end before start, non-positive duration, duration longer than window, passing > max, past start, marks not summing to max, cross-subject questions, unassigned subject; one end-to-end workflow (eligibility 403, draft not attemptable, start/resume, autosave, deadline, submit idempotency, objective grading, pending written answers block publish, evaluation, publish, correction, student sees only published results, correct answers hidden before publish); an expired attempt is auto-submitted and late answers refused.

Some assertions appear in both `auth`/`authorization` and `api` files; they are cheap and can be pruned.

## What has been verified by hand on Dolt
- All table, key, FK, CHECK and UNIQUE behaviours in the schema.
- Views, including `DENSE_RANK`, pending-evaluation handling and published-only subject summaries.
- The objective-grading `UPDATE` (correct MCQ = full marks, wrong = 0, blank written = 0, real written stays PENDING).
- The publish pre-flight queries and the 20+ analytical queries.
- `EXPLAIN FORMAT=TREE` plans before and after adding an index.

## Known gaps
- Behaviour that differs between Dolt and MySQL 8 (plan shapes, CHECK enforcement details, error codes such as `ER_CHECK_CONSTRAINT_VIOLATED`) is untested on MySQL.
- No browser or accessibility testing; no load test; the login rate limiter is in-memory and per process.
- No automated frontend tests.

## Manual checklist for the viva demo
1. Log in as each role (credentials in README).
2. As faculty: create a question, build an exam, schedule it.
3. As an eligible student: start, answer, refresh (resume), submit.
4. As faculty: evaluate the written answer, publish; try to publish twice.
5. As the student: see the result; as another student: try the first student's attempt URL (expect 404).
6. Run `sql-demonstrations.md` demos 23-24 on MySQL to show index use.
