# SQL demonstrations

Every block below was **executed against the seeded database** and the output pasted here. The queries are in `sql/demos/*.sql` and use only real tables and columns.

> The outputs were produced on **Dolt** (a MySQL-compatible engine) because MySQL 8 could not be installed in the build environment. Result rows are engine-independent; `EXPLAIN` text and numeric formatting (for example `2.00`) can differ slightly in MySQL 8.

## 1. CREATE TABLE with PRIMARY KEY, FOREIGN KEY, CHECK (scratch table)

**Expected:** Creates demo_exam_notes; the next block shows the constraints rejecting bad rows.

```sql
DROP TABLE IF EXISTS demo_exam_notes;
CREATE TABLE demo_exam_notes (
  note_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  exam_id INT UNSIGNED NOT NULL,
  note    VARCHAR(200) NOT NULL,
  PRIMARY KEY (note_id),
  CONSTRAINT fk_demo_exam FOREIGN KEY (exam_id) REFERENCES examinations (exam_id) ON DELETE CASCADE,
  CONSTRAINT ck_demo_note CHECK (CHAR_LENGTH(note) >= 3)
);
SHOW TABLES LIKE 'demo_exam_notes';
```
```text
+-------------------------+
| Tables_in_examsphere_db |
+-------------------------+
| demo_exam_notes         |
+-------------------------+
```

## 2. INSERT, UPDATE, DELETE (inside a transaction that is rolled back, so the demo is repeatable)

**Expected:** INSERT adds 2 rows; UPDATE changes 1; DELETE removes 1; ROLLBACK leaves 0 rows.

```sql
START TRANSACTION;
INSERT INTO demo_exam_notes (exam_id, note) VALUES (1, 'Re-check Q9 marking'), (2, 'Awaiting evaluation');
UPDATE demo_exam_notes SET note = 'Q9 re-checked' WHERE exam_id = 1;
DELETE FROM demo_exam_notes WHERE exam_id = 2;
SELECT note_id, exam_id, note FROM demo_exam_notes;
ROLLBACK;
SELECT COUNT(*) AS rows_after_rollback FROM demo_exam_notes;
```
```text
+---------+---------+---------------+
| note_id | exam_id | note          |
+---------+---------+---------------+
| 1       | 1       | Q9 re-checked |
+---------+---------+---------------+


+---------------------+
| rows_after_rollback |
+---------------------+
| 0                   |
+---------------------+
```

## 3. Constraints rejecting invalid rows (each statement is expected to fail)

**Expected:** Three errors: foreign key violation (exam 999), check violation (note too short), and a restricted delete of a subject that has exams.

```sql
INSERT INTO demo_exam_notes (exam_id, note) VALUES (999, 'orphan row');
```
```text
error on line 2 for query INSERT INTO demo_exam_notes (exam_id, note) VALUES (999, 'orphan row'): cannot add or update a child row - Foreign key violation on fk: `fk_demo_exam`, table: `demo_exam_notes`, referenced table: `examinations`, key: `[999]`
```
```sql
INSERT INTO demo_exam_notes (exam_id, note) VALUES (1, 'x');
```
```text
error on line 2 for query INSERT INTO demo_exam_notes (exam_id, note) VALUES (1, 'x'): Check constraint "ck_demo_note" violated
```
```sql
DELETE FROM subjects WHERE subject_id = 1;
```
```text
error on line 2 for query DELETE FROM subjects WHERE subject_id = 1: cannot delete or update a parent row - Foreign key violation on fk: `fk_exam_subject`, table: `examinations`, referenced table: `subjects`, key: `[1]`
```
```sql
DROP TABLE demo_exam_notes;
```

## 4. INNER JOIN: each examination with its subject and faculty owner

**Expected:** One row per exam (4): title, subject code, owner name, status.

