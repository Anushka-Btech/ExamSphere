import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';

export type ThemePref = 'light' | 'dark' | 'system';
export interface Prefs { theme: ThemePref; reduceMotion: boolean; sidebarCollapsed: boolean }
const DEFAULTS: Prefs = { theme: 'system', reduceMotion: false, sidebarCollapsed: false };
const KEY = 'examsphere:prefs';

// localStorage can be missing or throw (private windows, blocked storage): every access is guarded and the app works without it.
const read = (): Prefs => {
  try { const raw = localStorage.getItem(KEY); return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS; } catch { return DEFAULTS; }
};
const write = (p: Prefs) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } };

interface Ctx { prefs: Prefs; setPrefs: (patch: Partial<Prefs>) => void; resolved: 'light' | 'dark'; toggleTheme: () => void }
const ThemeCtx = createContext<Ctx>(null as never);
export const useTheme = () => useContext(ThemeCtx);

const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<Prefs>(read);
  const [sysDark, setSysDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)'); if (!mq) return;
    const on = () => setSysDark(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, []);

  const resolved: 'light' | 'dark' = prefs.theme === 'system' ? (sysDark ? 'dark' : 'light') : prefs.theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.classList.toggle('reduce-motion', prefs.reduceMotion);
    root.style.colorScheme = resolved;
  }, [resolved, prefs.reduceMotion]);

  const setPrefs = useCallback((patch: Partial<Prefs>) => setState((p) => { const n = { ...p, ...patch }; write(n); return n; }), []);
  const toggleTheme = useCallback(() => setPrefs({ theme: resolved === 'dark' ? 'light' : 'dark' }), [resolved, setPrefs]);
  const value = useMemo(() => ({ prefs, setPrefs, resolved, toggleTheme }), [prefs, setPrefs, resolved, toggleTheme]);

  return (
    <ThemeCtx.Provider value={value}>
      {/* 'user' follows the OS setting; the Preferences switch forces it on. Either way every framer-motion animation obeys it. */}
      <MotionConfig reducedMotion={prefs.reduceMotion ? 'always' : 'user'}>{children}</MotionConfig>
    </ThemeCtx.Provider>
  );
}

/** Hex colours for Recharts (SVG props cannot read Tailwind classes), switched with the theme. */
export function useChartColors() {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  return useMemo(() => ({
    primary: dark ? '#818CF8' : '#4F46E5',
    secondary: dark ? '#A78BFA' : '#8B5CF6',
    tertiary: dark ? '#38BDF8' : '#0EA5E9',
    ok: dark ? '#4ADE80' : '#16A34A',
    warn: dark ? '#FBBF24' : '#D97706',
    bad: dark ? '#F87171' : '#DC2626',
    neutral: dark ? '#4B5380' : '#A6ADC8',
    grid: dark ? '#242A52' : '#E3E6F3',
    axis: dark ? '#949CC2' : '#62698A',
    series: dark ? ['#818CF8', '#A78BFA', '#38BDF8', '#F472B6', '#4ADE80'] : ['#4F46E5', '#8B5CF6', '#0EA5E9', '#DB2777', '#16A34A'],
  }), [dark]);
}
