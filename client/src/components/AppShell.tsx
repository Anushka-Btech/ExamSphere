import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronsUpDown, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal, Sun, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { pageVariants, spring } from '../lib/motion';
import { Brand, LogoMark } from './Logo';
import { NAV, ROLE_LABEL, type NavItem } from './nav';
import { Popover, cn } from './ui';
import NotificationBell from './Notifications';
import CommandPalette from './CommandPalette';
import Preferences from './Preferences';

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

function Avatar({ name, className }: { name: string; className?: string }) {
  return <span className={cn('accent-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold text-white shadow-glow', className)} aria-hidden>{initials(name)}</span>;
}

function NavList({ items, collapsed, onNavigate }: { items: NavItem[]; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 px-3">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} onClick={onNavigate} title={collapsed ? i.label : undefined} aria-label={collapsed ? i.label : undefined}
          className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200',
            isActive ? 'text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white', collapsed && 'justify-center px-2')}>
          {({ isActive }) => (<>
            {isActive && <motion.span layoutId={collapsed ? 'nav-active-c' : 'nav-active'} transition={spring} className="accent-gradient absolute inset-0 rounded-xl opacity-90 shadow-glow" aria-hidden />}
            <i.icon className={cn('relative h-[1.15rem] w-[1.15rem] shrink-0 transition-transform duration-200', !isActive && 'group-hover:scale-110')} aria-hidden />
            {!collapsed && <span className="relative">{i.label}</span>}
          </>)}
        </NavLink>
      ))}
    </nav>
  );
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 2) return <span className="hidden text-sm font-medium text-ink sm:block">Dashboard</span>;
  const label = (s: string) => (/^\d+$/.test(s) ? `#${s}` : s.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
  return (
    <nav aria-label="Breadcrumb" className="hidden text-sm text-muted sm:block">
      <ol className="flex items-center gap-1.5">
        {parts.map((p, i) => {
          const to = '/' + parts.slice(0, i + 1).join('/');
          return <li key={to} className="flex items-center gap-1.5">{i > 0 && <span aria-hidden className="text-line-strong">/</span>}
            {i === parts.length - 1 ? <span aria-current="page" className="font-medium text-ink">{label(p)}</span> : <Link className="transition-colors hover:text-ink" to={to}>{i === 0 ? 'Home' : label(p)}</Link>}</li>;
        })}
      </ol>
    </nav>
  );
}

