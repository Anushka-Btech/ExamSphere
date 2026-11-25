-- ### 4. INNER JOIN: each examination with its subject and faculty owner
-- @expect One row per exam (4): title, subject code, owner name, status.
SELECT e.exam_id, e.title, s.code AS subject, u.full_name AS owner, e.status
FROM examinations e
INNER JOIN subjects s ON s.subject_id = e.subject_id
INNER JOIN users u    ON u.user_id = e.created_by
ORDER BY e.exam_id;

-- ### 5. LEFT JOIN: every CSE semester-3 student with their attempt at exam 1 (NULL = did not attempt)
-- @expect 9 students; the ones who skipped exam 1 show NULL in attempt columns.
SELECT u.full_name, sp.enrollment_no, a.attempt_id, a.status AS attempt_status
FROM student_profiles sp
JOIN users u ON u.user_id = sp.user_id
LEFT JOIN exam_attempts a ON a.student_id = sp.user_id AND a.exam_id = 1
WHERE sp.department_id = 1 AND sp.semester = 3
ORDER BY u.full_name;

-- ### 6. Multi-table JOIN: a student's answers with question, subject and correct option
-- @expect Up to 9 rows for attempt 1: question text, chosen option, correct option, marks awarded.
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
