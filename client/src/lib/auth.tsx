import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export type Role = 'ADMIN' | 'FACULTY' | 'STUDENT';
export interface User { userId: number; role: Role; fullName: string; email: string }
interface Ctx { user: User | null; loading: boolean; login: (id: string, pw: string) => Promise<User>; logout: () => Promise<void> }

const AuthCtx = createContext<Ctx>(null as never);
export const useAuth = () => useContext(AuthCtx);
export const homeFor = (r: Role) => (r === 'ADMIN' ? '/admin' : r === 'FACULTY' ? '/faculty' : '/student');

/**
 * The UI keeps the user only in memory and re-asks the server (/auth/me) on load. Nothing in localStorage is
 * trusted: even if someone edits this state, every API call is re-authorised on the server by the session cookie.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoading(false));
    const expired = () => setUser(null);
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const r = await api<{ user: User }>('/auth/login', { body: { identifier, password } });
    setUser(r.user); return r.user;
  }, []);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); setUser(null); }, []);

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}
