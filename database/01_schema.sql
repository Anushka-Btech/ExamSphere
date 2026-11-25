-- =====================================================================
-- ExamSphere : Online Examination & Result Management System
-- 01_schema.sql  -  tables, keys, constraints, indexes   (MySQL 8.0.16+)
--
-- Conventions
--   * Tables: plural snake_case.  PKs: <entity>_id.  FKs keep the PK name.
--   * Engine InnoDB (transactions + foreign keys), charset utf8mb4.
--   * All DATETIME values are stored in UTC; the API converts for display.
--   * MySQL forbids CHECK constraints on a column used by a CASCADE /
--     SET NULL referential action (error 3823), so such columns have no CHECK.
--   * A CHECK cannot look at other rows or tables.  Rules that span rows
--     (sum of question marks = exam max marks, exactly one correct option)
--     are enforced by a unique index trick and by transactions in the API
--     (this schema has no triggers) - see docs/database-design.md.
-- =====================================================================

DROP DATABASE IF EXISTS examsphere_db;
CREATE DATABASE examsphere_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE examsphere_db;

-- ---------------------------------------------------------------------
-- 1. departments            1 department -> N students, N faculty, N subjects
-- ---------------------------------------------------------------------
CREATE TABLE departments (
  department_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(10)  NOT NULL,
  name          VARCHAR(100) NOT NULL,
  PRIMARY KEY (department_id),
  CONSTRAINT uq_departments_code UNIQUE (code),
  CONSTRAINT uq_departments_name UNIQUE (name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. users                  one login identity for every role
-- ---------------------------------------------------------------------
CREATE TABLE users (
  user_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(150) NOT NULL,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(100) NOT NULL,              -- bcrypt, never plaintext
  full_name     VARCHAR(120) NOT NULL,
  role          ENUM('ADMIN','FACULTY','STUDENT') NOT NULL,
  status        ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT uq_users_email    UNIQUE (email),
  CONSTRAINT uq_users_username UNIQUE (username),
  CONSTRAINT ck_users_email    CHECK (email LIKE '%_@_%.__%')
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. student_profiles       1:1 specialisation of users (role = STUDENT)
-- ---------------------------------------------------------------------
CREATE TABLE student_profiles (
  user_id         INT UNSIGNED NOT NULL,
  enrollment_no   VARCHAR(20)  NOT NULL,
  department_id   INT UNSIGNED NOT NULL,
  semester        TINYINT UNSIGNED NOT NULL,
  enrollment_date DATE NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT uq_student_enrollment_no UNIQUE (enrollment_no),
  CONSTRAINT fk_student_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_student_department FOREIGN KEY (department_id)
    REFERENCES departments (department_id) ON DELETE RESTRICT,
  CONSTRAINT ck_student_semester CHECK (semester BETWEEN 1 AND 8),
  INDEX idx_student_dept_sem (department_id, semester)  -- eligibility lookups
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. faculty_profiles       1:1 specialisation of users (role = FACULTY)
-- ---------------------------------------------------------------------
CREATE TABLE faculty_profiles (
  user_id       INT UNSIGNED NOT NULL,
  employee_code VARCHAR(20)  NOT NULL,
  department_id INT UNSIGNED NOT NULL,
  designation   VARCHAR(60)  NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT uq_faculty_employee_code UNIQUE (employee_code),
  CONSTRAINT fk_faculty_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_faculty_department FOREIGN KEY (department_id)
    REFERENCES departments (department_id) ON DELETE RESTRICT,
  INDEX idx_faculty_department (department_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. subjects               1 department -> N subjects
-- ---------------------------------------------------------------------
CREATE TABLE subjects (
  subject_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(15)  NOT NULL,
  name          VARCHAR(120) NOT NULL,
  description   TEXT NULL,
  credits       TINYINT UNSIGNED NOT NULL,
  semester      TINYINT UNSIGNED NOT NULL,
  department_id INT UNSIGNED NOT NULL,
  status        ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (subject_id),
  CONSTRAINT uq_subjects_code UNIQUE (code),
  CONSTRAINT fk_subject_department FOREIGN KEY (department_id)
    REFERENCES departments (department_id) ON DELETE RESTRICT,
  CONSTRAINT ck_subject_credits  CHECK (credits BETWEEN 1 AND 10),
  CONSTRAINT ck_subject_semester CHECK (semester BETWEEN 1 AND 8),
  INDEX idx_subject_dept_sem (department_id, semester)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. faculty_subjects       M:N  faculty <-> subjects (composite PK)
-- ---------------------------------------------------------------------
CREATE TABLE faculty_subjects (
  faculty_id  INT UNSIGNED NOT NULL,
  subject_id  INT UNSIGNED NOT NULL,
  assigned_on DATE NOT NULL DEFAULT (CURRENT_DATE),
  PRIMARY KEY (faculty_id, subject_id),
  CONSTRAINT fk_fs_faculty FOREIGN KEY (faculty_id)
    REFERENCES faculty_profiles (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_fs_subject FOREIGN KEY (subject_id)
    REFERENCES subjects (subject_id) ON DELETE CASCADE,
  INDEX idx_fs_subject (subject_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. questions              1 subject -> N questions (the question bank)
-- ---------------------------------------------------------------------
CREATE TABLE questions (
  question_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_id    INT UNSIGNED NOT NULL,
  created_by    INT UNSIGNED NOT NULL,
  question_text TEXT NOT NULL,
  question_type ENUM('MCQ','TRUE_FALSE','SHORT','DESCRIPTIVE') NOT NULL,
  difficulty    ENUM('EASY','MEDIUM','HARD') NOT NULL DEFAULT 'MEDIUM',
  default_marks DECIMAL(5,2) NOT NULL,
  model_answer  TEXT NULL,                 -- SHORT / DESCRIPTIVE only; never sent to students
  status        ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (question_id),
  CONSTRAINT fk_question_subject FOREIGN KEY (subject_id)
    REFERENCES subjects (subject_id) ON DELETE RESTRICT,
  CONSTRAINT fk_question_author FOREIGN KEY (created_by)
    REFERENCES faculty_profiles (user_id) ON DELETE RESTRICT,
  CONSTRAINT ck_question_marks CHECK (default_marks > 0),
  INDEX idx_question_filter (subject_id, status, question_type, difficulty),
  INDEX idx_question_author (created_by)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. question_options       1 question -> N options (MCQ, TRUE_FALSE)
--    correct_flag is a generated column that is 1 for the correct option
--    and NULL otherwise.  A UNIQUE index on (question_id, correct_flag)
--    therefore allows AT MOST ONE correct option per question, because
--    UNIQUE indexes permit any number of NULLs.  "At least one" is
--    checked by the API when a question is saved.
-- ---------------------------------------------------------------------
CREATE TABLE question_options (
  option_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id   INT UNSIGNED NOT NULL,
  option_text   VARCHAR(500) NOT NULL,
  is_correct    TINYINT(1) NOT NULL DEFAULT 0,
  display_order TINYINT UNSIGNED NOT NULL,
  correct_flag  TINYINT GENERATED ALWAYS AS (IF(is_correct = 1, 1, NULL)) STORED,
  PRIMARY KEY (option_id),
  CONSTRAINT fk_option_question FOREIGN KEY (question_id)
    REFERENCES questions (question_id) ON DELETE CASCADE,
  CONSTRAINT uq_option_order       UNIQUE (question_id, display_order),
  CONSTRAINT uq_option_one_correct UNIQUE (question_id, correct_flag),
  CONSTRAINT ck_option_is_correct  CHECK (is_correct IN (0,1))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. examinations           1 subject -> N examinations; 1 faculty owner
-- ---------------------------------------------------------------------
CREATE TABLE examinations (
  exam_id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_id      INT UNSIGNED NOT NULL,
  created_by      INT UNSIGNED NOT NULL,            -- faculty owner
  title           VARCHAR(150) NOT NULL,
  description     TEXT NULL,
  scheduled_start DATETIME NOT NULL,
  scheduled_end   DATETIME NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  max_marks       DECIMAL(6,2) NOT NULL,
  passing_marks   DECIMAL(6,2) NOT NULL,
  status          ENUM('DRAFT','SCHEDULED','LIVE','COMPLETED','CANCELLED')
                  NOT NULL DEFAULT 'DRAFT',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exam_id),
  CONSTRAINT fk_exam_subject FOREIGN KEY (subject_id)
    REFERENCES subjects (subject_id) ON DELETE RESTRICT,
  CONSTRAINT fk_exam_owner FOREIGN KEY (created_by)
    REFERENCES faculty_profiles (user_id) ON DELETE RESTRICT,
  CONSTRAINT ck_exam_window   CHECK (scheduled_end > scheduled_start),
  -- duration <= (end - start) spans two columns through a function: validated in the API
  CONSTRAINT ck_exam_duration CHECK (duration_minutes > 0),
  CONSTRAINT ck_exam_marks    CHECK (max_marks > 0 AND passing_marks >= 0 AND passing_marks <= max_marks),
  INDEX idx_exam_subject_status (subject_id, status),
  INDEX idx_exam_schedule (scheduled_start),
  INDEX idx_exam_owner (created_by, status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. examination_questions  M:N  examinations <-> questions, with the
--     marks the question carries IN THAT EXAM (so the same bank question
--     may be worth different marks in different exams).
--     Surrogate key lets answers reference one assignment with one column.
-- ---------------------------------------------------------------------
CREATE TABLE examination_questions (
  exam_question_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  exam_id          INT UNSIGNED NOT NULL,
  question_id      INT UNSIGNED NOT NULL,
  marks            DECIMAL(5,2) NOT NULL,
  display_order    SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (exam_question_id),
  CONSTRAINT uq_eq_exam_question UNIQUE (exam_id, question_id),
  CONSTRAINT uq_eq_exam_order    UNIQUE (exam_id, display_order),
  CONSTRAINT fk_eq_exam FOREIGN KEY (exam_id)
    REFERENCES examinations (exam_id) ON DELETE CASCADE,
  CONSTRAINT fk_eq_question FOREIGN KEY (question_id)
    REFERENCES questions (question_id) ON DELETE RESTRICT,
  CONSTRAINT ck_eq_marks CHECK (marks > 0),
  INDEX idx_eq_question (question_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 11. exam_attempts         one attempt per (exam, student)
--     No stored score: total = SUM(student_answers.awarded_marks) (view
--     attempt_scores).  Evaluation status is likewise derived.
-- ---------------------------------------------------------------------
CREATE TABLE exam_attempts (
  attempt_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  exam_id      INT UNSIGNED NOT NULL,
  student_id   INT UNSIGNED NOT NULL,
  started_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME NULL,
  status       ENUM('IN_PROGRESS','SUBMITTED','AUTO_SUBMITTED') NOT NULL DEFAULT 'IN_PROGRESS',
  PRIMARY KEY (attempt_id),
  CONSTRAINT uq_attempt_exam_student UNIQUE (exam_id, student_id),   -- single-attempt policy
  CONSTRAINT fk_attempt_exam FOREIGN KEY (exam_id)
    REFERENCES examinations (exam_id) ON DELETE RESTRICT,
  CONSTRAINT fk_attempt_student FOREIGN KEY (student_id)
    REFERENCES student_profiles (user_id) ON DELETE RESTRICT,
  CONSTRAINT ck_attempt_submit CHECK (
    (status = 'IN_PROGRESS' AND submitted_at IS NULL) OR
    (status <> 'IN_PROGRESS' AND submitted_at IS NOT NULL AND submitted_at >= started_at)),
  INDEX idx_attempt_student (student_id, status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 12. student_answers       composite PK => one answer row per attempt
--     and assigned question.  awarded_marks is the graded outcome of THAT
--     answer (objective: written by the finalize transaction; subjective:
--     written by faculty).  NULL = not yet graded.
-- ---------------------------------------------------------------------
CREATE TABLE student_answers (
  attempt_id         INT UNSIGNED NOT NULL,
  exam_question_id   INT UNSIGNED NOT NULL,
  selected_option_id INT UNSIGNED NULL,
  answer_text        TEXT NULL,
  marked_for_review  TINYINT(1) NOT NULL DEFAULT 0,
  awarded_marks      DECIMAL(5,2) NULL,
  evaluation_status  ENUM('PENDING','EVALUATED') NOT NULL DEFAULT 'PENDING',
  evaluated_by       INT UNSIGNED NULL,               -- NULL = auto-graded
  evaluated_at       DATETIME NULL,
  saved_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attempt_id, exam_question_id),
  CONSTRAINT fk_answer_attempt FOREIGN KEY (attempt_id)
    REFERENCES exam_attempts (attempt_id) ON DELETE CASCADE,
  CONSTRAINT fk_answer_eq FOREIGN KEY (exam_question_id)
    REFERENCES examination_questions (exam_question_id) ON DELETE RESTRICT,
  CONSTRAINT fk_answer_option FOREIGN KEY (selected_option_id)
    REFERENCES question_options (option_id) ON DELETE RESTRICT,
  CONSTRAINT fk_answer_evaluator FOREIGN KEY (evaluated_by)
    REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT ck_answer_one_kind CHECK (selected_option_id IS NULL OR answer_text IS NULL),
  CONSTRAINT ck_answer_awarded  CHECK (awarded_marks IS NULL OR awarded_marks >= 0),
  CONSTRAINT ck_answer_eval     CHECK (
    (evaluation_status = 'PENDING'   AND evaluated_at IS NULL) OR
    (evaluation_status = 'EVALUATED' AND awarded_marks IS NOT NULL AND evaluated_at IS NOT NULL)),
  INDEX idx_answer_eq (exam_question_id, evaluation_status),
  INDEX idx_answer_option (selected_option_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 13. result_publications   append-only history. An exam's results are
--     "published" iff it has a PUBLISH row (no duplicated flag on exams).
-- ---------------------------------------------------------------------
CREATE TABLE result_publications (
  publication_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  exam_id        INT UNSIGNED NOT NULL,
  published_by   INT UNSIGNED NOT NULL,
  action         ENUM('PUBLISH','CORRECTION') NOT NULL DEFAULT 'PUBLISH',
  note           VARCHAR(300) NULL,
  published_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (publication_id),
  CONSTRAINT fk_pub_exam FOREIGN KEY (exam_id)
    REFERENCES examinations (exam_id) ON DELETE RESTRICT,
  CONSTRAINT fk_pub_user FOREIGN KEY (published_by)
    REFERENCES users (user_id) ON DELETE RESTRICT,
  INDEX idx_pub_exam (exam_id, action, published_at),
  INDEX idx_pub_time (published_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 14. audit_logs            who did what to which row (append-only)
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  log_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id INT UNSIGNED NULL,
  action        VARCHAR(50)  NOT NULL,
  entity_type   VARCHAR(40)  NOT NULL,
  entity_id     INT UNSIGNED NULL,
  details       JSON NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id)
    REFERENCES users (user_id) ON DELETE SET NULL,
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_time (created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 15. sessions              server-side login sessions. Only the SHA-256
--     of the random cookie token is stored, so a DB leak cannot be
--     replayed as a cookie.
-- ---------------------------------------------------------------------
CREATE TABLE sessions (
  token_hash CHAR(64) NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (token_hash),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE,
  INDEX idx_session_user (user_id),
  INDEX idx_session_expiry (expires_at)
) ENGINE=InnoDB;
