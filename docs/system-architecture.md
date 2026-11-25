# System architecture

```
Browser (React SPA)
   │  fetch /api/...  (cookie: es_sid, HttpOnly)
   ▼
Vite dev server ── proxy /api ──▶ Express (port 4000)
                                    1. loadUser: session cookie → sessions → users (role from DB)
                                    2. requireAuth / requireRole per router
                                    3. Zod validation of params, query and body
                                    4. services: examEngine.ts, resultEngine.ts (rules + transactions)
                                    5. errorHandler: safe messages, no SQL or stack traces
                                    ▼
                                  MySQL 8 (InnoDB): tables, constraints, views
```

## Layers
| Layer | Responsibility | Files |
|---|---|---|
| UI | Pages, forms, charts, route guards (convenience only) | `client/src` |
| API | Authentication, authorisation, validation | `server/src/routes`, `auth.ts`, `util.ts` |
| Services | Attempt lifecycle, grading, publication, corrections | `examEngine.ts`, `resultEngine.ts` |
| Data | Schema, constraints, views | `database/*.sql` |

## Why the browser is not trusted
The route guards in `App.tsx` only redirect. Every API request is authorised again from the session cookie. The countdown timer is cosmetic: `saveAnswer` and `submitAttempt` compare the server time (`UTC_TIMESTAMP()`) with the stored deadline. A student who edits client state, changes the URL or replays requests gets 401, 403, 404 or 409 from the server.

## Request walk-through: saving an answer
1. `PUT /api/student/attempts/12/answers` with `{examQuestionId, selectedOptionId}`.
2. `loadUser` finds the session and loads the user; `requireRole('STUDENT')` passes.
3. Zod (`.strict()`) rejects unknown keys such as a client-supplied `awardedMarks`.
4. `saveAnswer` opens a transaction and locks the attempt row (`SELECT … FOR UPDATE`).
5. It checks: attempt belongs to the caller (else 404), is `IN_PROGRESS` (else 409), deadline not passed (else it auto-submits and returns 409), question belongs to this exam (else 400), option belongs to this question (else 400).
6. It upserts into `student_answers` (composite PK ⇒ one row per attempt and question) and commits.

## Time handling
All `DATETIME` values are UTC. `mysql2` is configured with `timezone: 'Z'` and `dateStrings: true`. The client converts to local time for display and to ISO UTC when sending.

## Exam state machine
`DRAFT → SCHEDULED` (faculty, after validation) · `SCHEDULED → DRAFT` (only if nobody attempted) · `SCHEDULED → LIVE → COMPLETED` (by the clock) · `DRAFT/SCHEDULED/LIVE → CANCELLED` (only if no attempts). `COMPLETED` and `CANCELLED` are terminal. Publication is not a status; it is a row in `result_publications`.
