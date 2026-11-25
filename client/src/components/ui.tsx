import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Inbox, ChevronLeft, ChevronRight, X, AlertCircle } from 'lucide-react';
import { popover, spring } from '../lib/motion';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------- Button (hover lift, press feedback, glow on primary: all CSS so it stays cheap and typed)
const variants = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-hover hover:shadow-glow hover:-translate-y-px',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2 shadow-sm hover:-translate-y-px',
  ghost: 'text-muted hover:bg-surface-3 hover:text-ink',
  danger: 'bg-bad text-white hover:opacity-90 shadow-sm',
};
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; loading?: boolean; size?: 'sm' | 'md' | 'lg' };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ variant = 'primary', loading, size = 'md', className, children, disabled, ...p }, ref) => (
  <button ref={ref} disabled={disabled || loading} aria-busy={loading || undefined}
    className={cn('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-55',
      size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-5 py-3 text-sm' : 'px-4 py-2 text-sm', variants[variant], className)} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
  </button>
));

// ---------- Layout bits
export const Card = ({ className, children, interactive }: { className?: string; children: ReactNode; interactive?: boolean }) =>
  <div className={cn('rounded-2xl border border-line bg-surface shadow-card transition-[box-shadow,transform,border-color] duration-300',
    interactive && 'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop', className)}>{children}</div>;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-[1.65rem] font-semibold leading-tight text-ink">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const tones = {
  gray: 'bg-surface-3 text-muted ring-line',
  green: 'bg-ok/10 text-ok ring-ok/20',
  amber: 'bg-warn/10 text-warn ring-warn/25',
  red: 'bg-bad/10 text-bad ring-bad/20',
  indigo: 'bg-brand-500/10 text-brand-600 ring-brand-500/20',
};
export const Badge = ({ tone = 'gray', children }: { tone?: keyof typeof tones; children: ReactNode }) =>
  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>{children}</span>;

