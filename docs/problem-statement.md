# Problem statement

## Context
Colleges conduct internal and end-semester examinations with a mix of paper, spreadsheets and ad-hoc forms. Faculty rewrite questions each term, students wait days for marks, and corrections happen without a record.

## Problems addressed
1. **Question reuse.** Questions live in personal files, so quality and difficulty are inconsistent. *ExamSphere keeps a subject-wise question bank with type, difficulty and marks.*
2. **Scheduling and eligibility.** It is unclear who may attempt what and when. *Eligibility is derived from the student's department and semester matching the subject; the window is enforced by the server.*
3. **Trustworthy timing.** Browser timers can be changed. *The server computes the deadline from its own clock and rejects late answers.*
4. **Slow, error-prone marking.** *Objective answers are graded by SQL inside the submit transaction; written answers go to a faculty queue.*
5. **Premature or silent result changes.** *Results are invisible until published; later changes need a correction with a stated reason, recorded in `result_publications` and `audit_logs`.*
6. **No evidence of who did what.** *Sensitive actions write to `audit_logs`.*

## Objectives
- Design a normalised schema (3NF) with explicit keys, constraints and deletion rules.
- Provide the full exam lifecycle for three roles.
- Compute all statistics with SQL (joins, aggregates, views, window functions).
- Keep consistency with transactions (attempt finalisation, publication, corrections).
- Be explainable in a viva: every rule has a place in the schema, a query, or a service function.

## Scope
**In scope:** users and roles, departments, subjects, faculty-subject assignment, question bank, exams, attempts, answers, evaluation, publication and corrections, analytics, audit log.
**Out of scope:** payment, video proctoring, adaptive testing, mobile apps, external LMS integration, AI features.
