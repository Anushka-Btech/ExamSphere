import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BarChart3, CheckCircle2, ClipboardCheck, Database, FileQuestion, Flag, GraduationCap, Lock, Moon, PenLine, Presentation, Send, ShieldCheck, Sun, Users } from 'lucide-react';
import { Brand } from '../components/Logo';
import { AnimatedNumber, Reveal } from '../components/motion';
import { cn } from '../components/ui';
import { useTheme } from '../lib/theme';
import { ease } from '../lib/motion';

const features = [
  { icon: Presentation, title: 'Intelligent Exam Management', text: 'Draft, schedule, cancel and complete examinations through enforced state transitions, with marks validated before scheduling.' },
  { icon: FileQuestion, title: 'Structured Question Bank', text: 'MCQ, true/false, short and descriptive questions, with options stored as proper rows rather than packed text.' },
  { icon: ClipboardCheck, title: 'Transparent Evaluation', text: 'Objective answers are graded by the server; written answers wait for faculty and are never counted as a final score.' },
  { icon: BarChart3, title: 'Instant Result Analytics', text: 'Pass rates, distributions and question-level correctness, computed with SQL over published results.' },
  { icon: Lock, title: 'Secure Role-Based Access', text: 'Admin, faculty and student permissions are checked on the server for every request, never trusted from the browser.' },
  { icon: Database, title: 'Reliable Database Management', text: 'A normalised MySQL schema with foreign keys, constraints, views and transactions for every critical change.' },
];
const roles = [
  { role: 'ADMIN', icon: ShieldCheck, name: 'Administrators', text: 'Oversee the institution: people, subjects, every examination, analytics and the audit trail.', points: ['Live analytics and activity timeline', 'Student, faculty and subject management', 'Read-only examination oversight'] },
  { role: 'FACULTY', icon: Users, name: 'Faculty', text: 'Build the paper, run the evaluation and publish results with a full correction history.', points: ['Question bank with four question types', 'Evaluation queue for written answers', 'Audited result publication and corrections'] },
  { role: 'STUDENT', icon: GraduationCap, name: 'Students', text: 'Sit timed examinations with autosave, then track results, rank and progress.', points: ['Distraction-free examination screen', 'Autosave with server-enforced deadline', 'Published results with answer review'] },
];
const steps = [
  { icon: Presentation, title: 'Create Exam', text: 'Faculty pick questions from the bank and schedule the window.' },
  { icon: PenLine, title: 'Attempt Exam', text: 'Students answer with autosave; the server enforces the deadline.' },
  { icon: ClipboardCheck, title: 'Evaluate', text: 'Objective marks are automatic; faculty mark written answers.' },
  { icon: Send, title: 'Publish Results', text: 'Results become visible only after an audited publication.' },
];
const tech = [
  ['Frontend', ['React 18', 'Vite', 'TypeScript', 'Tailwind CSS', 'Framer Motion', 'Recharts']],
  ['Backend', ['Node.js', 'Express', 'Zod validation', 'Central error handling']],
  ['Database', ['MySQL 8', 'InnoDB', 'Parameterised queries', 'Transactions', 'Views']],
  ['Security', ['bcrypt hashing', 'Server-side sessions', 'Role-based authorisation', 'Audit logs']],
] as const;
// Real facts about this project's schema (see README / database/01_schema.sql), not marketing numbers.
const facts = [{ n: 15, l: 'normalised tables' }, { n: 24, l: 'foreign keys' }, { n: 5, l: 'SQL views' }, { n: 26, l: 'documented SQL demos' }];