```sql
SELECT e.exam_id, e.title, s.code AS subject, u.full_name AS owner, e.status
FROM examinations e
INNER JOIN subjects s ON s.subject_id = e.subject_id
INNER JOIN users u    ON u.user_id = e.created_by
ORDER BY e.exam_id;
```
```text
+---------+----------------------------+---------+-------------------+-----------+
| exam_id | title                      | subject | owner             | status    |
+---------+----------------------------+---------+-------------------+-----------+
| 1       | DBMS Mid-Term Examination  | CS301   | Dr. Meera Iyer    | COMPLETED |
| 2       | DSA Unit Test 1            | CS302   | Prof. Rohan Verma | COMPLETED |
| 3       | Operating Systems Quiz     | CS303   | Dr. Kavita Rao    | SCHEDULED |
| 4       | DBMS Practice Test (Draft) | CS301   | Dr. Meera Iyer    | DRAFT     |
+---------+----------------------------+---------+-------------------+-----------+
```

## 5. LEFT JOIN: every CSE semester-3 student with their attempt at exam 1 (NULL = did not attempt)

**Expected:** 9 students; the ones who skipped exam 1 show NULL in attempt columns.

```sql
SELECT u.full_name, sp.enrollment_no, a.attempt_id, a.status AS attempt_status
FROM student_profiles sp
JOIN users u ON u.user_id = sp.user_id
LEFT JOIN exam_attempts a ON a.student_id = sp.user_id AND a.exam_id = 1
WHERE sp.department_id = 1 AND sp.semester = 3
ORDER BY u.full_name;
```
```text
+--------------+---------------+------------+----------------+
| full_name    | enrollment_no | attempt_id | attempt_status |
+--------------+---------------+------------+----------------+
| Aarav Sharma | EN2024001     | 1          | SUBMITTED      |
| Ananya Joshi | EN2024008     | 8          | AUTO_SUBMITTED |
| Arjun Kapoor | EN2024009     | NULL       | NULL           |
| Diya Patel   | EN2024002     | 2          | SUBMITTED      |
| Ishita Gupta | EN2024004     | 4          | SUBMITTED      |
| Kabir Singh  | EN2024003     | 3          | SUBMITTED      |
| Rahul Nair   | EN2024005     | 5          | SUBMITTED      |
| Sneha Reddy  | EN2024006     | 6          | SUBMITTED      |
| Vihaan Mehta | EN2024007     | 7          | SUBMITTED      |
+--------------+---------------+------------+----------------+
```

## 6. Multi-table JOIN: a student's answers with question, subject and correct option

**Expected:** Up to 9 rows for attempt 1: question text, chosen option, correct option, marks awarded.

```sql
SELECT u.full_name AS student, sub.code AS subject, eq.display_order AS q_no, q.question_type,
       so.option_text AS chosen, co.option_text AS correct, sa.awarded_marks, sa.evaluation_status
FROM student_answers sa
JOIN exam_attempts a            ON a.attempt_id = sa.attempt_id
JOIN users u                    ON u.user_id = a.student_id
JOIN examination_questions eq   ON eq.exam_question_id = sa.exam_question_id
JOIN questions q                ON q.question_id = eq.question_id
JOIN subjects sub               ON sub.subject_id = q.subject_id
LEFT JOIN question_options so   ON so.option_id = sa.selected_option_id
LEFT JOIN question_options co   ON co.question_id = q.question_id AND co.is_correct = 1
WHERE a.attempt_id = 1
ORDER BY eq.display_order;
```
```text
+--------------+---------+------+---------------+-----------------------+-----------------------+---------------+-------------------+
| student      | subject | q_no | question_type | chosen                | correct               | awarded_marks | evaluation_status |
+--------------+---------+------+---------------+-----------------------+-----------------------+---------------+-------------------+
| Aarav Sharma | CS301   | 1    | MCQ           | 2NF                   | 2NF                   | 2.00          | EVALUATED         |
| Aarav Sharma | CS301   | 3    | MCQ           | READ COMMITTED        | READ COMMITTED        | 2.00          | EVALUATED         |
| Aarav Sharma | CS301   | 4    | MCQ           | Referential integrity | Referential integrity | 2.00          | EVALUATED         |
| Aarav Sharma | CS301   | 5    | MCQ           | B+ tree               | B+ tree               | 2.00          | EVALUATED         |
| Aarav Sharma | CS301   | 6    | TRUE_FALSE    | False                 | False                 | 1.00          | EVALUATED         |
| Aarav Sharma | CS301   | 7    | TRUE_FALSE    | True                  | True                  | 1.00          | EVALUATED         |
| Aarav Sharma | CS301   | 8    | SHORT         | NULL                  | NULL                  | 2.50          | EVALUATED         |
+--------------+---------+------+---------------+-----------------------+-----------------------+---------------+-------------------+
```

