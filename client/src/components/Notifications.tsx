import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCheck, ClipboardCheck, PlayCircle, Radio, Send, CalendarClock } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, type Role } from '../lib/auth';
import { fmtDateTime, parseUtc } from '../lib/format';
import { Popover, cn } from './ui';
import { fadeUp, stagger } from '../lib/motion';

/**
 * Notification centre. There is no notifications table: every item is DERIVED, on the client, from endpoints the app already has
 * (dashboards, student exams, published results). Nothing is invented, and nothing needs a backend change.
 * "Read" state is only a convenience, kept per user in localStorage.
 */
interface Note { id: string; title: string; body: string; to: string; icon: typeof Bell; tone: 'accent' | 'ok' | 'warn'; when?: string }

type StudentExam = { exam_id: number; title: string; status: string; scheduled_start: string; attempt_id: number | null; attempt_status: string | null; subject_code: string };
type StudentResult = { exam_id: number; exam_title: string; percentage: number; result: string };
type FacultyDash = { exams: { exam_id: number; title: string; status: string; attempts_total: number; attempts_pending: number; is_published: number }[] };
type AdminDash = { upcoming: { exam_id: number; title: string; scheduled_start: string; subject_code: string }[]; recentPublications: { published_at: string; action: string; title: string; by_name: string }[] };

async function load(role: Role): Promise<Note[]> {
  const out: Note[] = [];
  if (role === 'STUDENT') {
    const [ex, rs] = await Promise.allSettled([api<{ exams: StudentExam[] }>('/student/exams'), api<{ items: StudentResult[] }>('/results')]);
    if (ex.status === 'fulfilled') for (const e of ex.value.exams) {
      if (e.attempt_status === 'IN_PROGRESS' && e.attempt_id) out.push({ id: `resume-${e.attempt_id}`, title: 'Attempt in progress', body: `${e.title} is waiting for you. The server deadline keeps running.`, to: `/student/attempt/${e.attempt_id}`, icon: PlayCircle, tone: 'warn' });
      else if (e.status === 'LIVE' && !e.attempt_status) out.push({ id: `live-${e.exam_id}`, title: `${e.title} is live`, body: `${e.subject_code} · you can start now.`, to: '/student/exams', icon: Radio, tone: 'ok' });
      else if (e.status === 'SCHEDULED') {
        const d = parseUtc(e.scheduled_start); const h = d ? (d.getTime() - Date.now()) / 36e5 : Infinity;
        if (h > 0 && h <= 72) out.push({ id: `soon-${e.exam_id}`, title: `${e.title} opens soon`, body: `${e.subject_code} · ${fmtDateTime(e.scheduled_start)}`, to: '/student/exams', icon: CalendarClock, tone: 'accent' });
      }
    }
    if (rs.status === 'fulfilled') for (const r of rs.value.items.slice(0, 3)) out.push({ id: `res-${r.exam_id}-${r.percentage}`, title: `Result published: ${r.exam_title}`, body: `${r.percentage}% · ${r.result === 'PASS' ? 'Passed' : 'Not passed'}`, to: `/student/results/${r.exam_id}`, icon: Send, tone: 'ok' });
  } else if (role === 'FACULTY') {
    const d = await api<FacultyDash>('/dashboard/faculty').catch(() => null);
    for (const e of d?.exams ?? []) {
      if (e.attempts_pending > 0) out.push({ id: `eval-${e.exam_id}-${e.attempts_pending}`, title: `${e.attempts_pending} ${e.attempts_pending === 1 ? 'answer' : 'answers'} to evaluate`, body: e.title, to: '/faculty/evaluation', icon: ClipboardCheck, tone: 'warn' });
      if (e.status === 'LIVE') out.push({ id: `live-${e.exam_id}`, title: `${e.title} is live`, body: `${e.attempts_total} ${e.attempts_total === 1 ? 'attempt' : 'attempts'} so far`, to: `/faculty/exams/${e.exam_id}`, icon: Radio, tone: 'ok' });
      if (e.status === 'COMPLETED' && e.attempts_total > 0 && !e.is_published && e.attempts_pending === 0) out.push({ id: `pub-${e.exam_id}`, title: 'Ready to publish results', body: e.title, to: `/faculty/exams/${e.exam_id}`, icon: Send, tone: 'accent' });
    }
  } else {
    const d = await api<AdminDash>('/dashboard/admin').catch(() => null);
    for (const p of d?.recentPublications.slice(0, 3) ?? []) out.push({ id: `pub-${p.published_at}-${p.title}`, title: `${p.action === 'PUBLISH' ? 'Results published' : 'Result correction'}: ${p.title}`, body: `${p.by_name} · ${fmtDateTime(p.published_at)}`, to: '/admin/exams', icon: Send, tone: p.action === 'PUBLISH' ? 'ok' : 'warn' });
    for (const u of d?.upcoming.slice(0, 3) ?? []) out.push({ id: `up-${u.exam_id}`, title: `Upcoming: ${u.title}`, body: `${u.subject_code} · ${fmtDateTime(u.scheduled_start)}`, to: `/admin/exams/${u.exam_id}`, icon: CalendarClock, tone: 'accent' });
  }
  return out;
}

