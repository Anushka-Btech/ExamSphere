# UI redesign notes

Scope: client only, plus one additive field on `GET /api/dashboard/faculty` (`questionBank`). No schema, route or exam-engine changes. No new dependencies.

## Design system
- Tokens are CSS variables in `client/src/index.css` (light + `.dark`), mapped in `tailwind.config.js`. Role accent via `data-role` (Admin indigo, Faculty blue, Student violet).
- Theme / reduce-motion / sidebar default: `lib/theme.tsx` (localStorage, guarded). Reduced motion is honoured from the OS and from Preferences (framer `MotionConfig` + CSS).
- Shared pieces: `components/ui.tsx` (same exports as before + Popover, Switch, ProgressBar), `dashboard.tsx` (Hero, StatCard, Panel, Timeline, Ring, ChartTooltip), `motion.tsx` (AnimatedNumber, Stagger, Reveal), `charts.tsx`.

## Added features (derived from existing data, nothing invented)
- Notification centre: built client-side from dashboard / student exams / results endpoints.
- Global search (Ctrl/Cmd+K or `/`): existing list endpoints with `search=`.
- Preferences: theme, reduce motion, collapsed sidebar.

## Exam screen
View layer rewritten; autosave, retry, deadline and submit logic unchanged. UI-only additions: `dir`, `lastSaved`, `sheet`, `totalMs` state and arrow-key navigation.

## Login demo accounts
Choosing a role fills the username. The password is pre-filled only under `npm run dev` (`import.meta.env.DEV`); production builds do not contain it.

## To verify locally (not run in the authoring sandbox: no npm access)
`cd client && npm run typecheck && npm run build`, then `cd ../server && npm test`.