## 7. Aggregate functions: score statistics for every exam with evaluated attempts

**Expected:** Exam 1 fully evaluated; exam 2 only counts attempts whose written answers are marked.

```sql
SELECT exam_id, COUNT(*) AS attempts, ROUND(AVG(total_marks), 2) AS avg_marks, MIN(total_marks) AS lowest, MAX(total_marks) AS highest, SUM(total_marks) AS sum_marks
FROM student_result_summary
WHERE result IS NOT NULL
GROUP BY exam_id;
```
```text
+---------+----------+-----------+--------+---------+-----------+
| exam_id | attempts | avg_marks | lowest | highest | sum_marks |
+---------+----------+-----------+--------+---------+-----------+
| 1       | 8        | 11.13     | 7.5    | 19      | 89        |
| 2       | 4        | 10.75     | 3      | 17      | 43        |
+---------+----------+-----------+--------+---------+-----------+
```

## 8. GROUP BY with HAVING: subjects that have more than one examination

**Expected:** Only CS301 (DBMS has a completed exam and a draft).

```sql
SELECT s.code, s.name, COUNT(e.exam_id) AS exams
FROM subjects s JOIN examinations e ON e.subject_id = s.subject_id
GROUP BY s.subject_id, s.code, s.name
HAVING COUNT(e.exam_id) > 1;
```
```text
+-------+-----------------------------+-------+
| code  | name                        | exams |
+-------+-----------------------------+-------+
| CS301 | Database Management Systems | 2     |
+-------+-----------------------------+-------+
```

## 9. Conditional aggregation: outcome counts per exam in one pass

**Expected:** Per exam: how many PASS, FAIL and still-pending attempts.

```sql
SELECT exam_id,
       SUM(result = 'PASS')               AS passed,
       SUM(result = 'FAIL')               AS failed,
       SUM(result_state = 'PENDING_EVALUATION') AS pending
FROM student_result_summary
GROUP BY exam_id;
```
```text
+---------+--------+--------+---------+
| exam_id | passed | failed | pending |
+---------+--------+--------+---------+
| 1       | 7      | 1      | 0       |
| 2       | 3      | 1      | 3       |
+---------+--------+--------+---------+
```

## 10. Pass-percentage calculation (evaluated attempts only; NULLIF avoids division by zero)

**Expected:** Exam 1 pass percentage; exam 2 computed from its evaluated attempts only; exams without attempts are not listed.

```sql
SELECT exam_id, ROUND(100 * SUM(result = 'PASS') / NULLIF(SUM(result IS NOT NULL), 0), 2) AS pass_percentage
FROM student_result_summary
GROUP BY exam_id;
```
```text
+---------+-----------------+
| exam_id | pass_percentage |
+---------+-----------------+
| 1       | 87.5            |
| 2       | 75              |
+---------+-----------------+
```

## 11. Subject-wise performance analysis (published results only)

**Expected:** Only subjects with published results (CS301 DBMS).

```sql
SELECT * FROM subject_performance_summary WHERE attempts > 0;
```
```text
+------------+-------+-----------------------------+-----------------+----------+----------------+-----------------+
| subject_id | code  | name                        | published_exams | attempts | avg_percentage | pass_percentage |
+------------+-------+-----------------------------+-----------------+----------+----------------+-----------------+
| 1          | CS301 | Database Management Systems | 1               | 8        | 55.63          | 87.5            |
+------------+-------+-----------------------------+-----------------+----------+----------------+-----------------+
```

