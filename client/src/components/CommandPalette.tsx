import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, CornerDownLeft, FileQuestion, GraduationCap, Presentation, Search, Trophy, Users, type LucideIcon } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { NAV } from './nav';
import { cn } from './ui';
import { spring } from '../lib/motion';

/**
 * Global search (Ctrl/Cmd+K or "/"). "Pages" are instant; records come from the SAME list endpoints the pages use,
 * so each role only ever finds what the server already lets it see (admin: students, faculty, subjects; faculty: questions; student: own exams/results).
 */
interface Hit { key: string; group: string; label: string; sub?: string; to: string; icon: LucideIcon }

async function search(role: 'ADMIN' | 'FACULTY' | 'STUDENT', q: string): Promise<Hit[]> {
  const out: Hit[] = [];
  const base = role === 'ADMIN' ? '/admin' : role === 'FACULTY' ? '/faculty' : '/student';
  if (role === 'STUDENT') {
    const [ex, rs] = await Promise.allSettled([api<{ exams: { exam_id: number; title: string; subject_code: string; subject_name: string }[] }>('/student/exams'),
      api<{ items: { exam_id: number; exam_title: string; subject_name: string; percentage: number }[] }>('/results')]);
    const m = (s: string) => s.toLowerCase().includes(q.toLowerCase());
    if (ex.status === 'fulfilled') ex.value.exams.filter((e) => m(e.title) || m(e.subject_code) || m(e.subject_name)).slice(0, 5)
      .forEach((e) => out.push({ key: `e${e.exam_id}`, group: 'Examinations', label: e.title, sub: e.subject_code, to: '/student/exams', icon: FileQuestion }));
    if (rs.status === 'fulfilled') rs.value.items.filter((r) => m(r.exam_title) || m(r.subject_name)).slice(0, 5)
      .forEach((r) => out.push({ key: `r${r.exam_id}`, group: 'Results', label: r.exam_title, sub: `${r.percentage}%`, to: `/student/results/${r.exam_id}`, icon: Trophy }));
    return out;
  }
  const enc = encodeURIComponent(q);
  const jobs: Promise<unknown>[] = [
    api<{ items: { exam_id: number; title: string; subject_code: string; status: string }[] }>(`/exams${qs({ search: q, pageSize: 5 })}`)
      .then((r) => r.items.forEach((e) => out.push({ key: `x${e.exam_id}`, group: 'Examinations', label: e.title, sub: `${e.subject_code} · ${e.status.toLowerCase()}`, to: `${base}/exams/${e.exam_id}`, icon: Presentation }))),
  ];
  if (role === 'ADMIN') jobs.push(
    api<{ items: { user_id: number; full_name: string; enrollment_no: string; department_code: string }[] }>(`/admin/students${qs({ search: q, pageSize: 5 })}`)
      .then((r) => r.items.forEach((s) => out.push({ key: `s${s.user_id}`, group: 'Students', label: s.full_name, sub: `${s.enrollment_no} · ${s.department_code}`, to: `/admin/students?search=${enc}`, icon: GraduationCap }))),
    api<{ items: { user_id: number; full_name: string; employee_code: string; department_code: string }[] }>(`/admin/faculty${qs({ search: q, pageSize: 5 })}`)
      .then((r) => r.items.forEach((f) => out.push({ key: `f${f.user_id}`, group: 'Faculty', label: f.full_name, sub: `${f.employee_code} · ${f.department_code}`, to: `/admin/faculty?search=${enc}`, icon: Users }))),
    api<{ items: { subject_id: number; code: string; name: string }[] }>(`/subjects${qs({ search: q, pageSize: 5 })}`)
      .then((r) => r.items.forEach((s) => out.push({ key: `u${s.subject_id}`, group: 'Subjects', label: `${s.code} · ${s.name}`, to: `/admin/subjects?search=${enc}`, icon: BookOpen }))));
  else jobs.push(
    api<{ items: { question_id: number; question_text: string; subject_code: string }[] }>(`/questions${qs({ search: q, pageSize: 5 })}`)
      .then((r) => r.items.forEach((x) => out.push({ key: `q${x.question_id}`, group: 'Question bank', label: x.question_text.slice(0, 80), sub: x.subject_code, to: `/faculty/questions?search=${enc}`, icon: FileQuestion }))));
  await Promise.allSettled(jobs);
  return out;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth(); const nav = useNavigate();
  const [q, setQ] = useState(''); const [remote, setRemote] = useState<Hit[]>([]); const [busy, setBusy] = useState(false); const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const role = user?.role;

  const pages = useMemo<Hit[]>(() => !role ? [] : NAV[role].map((n) => ({ key: n.to, group: 'Pages', label: n.label, to: n.to, icon: n.icon })), [role]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const p = t ? pages.filter((x) => x.label.toLowerCase().includes(t)) : pages;
    return [...p, ...remote];
  }, [pages, remote, q]);

  useEffect(() => { if (open) { setQ(''); setRemote([]); setSel(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  useEffect(() => {
    const t = q.trim();
    if (!open || !role || t.length < 2) { setRemote([]); return; }
    let live = true; setBusy(true);
    const h = setTimeout(() => { search(role, t).then((r) => { if (live) setRemote(r); }).catch(() => undefined).finally(() => { if (live) setBusy(false); }); }, 250);
    return () => { live = false; clearTimeout(h); };
  }, [q, open, role]);
  useEffect(() => setSel(0), [q, remote.length]);

  const go = (h: Hit) => { onClose(); nav(h.to); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); go(shown[sel]); }
    else if (e.key === 'Escape') onClose();
  };
  useEffect(() => { document.getElementById(`cp-${sel}`)?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  let lastGroup = '';
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
          <motion.div role="dialog" aria-modal="true" aria-label="Search" initial={{ opacity: 0, y: -16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={spring}
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-surface shadow-pop" onKeyDown={key}>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={role === 'STUDENT' ? 'Search your exams and results…' : role === 'FACULTY' ? 'Search exams, questions, pages…' : 'Search students, faculty, subjects, exams…'}
                aria-label="Search" role="combobox" aria-expanded aria-controls="cp-list" aria-activedescendant={shown[sel] ? `cp-${sel}` : undefined}
                className="h-14 w-full bg-transparent text-sm text-ink placeholder:text-muted/70 focus:outline-none" />
              {busy && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-brand-500" aria-label="Searching" />}
              <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[0.65rem] text-muted sm:block">Esc</kbd>
            </div>
            <ul id="cp-list" role="listbox" className="max-h-[22rem] overflow-y-auto p-2">
              {!shown.length && <li className="px-4 py-10 text-center text-sm text-muted">{q.trim().length < 2 ? 'Type at least 2 characters to search records.' : busy ? 'Searching…' : `No results for “${q.trim()}”.`}</li>}
              {shown.map((h, i) => { const head = h.group !== lastGroup; lastGroup = h.group; return (
                <li key={h.key} role="presentation">
                  {head && <p className="px-3 pb-1 pt-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">{h.group}</p>}
                  <button id={`cp-${i}`} role="option" aria-selected={i === sel} onMouseMove={() => setSel(i)} onClick={() => go(h)}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', i === sel ? 'bg-brand-500/10' : '')}>
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', i === sel ? 'accent-gradient text-white' : 'bg-surface-3 text-muted')}><h.icon className="h-4 w-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{h.label}</span>{h.sub && <span className="block truncate text-xs text-muted">{h.sub}</span>}</span>
                    {i === sel && <CornerDownLeft className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                  </button>
                </li>); })}
            </ul>
            <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2 text-[0.7rem] text-muted"><span>↑ ↓ to move · Enter to open</span><span>Ctrl/⌘ + K</span></div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
