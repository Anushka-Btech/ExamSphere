// The API sends UTC 'YYYY-MM-DD HH:MM:SS' strings; show them in the viewer's local time.
export const parseUtc = (s: string | null | undefined) => (s ? new Date(s.replace(' ', 'T').replace(/\.\d+$/, '') + 'Z') : null);
export const fmtDateTime = (s: string | null | undefined) => {
  const d = parseUtc(s); return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '-';
};
export const fmtDate = (s: string | null | undefined) => {
  const d = parseUtc(s ?? undefined) ?? (s ? new Date(s) : null); return d ? d.toLocaleDateString(undefined, { dateStyle: 'medium' }) : '-';
};
export const num = (v: number | string | null | undefined, digits = 2) => (v === null || v === undefined ? '-' : Number(v).toFixed(digits).replace(/\.?0+$/, ''));
export const pct = (v: number | string | null | undefined) => (v === null || v === undefined ? '-' : `${num(v, 1)}%`);
/** Local datetime-local value -> ISO UTC for the API */
export const localToIso = (v: string) => new Date(v).toISOString();
export const isoToLocalInput = (s: string) => { const d = parseUtc(s)!; const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** Read ?search= from the URL once, so global-search results open a pre-filtered list. */
export const initialSearch = () => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('search') ?? '');