## 12. Examination participation statistics

**Expected:** attempted vs eligible students per completed exam, with participation percentage.

```sql
SELECT e.title,
       COUNT(DISTINCT a.student_id) AS attempted,
       (SELECT COUNT(*) FROM student_profiles sp WHERE sp.department_id = s.department_id AND sp.semester = s.semester) AS eligible,
       ROUND(100 * COUNT(DISTINCT a.student_id) /
         (SELECT COUNT(*) FROM student_profiles sp WHERE sp.department_id = s.department_id AND sp.semester = s.semester), 1) AS participation_pct
FROM examinations e
JOIN subjects s ON s.subject_id = e.subject_id
LEFT JOIN exam_attempts a ON a.exam_id = e.exam_id AND a.status <> 'IN_PROGRESS'
WHERE e.status = 'COMPLETED'
GROUP BY e.exam_id, e.title, s.department_id, s.semester;
```
```text
+---------------------------+-----------+----------+-------------------+
| title                     | attempted | eligible | participation_pct |
+---------------------------+-----------+----------+-------------------+
| DBMS Mid-Term Examination | 8         | 9        | 88.9              |
| DSA Unit Test 1           | 7         | 9        | 77.8              |
+---------------------------+-----------+----------+-------------------+
```

## 13. Faculty-wise examination statistics

**Expected:** One row per faculty member: exams owned, attempts received, average of evaluated marks.

```sql
SELECT u.full_name AS faculty, COUNT(st.exam_id) AS exams, COALESCE(SUM(st.attempts_total), 0) AS attempts, ROUND(AVG(st.avg_marks), 2) AS avg_of_exam_averages
FROM faculty_profiles fp
JOIN users u ON u.user_id = fp.user_id
LEFT JOIN examination_statistics st ON st.created_by = fp.user_id
GROUP BY fp.user_id, u.full_name
ORDER BY u.full_name;
```
```text
+-------------------+-------+----------+----------------------+
| faculty           | exams | attempts | avg_of_exam_averages |
+-------------------+-------+----------+----------------------+
| Dr. Kavita Rao    | 1     | 0        | NULL                 |
| Dr. Meera Iyer    | 2     | 8        | 11.13                |
| Prof. Rohan Verma | 1     | 7        | 10.75                |
+-------------------+-------+----------+----------------------+
```

## 14. Subquery: students who scored above the average of all evaluated attempts in exam 1

**Expected:** Students with total_marks above the exam average.

```sql
SELECT student_name, total_marks
FROM student_result_summary
WHERE exam_id = 1
  AND total_marks > (SELECT AVG(total_marks) FROM student_result_summary WHERE exam_id = 1)
ORDER BY total_marks DESC;
```
```text
+--------------+-------------+
| student_name | total_marks |
+--------------+-------------+
| Vihaan Mehta | 19          |
| Diya Patel   | 13          |
| Aarav Sharma | 12.5        |
+--------------+-------------+
```

## 15. Correlated subquery: each student's result compared with the average of THEIR OWN exam

**Expected:** Rows where the student beat their exam's average; the inner query is re-evaluated per outer row.

```sql
SELECT r.exam_id, r.student_name, r.total_marks
FROM student_result_summary r
WHERE r.result IS NOT NULL
  AND r.total_marks > (SELECT AVG(x.total_marks) FROM student_result_summary x WHERE x.exam_id = r.exam_id AND x.result IS NOT NULL)
ORDER BY r.exam_id, r.total_marks DESC;
```
```text
+---------+--------------+-------------+
| exam_id | student_name | total_marks |
+---------+--------------+-------------+
| 1       | Vihaan Mehta | 19          |
| 1       | Diya Patel   | 13          |
| 1       | Aarav Sharma | 12.5        |
| 2       | Aarav Sharma | 17          |
| 2       | Ishita Gupta | 12          |
| 2       | Vihaan Mehta | 11          |
+---------+--------------+-------------+
```

