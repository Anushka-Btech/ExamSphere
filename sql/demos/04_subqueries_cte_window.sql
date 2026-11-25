-- ### 14. Subquery: students who scored above the average of all evaluated attempts in exam 1
-- @expect Students with total_marks above the exam average.
SELECT student_name, total_marks
FROM student_result_summary
WHERE exam_id = 1
  AND total_marks > (SELECT AVG(total_marks) FROM student_result_summary WHERE exam_id = 1)
ORDER BY total_marks DESC;

-- ### 15. Correlated subquery: each student's result compared with the average of THEIR OWN exam
-- @expect Rows where the student beat their exam's average; the inner query is re-evaluated per outer row.
SELECT r.exam_id, r.student_name, r.total_marks
FROM student_result_summary r
WHERE r.result IS NOT NULL
  AND r.total_marks > (SELECT AVG(x.total_marks) FROM student_result_summary x WHERE x.exam_id = r.exam_id AND x.result IS NOT NULL)
ORDER BY r.exam_id, r.total_marks DESC;

-- ### 16. Common Table Expression (CTE): per-student average across evaluated exams
-- @expect Students ordered by their average percentage.
WITH per_exam AS (
  SELECT student_id, student_name, percentage FROM student_result_summary WHERE result IS NOT NULL
)
SELECT student_name, COUNT(*) AS exams_taken, ROUND(AVG(percentage), 1) AS avg_percentage
FROM per_exam GROUP BY student_id, student_name ORDER BY avg_percentage DESC;

-- ### 17. Window functions: RANK vs DENSE_RANK within each exam
-- @expect Ties share a rank; RANK skips the next number, DENSE_RANK does not (see rows with equal marks).
SELECT exam_id, student_name, total_marks,
       RANK()       OVER (PARTITION BY exam_id ORDER BY total_marks DESC) AS rnk,
       DENSE_RANK() OVER (PARTITION BY exam_id ORDER BY total_marks DESC) AS dense_rnk
FROM student_result_summary
WHERE result IS NOT NULL
ORDER BY exam_id, total_marks DESC;

-- ### 18. Top-performing students (top 3 per exam using a window function inside a CTE)
-- @expect Up to 3 highest scorers for each exam (ties included).
WITH ranked AS (
  SELECT exam_id, student_name, total_marks, DENSE_RANK() OVER (PARTITION BY exam_id ORDER BY total_marks DESC) AS pos
  FROM student_result_summary WHERE result IS NOT NULL
)
SELECT exam_id, pos, student_name, total_marks FROM ranked WHERE pos <= 3 ORDER BY exam_id, pos;

-- ### 19. Students who have NOT attempted an eligible completed examination
-- @expect CSE semester-3 students missing from exam 1 and/or exam 2 (found with LEFT JOIN ... IS NULL).
SELECT e.title, u.full_name, sp.enrollment_no
FROM examinations e
JOIN subjects s ON s.subject_id = e.subject_id
JOIN student_profiles sp ON sp.department_id = s.department_id AND sp.semester = s.semester
JOIN users u ON u.user_id = sp.user_id AND u.status = 'ACTIVE'
LEFT JOIN exam_attempts a ON a.exam_id = e.exam_id AND a.student_id = sp.user_id
WHERE e.status = 'COMPLETED' AND a.attempt_id IS NULL
ORDER BY e.exam_id, u.full_name;

-- ### 20. Questions that are frequently answered incorrectly (objective, at least 3 answers)
-- @expect The lowest correct-percentage questions first.
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

-- ### 21. Result publication history
-- @expect Exam 1 was published once and corrected once, with who/when/why.
SELECT e.title, p.action, p.note, p.published_at, u.full_name AS by_user
FROM result_publications p
JOIN examinations e ON e.exam_id = p.exam_id
JOIN users u ON u.user_id = p.published_by
ORDER BY p.published_at;