/** Illustrative mock of the product (layout only: it shows no real statistics). */
function DashboardPreview() {
  const bars = [38, 62, 48, 80, 58, 92, 70];
  return (
    <div className="relative mx-auto w-full max-w-xl" role="img" aria-label="Illustration of the ExamSphere dashboard with an examination question card floating above it">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-indigo-500/30 via-violet-500/20 to-transparent blur-2xl" aria-hidden />
      <motion.div initial={{ opacity: 0, y: 24, rotateX: 8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.8, ease, delay: 0.15 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-navy-800/90 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3"><span className="h-2.5 w-2.5 rounded-full bg-white/20" /><span className="h-2.5 w-2.5 rounded-full bg-white/20" /><span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="ml-3 h-2 w-28 rounded-full bg-white/10" /></div>
        <div className="grid grid-cols-[3.2rem_1fr]">
          <div className="space-y-2.5 border-r border-white/10 p-3">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={cn('block h-6 w-6 rounded-lg', i === 0 ? 'bg-gradient-to-br from-indigo-500 to-violet-500' : 'bg-white/10')} />)}</div>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.1 }} className="rounded-xl bg-white/[0.06] p-3 ring-1 ring-inset ring-white/10">
                <span className="block h-5 w-5 rounded-md bg-gradient-to-br from-indigo-400 to-violet-400" /><span className="mt-3 block h-3 w-10 rounded-full bg-white/70" /><span className="mt-2 block h-2 w-14 rounded-full bg-white/20" /></motion.div>))}</div>
            <div className="rounded-xl bg-white/[0.06] p-4 ring-1 ring-inset ring-white/10">
              <div className="mb-3 flex items-center justify-between"><span className="h-2.5 w-24 rounded-full bg-white/40" /><span className="h-2 w-10 rounded-full bg-white/15" /></div>
              <div className="flex h-24 items-end gap-2.5">{bars.map((h, i) => (
                <motion.span key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ duration: 0.8, ease, delay: 0.7 + i * 0.07 }} className="flex-1 rounded-t-md bg-gradient-to-t from-indigo-500 to-violet-400" />))}</div>
            </div>
            <div className="space-y-2">{[78, 56].map((w, i) => <div key={i} className="flex items-center gap-3"><span className="h-6 w-6 rounded-full bg-white/10" /><span className="h-2 rounded-full bg-white/15" style={{ width: `${w}%` }} /></div>)}</div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 30, x: 10 }} animate={{ opacity: 1, y: 0, x: 0 }} transition={{ duration: 0.8, ease, delay: 0.9 }} className="absolute -bottom-10 -right-2 w-[17.5rem] sm:-right-8">
        <div className="animate-float rounded-2xl border border-line bg-surface p-4 text-ink shadow-pop">
          <div className="flex items-center justify-between">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">Question 3 · MCQ</p>
            <span className="relative inline-flex h-7 w-7 items-center justify-center" aria-hidden>
              <svg viewBox="0 0 28 28" className="-rotate-90"><circle cx="14" cy="14" r="11" fill="none" strokeWidth="3" style={{ stroke: 'rgb(var(--surface-3))' }} />
                <motion.circle cx="14" cy="14" r="11" fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray="69.1" initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: 52 }} transition={{ duration: 14, ease: 'linear', repeat: Infinity, repeatType: 'reverse' }} style={{ stroke: 'rgb(var(--brand-500))' }} /></svg>
            </span>
          </div>
          <p className="mt-2 text-[0.8rem] font-medium leading-snug">Which isolation level prevents dirty reads but allows non-repeatable reads?</p>
          <ul className="mt-3 space-y-1.5">{['Read uncommitted', 'Read committed', 'Serializable'].map((o, i) => (
            <li key={o} className={cn('flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-xs', i === 1 ? 'border-brand-500 bg-brand-500/10' : 'border-line')}>
              <span className={cn('flex h-4 w-4 items-center justify-center rounded text-[0.55rem] font-bold', i === 1 ? 'bg-brand-600 text-white' : 'bg-surface-3 text-muted')}>{'ABC'[i]}</span>{o}</li>))}</ul>
          <div className="mt-3 flex items-center justify-between text-[0.7rem] text-muted"><span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Saved</span><span className="inline-flex items-center gap-1"><Flag className="h-3.5 w-3.5" aria-hidden />Review</span></div>
        </div>
      </motion.div>
    </div>
  );
}

