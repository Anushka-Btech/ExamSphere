import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

/** Loads GET `path` (null = skip). Exposes loading / error / reload so every page can show all three states. */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true); setError(null);
    api<T>(path).then((d) => { if (!cancelled) setData(d); }).catch((e) => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
