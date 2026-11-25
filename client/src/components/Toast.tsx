import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { spring } from '../lib/motion';

type T = { id: number; kind: 'success' | 'error'; text: string };
const Ctx = createContext<(kind: T['kind'], text: string) => void>(() => undefined);
export const useToast = () => {
  const push = useContext(Ctx);
  return { success: (t: string) => push('success', t), error: (t: string) => push('error', t) };
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((kind: T['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((a) => [...a, { id, kind, text }]);
    setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      {/* aria-live so screen readers announce results of actions */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" role="status">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40, scale: 0.97 }} transition={spring}
              className="glass pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl border border-line p-3.5 pl-4 shadow-pop">
              <span className={`absolute inset-y-0 left-0 w-1 ${t.kind === 'success' ? 'bg-ok' : 'bg-bad'}`} aria-hidden />
              {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-bad" aria-hidden />}
              <p className="flex-1 text-sm text-ink">{t.text}</p>
              <button onClick={() => setItems((a) => a.filter((x) => x.id !== t.id))} aria-label="Dismiss notification" className="rounded p-0.5 text-muted transition-colors hover:text-ink"><X className="h-4 w-4" /></button>
              <motion.span aria-hidden className={`absolute bottom-0 left-0 h-0.5 ${t.kind === 'success' ? 'bg-ok' : 'bg-bad'}`} initial={{ width: '100%' }} animate={{ width: 0 }} transition={{ duration: 4.5, ease: 'linear' }} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
