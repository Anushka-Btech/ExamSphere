# ExamSphere: Online Examination & Result Management System

**Assess Smarter. Perform Better.**

An individual B.Tech CSE DBMS project: a web application whose behaviour is driven by a normalised MySQL schema, real SQL, and transactions.

> **Honest status.** The database layer (schema, seed data, views, 26 demo queries, ER diagram) was run and checked. The Express backend and React frontend were written to this specification but **could not be installed or run** in the environment they were written in (the npm registry was blocked there), so they have **never been executed**. Expect to fix small errors on first run. See [Verification status](#verification-status) for exactly what ran.

## Contents
1. [Problem statement and objectives](#problem-statement-and-objectives) · 2. [Features](#features) · 3. [Technology stack](#technology-stack) · 4. [Architecture](#architecture) · 5. [Database](#database) · 6. [Installation](#installation) · 7. [Demo credentials](#demo-credentials) · 8. [Demo script](#demo-script) · 9. [Testing](#testing) · 10. [Verification status](#verification-status) · 11. [Limitations](#limitations) · 12. [Future scope](#future-scope) · 13. [Documentation map](#documentation-map)

## Problem statement and objectives
Institutions run exams with spreadsheets and paper: question reuse is poor, marking is slow, results can leak or change silently, and nobody can prove who changed what. ExamSphere centralises the cycle. Full text: [docs/problem-statement.md](docs/problem-statement.md).

Objectives: (1) a normalised relational design with enforced integrity; (2) a complete workflow from question bank to published result; (3) server-side enforcement of timing, eligibility and visibility; (4) every statistic computed by SQL; (5) an audit trail for sensitive changes.

## Features
| Role | Capabilities |
|---|---|
| **Admin** | Dashboard (SQL-derived counts and charts), students and faculty (search, filter, pagination, add, edit, deactivate), subjects, faculty-subject assignment, read-only exam oversight, analytics |
| **Faculty** | Question bank (MCQ, true/false, short, descriptive; filters; preview; archive; CSV import), exam drafts, question assignment with per-exam marks, scheduling, cancellation, evaluation queue, result publication, audited corrections |
| **Student** | Eligible exams, timed attempt with autosave, navigator, mark for review, confirm-before-submit, published results with answer review and rank |

Rules enforced on the server: one attempt per student per exam; deadline = earlier of (start + duration) and window end; late answers rejected and the attempt auto-submitted; objective answers graded inside the submit transaction; a result with unmarked written answers is never final; results are invisible until published; published marks change only through a correction that needs a reason.

## Technology stack
React 18, Vite, TypeScript, Tailwind CSS, Framer Motion, Recharts, Lucide icons · Node.js, Express, Zod · MySQL 8.0.16+ (InnoDB), `mysql2` with parameterised queries · `bcrypt`, server-side sessions · Vitest + Supertest.

## Architecture
Browser (React) → `/api` (Vite dev proxy) → Express (session check, role check, Zod validation, business rules) → MySQL. Details and a request walk-through: [docs/system-architecture.md](docs/system-architecture.md).

## Database
15 tables, 24 foreign keys, 5 views. Diagram: [docs/er-diagram.md](docs/er-diagram.md) (also `er-diagram.png` / `.svg`). Design decisions and cardinalities: [docs/database-design.md](docs/database-design.md). Normalisation (1NF/2NF/3NF, with the dependencies listed per table): [docs/normalization.md](docs/normalization.md). 26 SQL demonstrations with captured output: [docs/sql-demonstrations.md](docs/sql-demonstrations.md).

## Installation
Requirements: **Node.js 20+**, **MySQL 8.0.16 or newer** (earlier versions parse but ignore CHECK constraints).

```bash
# 1. MySQL: create the least-privilege application user (once, as an admin)
#    edit CHANGE_ME in the file first
mysql -u root -p < database/00_create_app_user.sql

# 2. Backend
cd server
cp .env.example .env          # fill in DB_PASSWORD, DB_ADMIN_PASSWORD (placeholders only in the example)
npm install
npm run db:setup              # drops + recreates examsphere_db, loads schema, seed data (bcrypt-hashed), views
npm run dev                   # API on http://localhost:4000

# 3. Frontend (second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173  (proxies /api to port 4000)
```

**Reset the demo data** at any time with `npm run db:setup` (it recreates the database; the app user keeps its grants).
**Regenerate seed SQL** (only if you edit the generator): `python3 database/tools/gen_seed.py`. It is deterministic: no random data at page load.
Secrets: only `server/.env` holds credentials, it is not committed, and nothing secret reaches the browser.

## Demo credentials
These are fictional accounts created by the seed. The seed script hashes the passwords with bcrypt (cost 10, per-hash salt) from the `DEMO_*_PASSWORD` values in `.env`; no plaintext password or hash is stored in the repository.

| Role | Username (or email) | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Faculty (DBMS, DSA subjects) | `meera.iyer` / `rohan.verma` | `Faculty@123` |
| Faculty (OS, Networks) | `kavita.rao` | `Faculty@123` |
| Student, CSE sem 3 (eligible for exams 1-3) | `aarav.sharma`, `diya.patel`, `kabir.singh`, `ishita.gupta`, `rahul.nair`, `sneha.reddy`, `vihaan.mehta`, `ananya.joshi`, `arjun.kapoor` | `Student@123` |
| Student, IT sem 3 (not eligible for CSE exams) | `meera.pillai`, `yash.agarwal`, `tara.bose` | `Student@123` |

Emails are `<username>@examsphere.edu` for staff and `<username>@student.examsphere.edu` for students. Change these passwords for anything beyond a demo.

### What the seed contains
| Exam | Subject | Owner | State | Shows |
|---|---|---|---|---|
| 1 DBMS Mid-Term | CS301 | meera.iyer | Completed, **published**, one correction | Published results, ranking with ties, correction history |
| 2 DSA Unit Test 1 | CS302 | rohan.verma | Completed, **written answers pending** | Evaluation queue; publish is refused until it is empty |
| 3 Operating Systems Quiz | CS303 | kavita.rao | Scheduled (2026-11-05) | Upcoming exam |
| 4 DBMS Practice Test | CS301 | meera.iyer | Draft, 5 of 9 questions | Marks not yet balanced, so scheduling is refused |

## Demo script
1. Sign in as `meera.iyer`: dashboard → Evaluation (nothing for exam 1) → Examinations → exam 1 → view results, publication history.
2. Sign in as `rohan.verma`: Evaluation → mark a few answers → try **Publish results** on exam 2 while answers are still pending (refused with a count).
3. As `meera.iyer`: create an exam on DBMS with a start time about 5 minutes ahead (start must be in the future), assign questions so the marks equal the maximum, **Schedule**.
4. As `aarav.sharma`: when the window opens, **Start exam**, answer, refresh the page (answers return), **Submit** (see the answered/unanswered counts).
5. As `aarav.sharma`: Results shows nothing for the new exam until it is published.
6. As admin: Dashboard, Students (try a duplicate enrollment number `EN2024001`: rejected), Subjects (try deleting CS301: refused, archive instead).
7. Open [docs/sql-demonstrations.md](docs/sql-demonstrations.md) for the SQL walk-through.

## Testing
`cd server && npm test` runs 45 tests (9 constraint tests plus auth, authorization and API suites) against the seeded database (run `npm run db:setup` first; the suite adds a few rows, so re-run `db:setup` to reset). Coverage and how to read it: [docs/testing.md](docs/testing.md).

## Verification status
| Item | Status |
|---|---|
| `01_schema.sql`, `02_seed.sql`, `03_views.sql` load without error | **Ran** (on Dolt, a MySQL-compatible engine; not on MySQL 8) |
| Constraint rejections (FK, unique, CHECK, restricted delete, duplicate attempt/answer) | **Ran** (Dolt) |
| 26 SQL demonstrations with output | **Ran** (Dolt; output in `docs/sql-demonstrations.md`) |
| Grading UPDATE and publish pre-flight query | **Ran** (Dolt) |
| ER diagram matches schema (24 FKs / 15 tables) and renders | **Checked** |
| Express backend, React frontend, vitest suite | **Written, never executed.** Only syntax-parsed. |
| `seed.js` (bcrypt hashing) | **Written, never executed** (syntax-checked only) |
| Run on real MySQL 8 | **Not done**: please run the schema and demos on MySQL 8 before your viva |

## Limitations
- Single attempt per student per exam (a unique key); no retake workflow.
- Exam state moves LIVE/COMPLETED from the clock when the API is called and on a 30-second timer; there is no separate job scheduler.
- Written answers are marked by hand; there is no plagiarism or auto-marking of text.
- No email notification, no password reset, no 2FA.
- Cross-row rules (marks total, one correct option, subject match) are enforced in transactions, not by triggers.
- CSRF protection relies on SameSite=Lax cookies plus a JSON-only body rule; the in-memory login limiter resets on restart and is per process.
- Times are stored in UTC and shown in the viewer's local time zone.

## Future scope
Question randomisation and per-student option shuffling; multiple attempts with a policy table; proctoring signals; rubric-based marking; import/export of results (CSV, PDF); notifications; read replicas for analytics.

## Documentation map
[problem-statement](docs/problem-statement.md) · [requirements](docs/requirements.md) · [system-architecture](docs/system-architecture.md) · [database-design](docs/database-design.md) · [normalization](docs/normalization.md) · [er-diagram](docs/er-diagram.md) · [data-dictionary](docs/data-dictionary.md) · [sql-demonstrations](docs/sql-demonstrations.md) · [api-documentation](docs/api-documentation.md) · [testing](docs/testing.md) · [viva-questions](docs/viva-questions.md)
