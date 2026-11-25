# Database design

MySQL 8.0.16+, InnoDB, `utf8mb4`. Source of truth: `database/01_schema.sql` (tables), `03_views.sql` (views). The ER diagram and the full list of 24 foreign keys with their deletion rules are in [er-diagram.md](er-diagram.md) (generated from the live schema).

## Tables (15)
| Table | Purpose | Primary key | Notes |
|---|---|---|---|
| `departments` | Academic departments | `department_id` | UNIQUE `code`, `name` |
| `users` | One login identity for every role | `user_id` | UNIQUE `email`, `username`; `password_hash` is bcrypt |
| `student_profiles` | Student-specific data | `user_id` (also FK to `users`) | UNIQUE `enrollment_no`; semester 1-8 |
| `faculty_profiles` | Faculty-specific data | `user_id` (also FK) | UNIQUE `employee_code` |
| `subjects` | Courses | `subject_id` | UNIQUE `code`; belongs to a department and semester |
| `faculty_subjects` | Which faculty teach which subjects (M:N) | `(faculty_id, subject_id)` | Composite key prevents a repeat assignment |
| `questions` | Question bank | `question_id` | Belongs to a subject; author is a faculty member |
| `question_options` | Options of MCQ / true-false questions | `option_id` | `(question_id, display_order)` unique; at most one correct option per question |
| `examinations` | Exams | `exam_id` | Subject, faculty owner, window, duration, marks, status |
| `examination_questions` | Which questions are in which exam, with marks for that exam (M:N) | `exam_question_id` | UNIQUE `(exam_id, question_id)` and `(exam_id, display_order)` |
| `exam_attempts` | A student's attempt | `attempt_id` | UNIQUE `(exam_id, student_id)` = single attempt |
| `student_answers` | One answer per attempt and exam question | `(attempt_id, exam_question_id)` | Holds the chosen option or text, awarded marks, evaluation status |
| `result_publications` | Append-only publish/correction history | `publication_id` | An exam is "published" iff it has a `PUBLISH` row |
| `audit_logs` | Who did what | `log_id` | `actor_user_id` is `SET NULL` if the user is ever removed |
| `sessions` | Server-side logins | `token_hash` | Stores SHA-256 of the cookie token only |

## Cardinalities
- One department has many students, faculty and subjects.
- One user has zero or one student profile, or zero or one faculty profile (1 : 0..1).
- One subject has many questions and many examinations.
- One faculty member teaches many subjects; one subject may have many faculty (M:N through `faculty_subjects`).
- One question has many options (0 for written questions).
- One examination contains many questions; one question can appear in many examinations (M:N through `examination_questions`).
- One examination has many attempts; each student has at most one attempt per examination.
- One attempt has many answers, at most one per exam question.
- One examination has many publication rows (the first is `PUBLISH`, later ones `CORRECTION`).

## Constraints
**Keys and uniqueness:** every table has a primary key. UNIQUE: `users.email`, `users.username`, `student_profiles.enrollment_no`, `faculty_profiles.employee_code`, `subjects.code`, `departments.code/name`, `(exam_id, student_id)`, `(exam_id, question_id)`, `(exam_id, display_order)`, `(question_id, display_order)`, `(question_id, correct_flag)`.

**CHECK constraints (enforced from MySQL 8.0.16):** email shape; semester 1-8; credits 1-10; marks > 0; `scheduled_end > scheduled_start`; `duration_minutes > 0`; `max_marks > 0` and `0 ≤ passing_marks ≤ max_marks`; attempt status vs `submitted_at` (an in-progress attempt has no submit time; a finished one has one not earlier than the start); an answer holds an option **or** text, never both; awarded marks ≥ 0; evaluated answers must have marks and a timestamp.

**Rules a CHECK cannot express** (they look across rows, so they are enforced elsewhere):
| Rule | How it is enforced |
|---|---|
| At most one correct option per question | UNIQUE index on `(question_id, correct_flag)`. `correct_flag` is a generated column that equals 1 for the correct option and NULL otherwise; UNIQUE allows many NULLs but only one 1. |
| At least one (exactly one) correct option | API validation when saving a question; re-checked when scheduling an exam |
| Sum of question marks = exam `max_marks` | Checked in the `schedule` transaction under a row lock; the question set can only change while the exam is a DRAFT |
| Duration fits inside the window | API validation (the database rejected this expression in a CHECK on the test engine, and it needs two columns plus a function) |
| Question belongs to the exam's subject; option belongs to the question | API validation in a transaction |
| `users.role` matches the profile table | Created together in one transaction by the admin routes |