function ThemeButton() {
  const { resolved, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="relative rounded-xl p-2.5 text-muted transition-colors hover:bg-surface-3 hover:text-ink">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={resolved} initial={{ rotate: -80, opacity: 0, scale: 0.6 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 80, opacity: 0, scale: 0.6 }} transition={{ duration: 0.18 }} className="block">
          {resolved === 'dark' ? <Sun className="h-[1.15rem] w-[1.15rem]" aria-hidden /> : <Moon className="h-[1.15rem] w-[1.15rem]" aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { prefs } = useTheme();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(prefs.sidebarCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  // Ctrl/Cmd+K, or "/" outside a text field, opens global search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setSearch((s) => !s); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setSearch(true); }
    };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, []);
  useEffect(() => { setDrawer(false); setMenu(false); }, [pathname]);

  if (!user) return null;
  const items = NAV[user.role];
  const signOut = async () => { await logout(); nav('/login'); };

  const sidebarBody = (compact: boolean, onNavigate?: () => void) => (<>
    <div className={cn('flex h-16 shrink-0 items-center px-5', compact && 'justify-center px-2')}><Link to="/" aria-label="ExamSphere home"><Brand compact={compact} onDark /></Link></div>
    {!compact && <p className="px-6 pb-2 pt-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{ROLE_LABEL[user.role]} workspace</p>}
    <div className="flex-1 overflow-y-auto py-2"><NavList items={items} collapsed={compact} onNavigate={onNavigate} /></div>
    <div className={cn('m-3 flex items-center gap-3 rounded-2xl bg-white/[0.05] p-2.5 ring-1 ring-inset ring-white/[0.06]', compact && 'justify-center p-2')}>
      <Avatar name={user.fullName} />
      {!compact && <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{user.fullName}</p><p className="truncate text-xs text-slate-400">{user.email}</p></div>}
    </div>
  </>);

  return (
    <div className="min-h-screen bg-canvas" data-role={user.role}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-xl focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">Skip to content</a>

      {/* desktop sidebar: always midnight navy, collapses with a width tween */}
      <motion.aside initial={false} animate={{ width: collapsed ? 76 : 264 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden bg-navy-900 lg:flex" aria-label="Sidebar">
        <div className="accent-gradient pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl" aria-hidden />
        <div className="relative flex h-full flex-col">
          {sidebarBody(collapsed)}
          <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed}
            className="mx-3 mb-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white">
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <><PanelLeftClose className="h-5 w-5" /><span>Collapse</span></>}
          </button>
        </div>
      </motion.aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} aria-hidden />
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={spring} className="absolute inset-y-0 left-0 flex w-72 flex-col bg-navy-900 shadow-pop" aria-label="Navigation drawer">
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
              {sidebarBody(false, () => setDrawer(false))}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className={cn('transition-[padding] duration-300', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]')}>
        <header className="glass sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-xl p-2 text-muted transition-colors hover:bg-surface-3 lg:hidden"><Menu className="h-5 w-5" /></button>
            <span className="lg:hidden"><LogoMark className="h-7 w-7" /></span>
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button onClick={() => setSearch(true)} aria-label="Search (Ctrl K)" className="hidden items-center gap-2 rounded-xl border border-line bg-surface-2 py-2 pl-3 pr-2 text-sm text-muted transition-all hover:border-line-strong hover:text-ink md:flex md:w-56">
              <Search className="h-4 w-4" aria-hidden /><span className="flex-1 text-left">Search…</span><kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[0.65rem]">Ctrl K</kbd>
            </button>
            <button onClick={() => setSearch(true)} aria-label="Search" className="rounded-xl p-2.5 text-muted transition-colors hover:bg-surface-3 hover:text-ink md:hidden"><Search className="h-[1.15rem] w-[1.15rem]" aria-hidden /></button>
            <ThemeButton />
            <NotificationBell />
            <div className="relative ml-1">
              <button onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu"
                className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-surface-3">
                <Avatar name={user.fullName} className="h-8 w-8" />
                <span className="hidden text-left sm:block"><span className="block text-sm font-medium leading-tight text-ink">{user.fullName}</span><span className="block text-xs text-muted">{ROLE_LABEL[user.role]}</span></span>
                <ChevronsUpDown className="hidden h-4 w-4 text-muted sm:block" aria-hidden />
              </button>
              <Popover open={menu} onClose={() => setMenu(false)} className="w-60" label="Account">
                <div className="border-b border-line px-4 py-3"><p className="truncate text-sm font-semibold text-ink">{user.fullName}</p><p className="truncate text-xs text-muted">{user.email}</p></div>
                <div className="p-1.5">
                  <button role="menuitem" onClick={() => { setMenu(false); setPrefsOpen(true); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-3"><SlidersHorizontal className="h-4 w-4 text-muted" aria-hidden />Preferences</button>
                  <button role="menuitem" onClick={signOut} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-bad transition-colors hover:bg-bad/10"><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
                </div>
              </Popover>
            </div>
          </div>
        </header>
        {/* page transition: each route eases in (key = path). Reduced motion turns it into an instant swap. */}
        <motion.main id="main" key={pathname} variants={pageVariants} initial="initial" animate="enter" className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
          <Outlet />
        </motion.main>
      </div>

      <CommandPalette open={search} onClose={() => setSearch(false)} />
      <Preferences open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  );
}