const statusTone: Record<string, keyof typeof tones> = {
  ACTIVE: 'green', INACTIVE: 'gray', ARCHIVED: 'gray', DRAFT: 'gray', SCHEDULED: 'indigo', LIVE: 'green', COMPLETED: 'amber', CANCELLED: 'red',
  PASS: 'green', FAIL: 'red', PUBLISHED: 'green', EVALUATED: 'indigo', PENDING_EVALUATION: 'amber', SUBMITTED: 'indigo', AUTO_SUBMITTED: 'amber', IN_PROGRESS: 'amber',
  EASY: 'green', MEDIUM: 'amber', HARD: 'red',
};
export const StatusBadge = ({ value }: { value: string | null | undefined }) =>
  value ? <Badge tone={statusTone[value] ?? 'gray'}>{value === 'LIVE' && <span className="relative mr-1.5 flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-ok" /><span className="relative h-1.5 w-1.5 rounded-full bg-ok" /></span>}{value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge> : <span className="text-muted">-</span>;

// ---------- Form controls (label + error wired with htmlFor / aria-describedby)
type FieldBase = { label: string; error?: string; hint?: string };
const inputCls = (err?: string) => cn('w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 transition-all duration-200',
  'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15',
  err ? 'border-bad focus:border-bad focus:ring-bad/15' : 'border-line hover:border-line-strong');

function FieldShell({ id, label, error, hint, children }: FieldBase & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      <AnimatePresence initial={false}>
        {error && <motion.p id={`${id}-err`} role="alert" initial={{ opacity: 0, height: 0, y: -4 }} animate={{ opacity: 1, height: 'auto', y: 0 }} exit={{ opacity: 0, height: 0 }}
          className="mt-1 flex items-center gap-1 overflow-hidden text-xs text-bad"><AlertCircle className="h-3.5 w-3.5" aria-hidden />{error}</motion.p>}
      </AnimatePresence>
    </div>
  );
}
const aria = (id: string, error?: string, hint?: string) => ({ 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined });

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldBase>(({ label, error, hint, className, ...p }, ref) => {
  const id = useId();
  return <FieldShell id={id} label={label} error={error} hint={hint}><input ref={ref} id={id} className={cn(inputCls(error), className)} {...aria(id, error, hint)} {...p} /></FieldShell>;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldBase>(({ label, error, hint, className, children, ...p }, ref) => {
  const id = useId();
  return <FieldShell id={id} label={label} error={error} hint={hint}><select ref={ref} id={id} className={cn(inputCls(error), className)} {...aria(id, error, hint)} {...p}>{children}</select></FieldShell>;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldBase>(({ label, error, hint, className, ...p }, ref) => {
  const id = useId();
  return <FieldShell id={id} label={label} error={error} hint={hint}><textarea ref={ref} id={id} className={cn(inputCls(error), 'min-h-[6rem]', className)} {...aria(id, error, hint)} {...p} /></FieldShell>;
});

/** Compact filter control (visually-hidden label keeps it accessible) */
export const FilterSelect = ({ label, className, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) =>
  <select aria-label={label} className={cn('rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition-all hover:border-line-strong focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15', className)} {...p} />;
export const SearchInput = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) =>
  <input type="search" aria-label={p.placeholder ?? 'Search'} className={cn('w-full min-w-[12rem] rounded-xl border border-line bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-muted/70 transition-all hover:border-line-strong focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:w-72', className)} {...p} />;

// ---------- Popover: animated dropdown anchored to its (relatively positioned) parent. Esc and outside click close it.
export function Popover({ open, onClose, className, align = 'right', children, label }: { open: boolean; onClose: () => void; className?: string; align?: 'left' | 'right'; children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { const host = ref.current?.parentElement; if (host && !host.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={ref} role="menu" aria-label={label} variants={popover} initial="hidden" animate="show" exit="exit"
          style={{ transformOrigin: align === 'right' ? 'top right' : 'top left' }}
          className={cn('glass absolute z-50 mt-2 min-w-[12rem] overflow-hidden rounded-2xl border border-line shadow-pop', align === 'right' ? 'right-0' : 'left-0', className)}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- Switch + segmented control (used by Preferences)
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-primary' : 'bg-line-strong')}>
      <motion.span layout transition={spring} className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow" style={{ left: checked ? '1.375rem' : '0.125rem' }} />
    </button>
  );
}

export function ProgressBar({ value, className, tone = 'accent' }: { value: number; className?: string; tone?: 'accent' | 'ok' | 'warn' }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <motion.div className={cn('h-full rounded-full', tone === 'accent' ? 'accent-gradient' : tone === 'ok' ? 'bg-ok' : 'bg-warn')}
        initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}

// ---------- Modal / Confirm (focus moves in, Esc closes, focus returns)
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const last = useRef<Element | null>(null); const titleId = useId();
  useEffect(() => {
    if (!open) return;
    last.current = document.activeElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {   // simple focus trap
        const f = ref.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], end = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
        else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); (last.current as HTMLElement | null)?.focus?.(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
          <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
            initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={spring}
            className={cn('relative max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-6 shadow-pop focus:outline-none sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id={titleId} className="text-lg font-semibold text-ink">{title}</h2>
              <button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onClose }:
  { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-muted">{message}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// ---------- States
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton', className)} aria-hidden />;
export const TableSkeleton = ({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) => (
  <div className="space-y-3 p-4" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => (
    <div key={i} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>{Array.from({ length: cols }, (_, j) => <Skeleton key={j} className="h-5" />)}</div>))}</div>
);
export const EmptyState = ({ title, message, action }: { title: string; message?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
    <div className="mb-4 rounded-2xl bg-brand-500/10 p-3.5 text-brand-600 ring-1 ring-inset ring-brand-500/15"><Inbox className="h-6 w-6" aria-hidden /></div>
    <p className="font-medium text-ink">{title}</p>{message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}{action && <div className="mt-4">{action}</div>}
  </div>
);
export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex flex-col items-center px-6 py-12 text-center" role="alert">
    <div className="mb-3 rounded-2xl bg-bad/10 p-3 text-bad"><AlertCircle className="h-6 w-6" aria-hidden /></div><p className="font-medium text-ink">Something went wrong</p>
    <p className="mt-1 text-sm text-muted">{message}</p>{onRetry && <Button className="mt-4" variant="secondary" onClick={onRetry}>Try again</Button>}
  </div>
);

// ---------- Table + pagination
export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full text-left text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-surface-2">{children}</table></div>
);
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) =>
  <th scope="col" className={cn('whitespace-nowrap border-b border-line bg-surface-2 px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted', className)}>{children}</th>;
export const Td = ({ children, className, ...p }: { children?: ReactNode; className?: string; title?: string }) =>
  <td className={cn('border-b border-line/70 px-4 py-3.5 align-middle text-ink', className)} {...p}>{children}</td>;

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav className="flex items-center justify-between gap-3 px-4 py-3 text-sm" aria-label="Pagination">
      <span className="text-muted">Page {page} of {pages} · {total} total</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </nav>
  );
}