## 16. Common Table Expression (CTE): per-student average across evaluated exams

**Expected:** Students ordered by their average percentage.

```sql
WITH per_exam AS (
  SELECT student_id, student_name, percentage FROM student_result_summary WHERE result IS NOT NULL
)
SELECT student_name, COUNT(*) AS exams_taken, ROUND(AVG(percentage), 1) AS avg_percentage
FROM per_exam GROUP BY student_id, student_name ORDER BY avg_percentage DESC;
```
```text
+--------------+-------------+----------------+
| student_name | exams_taken | avg_percentage |
+--------------+-------------+----------------+
| Vihaan Mehta | 2           | 75             |
| Aarav Sharma | 2           | 73.8           |
| Diya Patel   | 1           | 65             |
| Ishita Gupta | 2           | 56.3           |
| Sneha Reddy  | 1           | 52.5           |
| Kabir Singh  | 1           | 40             |
| Ananya Joshi | 1           | 40             |
| Rahul Nair   | 2           | 26.3           |
+--------------+-------------+----------------+
```

## 17. Window functions: RANK vs DENSE_RANK within each exam

**Expected:** Ties share a rank; RANK skips the next number, DENSE_RANK does not (see rows with equal marks).

```sql
SELECT exam_id, student_name, total_marks,
       RANK()       OVER (PARTITION BY exam_id ORDER BY total_marks DESC) AS rnk,
       DENSE_RANK() OVER (PARTITION BY exam_id ORDER BY total_marks DESC) AS dense_rnk
FROM student_result_summary
WHERE result IS NOT NULL
ORDER BY exam_id, total_marks DESC;
```
```text
+---------+--------------+-------------+-----+-----------+
| exam_id | student_name | total_marks | rnk | dense_rnk |
+---------+--------------+-------------+-----+-----------+
| 1       | Vihaan Mehta | 19          | 1   | 1         |
| 1       | Diya Patel   | 13          | 2   | 2         |
| 1       | Aarav Sharma | 12.5        | 3   | 3         |
| 1       | Ishita Gupta | 10.5        | 4   | 4         |
| 1       | Sneha Reddy  | 10.5        | 4   | 4         |
| 1       | Kabir Singh  | 8           | 6   | 5         |
| 1       | Ananya Joshi | 8           | 6   | 5         |
| 1       | Rahul Nair   | 7.5         | 8   | 6         |
| 2       | Aarav Sharma | 17          | 1   | 1         |
| 2       | Ishita Gupta | 12          | 2   | 2         |
| 2       | Vihaan Mehta | 11          | 3   | 3         |
| 2       | Rahul Nair   | 3           | 4   | 4         |
+---------+--------------+-------------+-----+-----------+
```

## 18. Top-performing students (top 3 per exam using a window function inside a CTE)

**Expected:** Up to 3 highest scorers for each exam (ties included).

```sql
WITH ranked AS (
  SELECT exam_id, student_name, total_marks, DENSE_RANK() OVER (PARTITION BY exam_id ORDER BY total_marks DESC) AS pos
  FROM student_result_summary WHERE result IS NOT NULL
)
SELECT exam_id, pos, student_name, total_marks FROM ranked WHERE pos <= 3 ORDER BY exam_id, pos;
```
```text
+---------+-----+--------------+-------------+
| exam_id | pos | student_name | total_marks |
+---------+-----+--------------+-------------+
| 1       | 1   | Vihaan Mehta | 19          |
| 1       | 2   | Diya Patel   | 13          |
| 1       | 3   | Aarav Sharma | 12.5        |
| 2       | 1   | Aarav Sharma | 17          |
| 2       | 2   | Ishita Gupta | 12          |
| 2       | 3   | Vihaan Mehta | 11          |
+---------+-----+--------------+-------------+
```

## 19. Students who have NOT attempted an eligible completed examination

