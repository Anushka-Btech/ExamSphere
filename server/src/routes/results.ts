import { Router } from 'express';
import { query, one } from '../db.js';
import { requireRole } from '../auth.js';
import { h, notFound } from '../errors.js';
import { idParam } from '../util.js';

export const resultsRouter = Router();
resultsRouter.use(requireRole('STUDENT'));

// Every query filters on student_id = session user AND result_state = 'PUBLISHED'. The student id is never read from the request.
resultsRouter.get('/', h(async (req, res) => {
  const items = await query(
    `SELECT r.exam_id, r.exam_title, r.subject_name, r.total_marks, r.max_marks, r.percentage, r.result, r.dense_rank_in_exam AS rank_in_exam,
            e.scheduled_start,
            (SELECT COUNT(*) FROM student_result_summary x WHERE x.exam_id = r.exam_id AND x.result IS NOT NULL) AS participants
       FROM student_result_summary r JOIN examinations e ON e.exam_id = r.exam_id
      WHERE r.student_id = ? AND r.result_state = 'PUBLISHED' ORDER BY e.scheduled_start DESC`, [req.user!.userId]);
  res.json({ items });
}));

// Detail, including the correct answers: allowed only because the result is published.
resultsRouter.get('/:examId', h(async (req, res) => {
  const examId = idParam.parse(req.params.examId);
  const summary = await one(`SELECT * FROM student_result_summary WHERE student_id = ? AND exam_id = ? AND result_state = 'PUBLISHED'`, [req.user!.userId, examId]);
  if (!summary) throw notFound('No published result for this examination');   // same answer for "unpublished" and "does not exist"
  const answers = await query(
    `SELECT eq.display_order, q.question_text, q.question_type, eq.marks AS max_marks, sa.awarded_marks,
            (SELECT o.option_text FROM question_options o WHERE o.option_id = sa.selected_option_id) AS your_option,
            (SELECT o.option_text FROM question_options o WHERE o.question_id = q.question_id AND o.is_correct = 1) AS correct_option,
            sa.answer_text AS your_text, q.model_answer
       FROM examination_questions eq JOIN questions q ON q.question_id = eq.question_id
       LEFT JOIN student_answers sa ON sa.exam_question_id = eq.exam_question_id AND sa.attempt_id = ?
      WHERE eq.exam_id = ? ORDER BY eq.display_order`, [summary.attempt_id, examId]);
  res.json({ summary, answers });
}));