export default function Landing() {
  const { resolved, toggleTheme } = useTheme();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="ExamSphere home"><Brand onDark /></Link>
          <nav aria-label="Primary" className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            {[['#roles', 'Roles'], ['#features', 'Features'], ['#workflow', 'Workflow'], ['#technology', 'Technology']].map(([h, l]) => <a key={h} className="transition-colors hover:text-white" href={h}>{l}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="rounded-xl p-2.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white">
              {resolved === 'dark' ? <Sun className="h-[1.1rem] w-[1.1rem]" /> : <Moon className="h-[1.1rem] w-[1.1rem]" />}</button>
            <Link to="/login" className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-navy-900 transition-all hover:-translate-y-px hover:shadow-lg active:scale-[0.97]">Sign in</Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- hero */}
        <section className="relative overflow-hidden bg-navy-950 text-white">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(60rem 30rem at 15% -10%, rgba(99,102,241,.35), transparent 60%), radial-gradient(50rem 30rem at 95% 10%, rgba(139,92,246,.28), transparent 55%)' }} aria-hidden />
          <div className="bg-dots absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-4 pb-28 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-32 lg:pt-24">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-indigo-200 ring-1 ring-inset ring-white/15"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" />The Complete Examination Management Ecosystem</span>
              <h1 className="mt-6 text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">Examinations,<br /><span className="font-display text-[1.08em] font-normal italic text-transparent bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text">simplified.</span></h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">ExamSphere runs the whole examination cycle in one system: question banks, scheduling, timed attempts, evaluation and audited results, backed by a relational database you can query and explain.</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/login" className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.97]">Explore Platform <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></Link>
                <Link to="/login" className="inline-flex items-center rounded-xl bg-white/10 px-6 py-3.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 transition-all hover:bg-white/15 active:scale-[0.97]">View Demo</Link>
              </div>
              <p className="mt-4 text-xs text-slate-400">The demo opens the sign-in page, where each role has a ready-made demo account.</p>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
                {['Admin, Faculty and Student roles', 'Server-enforced deadlines', 'Audited result publication'].map((t) => <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-violet-300" aria-hidden />{t}</li>)}</ul>
            </motion.div>
            <DashboardPreview />
          </div>
        </section>

        {/* ---------- roles */}
        <section id="roles" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <Reveal><p className="text-sm font-semibold text-brand-600">One platform, three workspaces</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold text-ink sm:text-4xl">Built for everyone in the examination cycle</h2></Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {roles.map((r, i) => (
              <Reveal key={r.role} delay={i * 0.08}>
                <div data-role={r.role} className="group relative h-full overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-pop">
                  <div className="accent-gradient absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-30" aria-hidden />
                  <span className="accent-gradient relative inline-flex rounded-2xl p-3 text-white shadow-glow"><r.icon className="h-6 w-6" aria-hidden /></span>
                  <h3 className="relative mt-5 text-xl font-semibold text-ink">{r.name}</h3><p className="relative mt-2 text-sm leading-relaxed text-muted">{r.text}</p>
                  <ul className="relative mt-5 space-y-2.5 border-t border-line pt-5 text-sm text-ink">{r.points.map((p) => <li key={p} className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{p}</li>)}</ul>
                </div>
              </Reveal>))}
          </div>
        </section>

        {/* ---------- features */}
        <section id="features" className="border-y border-line bg-surface-2 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal><p className="text-sm font-semibold text-brand-600">Capabilities</p><h2 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">Everything an examination needs</h2>
              <p className="mt-3 max-w-2xl text-muted">Each capability maps to real tables, constraints and queries, not placeholders.</p></Reveal>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 0.07}>
                  <div className="group relative h-full overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-pop">
                    <span className="inline-flex rounded-xl bg-brand-500/10 p-3 text-brand-600 ring-1 ring-inset ring-brand-500/15 transition-all duration-300 group-hover:bg-primary group-hover:text-white group-hover:shadow-glow"><f.icon className="h-5 w-5" aria-hidden /></span>
                    <h3 className="mt-5 font-semibold text-ink">{f.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
                  </div>
                </Reveal>))}
            </div>
          </div>
        </section>

        {/* ---------- workflow */}
        <section id="workflow" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <Reveal><p className="text-sm font-semibold text-brand-600">Workflow</p><h2 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">From question to result in four steps</h2></Reveal>
          <ol className="relative mt-14 grid gap-8 md:grid-cols-4">
            <motion.span aria-hidden initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, ease, delay: 0.2 }} style={{ transformOrigin: 'left' }}
              className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-gradient-to-r from-indigo-500/60 via-violet-500/60 to-indigo-500/60 md:block" />
            {steps.map((s, i) => (
              <motion.li key={s.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.45, ease, delay: i * 0.1 }} className="relative text-center">
                <span className="accent-gradient relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-glow ring-8 ring-canvas"><s.icon className="h-6 w-6" aria-hidden /></span>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Step {i + 1}</p>
                <h3 className="mt-1 font-semibold text-ink">{s.title}</h3><p className="mx-auto mt-2 max-w-[14rem] text-sm leading-relaxed text-muted">{s.text}</p>
              </motion.li>))}
          </ol>
        </section>

        {/* ---------- technology */}
        <section id="technology" className="relative overflow-hidden bg-navy-950 py-24 text-white">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(40rem 20rem at 85% 0%, rgba(99,102,241,.25), transparent 60%)' }} aria-hidden />
          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal><p className="text-sm font-semibold text-indigo-300">Technology</p><h2 className="mt-2 text-3xl font-semibold sm:text-4xl">A DBMS project with a real engine underneath</h2></Reveal>
            <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 lg:grid-cols-4">
              {facts.map((f) => <div key={f.l} className="bg-navy-900 p-6"><dt className="sr-only">{f.l}</dt><dd><p className="text-4xl font-semibold tnum text-white"><AnimatedNumber value={f.n} /></p><p className="mt-1 text-sm text-slate-400">{f.l}</p></dd></div>)}
            </dl>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {tech.map(([k, items], i) => (
                <Reveal key={k} delay={(i % 2) * 0.08}>
                  <div className="h-full rounded-2xl bg-white/[0.04] p-6 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.07]">
                    <h3 className="text-sm font-semibold text-indigo-200">{k}</h3>
                    <ul className="mt-4 flex flex-wrap gap-2">{items.map((t) => <li key={t} className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 ring-1 ring-inset ring-white/10">{t}</li>)}</ul>
                  </div>
                </Reveal>))}
            </div>
          </div>
        </section>

        {/* ---------- closing call to action */}
        <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-navy-900 px-6 py-14 text-center text-white sm:px-12">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/50 via-violet-600/30 to-transparent" aria-hidden /><div className="bg-dots absolute inset-0 opacity-60" aria-hidden />
              <div className="relative"><h2 className="text-3xl font-semibold sm:text-4xl">See the whole cycle, end to end.</h2>
                <p className="mx-auto mt-3 max-w-xl text-slate-300">Sign in as an administrator, faculty member or student and walk through a real, seeded examination.</p>
                <Link to="/login" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-navy-900 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.97]">Open the demo <ArrowRight className="h-4 w-4" aria-hidden /></Link></div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted sm:flex-row sm:px-6">
          <Brand /><p>An academic DBMS project. All data in the demo is fictional.</p>
          <Link to="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
