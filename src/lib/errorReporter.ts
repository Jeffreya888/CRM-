// App error reporting: crashes and unhandled errors go to public.app_errors (Platform admin → Errors).
// Quiet by design: never throws, skips repeats of the same message within a minute, and sends at most
// 20 reports per app session so a crash loop can't flood anything.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

let currentOrg: string | null = null;
let currentRoute: string | null = null;
let sent = 0;
const recent = new Map<string, number>();
let installed = false;

export const setErrorContext = (ctx: { orgId?: string | null; route?: string | null }) => {
  if (ctx.orgId !== undefined) currentOrg = ctx.orgId;
  if (ctx.route !== undefined) currentRoute = ctx.route;
};

/** Messages that aren't app bugs (offline, cancelled requests) and would only add noise. */
const IGNORED = /network request failed|failed to fetch|load failed|aborted|cancell?ed|the internet connection appears to be offline/i;

export function reportClientError(e: unknown, route?: string | null) {
  try {
    const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })());
    const message = (err.message || 'Unknown error').slice(0, 1000);
    if (IGNORED.test(message)) return;
    const now = Date.now();
    const key = message.slice(0, 200);
    if (sent >= 20 || (recent.get(key) ?? 0) > now - 60_000) return;
    recent.set(key, now);
    sent += 1;
    void supabase.rpc('log_client_error', {
      p_message: message,
      p_stack: (err.stack ?? '').slice(0, 4000),
      p_route: route ?? currentRoute,
      p_platform: Platform.OS,
      p_version: Constants.expoConfig?.version ?? null,
      p_org: currentOrg,
    }).then(() => {}, () => {});
  } catch {
    // Reporting must never cause another error.
  }
}

/** Catches errors nothing else caught: JS errors on iPhone/Android, and errors and rejected promises on the web. */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;
  const eu = (globalThis as any).ErrorUtils;
  if (eu?.getGlobalHandler && eu?.setGlobalHandler) {
    const previous = eu.getGlobalHandler();
    eu.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      reportClientError(error);
      previous?.(error, isFatal);
    });
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('error', (ev) => reportClientError(ev.error ?? ev.message));
    window.addEventListener('unhandledrejection', (ev) => reportClientError(ev.reason));
  }
}
