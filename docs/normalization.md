# Normalization

Notation: `A → B` means "A determines B". Candidate keys are listed per table. This analysis uses the implemented schema, not an idealised one.

## First Normal Form (1NF)
Every column holds a single atomic value and every table has a primary key.
- Options of a question are **rows in `question_options`**, not a comma-separated list in `questions`.
- A student's answer is one row per `(attempt, exam question)`, not a repeating group of answer columns.
- `ENUM` columns hold one scalar value each.
- **One documented exception:** `audit_logs.details` is a JSON document. It is a free-form log payload that is only displayed, never joined or filtered relationally, so it is not part of the relational design.

## Second Normal Form (2NF)
2NF concerns tables with composite keys: no non-key attribute may depend on only part of the key.
| Table | Key | Check |
|---|---|---|
| `faculty_subjects` | `(faculty_id, subject_id)` | `assigned_on` describes the assignment (the pair); it does not depend on faculty alone or subject alone ✔ |
| `student_answers` | `(attempt_id, exam_question_id)` | `selected_option_id`, `answer_text`, `awarded_marks`, evaluation fields all describe this answer to this question in this attempt ✔ |
All other tables use a single-column primary key, so partial dependencies cannot exist ✔.

## Third Normal Form (3NF)
No non-key attribute may depend on another non-key attribute (no transitive dependency).
| Table | Candidate keys | Functional dependencies | Result |
|---|---|---|---|
| `departments` | `department_id`, `code`, `name` | everything depends on a key | ✔ |
| `users` | `user_id`, `email`, `username` | `user_id → email, username, password_hash, full_name, role, status, …` | ✔ |
| `student_profiles` | `user_id`, `enrollment_no` | `user_id → enrollment_no, department_id, semester, enrollment_date`. Department **name** is not stored; it is reached through `department_id` | ✔ |
| `faculty_profiles` | `user_id`, `employee_code` | as above | ✔ |
| `subjects` | `subject_id`, `code` | `subject_id → name, credits, semester, department_id, status` | ✔ |
| `questions` | `question_id` | subject name and author name are **not** copied; they are reached through FKs | ✔ |
| `question_options` | `option_id`, `(question_id, display_order)` | see the note on `correct_flag` below | ✔ with note |
| `examinations` | `exam_id` | subject and owner names are not copied | ✔ (see note on `max_marks`) |
| `examination_questions` | `exam_question_id`, `(exam_id, question_id)`, `(exam_id, display_order)` | `marks` is the weight of **this question in this exam**; it is a different fact from `questions.default_marks` | ✔ |
| `exam_attempts` | `attempt_id`, `(exam_id, student_id)` | no stored score; total is derived | ✔ |
| `student_answers` | `(attempt_id, exam_question_id)` | ✔ |
| `result_publications`, `audit_logs`, `sessions` | single surrogate/natural key | each row is one event | ✔ |

### Notes on deliberate departures (stated honestly)
1. **`question_options.correct_flag`.** It is a generated column defined as `IF(is_correct = 1, 1, NULL)`. Taken literally this adds the dependency `is_correct → correct_flag` where `is_correct` is not a key. It is a *physical implementation device* so that a UNIQUE index can enforce "at most one correct option". Because MySQL computes it and it cannot be written independently, it can never become inconsistent, so none of the anomalies below can occur through it. Strictly speaking, the logical design is 3NF and this column is a controlled exception.
2. **`examinations.max_marks`** equals the sum of `examination_questions.marks` once scheduled. It is a declared total that is **validated** (not trusted) at scheduling; it is needed before questions are assigned (a draft with a target total). This is controlled redundancy, enforced in a transaction because a CHECK cannot sum across rows.
3. **`student_answers.awarded_marks`** is stored on purpose. It is the recorded outcome of grading or a faculty decision (and is corrected through an audited workflow). It is not derivable from other columns once options or marks change.
4. **`users.role`** and the existence of a profile row must agree. This is a multi-table rule, enforced by creating both in one transaction.

## BCNF
For tables whose only determinants are candidate keys, BCNF also holds. This is demonstrated for the tables that have more than one candidate key:
- `users`: determinants are `user_id`, `email`, `username`, all candidate keys ✔
- `exam_attempts`: `attempt_id` and `(exam_id, student_id)` are both candidate keys ✔
- `examination_questions`: `exam_question_id`, `(exam_id, question_id)`, `(exam_id, display_order)` ✔
- `student_profiles`, `faculty_profiles`, `subjects`, `departments`: all determinants are candidate keys ✔

The `correct_flag` column from note 1 is the single exception to a BCNF claim for `question_options`. No claim beyond BCNF (4NF/5NF) is made.

## Anomalies that this design prevents
| Anomaly | What would go wrong in an unnormalised table | How the design prevents it |
|---|---|---|
| **Update** | A department or subject is renamed, but only some copies change | Names live once (`departments.name`, `subjects.name`); other tables store ids |
| **Insertion** | A new subject cannot be recorded until an exam uses it; a question cannot exist without an exam | Subjects, questions and exams are separate tables |
| **Deletion** | Deleting the last exam of a subject deletes the subject's details; deleting an attempt deletes the student | Separate tables, and `RESTRICT` on parents that still have history |
| **Score inconsistency** | A stored total diverges from its answers | No stored total; the view sums the answers |

## Worked example: why `examination_questions` exists
A single table `exam(exam_id, question_text, question_marks, …)` would repeat the question text in every exam (update anomaly if a typo is fixed), could not hold a question before it is used (insertion anomaly) and would lose the question when its last exam is removed (deletion anomaly). Splitting into `questions` (the bank) and `examination_questions` (the link, carrying the per-exam marks) removes all three.
