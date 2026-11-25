import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CalendarClock, Hourglass, Medal, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { fmtDateTime, num, pct } from '../../lib/format';
import { EmptyState, ErrorState, StatusBadge } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { ChartTooltip, DashSkeleton, Hero, Panel, Ring, StatCard, heroBtnGhost, heroBtnSolid } from '../../components/dashboard';
import { Stagger, StaggerItem } from '../../components/motion';
import { useChartKit } from '../../components/charts';

interface D { upcoming: { exam_id: number; title: string; status: string; scheduled_start: string; subject_code: string; attempt_id: number | null; attempt_status: string | null }[];
  trend: { exam_title: string; percentage: number; result: string }[]; awaitingResults: number }
interface R { items: { exam_id: number; exam_title: string; subject_name: string; total_marks: number; max_marks: number; percentage: number; result: string; rank_in_exam: number; participants: number }[] }

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<D>('/dashboard/student');
  const results = useFetch<R>('/results');
  const k = useChartKit();
  if (loading) return <DashSkeleton />;
  if (error || !data) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;

  // Everything below is computed from the student's own published results (no placeholder figures).
  const p = data.trend.map((x) => Number(x.percentage));
  const avg = p.length ? p.reduce((a, b) => a + b, 0) / p.length : null;
  const best = p.length ? Math.max(...p) : null;
  const passed = data.trend.filter((x) => x.result === 'PASS').length;
  const delta = p.length >= 2 ? p[p.length - 1] - p[p.length - 2] : null;
  const next = data.upcoming[0];
  const live = data.upcoming.find((e) => e.status === 'LIVE' && !e.attempt_status);

  return (
    <>
      <Hero eyebrow="Student" title={`Welcome, ${user?.fullName.split(' ')[0]}`} subtitle={live ? `${live.title} is live right now.` : next ? `Up next: ${next.title} on ${fmtDateTime(next.scheduled_start)}.` : 'No examinations are scheduled at the moment.'}
        actions={<><Link to="/student/exams" className={heroBtnSolid}>{live ? 'Start your exam' : 'My examinations'}<ArrowRight className="h-4 w-4" aria-hidden /></Link><Link to="/student/results" className={heroBtnGhost}>View results</Link></>}>
        {avg !== null && (
          <div className="hidden items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/15 backdrop-blur md:flex">
            <Ring value={avg} size={92} stroke={9} sub="average" onDark />
            <div><p className="text-xs text-white/70">Across {p.length} published {p.length === 1 ? 'result' : 'results'}</p><p className="text-lg font-semibold tnum">{passed} <span className="text-sm font-normal text-white/70">of {p.length} passed</span></p></div>
          </div>)}
      </Hero>

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.06}>
        <StaggerItem><StatCard label="Average score" icon={Target} {...(avg === null ? { text: '-' } : { value: avg, decimals: 1, suffix: '%' })} /></StaggerItem>
        <StaggerItem><StatCard label="Best score" icon={Medal} {...(best === null ? { text: '-' } : { value: best, decimals: 1, suffix: '%' })} /></StaggerItem>
        <StaggerItem><StatCard label="Exams passed" icon={TrendingUp} text={p.length ? `${passed} / ${p.length}` : '-'} to="/student/results" /></StaggerItem>
        <StaggerItem><StatCard label="Awaiting publication" icon={Hourglass} value={data.awaitingResults} hint="Submitted, not yet published" /></StaggerItem>
      </Stagger>

      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <Panel title="Academic performance" subtitle="Your percentage in each published examination" className="lg:col-span-3"
          action={delta !== null && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${delta >= 0 ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad'}`}>
            {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}{delta >= 0 ? '+' : ''}{num(delta, 1)} pts vs previous</span>}>
          {!data.trend.length ? <EmptyState title="No published results yet" message="Your progress chart appears after your first result is published." /> : (
            <div className="h-64" role="img" aria-label="Area chart of your percentage in each published examination">
              <ResponsiveContainer><AreaChart data={data.trend} margin={{ left: -16, right: 10, top: 10 }}>
                <defs><linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={k.c.secondary} stopOpacity={0.38} /><stop offset="100%" stopColor={k.c.secondary} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid {...k.grid} />
                <XAxis dataKey="exam_title" {...k.axis} tick={{ fontSize: 11, fill: k.c.axis }} tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 12) + '…' : v)} /><YAxis domain={[0, 100]} unit="%" {...k.axis} />
                {avg !== null && <ReferenceLine y={avg} stroke={k.c.neutral} strokeDasharray="4 4" label={{ value: 'avg', position: 'right', fill: k.c.axis, fontSize: 11 }} />}
                <Tooltip content={<ChartTooltip unit="%" />} cursor={{ stroke: k.c.neutral, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="percentage" name="Score" stroke={k.c.secondary} strokeWidth={2.5} fill="url(#perfFill)" dot={{ r: 4, fill: k.c.secondary, strokeWidth: 0 }} activeDot={{ r: 6 }} {...k.anim} />
              </AreaChart></ResponsiveContainer></div>)}
        </Panel>

        <Panel title="Upcoming examinations" className="lg:col-span-2" action={<CalendarClock className="h-5 w-5 text-accent" aria-hidden />}>
          {!data.upcoming.length ? <EmptyState title="Nothing scheduled" /> : (
            <ul className="space-y-2.5">{data.upcoming.map((e) => (
              <li key={e.exam_id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3 transition-colors hover:border-line-strong">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-ink">{e.title}</p><p className="text-xs text-muted">{e.subject_code} · {fmtDateTime(e.scheduled_start)}</p></div>
                <StatusBadge value={e.attempt_status ?? e.status} /></li>))}</ul>)}
          <Link to="/student/exams" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">All examinations <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
        </Panel>
      </div>

      <Panel title="Results overview" subtitle="Your latest published results" className="mt-6"
        action={<Link to="/student/results" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>}>
        {results.loading ? <p className="py-6 text-center text-sm text-muted">Loading…</p> : !results.data?.items.length ? <EmptyState title="No published results" message="Results appear after your faculty evaluates and publishes them." /> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{results.data.items.slice(0, 6).map((r) => (
            <li key={r.exam_id}><Link to={`/student/results/${r.exam_id}`} className="group flex items-center gap-4 rounded-2xl border border-line bg-surface-2 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card">
              <Ring value={Number(r.percentage)} size={56} stroke={6} label={<span className="text-xs font-semibold tnum text-ink">{Math.round(Number(r.percentage))}</span>} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{r.exam_title}</p><p className="truncate text-xs text-muted">{num(r.total_marks)} / {num(r.max_marks)} · {pct(r.percentage)}</p>
                <p className="text-xs text-muted">Rank {r.rank_in_exam} of {r.participants}</p></div>
              <StatusBadge value={r.result} /></Link></li>))}</ul>)}
      </Panel>
    </>
  );
}
