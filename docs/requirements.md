# Requirements

## Functional requirements
| ID | Requirement | Where implemented |
|---|---|---|
| F1 | Sign in/out with server-validated sessions; role-based access | `server/src/auth.ts`, `routes/auth.ts` |
| F2 | Admin manages students (add, edit, deactivate, search, filter, paginate) and rejects duplicate email / enrollment number | `routes/people.ts`; UNIQUE keys |
| F3 | Admin manages faculty and faculty-subject assignment | `routes/people.ts`, `faculty_subjects` |
| F4 | Admin manages subjects; subjects used by exams cannot be deleted | `routes/subjects.ts`; `ON DELETE RESTRICT` |
| F5 | Faculty maintain a question bank of four question types | `routes/questions.ts` |
| F6 | MCQ has 2-6 options and exactly one correct option | `normalizeOptions`, unique index on `question_options (question_id, correct_flag)` |
| F7 | Faculty create exams, assign questions with per-exam marks, schedule, cancel | `routes/exams.ts` |
| F8 | Scheduling is refused unless question marks equal the maximum marks | `POST /exams/:id/schedule` |
| F9 | Students see only eligible exams and attempt within the window | `examEngine.startAttempt` |
| F10 | Answers autosave; one row per (attempt, exam question) | `student_answers` composite PK; upsert |
| F11 | The server decides when an attempt ends; late answers are refused | `DEADLINE_SQL`, `saveAnswer` |
| F12 | Submission is idempotent and grades objective answers in one transaction | `submitAttempt`, `finalizeLocked` |
| F13 | Faculty mark written answers within each question's marks | `resultEngine.evaluateAnswer` |
| F14 | Results cannot be published with pending evaluation or running attempts | `resultEngine.publishResults` |
| F15 | Students see only their own published results; correct answers appear only then | `routes/results.ts` |
| F16 | Post-publication changes need a reason and are logged | `resultEngine.correctMarks` |
| F17 | Dashboards and analytics come from SQL | `routes/dashboard.ts`, views |
| F18 | Audit log for sensitive operations | `audit.ts`, `audit_logs` |

## Non-functional requirements
- **Security:** bcrypt password hashes; session cookie is HttpOnly and SameSite=Lax; only a SHA-256 of the token is stored; parameterised SQL; Zod validation; roles come from the database, never from the client; generic login error.
- **Integrity:** foreign keys, UNIQUE and CHECK constraints, transactions with row locks for critical changes.
- **Usability and accessibility:** responsive layouts, keyboard focus styles, labelled form controls, `aria-live` status messages, reduced-motion support.
- **Maintainability:** business rules in two service modules (`examEngine.ts`, `resultEngine.ts`); thin routes.
- **Performance:** indexes for the main access paths (see `database-design.md`); pagination capped at 100 rows.
