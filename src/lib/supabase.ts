import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  },
);

// Refresh tokens only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Unwraps a Supabase response, throwing a readable Error on failure. */
export async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(friendlyError(error.message));
  return data;
}

export function friendlyError(message: string): string {
  if (message.includes('SUBSCRIPTION_REQUIRED')) return 'Your plan has expired. Choose a plan in Settings → Subscription to keep adding records.';
  if (message.includes('SEAT_LIMIT')) return message.replace(/^.*SEAT_LIMIT:\s*/, '');
  if (message.includes('duplicate key') && message.includes('tail_number')) return 'That tail number already exists.';
  if (message.includes('time_entries_one_open')) return 'You already have a clock running. Stop it first.';
  if (message.includes('row-level security')) return "You don't have permission to do that.";
  return message;
}

/** Calls an Edge Function and surfaces its {error} payload as an Error. */
export async function callFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx?.json) msg = (await ctx.json()).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return data as T;
}
