# Viva questions and answers

Answers describe what is actually implemented. Where something is *not* done, the answer says so; that is stronger in a viva than over-claiming.

## A. Project and design
**1. What problem does EXAMSPHERE solve?** Paper or ad-hoc online exams make scheduling, timing, marking and result publication manual and error-prone. It centralises question banks, timed exams, grading and result publication with role-based access and an audit trail.

**2. Who are the users?** Admin (manages people and subjects, read-only on exams), faculty (question bank, exams, evaluation, publishing, for their own subjects/exams), student (attempts, published results).

**3. Why MySQL?** The project is a DBMS capstone: relational integrity (FK, CHECK, UNIQUE), transactions, views and window functions are central. MySQL 8 provides all of these (CHECK from 8.0.16, window functions from 8.0).

**4. Why a single `users` table with profile tables?** One login identity (credentials, role, status) and role-specific data in `student_profiles` / `faculty_profiles`. It avoids NULL-filled columns and duplicate login logic. The cost is a rule SQL cannot express alone: role must match the profile, so both rows are created in one transaction.

**5. How many tables and relationships?** 15 tables, 24 foreign keys (see `er-diagram.md`).

## B. Keys and constraints
**6. Primary key vs candidate key vs foreign key?** PK: chosen unique, non-null identifier. Candidate keys: any minimal unique set (e.g. `users.email`, `enrollment_no`). FK: column referencing another table's key to enforce referential integrity.

**7. Where do you use composite keys?** `faculty_subjects (faculty_id, subject_id)` and `student_answers (attempt_id, exam_question_id)`. They make duplicates impossible and give the natural upsert target.

**8. How do you guarantee one attempt per student per exam?** `UNIQUE (exam_id, student_id)` on `exam_attempts`. The application checks first, but the constraint is the real guarantee under concurrent requests.

**9. How do you ensure only one correct option per question?** A generated column `correct_flag` = 1 when `is_correct`, else NULL, with `UNIQUE (question_id, correct_flag)`. UNIQUE allows many NULLs but one 1. "At least one" cannot be a constraint; the API validates it on save and again at scheduling.

**10. Which CHECK constraints exist?** Semester 1-8, credits, marks > 0, end after start, duration > 0, passing ≤ max, attempt status vs submit time, answer holds option xor text, non-negative marks. (They need MySQL ≥ 8.0.16; older versions parse and ignore them.)

**11. Rules that a CHECK cannot enforce?** Cross-row rules: marks sum, question-in-exam-subject, duration-fits-window (I could not get it accepted as a CHECK on my test engine, so it is API-validated), role/profile agreement. I enforce them in transactions and say so openly.

**12. ON DELETE choices?** RESTRICT for history (cannot delete a subject with exams), CASCADE for dependent rows (options, profiles, sessions), SET NULL for `audit_logs.actor_user_id`.

## C. Normalization
**13. Explain 1NF/2NF/3NF with an example from the project.** 1NF: options are rows, not a list. 2NF: `assigned_on` depends on the whole `(faculty, subject)` key. 3NF: department name is not copied into students; it is reached via `department_id`.

**14. Is it BCNF?** For the tables with several candidate keys I showed every determinant is a candidate key. The one controlled exception is the generated `correct_flag` (see `normalization.md`).

**15. Which redundancy is deliberate?** `examinations.max_marks` (declared total, validated against the sum at scheduling), `awarded_marks` (a recorded decision), and `correct_flag` (generated). I do **not** store attempt totals.

**16. Why no stored score?** A stored total can diverge from its answers after a correction. The view sums the answers, so it cannot be stale.

**17. Update/insert/delete anomalies avoided?** Names stored once; questions exist without exams; deleting an exam does not delete subject or question data.

## D. SQL
**18. Inner vs left join in your project?** Inner: result summary needs student and exam. Left: `attempt_scores` keeps attempts with zero answers; `subject_performance_summary` keeps subjects with no published exams.

**19. What is a view, and which do you have?** A stored query: `attempt_scores`, `published_exams`, `student_result_summary`, `examination_statistics`, `subject_performance_summary`. They are read helpers, not security: the API adds the per-student filter.

**20. DENSE_RANK vs RANK vs ROW_NUMBER?** Ties share a rank: DENSE_RANK does not skip numbers, RANK does, ROW_NUMBER never ties. Rank is NULL while any written answer is pending.

**21. Show a subquery and a correlated subquery.** Demo 14 (above-average scorers) is a subquery; demo 15 is correlated. Demo 19 (not attempted) shows the exclusion pattern. The grading UPDATE also uses a correlated subquery per answer.

**22. HAVING vs WHERE?** WHERE filters rows before grouping; HAVING filters groups (demo 8: subjects with more than one exam).

**23. How are NULLs handled in averages?** Pending attempts are excluded (`CASE ... END` inside AVG; `NULLIF` for pass % so zero rows give NULL, not a misleading 0%).