**Expected:** CSE semester-3 students missing from exam 1 and/or exam 2 (found with LEFT JOIN ... IS NULL).

```sql
SELECT e.title, u.full_name, sp.enrollment_no
FROM examinations e
JOIN subjects s ON s.subject_id = e.subject_id
JOIN student_profiles sp ON sp.department_id = s.department_id AND sp.semester = s.semester
JOIN users u ON u.user_id = sp.user_id AND u.status = 'ACTIVE'
LEFT JOIN exam_attempts a ON a.exam_id = e.exam_id AND a.student_id = sp.user_id
WHERE e.status = 'COMPLETED' AND a.attempt_id IS NULL
ORDER BY e.exam_id, u.full_name;
```
```text
+---------------------------+--------------+---------------+
| title                     | full_name    | enrollment_no |
+---------------------------+--------------+---------------+
| DBMS Mid-Term Examination | Arjun Kapoor | EN2024009     |
| DSA Unit Test 1           | Arjun Kapoor | EN2024009     |
| DSA Unit Test 1           | Sneha Reddy  | EN2024006     |
+---------------------------+--------------+---------------+
```

## 20. Questions that are frequently answered incorrectly (objective, at least 3 answers)

**Expected:** The lowest correct-percentage questions first.

```sql
SELECT q.question_id, LEFT(q.question_text, 55) AS question, COUNT(*) AS answered, SUM(sa.awarded_marks = eq.marks) AS correct,
       ROUND(100 * SUM(sa.awarded_marks = eq.marks) / COUNT(*), 1) AS correct_pct
FROM student_answers sa
JOIN examination_questions eq ON eq.exam_question_id = sa.exam_question_id
JOIN questions q ON q.question_id = eq.question_id AND q.question_type IN ('MCQ', 'TRUE_FALSE')
WHERE sa.selected_option_id IS NOT NULL
GROUP BY q.question_id, q.question_text
HAVING COUNT(*) >= 3
ORDER BY correct_pct, q.question_id
LIMIT 5;
```
```text
+-------------+---------------------------------------------------------+----------+---------+-------------+
| question_id | question                                                | answered | correct | correct_pct |
+-------------+---------------------------------------------------------+----------+---------+-------------+
| 7           | ROLLBACK undoes all changes made since the last COMMIT  | 8        | 3       | 37.5        |
| 15          | A min-heap guarantees the root is the smallest element. | 7        | 3       | 42.9        |
| 4           | A foreign key primarily enforces:                       | 8        | 4       | 50          |
| 10          | Worst-case time complexity of binary search on a sorted | 5        | 3       | 60          |
| 1           | Which normal form removes partial dependencies on a com | 6        | 4       | 66.7        |
+-------------+---------------------------------------------------------+----------+---------+-------------+
```

## 21. Result publication history

**Expected:** Exam 1 was published once and corrected once, with who/when/why.

```sql
SELECT e.title, p.action, p.note, p.published_at, u.full_name AS by_user
FROM result_publications p
JOIN examinations e ON e.exam_id = p.exam_id
JOIN users u ON u.user_id = p.published_by
ORDER BY p.published_at;
```
```text
+---------------------------+------------+------------------------------------------------------------+---------------------+----------------+
| title                     | action     | note                                                       | published_at        | by_user        |
+---------------------------+------------+------------------------------------------------------------+---------------------+----------------+
| DBMS Mid-Term Examination | PUBLISH    | Mid-term results released after full evaluation            | 2026-09-18 10:00:00 | Dr. Meera Iyer |
| DBMS Mid-Term Examination | CORRECTION | Q9 descriptive marks corrected after re-evaluation request | 2026-09-20 12:30:00 | Dr. Meera Iyer |
+---------------------------+------------+------------------------------------------------------------+---------------------+----------------+
```

## 22. Views: the three summary views

**Expected:** student_result_summary (one row per submitted attempt), examination_statistics (one per exam), subject_performance_summary (one per subject).

