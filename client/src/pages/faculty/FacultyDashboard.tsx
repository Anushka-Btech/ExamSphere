import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ClipboardCheck, FileQuestion, Plus, Presentation, Timer } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { num, pct } from '../../lib/format';
import { Button, EmptyState, ErrorState, ProgressBar, StatusBadge, Table, Td, Th } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { ChartTooltip, DashSkeleton, Hero, Panel, Ring, StatCard, heroBtnGhost, heroBtnSolid } from '../../components/dashboard';
import { Stagger, StaggerItem } from '../../components/motion';
import { useChartKit } from '../../components/charts';

interface QB { byType: { type: string; n: number }[]; byDifficulty: { difficulty: string; n: number }[]; bySubject: { code: string; n: number }[] }
interface D { totals: { exams: number; drafts: number; upcoming: number; pendingEvaluations: number; questions: number };
  exams: { exam_id: number; title: string; status: string; attempts_total: number; attempts_pending: number; avg_marks: number | null; pass_percentage: number | null; is_published: number }[];
  questionBank?: QB }   // questionBank is optional so the page still works against an older server

const TYPE_LABEL: Record<string, string> = { MCQ: 'Multiple choice', TRUE_FALSE: 'True / false', SHORT: 'Short answer', DESCRIPTIVE: 'Descriptive' };
const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

