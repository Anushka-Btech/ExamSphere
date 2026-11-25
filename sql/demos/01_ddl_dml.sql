-- ### 1. CREATE TABLE with PRIMARY KEY, FOREIGN KEY, CHECK (scratch table)
-- @expect Creates demo_exam_notes; the next block shows the constraints rejecting bad rows.
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

-- ### 2. INSERT, UPDATE, DELETE (inside a transaction that is rolled back, so the demo is repeatable)
-- @expect INSERT adds 2 rows; UPDATE changes 1; DELETE removes 1; ROLLBACK leaves 0 rows.
START TRANSACTION;
INSERT INTO demo_exam_notes (exam_id, note) VALUES (1, 'Re-check Q9 marking'), (2, 'Awaiting evaluation');
UPDATE demo_exam_notes SET note = 'Q9 re-checked' WHERE exam_id = 1;
DELETE FROM demo_exam_notes WHERE exam_id = 2;
SELECT note_id, exam_id, note FROM demo_exam_notes;
ROLLBACK;
SELECT COUNT(*) AS rows_after_rollback FROM demo_exam_notes;

-- ### 3. Constraints rejecting invalid rows (each statement is expected to fail)
-- @expect Three errors: foreign key violation (exam 999), check violation (note too short), and a restricted delete of a subject that has exams.
INSERT INTO demo_exam_notes (exam_id, note) VALUES (999, 'orphan row');
INSERT INTO demo_exam_notes (exam_id, note) VALUES (1, 'x');
DELETE FROM subjects WHERE subject_id = 1;
DROP TABLE demo_exam_notes;
