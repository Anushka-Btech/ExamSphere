import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { cn, Card, Skeleton } from './ui';
import { AnimatedNumber } from './motion';
import { ease } from '../lib/motion';

/** Gradient banner at the top of each dashboard. The gradient comes from the role accent, so each role feels distinct. */
export function Hero({ eyebrow, title, subtitle, actions, children }: { eyebrow: string; title: string; subtitle?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}
      className="relative mb-6 overflow-hidden rounded-3xl bg-navy-900 p-6 text-white shadow-pop sm:p-8">
      <div className="accent-gradient absolute inset-0 opacity-[0.55]" aria-hidden />
      <div className="bg-dots absolute inset-0 [mask-image:linear-gradient(to_bottom_left,black,transparent_70%)]" aria-hidden />
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-white/75">{subtitle}</p>}
          {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children && <div className="relative">{children}</div>}
      </div>
    </motion.section>
  );
}

/** Buttons that sit on the Hero (translucent so they work on any accent gradient) */
export const heroBtn = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97]';
export const heroBtnSolid = cn(heroBtn, 'bg-white text-navy-900 shadow-sm hover:-translate-y-px hover:shadow-lg');
export const heroBtnGhost = cn(heroBtn, 'bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/20');

export function StatCard({ label, value, icon: Icon, to, decimals = 0, suffix, text, hint }:
  { label: string; value?: number; icon: LucideIcon; to?: string; decimals?: number; suffix?: string; text?: string; hint?: string }) {
  const body = (
    <Card interactive={!!to} className="group relative h-full overflow-hidden p-5">
      <div className="accent-gradient pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.12] blur-xl transition-opacity duration-300 group-hover:opacity-30" aria-hidden />
      <div className="relative flex items-start justify-between">
        <span className="accent-gradient inline-flex rounded-xl p-2.5 text-white shadow-glow"><Icon className="h-5 w-5" aria-hidden /></span>
        {to && <ArrowUpRight className="h-4 w-4 text-muted opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" aria-hidden />}
      </div>
      <p className="relative mt-4 text-[1.9rem] font-semibold leading-none text-ink tnum">
        {text !== undefined ? text : <AnimatedNumber value={value ?? 0} decimals={decimals} suffix={suffix} />}
      </p>
      <p className="relative mt-1.5 text-sm text-muted">{label}</p>
      {hint && <p className="relative mt-0.5 text-xs text-muted/80">{hint}</p>}
    </Card>
  );
  return to ? <Link to={to} className="block h-full rounded-2xl focus-visible:outline-offset-4">{body}</Link> : body;
}

export function Panel({ title, subtitle, action, children, className, flush }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pb-0 pt-5">
        <div><h2 className="font-semibold text-ink">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}</div>
        {action}
      </div>
      <div className={cn('flex-1', flush ? 'mt-3' : 'px-5 pb-5 pt-3')}>{children}</div>
    </Card>
  );
}

/** Vertical activity timeline (admin audit log, publications) */
export function Timeline({ items }: { items: { key: string | number; title: string; meta: string; tone?: 'accent' | 'ok' | 'warn'; badge?: ReactNode }[] }) {
  return (
    <ol className="relative ml-2 space-y-4 border-l border-line pl-5">
      {items.map((it, i) => (
        <motion.li key={it.key} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.05, duration: 0.3, ease }} className="relative">
          <span className={cn('absolute -left-[1.72rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface', it.tone === 'ok' ? 'bg-ok' : it.tone === 'warn' ? 'bg-warn' : 'accent-gradient')} aria-hidden />
          <p className="text-sm font-medium text-ink">{it.title} {it.badge}</p>
          <p className="text-xs text-muted">{it.meta}</p>
        </motion.li>
      ))}
    </ol>
  );
}

/** Circular progress / gauge. Pure SVG; the arc draws in on mount. */
export function Ring({ value, size = 120, stroke = 10, label, sub, onDark }: { value: number; size?: number; stroke?: number; label?: ReactNode; sub?: string; onDark?: boolean }) {
  const v = Math.max(0, Math.min(100, value)); const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(v)} percent${sub ? ' ' + sub : ''}`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: onDark ? 'rgb(255 255 255 / .2)' : 'rgb(var(--surface-3))' }} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" style={{ stroke: onDark ? '#fff' : 'rgb(var(--accent))' }}
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v / 100) }} transition={{ duration: 1.1, ease }} />
      </svg>
      <div className="absolute text-center">{label ?? <span className={cn('text-xl font-semibold tnum', onDark ? 'text-white' : 'text-ink')}>{Math.round(v)}%</span>}{sub && <p className={cn('text-[0.65rem] uppercase tracking-wide', onDark ? 'text-white/70' : 'text-muted')}>{sub}</p>}</div>
    </div>
  );
}

/** Tooltip body shared by all Recharts charts so they match the surface in light and dark. */
interface TipProps { active?: boolean; payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[]; label?: string | number; unit?: string; labelFormatter?: (l: string) => string }
export function ChartTooltip({ active, payload, label, unit = '', labelFormatter }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl border border-line px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium text-ink">{labelFormatter ? labelFormatter(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}: <span className="font-semibold text-ink tnum">{p.value}{unit}</span></p>
      ))}
    </div>
  );
}

/** Loading placeholder shaped like the real dashboard (hero + stat row + two panels), so nothing jumps when data arrives. */
export function DashSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <Skeleton className="h-40 rounded-3xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
    </div>
  );
}