export default function FacultyDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<D>('/dashboard/faculty');
  const k = useChartKit();
  if (loading) return <DashSkeleton />;
  if (error || !data) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;
  const t = data.totals; const qb = data.questionBank;
  const withAttempts = data.exams.filter((e) => e.attempts_total > 0);
  const totalAttempts = withAttempts.reduce((a, e) => a + e.attempts_total, 0);
  const totalPending = withAttempts.reduce((a, e) => a + e.attempts_pending, 0);
  const evalPct = totalAttempts ? (100 * (totalAttempts - totalPending)) / totalAttempts : 0;
  const stat = [
    { label: 'Active questions', value: t.questions, icon: FileQuestion, to: '/faculty/questions' },
    { label: 'Your examinations', value: t.exams, icon: Presentation, to: '/faculty/exams' },
    { label: 'Drafts / upcoming', text: `${t.drafts} / ${t.upcoming}`, icon: Timer, to: '/faculty/exams' },
    { label: 'Answers to evaluate', value: t.pendingEvaluations, icon: ClipboardCheck, to: '/faculty/evaluation' },
  ];
  const diffColor: Record<string, string> = { EASY: k.c.ok, MEDIUM: k.c.warn, HARD: k.c.bad };

  return (
    <>
      <Hero eyebrow="Faculty" title={`Good to see you, ${user?.fullName.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '').split(' ')[0]}`} subtitle="Your examinations, the marking waiting for you, and how your question bank is shaping up."
        actions={<><Link to="/faculty/exams/new" className={heroBtnSolid}><Plus className="h-4 w-4" aria-hidden />New examination</Link><Link to="/faculty/questions" className={heroBtnGhost}><Plus className="h-4 w-4" aria-hidden />Add question</Link></>}>
        <div className="hidden items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/15 backdrop-blur md:flex">
          <Ring value={evalPct} size={92} stroke={9} sub="evaluated" onDark />
          <div><p className="text-xs text-white/70">Evaluation progress</p>
            <p className="text-lg font-semibold tnum">{totalAttempts - totalPending} <span className="text-sm font-normal text-white/70">of {totalAttempts} attempts</span></p></div>
        </div>
      </Hero>

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.06}>
        {stat.map((s) => <StaggerItem key={s.label}><StatCard {...s} /></StaggerItem>)}
      </Stagger>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Panel title="Examination overview" subtitle="Your most recent examinations" className="lg:col-span-2" flush>
          {!data.exams.length ? <EmptyState title="No examinations yet" message="Create one from your question bank." action={<Link to="/faculty/exams/new"><Button>New examination</Button></Link>} /> : (
            <Table><thead><tr><Th>Examination</Th><Th>Status</Th><Th>Attempts</Th><Th>Avg marks</Th><Th>Pass rate</Th><Th>Results</Th></tr></thead>
              <tbody>{data.exams.map((e) => (<tr key={e.exam_id}>
                <Td className="font-medium"><Link className="transition-colors hover:text-brand-600" to={`/faculty/exams/${e.exam_id}`}>{e.title}</Link></Td><Td><StatusBadge value={e.status} /></Td>
                <Td className="tnum">{e.attempts_total}</Td><Td className="tnum">{num(e.avg_marks)}</Td><Td className="tnum">{pct(e.pass_percentage)}</Td>
                <Td>{e.is_published ? <StatusBadge value="PUBLISHED" /> : <span className="text-muted">Unpublished</span>}</Td></tr>))}</tbody></Table>)}
        </Panel>

        <Panel title="Evaluation progress" subtitle="Attempts marked vs. waiting, per examination">
          {!withAttempts.length ? <EmptyState title="Nothing to evaluate" message="Progress appears once students submit." /> : (
            <ul className="space-y-4">{withAttempts.slice(0, 5).map((e) => { const done = e.attempts_total - e.attempts_pending; const p = (100 * done) / e.attempts_total; return (
              <li key={e.exam_id}><div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm"><Link to={`/faculty/exams/${e.exam_id}`} className="truncate font-medium text-ink transition-colors hover:text-brand-600">{e.title}</Link>
                <span className="shrink-0 text-xs text-muted tnum">{done}/{e.attempts_total}</span></div>
                <ProgressBar value={p} tone={e.attempts_pending ? 'accent' : 'ok'} />
                {e.attempts_pending > 0 && <p className="mt-1 text-xs text-warn">{e.attempts_pending} waiting · <Link to="/faculty/evaluation" className="font-medium underline-offset-2 hover:underline">Evaluate</Link></p>}</li>); })}</ul>)}
        </Panel>
      </div>

      {qb && (qb.byType.length > 0 ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <Panel title="Question bank by type" subtitle="Your active questions">
            <div className="h-40" role="img" aria-label="Donut chart of your questions by type">
              <ResponsiveContainer><PieChart><Tooltip content={<ChartTooltip />} />
                <Pie data={qb.byType.map((x) => ({ ...x, name: TYPE_LABEL[x.type] ?? x.type }))} dataKey="n" nameKey="name" innerRadius={42} outerRadius={66} paddingAngle={3} stroke="none" cornerRadius={5} {...k.anim}>
                  {qb.byType.map((_, i) => <Cell key={i} fill={k.c.series[i % k.c.series.length]} />)}</Pie></PieChart></ResponsiveContainer></div>
            <ul className="mt-2 space-y-1.5 text-sm">{qb.byType.map((x, i) => (<li key={x.type} className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ background: k.c.series[i % k.c.series.length] }} />{TYPE_LABEL[x.type] ?? x.type}</span><span className="font-medium tnum text-ink">{x.n}</span></li>))}</ul>
          </Panel>
          <Panel title="Difficulty mix" subtitle="Balance of easy, medium and hard">
            <div className="h-52" role="img" aria-label="Bar chart of questions per difficulty">
              <ResponsiveContainer><BarChart data={qb.byDifficulty.map((d) => ({ ...d, name: cap(d.difficulty) }))} margin={{ left: -22, right: 6, top: 8 }}>
                <XAxis dataKey="name" {...k.axis} /><YAxis allowDecimals={false} {...k.axis} /><Tooltip content={<ChartTooltip />} cursor={k.cursor} />
                <Bar dataKey="n" name="Questions" radius={[8, 8, 0, 0]} maxBarSize={44} {...k.anim}>{qb.byDifficulty.map((d) => <Cell key={d.difficulty} fill={diffColor[d.difficulty]} />)}</Bar></BarChart></ResponsiveContainer></div>
          </Panel>
          <Panel title="Top subjects" subtitle="Where most of your questions live">
            <ul className="space-y-3.5">{qb.bySubject.map((s) => (<li key={s.code}><div className="mb-1 flex justify-between text-sm"><span className="font-medium text-ink">{s.code}</span><span className="text-muted tnum">{s.n}</span></div>
              <ProgressBar value={(100 * s.n) / Math.max(...qb.bySubject.map((x) => x.n))} /></li>))}</ul>
          </Panel>
        </div>
      ) : (
        <Panel title="Question bank insights" className="mt-6"><EmptyState title="No questions yet" message="Add questions to see type and difficulty insights." action={<Link to="/faculty/questions"><Button>Open question bank</Button></Link>} /></Panel>
      ))}
    </>
  );
}
