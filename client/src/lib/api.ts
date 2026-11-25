export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public fields?: Record<string, string[]>) { super(message); }
}

/** JSON fetch with the session cookie. Errors carry the server's message and per-field validation details. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    credentials: 'include',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  }).catch(() => { throw new ApiError(0, 'Cannot reach the server. Check your connection.', 'NETWORK'); });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) window.dispatchEvent(new Event('auth:expired'));
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.message ?? 'Request failed', e.code, e.details && !Array.isArray(e.details) ? e.details : undefined);
  }
  return data as T;
}
export const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
};
