-- =====================================================================
-- 03_views.sql  -  derived data. Nothing here is stored twice.
-- Views are read-only helpers; row-level security (a student seeing only
-- their own rows, or only PUBLISHED results) is enforced by the API's WHERE
-- clauses, not by the views.
-- =====================================================================
USE examsphere_db;

-- Total of awarded marks per attempt and how many answers still wait for a
-- faculty member. Unanswered questions have no row, so they add 0.
CREATE OR REPLACE VIEW attempt_scores AS
SELECT a.attempt_id, a.exam_id, a.student_id, a.status AS attempt_status, a.submitted_at,
       COALESCE(SUM(sa.awarded_marks), 0)                              AS total_marks,
       COALESCE(SUM(sa.evaluation_status = 'PENDING'), 0)              AS pending_answers
FROM exam_attempts a
LEFT JOIN student_answers sa ON sa.attempt_id = a.attempt_id
WHERE a.status <> 'IN_PROGRESS'
GROUP BY a.attempt_id, a.exam_id, a.student_id, a.status, a.submitted_at;

-- An exam is "published" when it has at least one PUBLISH row.
CREATE OR REPLACE VIEW published_exams AS
SELECT exam_id, MIN(published_at) AS first_published_at, MAX(published_at) AS last_changed_at
FROM result_publications
GROUP BY exam_id;

-- One row per submitted attempt with percentage, pass/fail, result state and
-- dense rank (ties share a rank; the next rank is not skipped).
-- result_state: PENDING_EVALUATION -> EVALUATED -> PUBLISHED.
-- result is NULL while evaluation is pending (never a "final" score).
CREATE OR REPLACE VIEW student_result_summary AS
SELECT s.exam_id, e.title AS exam_title, e.subject_id, sub.name AS subject_name,
       s.student_id, u.full_name AS student_name, sp.enrollment_no,
       s.attempt_id, s.total_marks, e.max_marks, e.passing_marks,
       ROUND(s.total_marks / e.max_marks * 100, 2) AS percentage,
       CASE WHEN s.pending_answers > 0 THEN NULL
            WHEN s.total_marks >= e.passing_marks THEN 'PASS' ELSE 'FAIL' END AS result,
       CASE WHEN s.pending_answers > 0 THEN 'PENDING_EVALUATION'
            WHEN pe.exam_id IS NOT NULL THEN 'PUBLISHED' ELSE 'EVALUATED' END AS result_state,
       CASE WHEN s.pending_answers > 0 THEN NULL
            ELSE DENSE_RANK() OVER (PARTITION BY s.exam_id, (s.pending_answers > 0)
                                    ORDER BY s.total_marks DESC) END AS dense_rank_in_exam
FROM attempt_scores s
JOIN examinations e       ON e.exam_id = s.exam_id
JOIN subjects sub         ON sub.subject_id = e.subject_id
JOIN users u              ON u.user_id = s.student_id
JOIN student_profiles sp  ON sp.user_id = s.student_id
LEFT JOIN published_exams pe ON pe.exam_id = s.exam_id;

-- Per-exam statistics over EVALUATED attempts only (pending ones are excluded
-- so averages are never based on incomplete marking).
CREATE OR REPLACE VIEW examination_statistics AS
SELECT e.exam_id, e.title, e.subject_id, e.created_by, e.status, e.max_marks, e.passing_marks,
       COUNT(r.attempt_id)                                            AS attempts_total,
       COALESCE(SUM(r.result_state = 'PENDING_EVALUATION'), 0)        AS attempts_pending,
       COALESCE(SUM(r.result IS NOT NULL), 0)                         AS attempts_evaluated,
       ROUND(AVG(CASE WHEN r.result IS NOT NULL THEN r.total_marks END), 2) AS avg_marks,
       MAX(CASE WHEN r.result IS NOT NULL THEN r.total_marks END)     AS highest_marks,
       MIN(CASE WHEN r.result IS NOT NULL THEN r.total_marks END)     AS lowest_marks,
       ROUND(100 * SUM(r.result = 'PASS') / NULLIF(SUM(r.result IS NOT NULL), 0), 2) AS pass_percentage,
       (pe.exam_id IS NOT NULL)                                       AS is_published
FROM examinations e
LEFT JOIN student_result_summary r ON r.exam_id = e.exam_id
LEFT JOIN published_exams pe       ON pe.exam_id = e.exam_id
GROUP BY e.exam_id, e.title, e.subject_id, e.created_by, e.status, e.max_marks, e.passing_marks, pe.exam_id;

-- Subject-level performance across PUBLISHED exams only.
CREATE OR REPLACE VIEW subject_performance_summary AS
SELECT sub.subject_id, sub.code, sub.name,
       COUNT(DISTINCT r.exam_id)                                   AS published_exams,
       COUNT(r.attempt_id)                                         AS attempts,
       ROUND(AVG(r.percentage), 2)                                 AS avg_percentage,
       ROUND(100 * SUM(r.result = 'PASS') / NULLIF(COUNT(r.attempt_id), 0), 2) AS pass_percentage
FROM subjects sub
LEFT JOIN student_result_summary r
       ON r.subject_id = sub.subject_id AND r.result_state = 'PUBLISHED'
GROUP BY sub.subject_id, sub.code, sub.name;
