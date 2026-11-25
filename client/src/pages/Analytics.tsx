import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { num, pct } from '../lib/format';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, Table, Td, Th } from '../components/ui';
import { useFetch } from '../components/useFetch';

interface A { overall: { attempts: number; pass_percentage: number | null; avg_percentage: number | null; highest_percentage: number | null; lowest_percentage: number | null };
  distribution: { band: string; students: number }[]; bySubject: { subject_name: string; avg_percentage: number; pass_percentage: number; attempts: number }[];
  participation: { exam_id: number; title: string; attempted: number; eligible: number }[]; hardestQuestions: { question_id: number; question: string; subject_code: string; answered: number; correct: number; correct_percentage: number }[] }

const DEFS = [
  ['Pass percentage', 'PASS results ÷ published attempts. Shown as "-" when there are no published attempts.'],
  ['Average score', 'Mean percentage across published attempts (marks ÷ maximum marks).'],
  ['Participation', 'Submitted attempts ÷ active students in the subject’s department and semester.'],
  ['Question correctness', 'Objective answers awarded full marks ÷ answered, in published exams. Needs 3+ answers.'],
];

export default function Analytics() {
  const { data, loading, error, reload } = useFetch<A>('/analytics');
  if (loading) return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  if (error || !data) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;
  const o = data.overall;
  return (
    <>
      <PageHeader title="Analytics" subtitle="Computed with SQL over published results only, so unfinished marking never distorts a number." />
      {o.attempts === 0 ? <Card><EmptyState title="No published results yet" message="Analytics appear once results are published." /></Card> : (<>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[['Published attempts', o.attempts], ['Pass percentage', pct(o.pass_percentage)], ['Average score', pct(o.avg_percentage)], ['Highest', pct(o.highest_percentage)], ['Lowest', pct(o.lowest_percentage)]].map(([k, v]) => (
            <Card key={String(k)} className="p-4"><p className="text-sm text-muted">{k}</p><p className="mt-1 text-2xl font-semibold">{v}</p></Card>))}</div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Card className="p-5"><h2 className="font-semibold">Result distribution</h2><p className="text-xs text-muted">Students per percentage band</p>
            <div className="mt-3 h-64" role="img" aria-label="Bar chart of students per percentage band"><ResponsiveContainer><BarChart data={data.distribution}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="band" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip /><Bar dataKey="students" name="Students" fill="#4F46E5" radius={[4, 4, 0, 0]} animationDuration={600} /></BarChart></ResponsiveContainer></div></Card>
          <Card className="p-5"><h2 className="font-semibold">Subject-wise performance</h2><p className="text-xs text-muted">Average score and pass rate</p>
            <div className="mt-3 h-64" role="img" aria-label="Bar chart of average percentage and pass percentage per subject"><ResponsiveContainer><BarChart data={data.bySubject}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="subject_name" tick={{ fontSize: 11 }} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 14) + '…' : v)} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} /><Tooltip formatter={(v: number) => `${v}%`} /><Legend /><Bar dataKey="avg_percentage" name="Average %" fill="#4F46E5" radius={[4, 4, 0, 0]} animationDuration={600} />
              <Bar dataKey="pass_percentage" name="Pass %" fill="#16A34A" radius={[4, 4, 0, 0]} animationDuration={600} /></BarChart></ResponsiveContainer></div></Card>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Card><div className="border-b border-line px-4 py-3"><h2 className="font-semibold">Examination participation</h2></div>
            {!data.participation.length ? <EmptyState title="No completed examinations" /> : <Table><thead><tr><Th>Examination</Th><Th>Attempted</Th><Th>Eligible</Th><Th>Rate</Th></tr></thead>
              <tbody>{data.participation.map((p) => (<tr key={p.exam_id}><Td>{p.title}</Td><Td>{p.attempted}</Td><Td>{p.eligible}</Td><Td>{p.eligible ? pct((100 * p.attempted) / p.eligible) : '-'}</Td></tr>))}</tbody></Table>}</Card>
          <Card><div className="border-b border-line px-4 py-3"><h2 className="font-semibold">Most-missed objective questions</h2></div>
            {!data.hardestQuestions.length ? <EmptyState title="Not enough answers yet" /> : <Table><thead><tr><Th>Question</Th><Th>Answered</Th><Th>Correct</Th></tr></thead>
              <tbody>{data.hardestQuestions.map((q) => (<tr key={q.question_id}><Td><span className="line-clamp-2">{q.question}</span><span className="text-xs text-muted">{q.subject_code}</span></Td><Td>{q.answered}</Td><Td>{num(q.correct)} ({pct(q.correct_percentage)})</Td></tr>))}</tbody></Table>}</Card>
        </div>
      </>)}
      <Card className="mt-6 p-5"><h2 className="font-semibold">How each metric is calculated</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{DEFS.map(([k, v]) => (<div key={k}><dt className="font-medium">{k}</dt><dd className="text-muted">{v}</dd></div>))}</dl></Card>
    </>
  );
}
