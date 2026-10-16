import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from './supabase';

/**
 * Minimal async loader: runs on mount, whenever `deps` change, and whenever the
 * screen regains focus, so lists stay fresh after editing a record elsewhere.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const key = JSON.stringify(deps);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Every state update here happens after the await, so effects can call it safely.
  const fetchNow = useCallback(async (forKey?: string) => {
    try {
      const v = await fnRef.current();
      if (mounted.current) { setData(v); setError(null); }
    } catch (e: any) {
      if (mounted.current) setError(friendlyError(e?.message ?? String(e)));
    } finally {
      if (mounted.current) {
        if (forKey !== undefined) setLoadedKey(forKey);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { fetchNow(key); }, [key, fetchNow]);
  useFocusEffect(useCallback(() => { fetchNow(); }, [fetchNow]));

  const refresh = () => { setRefreshing(true); return fetchNow(); };

  return {
    data, error, loading: loadedKey !== key, refreshing,
    refresh, reload: () => fetchNow(), setData,
  };
}
