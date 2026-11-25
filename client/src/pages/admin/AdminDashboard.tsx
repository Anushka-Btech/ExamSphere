import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BookOpen, ClipboardList, GraduationCap, Plus, Presentation, Send, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { Badge, EmptyState, ErrorState } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { ChartTooltip, DashSkeleton, Hero, Panel, Ring, StatCard, Timeline, heroBtnGhost, heroBtnSolid } from '../../components/dashboard';
import { Stagger, StaggerItem } from '../../components/motion';
import { useChartKit } from '../../components/charts';

interface D { totals: { students: number; faculty: number; subjects: number; exams: number; published_exams: number; attempts: number };
  enrollment: { month: string; students: number }[]; byDepartment: { code: string; students: number }[]; activity: { status: string; exams: number; attempts: number }[];
  subjectPerformance: { code: string; name: string; avg_percentage: number; pass_percentage: number; attempts: number }[];
  recentActivity: { action: string; entity_type: string; created_at: string; actor: string | null }[];
  upcoming: { exam_id: number; title: string; scheduled_start: string; subject_code: string }[]; recentPublications: { published_at: string; action: string; title: string; by_name: string }[] }

const label = (a: string) => a.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<D>('/dashboard/admin');
  const k = useChartKit();
  if (loading) return <DashSkeleton cards={6} />;
  if (error || !data) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;
  const t = data.totals;
  const publishedPct = t.exams ? (100 * t.published_exams) / t.exams : 0;
  const cards = [
    { label: 'Students', value: t.students, icon: GraduationCap, to: '/admin/students' }, { label: 'Faculty', value: t.faculty, icon: Users, to: '/admin/faculty' },
    { label: 'Subjects', value: t.subjects, icon: BookOpen, to: '/admin/subjects' }, { label: 'Examinations', value: t.exams, icon: Presentation, to: '/admin/exams' },
    { label: 'Results published', value: t.published_exams, icon: Send, to: '/admin/exams' }, { label: 'Attempts', value: t.attempts, icon: ClipboardList, to: '/admin/analytics' },
  ];
  const timeline = data.recentActivity.map((a, i) => ({ key: i, title: label(a.action), meta: `${label(a.entity_type)} · ${a.actor ?? 'System'} · ${fmtDateTime(a.created_at)}` }));

  return (
    <>
      <Hero eyebrow="Administration" title={`Welcome back, ${user?.fullName.split(' ')[0]}`} subtitle="Live figures straight from the database: every number on this page is a SQL aggregate."
        actions={<><Link to="/admin/students?new=1" className={heroBtnSolid}><UserPlus className="h-4 w-4" aria-hidden />Add student</Link><Link to="/admin/subjects?new=1" className={heroBtnGhost}><Plus className="h-4 w-4" aria-hidden />Add subject</Link></>}>
        <div className="hidden items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/15 backdrop-blur md:flex">
          <Ring value={publishedPct} size={92} stroke={9} sub="published" onDark />
          <div><p className="text-xs text-white/70">Examinations with published results</p><p className="text-lg font-semibold tnum">{t.published_exams} <span className="text-sm font-normal text-white/70">of {t.exams}</span></p></div>
        </div>
      </Hero>

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" gap={0.05}>
        {cards.map((c) => <StaggerItem key={c.label}><StatCard {...c} /></StaggerItem>)}
      </Stagger>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Panel title="Student enrollment" subtitle="Students by enrollment month" className="lg:col-span-2">
          {!data.enrollment.length ? <EmptyState title="No students yet" /> : (
            <div className="h-64" role="img" aria-label="Area chart of students enrolled per month">
              <ResponsiveContainer><AreaChart data={data.enrollment} margin={{ left: -18, right: 6, top: 8 }}>
                <defs><linearGradient id="enrollFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={k.c.primary} stopOpacity={0.35} /><stop offset="100%" stopColor={k.c.primary} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid {...k.grid} /><XAxis dataKey="month" {...k.axis} /><YAxis allowDecimals={false} {...k.axis} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: k.c.neutral, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="students" name="Students" stroke={k.c.primary} strokeWidth={2.5} fill="url(#enrollFill)" activeDot={{ r: 5 }} {...k.anim} />
              </AreaChart></ResponsiveContainer></div>)}
        </Panel>
        <Panel title="By department" subtitle="Where students are enrolled">
          {!data.byDepartment.some((d) => d.students) ? <EmptyState title="No data" /> : (<>
            <div className="h-44" role="img" aria-label="Donut chart of students per department">
              <ResponsiveContainer><PieChart><Tooltip content={<ChartTooltip />} />
                <Pie data={data.byDepartment} dataKey="students" nameKey="code" innerRadius={48} outerRadius={72} paddingAngle={3} stroke="none" cornerRadius={5} {...k.anim}>
                  {data.byDepartment.map((_, i) => <Cell key={i} fill={k.c.series[i % k.c.series.length]} />)}</Pie></PieChart></ResponsiveContainer></div>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">{data.byDepartment.map((d, i) => (
              <li key={d.code} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ background: k.c.series[i % k.c.series.length] }} />{d.code}</span><span className="font-medium tnum text-ink">{d.students}</span></li>))}</ul></>)}
        </Panel>

        <Panel title="Examination activity" subtitle="Examinations and submitted attempts by status">
          {!data.activity.length ? <EmptyState title="No examinations yet" /> : (
            <div className="h-64" role="img" aria-label="Bar chart of examinations and attempts per status">
              <ResponsiveContainer><BarChart data={data.activity.map((a) => ({ ...a, status: label(a.status) }))} margin={{ left: -18, right: 6, top: 8 }}>
                <CartesianGrid {...k.grid} /><XAxis dataKey="status" {...k.axis} /><YAxis allowDecimals={false} {...k.axis} /><Tooltip content={<ChartTooltip />} cursor={k.cursor} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: k.c.axis }} />
                <Bar dataKey="exams" name="Examinations" fill={k.c.primary} radius={[6, 6, 0, 0]} maxBarSize={28} {...k.anim} /><Bar dataKey="attempts" name="Attempts" fill={k.c.secondary} radius={[6, 6, 0, 0]} maxBarSize={28} {...k.anim} />
              </BarChart></ResponsiveContainer></div>)}
        </Panel>
        <Panel title="Subject-wise performance" subtitle="Published results only" className="lg:col-span-2">
          {!data.subjectPerformance.length ? <EmptyState title="No published results yet" message="Publish an examination's results to see subject performance." /> : (
            <div className="h-64" role="img" aria-label="Bar chart of average percentage and pass percentage per subject">
              <ResponsiveContainer><BarChart data={data.subjectPerformance} margin={{ left: -14, right: 6, top: 8 }}>
                <CartesianGrid {...k.grid} /><XAxis dataKey="code" {...k.axis} /><YAxis domain={[0, 100]} unit="%" {...k.axis} />
                <Tooltip content={<ChartTooltip unit="%" labelFormatter={(c) => data.subjectPerformance.find((s) => s.code === c)?.name ?? c} />} cursor={k.cursor} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: k.c.axis }} />
                <Bar dataKey="avg_percentage" name="Average %" fill={k.c.primary} radius={[6, 6, 0, 0]} maxBarSize={28} {...k.anim} /><Bar dataKey="pass_percentage" name="Pass %" fill={k.c.ok} radius={[6, 6, 0, 0]} maxBarSize={28} {...k.anim} />
              </BarChart></ResponsiveContainer></div>)}
        </Panel>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Panel title="Activity timeline" subtitle="Latest audit-log entries" className="lg:col-span-2">
          {!timeline.length ? <EmptyState title="No activity" /> : <Timeline items={timeline} />}
        </Panel>
        <div className="space-y-5">
          <Panel title="Upcoming examinations">
            {!data.upcoming.length ? <EmptyState title="Nothing scheduled" /> : <ul className="divide-y divide-line">{data.upcoming.map((e) => (
              <li key={e.exam_id} className="py-2.5 text-sm"><Link className="font-medium text-ink transition-colors hover:text-brand-600" to={`/admin/exams/${e.exam_id}`}>{e.title}</Link><p className="text-xs text-muted">{e.subject_code} · {fmtDateTime(e.scheduled_start)}</p></li>))}</ul>}
          </Panel>
          <Panel title="Recent result publications">
            {!data.recentPublications.length ? <EmptyState title="None yet" /> : <ul className="divide-y divide-line">{data.recentPublications.map((p, i) => (
              <li key={i} className="py-2.5 text-sm"><p className="font-medium text-ink">{p.title}</p><p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted"><Badge tone={p.action === 'PUBLISH' ? 'green' : 'amber'}>{p.action === 'PUBLISH' ? 'Published' : 'Correction'}</Badge>{fmtDateTime(p.published_at)} · {p.by_name}</p></li>))}</ul>}
          </Panel>
        </div>
      </div>
    </>
  );
}
