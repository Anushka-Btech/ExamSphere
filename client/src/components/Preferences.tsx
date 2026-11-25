import { Monitor, Moon, PanelLeftClose, Sun, Zap, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Modal, Switch, cn } from './ui';
import { useTheme, type ThemePref } from '../lib/theme';
import { spring } from '../lib/motion';

const THEMES: { v: ThemePref; label: string; icon: LucideIcon }[] = [
  { v: 'light', label: 'Light', icon: Sun }, { v: 'dark', label: 'Dark', icon: Moon }, { v: 'system', label: 'System', icon: Monitor },
];

/** Personalisation: theme, motion and sidebar defaults. Saved in this browser only (localStorage), never sent to the server. */
export default function Preferences({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, setPrefs } = useTheme();
  return (
    <Modal open={open} onClose={onClose} title="Preferences">
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Appearance</p>
          <div role="radiogroup" aria-label="Theme" className="relative grid grid-cols-3 gap-1 rounded-2xl bg-surface-3 p-1">
            {THEMES.map((t) => (
              <button key={t.v} role="radio" aria-checked={prefs.theme === t.v} onClick={() => setPrefs({ theme: t.v })}
                className={cn('relative flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-colors', prefs.theme === t.v ? 'text-ink' : 'text-muted hover:text-ink')}>
                {prefs.theme === t.v && <motion.span layoutId="theme-pill" transition={spring} className="absolute inset-0 rounded-xl bg-surface shadow-card" aria-hidden />}
                <span className="relative flex items-center gap-2"><t.icon className="h-4 w-4" aria-hidden />{t.label}</span>
              </button>))}
          </div>
        </div>
        <Row icon={Zap} title="Reduce motion" text="Turns off page transitions, counters and chart animation. Also follows your system setting automatically."
          control={<Switch checked={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} label="Reduce motion" />} />
        <Row icon={PanelLeftClose} title="Collapse sidebar by default" text="Start with the compact icon-only sidebar on large screens."
          control={<Switch checked={prefs.sidebarCollapsed} onChange={(v) => setPrefs({ sidebarCollapsed: v })} label="Collapse sidebar by default" />} />
        <p className="text-xs text-muted">Preferences are stored in this browser only.</p>
      </div>
    </Modal>
  );
}

function Row({ icon: Icon, title, text, control }: { icon: LucideIcon; title: string; text: string; control: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 rounded-xl bg-brand-500/10 p-2 text-brand-600"><Icon className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink">{title}</p><p className="text-xs text-muted">{text}</p></div>
      {control}
    </div>
  );
}
