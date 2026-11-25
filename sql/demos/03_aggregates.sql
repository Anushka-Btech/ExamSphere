-- ### 7. Aggregate functions: score statistics for every exam with evaluated attempts
-- @expect Exam 1 fully evaluated; exam 2 only counts attempts whose written answers are marked.
SELECT exam_id, COUNT(*) AS attempts, ROUND(AVG(total_marks), 2) AS avg_marks, MIN(total_marks) AS lowest, MAX(total_marks) AS highest, SUM(total_marks) AS sum_marks
FROM student_result_summary
WHERE result IS NOT NULL
GROUP BY exam_id;

-- ### 8. GROUP BY with HAVING: subjects that have more than one examination
-- @expect Only CS301 (DBMS has a completed exam and a draft).
SELECT s.code, s.name, COUNT(e.exam_id) AS exams
FROM subjects s JOIN examinations e ON e.subject_id = s.subject_id
GROUP BY s.subject_id, s.code, s.name
HAVING COUNT(e.exam_id) > 1;

-- ### 9. Conditional aggregation: outcome counts per exam in one pass
-- @expect Per exam: how many PASS, FAIL and still-pending attempts.
SELECT exam_id,
       SUM(result = 'PASS')               AS passed,
       SUM(result = 'FAIL')               AS failed,
       SUM(result_state = 'PENDING_EVALUATION') AS pending
FROM student_result_summary
GROUP BY exam_id;

-- ### 10. Pass-percentage calculation (evaluated attempts only; NULLIF avoids division by zero)
-- @expect Exam 1 pass percentage; exam 2 computed from its evaluated attempts only; exams without attempts are not listed.
SELECT exam_id, ROUND(100 * SUM(result = 'PASS') / NULLIF(SUM(result IS NOT NULL), 0), 2) AS pass_percentage
FROM student_result_summary
GROUP BY exam_id;

-- ### 11. Subject-wise performance analysis (published results only)
-- @expect Only subjects with published results (CS301 DBMS).
SELECT * FROM subject_performance_summary WHERE attempts > 0;

-- ### 12. Examination participation statistics
-- @expect attempted vs eligible students per completed exam, with participation percentage.
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

-- ### 13. Faculty-wise examination statistics
-- @expect One row per faculty member: exams owned, attempts received, average of evaluated marks.
SELECT u.full_name AS faculty, COUNT(st.exam_id) AS exams, COALESCE(SUM(st.attempts_total), 0) AS attempts, ROUND(AVG(st.avg_marks), 2) AS avg_of_exam_averages
FROM faculty_profiles fp
JOIN users u ON u.user_id = fp.user_id
LEFT JOIN examination_statistics st ON st.created_by = fp.user_id
GROUP BY fp.user_id, u.full_name
ORDER BY u.full_name;