const readKey = (uid: number) => `examsphere:read:${uid}`;
const getRead = (uid: number): string[] => { try { return JSON.parse(localStorage.getItem(readKey(uid)) ?? '[]'); } catch { return []; } };
const setReadStore = (uid: number, ids: string[]) => { try { localStorage.setItem(readKey(uid), JSON.stringify(ids.slice(-200))); } catch { /* ignore */ } };

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [read, setRead] = useState<string[]>([]);
  const uid = user?.userId ?? 0; const role = user?.role;

  const refresh = useCallback(() => { if (role) load(role).then((n) => { setNotes(n); setLoaded(true); }).catch(() => setLoaded(true)); }, [role]);
  useEffect(() => { setRead(getRead(uid)); refresh(); const t = setInterval(refresh, 60_000); return () => clearInterval(t); }, [uid, refresh]);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const unread = useMemo(() => notes.filter((n) => !read.includes(n.id)), [notes, read]);
  const markAll = () => { const ids = [...new Set([...read, ...notes.map((n) => n.id)])]; setRead(ids); setReadStore(uid, ids); };
  const markOne = (id: string) => { if (read.includes(id)) return; const ids = [...read, id]; setRead(ids); setReadStore(uid, ids); };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`} aria-expanded={open} aria-haspopup="menu"
        className="relative rounded-xl p-2.5 text-muted transition-colors hover:bg-surface-3 hover:text-ink">
        <Bell className="h-[1.15rem] w-[1.15rem]" aria-hidden />
        <AnimatePresence>
          {unread.length > 0 && <motion.span key="b" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="accent-gradient absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-bold text-white ring-2 ring-surface">{unread.length}</motion.span>}
        </AnimatePresence>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[min(24rem,calc(100vw-2rem))]" label="Notifications">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold text-ink">Notifications</p>
          <button onClick={markAll} disabled={!unread.length} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 transition-opacity hover:underline disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" aria-hidden />Mark all read</button>
        </div>
        <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="max-h-96 overflow-y-auto p-1.5">
          {!loaded && <li className="px-3 py-6 text-center text-sm text-muted">Loading…</li>}
          {loaded && !notes.length && <li className="px-3 py-8 text-center text-sm text-muted">You are all caught up.</li>}
          {notes.map((n) => { const isNew = !read.includes(n.id); return (
            <motion.li key={n.id} variants={fadeUp}>
              <Link to={n.to} role="menuitem" onClick={() => { markOne(n.id); setOpen(false); }} className="flex gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-3">
                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', n.tone === 'ok' ? 'bg-ok/10 text-ok' : n.tone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-brand-500/10 text-brand-600')}><n.icon className="h-4 w-4" aria-hidden /></span>
                <span className="min-w-0 flex-1"><span className={cn('block truncate text-sm text-ink', isNew && 'font-semibold')}>{n.title}</span><span className="block truncate text-xs text-muted">{n.body}</span></span>
                {isNew && <span className="accent-gradient mt-2 h-2 w-2 shrink-0 rounded-full" aria-label="Unread" />}
              </Link>
            </motion.li>); })}
        </motion.ul>
      </Popover>
    </div>
  );
}
