import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, GraduationCap, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { homeFor, useAuth, type Role } from '../lib/auth';
import { Brand } from '../components/Logo';
import { Button, Input, cn } from '../components/ui';
import { Stagger, StaggerItem } from '../components/motion';
import { ease } from '../lib/motion';

// Demo accounts of the seeded database (usernames are listed in the README).
// The password is pre-filled ONLY by the Vite dev server (import.meta.env.DEV is replaced by `false` in a production build,
// so the string below is removed from the shipped bundle). In production the user types it; see the README.
const DEMO: { role: Role; title: string; blurb: string; username: string; icon: LucideIcon; devPassword: string }[] = [
  { role: 'ADMIN', title: 'Administrator', blurb: 'Analytics, people, oversight', username: 'admin', icon: ShieldCheck, devPassword: 'Admin@123' },
  { role: 'FACULTY', title: 'Faculty', blurb: 'Question bank, evaluation, results', username: 'meera.iyer', icon: Users, devPassword: 'Faculty@123' },
  { role: 'STUDENT', title: 'Student', blurb: 'Take exams, track progress', username: 'aarav.sharma', icon: GraduationCap, devPassword: 'Student@123' },
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [picked, setPicked] = useState<Role | null>(null);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const pick = (d: (typeof DEMO)[number]) => {
    setPicked(d.role); setIdentifier(d.username); setPassword(import.meta.env.DEV ? d.devPassword : ''); setErrors({}); setFormError('');
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    // client-side validation is only for convenience; the server validates again
    const next: typeof errors = {};
    if (!identifier.trim()) next.identifier = 'Enter your email or username';
    if (!password) next.password = 'Enter your password';
    setErrors(next); setFormError('');
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const u = await login(identifier.trim(), password);
      // the destination is chosen from the role the SERVER returned
      nav(from && from.startsWith(homeFor(u.role)) ? from : homeFor(u.role), { replace: true });
    } catch (err) {
      setFormError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }} className="mx-auto w-full max-w-sm">
          <Link to="/" aria-label="ExamSphere home"><Brand /></Link>
          <h1 className="mt-10 text-3xl font-semibold text-ink">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted">Sign in with your institution account to continue.</p>
          <form onSubmit={submit} noValidate className="mt-7 space-y-4">
            <AnimatePresence>
              {formError && <motion.div role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{formError}</div></motion.div>}
            </AnimatePresence>
            <Input label="Email or username" autoComplete="username" value={identifier} onChange={(e) => { setIdentifier(e.target.value); setPicked(null); }} error={errors.identifier} autoFocus />
            <div className="relative">
              <Input label="Password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} className="pr-11" />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
                className="absolute right-2.5 top-[2.15rem] rounded-lg p-1 text-muted transition-colors hover:text-ink">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            <Button type="submit" size="lg" loading={busy} className="w-full">Sign in<ArrowRight className="h-4 w-4" aria-hidden /></Button>
          </form>
          <p className="mt-7 flex items-start gap-2 text-xs text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Sessions are validated on the server for every request.</p>
        </motion.div>
      </div>

      <aside className="relative hidden overflow-hidden bg-navy-950 p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(40rem 26rem at 90% 0%, rgba(139,92,246,.35), transparent 60%), radial-gradient(36rem 24rem at 0% 100%, rgba(99,102,241,.3), transparent 60%)' }} aria-hidden />
        <div className="bg-dots absolute inset-0 [mask-image:linear-gradient(to_bottom_left,black,transparent_75%)]" aria-hidden />
        <div className="relative mx-auto w-full max-w-md">
          <p className="text-sm font-medium text-indigo-200">Assess Smarter. Perform Better.</p>
          <h2 className="mt-3 font-display text-4xl leading-tight">One place for exams, <span className="italic text-violet-300">evaluation</span> and results.</h2>

          <div className="mt-9">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Demo accounts · seeded database</p>
            <Stagger className="mt-3 space-y-2.5" gap={0.08} delay={0.2}>
              {DEMO.map((d) => { const on = picked === d.role; return (
                <StaggerItem key={d.role}>
                  <button type="button" data-role={d.role} onClick={() => pick(d)} aria-pressed={on}
                    className={cn('group flex w-full items-center gap-4 rounded-2xl p-3.5 text-left ring-1 ring-inset transition-all duration-200 hover:-translate-y-0.5',
                      on ? 'bg-white/15 ring-white/40' : 'bg-white/[0.05] ring-white/10 hover:bg-white/10')}>
                    <span className="accent-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-glow"><d.icon className="h-5 w-5" aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{d.title}</span><span className="block text-xs text-slate-400">{d.blurb}</span></span>
                    <span className="text-right"><span className="block font-mono text-xs text-slate-300">{d.username}</span>
                      <span className="mt-0.5 block text-[0.7rem] font-medium text-violet-300">{on ? 'Filled in ✓' : 'Use account'}</span></span>
                  </button>
                </StaggerItem>); })}
            </Stagger>
            <p className="mt-4 text-xs leading-relaxed text-slate-400">{import.meta.env.DEV ? 'Development mode: choosing an account fills in the demo password too.' : 'Choosing an account fills in the username. Demo passwords are listed in the README.'}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