**24. UNION / INTERSECT / EXCEPT?** Not used in the application and not in my demo set (the demos use joins, subqueries, CTEs and windows). Concept: UNION merges result sets (dedupes; UNION ALL keeps duplicates); MySQL 8.0.31 added INTERSECT/EXCEPT; before that use joins or `NOT EXISTS` (as in demo 19).

**25. Indexes: which and why?** Composite `(subject_id, status, question_type, difficulty)` for bank filters, `(department_id, semester)` for eligibility, unique `(exam_id, student_id)`, and others in `database-design.md`. A composite index helps only if the query uses a leftmost prefix.

**26. Index trade-offs?** Faster reads; slower writes, more disk. FK columns need indexes anyway. I added only those backed by a query.

**27. What does EXPLAIN show?** The access path: full scan vs index, rows estimated. Demos 23-24 show before/after `EXPLAIN FORMAT=TREE` on Dolt. **Not yet re-run on MySQL 8**; plan text will differ, the idea does not.

**28. SQL injection?** Every query uses `?` placeholders (mysql2 prepared parameters); input is also validated by Zod. Sort order is fixed in the SQL; user input is never concatenated into a query.

## E. Transactions and concurrency
**29. ACID with an example?** Publishing results: insert the `PUBLISH` row and audit row, or neither (Atomicity); no half-published state (Consistency); concurrent publish blocked by a lock (Isolation); committed data survives restart (Durability, InnoDB).

**30. Where are transactions used?** Create user+profile, start attempt, save answers, submit+grade, evaluate, publish, correct, schedule, set exam questions, bulk question import.

**31. What does `SELECT ... FOR UPDATE` do?** Takes a row lock until commit. Two concurrent submits or publishes on the same row serialise; the second sees the new state and returns without repeating work.

**32. What is idempotent submit?** Calling submit twice leaves the same result: only an `IN_PROGRESS` attempt changes; later calls return the existing state.

**33. What isolation level?** InnoDB default REPEATABLE READ; correctness relies on explicit row locks plus unique constraints, not on isolation alone.

**34. Possible deadlocks?** Locking order is consistent (exam row, then attempt, then answers), which minimises them. A deadlock error would surface as a 500 and the client can retry; I have not built automatic retry.

**35. Who enforces the exam timer?** The server. Deadline = `LEAST(started_at + duration, scheduled_end)` using `UTC_TIMESTAMP()`. The browser timer is cosmetic; a late save returns 409 and auto-submits.

## F. Security
**36. How are passwords stored?** bcrypt hash, never plaintext.

**37. How do sessions work?** Random token in an HttpOnly, SameSite=Lax cookie; the database stores only its SHA-256, so a DB leak does not leak live sessions. Logout deletes the row.

**38. How is authorization enforced?** On the server per route (`requireRole`) plus ownership checks. The route guard in React is only for navigation convenience. Roles come from the database every request.

**39. How do you prevent a student seeing another's attempt?** The query includes the session user's id and returns 404 (not 403) so existence is not revealed.

**40. How are correct answers protected?** Never sent to students during an attempt; revealed after publication only.

**41. Can a student send their own marks?** No: Zod `.strict()` rejects unknown fields; marks are computed server-side.

**42. Known security limits?** Login rate limiter is in-memory (per process); no email verification or password reset; CSRF defence is SameSite + JSON-only, not tokens; HTTPS must be provided by deployment.

## G. Business rules and workflow
**43. Exam lifecycle?** DRAFT → SCHEDULED → LIVE → COMPLETED (CANCELLED possible). LIVE/COMPLETED derive from the clock. Publication is a row in `result_publications`, not a status.

**44. Why is publication a separate table?** It is an event with history: one publish, then audited corrections with reasons. A status flag would lose that.

**45. What stops publishing too early?** A pre-flight inside a transaction: exam completed, no running attempts, no pending written answers, not already published.

**46. How do objective and written answers differ in grading?** MCQ/true-false are auto-graded at submit by one UPDATE; blank written answers get 0; real written answers stay PENDING until faculty marks them.

**47. How are corrections handled?** Allowed after publication with a mandatory reason; old and new marks go into the audit log and a `CORRECTION` row.

**48. Who is eligible for an exam?** Active students whose department and semester match the exam's subject.

## H. Honesty and limitations
**49. What did you test, and what not?** DB layer: executed on Dolt (MySQL-compatible), 26 demos. Server and client code: written but not run in my sandbox; the 45 Vitest tests are written, not run. See `testing.md`.

**50. Biggest limitations?** No MySQL 8 run yet; no browser testing; single attempt per student; no question randomisation or proctoring; no email; in-memory rate limit.

**51. Future scope?** Question shuffling, partial credit for multi-select, proctoring signals, CSV export, Redis-backed sessions/rate limit, retry on deadlock.
