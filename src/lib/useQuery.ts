import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from './supabase';

/**
 * Minimal async loader: runs on mount and whenever the screen regains focus,
 * so lists stay fresh after editing a record on another screen.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const run = useCallback(async (mode: 'load' | 'refresh' | 'silent') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const v = await fnRef.current();
      if (mounted.current) { setData(v); setError(null); }
    } catch (e: any) {
      if (mounted.current) setError(friendlyError(e?.message ?? String(e)));
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); run('load'); }, deps);
  useFocusEffect(useCallback(() => { run('silent'); }, [run]));

  return { data, error, loading, refreshing, refresh: () => run('refresh'), reload: () => run('silent'), setData };
}
