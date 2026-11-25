-- ### 22. Views: the three summary views
-- @expect student_result_summary (one row per submitted attempt), examination_statistics (one per exam), subject_performance_summary (one per subject).
SELECT exam_id, student_name, total_marks, percentage, result, result_state, dense_rank_in_exam FROM student_result_summary WHERE exam_id = 1 ORDER BY dense_rank_in_exam, student_name LIMIT 5;
SELECT exam_id, title, attempts_total, attempts_pending, avg_marks, pass_percentage, is_published FROM examination_statistics;
SELECT code, published_exams, attempts, avg_percentage, pass_percentage FROM subject_performance_summary;

-- ### 23. Index creation and EXPLAIN: a lookup on examinations by status, before and after an extra index
-- @expect Before: no index starts with status (the existing ones start with subject_id / created_by), so the plan is a full table scan with a filter. After CREATE INDEX the plan switches to an index lookup. Plan wording differs between MySQL and Dolt.
EXPLAIN FORMAT=TREE SELECT exam_id, title FROM examinations WHERE status = 'COMPLETED';
CREATE INDEX idx_demo_status ON examinations (status);
EXPLAIN FORMAT=TREE SELECT exam_id, title FROM examinations WHERE status = 'COMPLETED';
DROP INDEX idx_demo_status ON examinations;

-- ### 24. EXPLAIN on the schema's real indexes: attempts of one student, and answers of one attempt
-- @expect Each plan shows an index access (idx_attempt_student, the primary key of student_answers, and the unique index on enrollment_no) instead of a table scan.
EXPLAIN FORMAT=TREE SELECT * FROM exam_attempts WHERE student_id = 5;
EXPLAIN FORMAT=TREE SELECT * FROM student_answers WHERE attempt_id = 1;
EXPLAIN FORMAT=TREE SELECT user_id FROM student_profiles WHERE enrollment_no = 'EN2024001';

-- ### 25. Transaction with ROLLBACK: a bulk mark change that is undone
-- @expect Marks sum changes inside the transaction; after ROLLBACK the original sum is back.
SELECT SUM(awarded_marks) AS before_change FROM student_answers WHERE attempt_id = 1;
START TRANSACTION;
UPDATE student_answers SET awarded_marks = 0 WHERE attempt_id = 1;
SELECT SUM(awarded_marks) AS inside_transaction FROM student_answers WHERE attempt_id = 1;
ROLLBACK;
SELECT SUM(awarded_marks) AS after_rollback FROM student_answers WHERE attempt_id = 1;

-- ### 26. Transaction with COMMIT: record an audit entry atomically, then remove it
-- @expect The new audit row is visible after COMMIT; the cleanup DELETE removes it.
START TRANSACTION;
INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES (1, 'DEMO_ACTION', 'examination', 1, JSON_OBJECT('note', 'commit demo'));
COMMIT;
SELECT action, entity_type, entity_id FROM audit_logs WHERE action = 'DEMO_ACTION';
DELETE FROM audit_logs WHERE action = 'DEMO_ACTION';
