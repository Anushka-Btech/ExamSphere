import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import { fmtDate, num, pct } from '../../lib/format';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, Table, TableSkeleton, Td, Th } from '../../components/ui';
import { useFetch } from '../../components/useFetch';

export function StudentResults() {
  const { data, loading, error, reload } = useFetch<{ items: { exam_id: number; exam_title: string; subject_name: string; total_marks: number; max_marks: number; percentage: number; result: string; rank_in_exam: number; participants: number; scheduled_start: string }[] }>('/results');
  return (
    <>
      <PageHeader title="Results" subtitle="Only published results are shown here." />
      <Card>
        {loading ? <TableSkeleton cols={5} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? <EmptyState title="No published results" message="Results appear after your faculty evaluates and publishes them." /> : (
          <Table>
            <thead><tr><Th>Examination</Th><Th>Date</Th><Th>Marks</Th><Th>Percentage</Th><Th>Rank</Th><Th>Result</Th><Th /></tr></thead>
            <tbody>{data.items.map((r) => (
              <tr key={r.exam_id}><Td className="font-medium">{r.exam_title}<div className="text-xs font-normal text-muted">{r.subject_name}</div></Td><Td>{fmtDate(r.scheduled_start)}</Td>
                <Td>{num(r.total_marks)} / {num(r.max_marks)}</Td><Td>{pct(r.percentage)}</Td>
                <Td title="Tied scores share a rank">{r.rank_in_exam} of {r.participants}</Td><Td><StatusBadge value={r.result} /></Td>
                <Td className="text-right"><Link className="text-sm font-medium text-brand-600 hover:underline" to={`/student/results/${r.exam_id}`}>Review</Link></Td></tr>))}</tbody>
          </Table>)}
      </Card>
    </>
  );
}

interface Detail { summary: { exam_title: string; total_marks: number; max_marks: number; passing_marks: number; percentage: number; result: string; dense_rank_in_exam: number };
  answers: { display_order: number; question_text: string; question_type: string; max_marks: number; awarded_marks: number | null; your_option: string | null; correct_option: string | null; your_text: string | null; model_answer: string | null }[] }

export function StudentResultDetail() {
  const { examId } = useParams();
  const { data, loading, error, reload } = useFetch<Detail>(`/results/${examId}`);
  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-40" /></div>;
  if (error || !data) return <ErrorState message={error ?? 'Not found'} onRetry={reload} />;
  const s = data.summary;
  return (
    <>
      <Link to="/student/results" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden />All results</Link>
      <PageHeader title={s.exam_title} subtitle={`Pass mark ${num(s.passing_marks)} · rank ${s.dense_rank_in_exam} (ties share a rank)`} actions={<StatusBadge value={s.result} />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-sm text-muted">Marks</p><p className="mt-1 text-2xl font-semibold">{num(s.total_marks)} <span className="text-base font-normal text-muted">/ {num(s.max_marks)}</span></p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Percentage</p><p className="mt-1 text-2xl font-semibold">{pct(s.percentage)}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Outcome</p><p className="mt-1 text-2xl font-semibold">{s.result === 'PASS' ? 'Passed' : 'Not passed'}</p></Card>
      </div>
      <h2 className="mb-3 text-lg font-semibold">Answer review</h2>
      <ol className="space-y-3">
        {data.answers.map((a) => { const obj = a.question_type === 'MCQ' || a.question_type === 'TRUE_FALSE'; const full = a.awarded_marks !== null && Number(a.awarded_marks) === Number(a.max_marks);
          return (
            <li key={a.display_order}><Card className="p-4">
              <div className="flex items-start justify-between gap-3"><p className="font-medium text-ink"><span className="text-muted">{a.display_order}.</span> {a.question_text}</p>
                <Badge tone={full ? 'green' : a.awarded_marks ? 'amber' : 'red'}>{num(a.awarded_marks ?? 0)} / {num(a.max_marks)}</Badge></div>
              {obj ? (
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="flex items-start gap-2">{a.your_option === a.correct_option ? <Check className="mt-0.5 h-4 w-4 text-ok" aria-label="Correct" /> : <X className="mt-0.5 h-4 w-4 text-bad" aria-label="Incorrect" />}
                    <div><dt className="text-xs text-muted">Your answer</dt><dd>{a.your_option ?? 'Not answered'}</dd></div></div>
                  <div><dt className="text-xs text-muted">Correct answer</dt><dd>{a.correct_option}</dd></div>
                </dl>
              ) : (
                <dl className="mt-3 space-y-2 text-sm"><div><dt className="text-xs text-muted">Your answer</dt><dd className="whitespace-pre-wrap">{a.your_text?.trim() || 'Not answered'}</dd></div>
                  {a.model_answer && <div><dt className="text-xs text-muted">Model answer</dt><dd className="whitespace-pre-wrap text-muted">{a.model_answer}</dd></div>}</dl>)}
            </Card></li>); })}
      </ol>
    </>
  );
}