```sql
SELECT exam_id, student_name, total_marks, percentage, result, result_state, dense_rank_in_exam FROM student_result_summary WHERE exam_id = 1 ORDER BY dense_rank_in_exam, student_name LIMIT 5;
SELECT exam_id, title, attempts_total, attempts_pending, avg_marks, pass_percentage, is_published FROM examination_statistics;
SELECT code, published_exams, attempts, avg_percentage, pass_percentage FROM subject_performance_summary;
```
```text
+---------+--------------+-------------+------------+--------+--------------+--------------------+
| exam_id | student_name | total_marks | percentage | result | result_state | dense_rank_in_exam |
+---------+--------------+-------------+------------+--------+--------------+--------------------+
| 1       | Vihaan Mehta | 19          | 95         | PASS   | PUBLISHED    | 1                  |
| 1       | Diya Patel   | 13          | 65         | PASS   | PUBLISHED    | 2                  |
| 1       | Aarav Sharma | 12.5        | 62.5       | PASS   | PUBLISHED    | 3                  |
| 1       | Ishita Gupta | 10.5        | 52.5       | PASS   | PUBLISHED    | 4                  |
| 1       | Sneha Reddy  | 10.5        | 52.5       | PASS   | PUBLISHED    | 4                  |
+---------+--------------+-------------+------------+--------+--------------+--------------------+

+---------+----------------------------+----------------+------------------+-----------+-----------------+--------------+
| exam_id | title                      | attempts_total | attempts_pending | avg_marks | pass_percentage | is_published |
+---------+----------------------------+----------------+------------------+-----------+-----------------+--------------+
| 1       | DBMS Mid-Term Examination  | 8              | 0                | 11.13     | 87.5            | 1            |
| 2       | DSA Unit Test 1            | 7              | 3                | 10.75     | 75              | 0            |
| 3       | Operating Systems Quiz     | 0              | 0                | NULL      | NULL            | 0            |
| 4       | DBMS Practice Test (Draft) | 0              | 0                | NULL      | NULL            | 0            |
+---------+----------------------------+----------------+------------------+-----------+-----------------+--------------+

+-------+-----------------+----------+----------------+-----------------+
| code  | published_exams | attempts | avg_percentage | pass_percentage |
+-------+-----------------+----------+----------------+-----------------+
| CS301 | 1               | 8        | 55.63          | 87.5            |
| CS302 | 0               | 0        | NULL           | NULL            |
| CS303 | 0               | 0        | NULL           | NULL            |
| IT304 | 0               | 0        | NULL           | NULL            |
| CS201 | 0               | 0        | NULL           | NULL            |
+-------+-----------------+----------+----------------+-----------------+
```

## 23. Index creation and EXPLAIN: a lookup on examinations by status, before and after an extra index

**Expected:** Before: no index starts with status (the existing ones start with subject_id / created_by), so the plan is a full table scan with a filter. After CREATE INDEX the plan switches to an index lookup. Plan wording differs between MySQL and Dolt.

```sql
EXPLAIN FORMAT=TREE SELECT exam_id, title FROM examinations WHERE status = 'COMPLETED';
CREATE INDEX idx_demo_status ON examinations (status);
EXPLAIN FORMAT=TREE SELECT exam_id, title FROM examinations WHERE status = 'COMPLETED';
DROP INDEX idx_demo_status ON examinations;
```
```text
+---------------------------------------------------------+
| plan                                                    |
+---------------------------------------------------------+
| Project                                                 |
|  ├─ columns: [examinations.exam_id, examinations.title] |
|  └─ Filter                                              |
|      ├─ (examinations.status = 'COMPLETED')             |
|      └─ Table                                           |
|          ├─ name: examinations                          |
|          └─ columns: [exam_id title status]             |
+---------------------------------------------------------+

+---------------------------------------------------------+
| plan                                                    |
+---------------------------------------------------------+
| Project                                                 |
|  ├─ columns: [examinations.exam_id, examinations.title] |
|  └─ Filter                                              |
|      ├─ (examinations.status = 'COMPLETED')             |
|      └─ IndexedTableAccess(examinations)                |
|          ├─ index: [examinations.status]                |
|          ├─ filters: [{[4, 4]}]                         |
|          └─ columns: [exam_id title status]             |
+---------------------------------------------------------+
```

