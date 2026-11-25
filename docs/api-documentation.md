# API documentation

Base URL `http://localhost:4000/api` (dev: the Vite server proxies `/api`). JSON in, JSON out. **Status: written, not executed** (see [testing.md](testing.md)). Exact request fields are defined by the Zod schemas at the top of each file in `server/src/routes/`; they are `.strict()`, so unknown fields (for example client-supplied `marks`, `role` or `score`) are rejected with 400.

## Conventions
- **Auth:** HttpOnly session cookie set by `POST /auth/login`. Every route except `/auth/login`, `/auth/logout`, `/health` requires it (401 otherwise). Roles are read from the database on each request, never from the client.
- **CSRF mitigation:** `SameSite=Lax` cookie plus a middleware that requires `Content-Type: application/json` on writes.
- **Errors:** `{ "error": { "code": "...", "message": "...", "details": ... } }`. Codes: `VALIDATION`/`BAD_REQUEST` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT`/`DUPLICATE`/`IN_USE` 409, `BAD_REFERENCE`/`CONSTRAINT` 400, `INTERNAL` 500 (never contains SQL or stack traces).
- **Times:** ISO-8601 UTC strings.
- **Lists:** filter by query string; paginated lists return rows plus a total (see each route).

## Auth - `/api/auth`
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/login` | public | Username or email plus password. Same generic error for unknown user and wrong password. Rate-limited in memory (per process). Sets cookie. |
| POST | `/logout` | any | Deletes the server-side session row |
| GET | `/me` | any | Current user (id, name, role) |
| GET | `/health` (at `/api/health`) | public | Liveness |

## People - `/api/admin` (ADMIN)
| Method | Path | Purpose |
|---|---|---|
| GET | `/students`, `/students/:id` | List with search/department/semester/status filters; detail |
| POST | `/students` | Create user + student profile in one transaction; 409 on duplicate email/username/enrollment |
| PATCH | `/students/:id` | Edit, activate/deactivate |
| GET | `/faculty`, `/faculty/:id` | List; detail with assigned subjects |
| POST | `/faculty` | Create user + faculty profile |
| PATCH | `/faculty/:id` | Edit, activate/deactivate |
| PUT / DELETE | `/faculty/:id/subjects/:subjectId` | Assign / remove a subject (composite-key table) |

## Subjects - `/api/subjects`
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/departments` | ADMIN, FACULTY | Department list |
| GET | `/`, `/:id` | ADMIN, FACULTY | List, detail |
| POST, PUT | `/`, `/:id` | ADMIN | Create, update |
| DELETE | `/:id` | ADMIN | 409 `IN_USE` if questions or exams reference it |

## Question bank - `/api/questions` (ADMIN read; FACULTY read/write)
| Method | Path | Purpose |
|---|---|---|
| GET | `/`, `/:id` | Filter by subject, type, difficulty, status, text search. Faculty see questions for subjects they teach. |
| POST | `/` | Create (faculty must be assigned to the subject). MCQ needs 2-6 distinct options with exactly one correct; TRUE_FALSE has exactly two; SHORT/DESCRIPTIVE have none |
| POST | `/import` | Bulk create from a JSON array, all-or-nothing |
| PUT | `/:id` | Edit; author only; 409 if the question is already in a non-draft exam (archive and recreate instead) |
| POST | `/:id/archive` | Soft-remove (kept for history) |

## Examinations - `/api/exams` (ADMIN read-only; FACULTY owner writes)
| Method | Path | Purpose |
|---|---|---|
| GET | `/pending-evaluations` | Written answers awaiting marks, for the caller's exams |
| PUT | `/evaluations` | Award marks to answers (0 ≤ marks ≤ question marks); not after publication |
| GET | `/` , `/:id` | List with status filter; detail with questions |
| POST | `/` | Create a DRAFT; faculty must teach the subject |
| PUT | `/:id` | Edit a DRAFT |
| PUT | `/:id/questions` | Replace the question set with per-exam marks (DRAFT only; same-subject questions only) |
| POST | `/:id/schedule` | DRAFT → SCHEDULED after validation under a row lock: start in the future, at least one question, marks sum = max marks, every MCQ/true-false question has exactly one correct option (duration-fits-window is checked when the draft is saved) |
| POST | `/:id/unschedule` | Back to DRAFT if no attempts exist |
| POST | `/:id/cancel` | Cancel a draft, scheduled, or live exam with no attempts; completed exams keep their records |
| GET | `/:id/results` | Per-student results incl. `attempt_id`, `result_state`, rank |
| GET | `/:id/attempts/:attemptId` | Full attempt review for marking |
| POST | `/:id/publish-results` | Publish; 409 listing blockers (running attempts, pending answers, not completed, already published) |
| POST | `/:id/corrections` | Correct one answer's marks after publication with a required reason; writes a `CORRECTION` row and an audit entry |
| GET | `/:id/publications` | Publication/correction history |

## Student - `/api/student` (STUDENT)
| Method | Path | Purpose |
|---|---|---|
| GET | `/exams` | Exams for the student's department and semester with attempt state |
| POST | `/exams/:examId/start` | 201 new attempt, 200 resume. 403 not eligible; 409 not open/already submitted. Returns questions **without** correct flags and the server deadline |
| GET | `/attempts/:attemptId` | Resume data (own attempts only; others are 404) |
| PUT | `/attempts/:attemptId/answers` | Autosave one or more answers. 409 and auto-submit if the server deadline (plus 5 s grace) has passed |
| GET | `/attempts/:attemptId/progress` | Answered / total |
| POST | `/attempts/:attemptId/submit` | Final submit; idempotent; grades objective answers |

## Results - `/api/results` (STUDENT)
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Own **published** results only |
| GET | `/:examId` | Own published result detail; correct answers are revealed only because publication has occurred |

## Dashboards and analytics
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/dashboard/admin` | ADMIN | Counts, recent activity, audit entries |
| GET | `/api/dashboard/faculty` | FACULTY | Own exams, pending evaluations |
| GET | `/api/dashboard/student` | STUDENT | Upcoming exams, recent published results |
| GET | `/api/analytics` | ADMIN, FACULTY | Over published results only: overall pass %, score distribution, per-subject averages, participation, question-level correctness (faculty limited to their own exams) |

## Behaviours worth knowing
- Starting an attempt, saving, submitting, publishing and correcting each run inside a transaction with a row lock ([database-design.md](database-design.md#transactions-and-consistency-rules)).
- The server alone decides time: `deadline = LEAST(started_at + duration, scheduled_end)`.
- Students never receive `is_correct` for an exam until it is published.