**Deletion rules:** `RESTRICT` wherever history matters (subjects, questions, exams, attempts, students, answers); `CASCADE` where the child has no meaning alone (profiles, options, exam-question links, answers of an attempt, sessions, faculty-subject links); `SET NULL` for `audit_logs.actor_user_id`.

## Stored versus derived data
- **No stored score.** An attempt's total is `SUM(student_answers.awarded_marks)` (view `attempt_scores`). Percentage, pass/fail, rank and evaluation state are derived in `student_result_summary`.
- **`awarded_marks` is stored per answer** because it is the recorded outcome of grading or a faculty decision at a point in time (and corrections change it with a log entry), not something that can be recomputed from other columns.
- **`examinations.max_marks` is a declared total** that must equal the sum of assigned question marks; the equality is validated at scheduling (see above).
- **`examinations.status`** is stored because DRAFT and CANCELLED cannot be derived from the clock; SCHEDULED/LIVE/COMPLETED are advanced from the clock by `syncExamStatuses`.

## Indexes and why
| Index | Serves |
|---|---|
| `uq_student_enrollment_no`, `uq_users_email`, `uq_users_username` | login and enrollment lookups; uniqueness |
| `idx_student_dept_sem (department_id, semester)` | eligibility: students of a subject's department and semester |
| `idx_subject_dept_sem` | subject filters; eligibility join |
| `idx_question_filter (subject_id, status, question_type, difficulty)` | question-bank filters (leading columns are the most selective filters) |
| `idx_exam_subject_status`, `idx_exam_schedule`, `idx_exam_owner (created_by, status)` | exam lists by subject/status, by date, by owner |
| `uq_attempt_exam_student`, `idx_attempt_student (student_id, status)` | attempt lookup per exam and per student |
| primary key `(attempt_id, exam_question_id)` | all answers of an attempt; upsert target |
| `idx_answer_eq (exam_question_id, evaluation_status)` | question-level statistics; pending-evaluation scans |
| `idx_pub_exam (exam_id, action, published_at)` | "is this exam published?" and history |
| `idx_audit_entity`, `idx_audit_time` | audit browsing |
| `idx_session_expiry` | purging expired sessions |

Demonstrated with `EXPLAIN FORMAT=TREE` in [sql-demonstrations.md](sql-demonstrations.md) (demos 23-24), including a before/after comparison. **Trade-offs:** each index speeds reads but costs disk space and slows `INSERT/UPDATE/DELETE` on the indexed columns; MySQL also needs an index on every foreign-key column, so some of the above exist partly to support the foreign keys. Write-heavy tables (`student_answers`) carry only the indexes the reads need.

## Views
| View | Meaning |
|---|---|
| `attempt_scores` | total marks and number of pending answers per submitted attempt |
| `published_exams` | exams that have a `PUBLISH` row |
| `student_result_summary` | per attempt: percentage, `PASS/FAIL` (NULL while any written answer is pending), `result_state` (`PENDING_EVALUATION`, `EVALUATED`, `PUBLISHED`), dense rank |
| `examination_statistics` | per exam: attempts, pending, average/high/low (evaluated attempts only), pass percentage |
| `subject_performance_summary` | per subject, over **published** exams only |

Views are read helpers. They do not provide row-level security: the API adds `student_id = <session user>` and `result_state = 'PUBLISHED'` filters itself. Ranking uses `DENSE_RANK`, so tied students share a rank and the next rank is not skipped.

## Transactions and consistency rules
| Operation | Boundary | Consistency guarantee |
|---|---|---|
| Start attempt | lock exam row (`FOR SHARE`), check eligibility/window/status, insert attempt | at most one attempt (unique key is the backstop under races) |
| Save answer | lock the attempt row, validate, upsert | no answers after the deadline or after submission; no duplicates |
| Finalise / submit | lock attempt; set status and `submitted_at`; grade objective answers; blank written answers get 0 | idempotent: a non-`IN_PROGRESS` attempt is untouched; repeat calls return the same state |
| Evaluate answer | lock the answer row | only the owner; marks within the question's marks; not after publication |
| Publish results | lock the exam row; verify COMPLETED, no running attempts, no pending answers, not already published; insert `PUBLISH` row + audit row | all-or-nothing, auditable, cannot publish twice |
| Correct marks | lock the answer row; update marks; insert `CORRECTION` row with reason; audit row with old and new value | no silent change after publication |
| Create student / faculty | insert `users` + profile together | no user without a profile |
