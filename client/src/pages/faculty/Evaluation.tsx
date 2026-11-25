import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDateTime, num } from '../../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { useToast } from '../../components/Toast';

interface Item { attempt_id: number; exam_question_id: number; exam_id: number; title: string; student_name: string; enrollment_no: string; question_text: string;
  question_type: string; model_answer: string | null; max_marks: number; answer_text: string; submitted_at: string }

export default function Evaluation() {
  const { data, loading, error, reload } = useFetch<{ items: Item[] }>('/exams/pending-evaluations');
  const toast = useToast(); const [marks, setMarks] = useState<Record<string, string>>({}); const [busy, setBusy] = useState<string | null>(null);
  const key = (i: Item) => `${i.attempt_id}-${i.exam_question_id}`;
  const save = async (i: Item) => {
    const m = Number(marks[key(i)]);
    if (marks[key(i)] === undefined || marks[key(i)] === '' || !Number.isFinite(m) || m < 0 || m > Number(i.max_marks)) { toast.error(`Enter marks between 0 and ${i.max_marks}`); return; }
    setBusy(key(i));
    try { await api('/exams/evaluations', { method: 'PUT', body: { attemptId: i.attempt_id, examQuestionId: i.exam_question_id, marks: m } }); toast.success('Marks saved'); reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const groups = data ? [...new Set(data.items.map((i) => i.exam_id))] : [];
  return (
    <>
      <PageHeader title="Evaluation" subtitle="Written answers waiting for marks. A result cannot be published until this list is empty for the exam." />
      {loading ? <Skeleton className="h-48" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? (
        <Card><EmptyState title="All caught up" message="No written answers are waiting for evaluation." action={<Link to="/faculty/exams"><Button variant="secondary">View examinations</Button></Link>} /></Card>
      ) : groups.map((g) => { const items = data.items.filter((i) => i.exam_id === g); return (
        <Card key={g} className="mb-5">
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold"><Link className="hover:underline" to={`/faculty/exams/${g}`}>{items[0].title}</Link></h2><Badge tone="amber">{items.length} to evaluate</Badge></div>
          <ul className="divide-y divide-line">{items.map((i) => (
            <li key={key(i)} className="grid gap-4 p-4 lg:grid-cols-[1fr_15rem]">
              <div className="min-w-0 text-sm"><p className="text-xs text-muted">{i.student_name} · {i.enrollment_no} · submitted {fmtDateTime(i.submitted_at)}</p>
                <p className="mt-1 font-medium">{i.question_text}</p><p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3">{i.answer_text}</p>
                {i.model_answer && <p className="mt-2 text-xs text-muted"><span className="font-medium">Model answer:</span> {i.model_answer}</p>}</div>
              <div className="flex items-end gap-2 lg:flex-col lg:items-stretch">
                <label className="text-xs text-muted">Marks (max {num(i.max_marks)})<input type="number" min="0" max={i.max_marks} step="0.5" value={marks[key(i)] ?? ''} onChange={(e) => setMarks((m) => ({ ...m, [key(i)]: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" /></label>
                <Button loading={busy === key(i)} onClick={() => save(i)}><CheckCircle2 className="h-4 w-4" aria-hidden />Save marks</Button></div>
            </li>))}</ul>
        </Card>); })}
    </>
  );
}