## 24. EXPLAIN on the schema's real indexes: attempts of one student, and answers of one attempt

**Expected:** Each plan shows an index access (idx_attempt_student, the primary key of student_answers, and the unique index on enrollment_no) instead of a table scan.

```sql
EXPLAIN FORMAT=TREE SELECT * FROM exam_attempts WHERE student_id = 5;
EXPLAIN FORMAT=TREE SELECT * FROM student_answers WHERE attempt_id = 1;
EXPLAIN FORMAT=TREE SELECT user_id FROM student_profiles WHERE enrollment_no = 'EN2024001';
```
```text
+-----------------------------------------------------------------------------+
| plan                                                                        |
+-----------------------------------------------------------------------------+
| IndexedTableAccess(exam_attempts)                                           |
|  ├─ index: [exam_attempts.student_id,exam_attempts.status]                  |
|  ├─ filters: [{[5, 5], [NULL, ∞)}]                                          |
|  └─ columns: [attempt_id exam_id student_id started_at submitted_at status] |
+-----------------------------------------------------------------------------+

+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| plan                                                                                                                                                           |
+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| IndexedTableAccess(student_answers)                                                                                                                            |
|  ├─ index: [student_answers.attempt_id,student_answers.exam_question_id]                                                                                       |
|  ├─ filters: [{[1, 1], [NULL, ∞)}]                                                                                                                             |
|  └─ columns: [attempt_id exam_question_id selected_option_id answer_text marked_for_review awarded_marks evaluation_status evaluated_by evaluated_at saved_at] |
+----------------------------------------------------------------------------------------------------------------------------------------------------------------+

+-------------------------------------------------+
| plan                                            |
+-------------------------------------------------+
| Project                                         |
|  ├─ columns: [student_profiles.user_id]         |
|  └─ IndexedTableAccess(student_profiles)        |
|      ├─ index: [student_profiles.enrollment_no] |
|      ├─ filters: [{[EN2024001, EN2024001]}]     |
|      └─ columns: [user_id enrollment_no]        |
+-------------------------------------------------+
```

## 25. Transaction with ROLLBACK: a bulk mark change that is undone

**Expected:** Marks sum changes inside the transaction; after ROLLBACK the original sum is back.

```sql
SELECT SUM(awarded_marks) AS before_change FROM student_answers WHERE attempt_id = 1;
START TRANSACTION;
UPDATE student_answers SET awarded_marks = 0 WHERE attempt_id = 1;
SELECT SUM(awarded_marks) AS inside_transaction FROM student_answers WHERE attempt_id = 1;
ROLLBACK;
SELECT SUM(awarded_marks) AS after_rollback FROM student_answers WHERE attempt_id = 1;
```
```text
+---------------+
| before_change |
+---------------+
| 12.5          |
+---------------+


+--------------------+
| inside_transaction |
+--------------------+
| 0                  |
+--------------------+


+----------------+
| after_rollback |
+----------------+
| 12.5           |
+----------------+
```

## 26. Transaction with COMMIT: record an audit entry atomically, then remove it

**Expected:** The new audit row is visible after COMMIT; the cleanup DELETE removes it.

```sql
START TRANSACTION;
INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES (1, 'DEMO_ACTION', 'examination', 1, JSON_OBJECT('note', 'commit demo'));
COMMIT;
SELECT action, entity_type, entity_id FROM audit_logs WHERE action = 'DEMO_ACTION';
DELETE FROM audit_logs WHERE action = 'DEMO_ACTION';
```
```text
+-------------+-------------+-----------+
| action      | entity_type | entity_id |
+-------------+-------------+-----------+
| DEMO_ACTION | examination | 1         |
+-------------+-------------+-----------+
```
