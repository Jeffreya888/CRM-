/**
 * Customer portal client (public, no Supabase auth): email one-time-code
 * login, the portal dashboard data, photo links and booking/reschedule
 * requests. Everything goes through the public `portal` edge function.
 *
 * ---------------------------------------------------------------------------
 * Contract with the `portal` edge function (see docs/build-contract.md,
 * "Portal `data` response"):
 *
 *   { action: 'request_code', slug, email }            → { ok: true }   (always; never reveals whether the email exists)
 *   { action: 'verify', slug, email, code }            → { token: string, expires_at: string }   (30-day session)
 *   { action: 'data', token }                          → PortalData (below)
 *   { action: 'files', token, paths: string[] }        → { urls: Record<path, signedUrl> }  (an array in the
 *                                                         same order as `paths` is also accepted)
 *   { action: 'request', token, kind: 'booking' | 'reschedule', aircraft_id?, service_id?, job_id?,
 *     preferred: string[] (ISO timestamps, 1–3), notes? } → { ok: true }
 *
 * Errors come back as { error: string }. When the session token is expired,
 * revoked or unknown, the error message should contain "expired", "invalid
 * session", "revoked" or "sign in" (HTTP 401) so the page can send the
 * customer back to the code login with a friendly note.
 *
 * Exact PortalData JSON expected from { action: 'data' }:
 * {
 *   org: { name, logo_url, phone, email, timezone, google_review_url, accepts_cards },
 *   customer: { id, name, email, phone, company },
 *   assets: [{ id, tail_number, asset_type: 'aircraft'|'vehicle'|'watercraft', manufacturer, model, category }],
 *   services: [{ id, name, asset_type }],
 *   upcoming_jobs: [{ id, number, title, status, scheduled_start, scheduled_end, aircraft_id, tail_number, location_name }],
 *   past_jobs: [{ id, number, title, actual_end, tail_number, rating, photos: [{ path, kind, caption }] }],
 *   quotes: [{ number, status, total, valid_until_at, token }],            // non-draft only
 *   invoices: [{ number, status, total, balance, due_date, token }],       // non-draft only
 *   requests: [{ id, kind, status, created_at, preferred: string[] }]
 * }
 * ---------------------------------------------------------------------------
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callFunction } from './supabase';

export type PortalAssetType = 'aircraft' | 'vehicle' | 'watercraft';

export interface PortalOrg {
  name: string; logo_url: string | null; phone: string | null; email: string | null;
  timezone: string; google_review_url: string | null; accepts_cards: boolean;
}
export interface PortalCustomer { id: string; name: string; email: string | null; phone: string | null; company: string | null }
export interface PortalAsset { id: string; tail_number: string; asset_type: PortalAssetType; manufacturer: string | null; model: string | null; category: string }
export interface PortalService { id: string; name: string; asset_type: string }
export interface PortalUpcomingJob {
  id: string; number: string; title: string | null; status: string; scheduled_start: string | null; scheduled_end: string | null;
  aircraft_id: string | null; tail_number: string | null; location_name: string | null;
}
export interface PortalPhoto { path: string; kind: string; caption: string | null }
export interface PortalPastJob { id: string; number: string; title: string | null; actual_end: string | null; tail_number: string | null; rating: number | null; photos: PortalPhoto[] }
export interface PortalQuote { number: string; status: string; total: number; valid_until_at: string | null; token: string }
export interface PortalInvoice { number: string; status: string; total: number; balance: number; due_date: string; token: string }
export interface PortalRequest { id: string; kind: string; status: string; created_at: string; preferred: string[] }

export interface PortalData {
  org: PortalOrg;
  customer: PortalCustomer;
  assets: PortalAsset[];
  services: PortalService[];
  upcoming_jobs: PortalUpcomingJob[];
  past_jobs: PortalPastJob[];
  quotes: PortalQuote[];
  invoices: PortalInvoice[];
  requests: PortalRequest[];
}

export interface PortalSession { token: string; expires_at: string | null; email: string }

/** Thrown when the stored session is no longer valid; the page shows the login again. */
export class PortalSessionExpired extends Error {
  constructor() { super('Your sign-in has expired. Enter your email to get a new code.'); }
}

const key = (slug: string) => `portal-session:${slug.toLowerCase()}`;

export async function loadPortalSession(slug: string): Promise<PortalSession | null> {
  try {
    const raw = await AsyncStorage.getItem(key(slug));
    if (!raw) return null;
    const s = JSON.parse(raw) as PortalSession;
    if (!s?.token) return null;
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) {
      await AsyncStorage.removeItem(key(slug));
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export async function savePortalSession(slug: string, s: PortalSession) {
  try { await AsyncStorage.setItem(key(slug), JSON.stringify(s)); } catch {}
}

export async function clearPortalSession(slug: string) {
  try { await AsyncStorage.removeItem(key(slug)); } catch {}
}

const isSessionError = (msg: string) => /expired|invalid session|invalid token|revoked|sign in|unauthori[sz]ed|401/i.test(msg);

async function call<T>(body: Record<string, unknown>): Promise<T> {
  try {
    const r = await callFunction<T & { error?: string }>('portal', body);
    if (r && typeof r === 'object' && 'error' in r && r.error) throw new Error(r.error);
    return r;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (body.token && isSessionError(msg)) throw new PortalSessionExpired();
    if (/Failed to send a request|Failed to fetch|network/i.test(msg)) throw new Error('We could not reach the server. Check your connection and try again.');
    throw new Error(msg);
  }
}

export function requestPortalCode(slug: string, email: string) {
  return call<{ ok: boolean }>({ action: 'request_code', slug, email: email.trim().toLowerCase() });
}

export async function verifyPortalCode(slug: string, email: string, code: string): Promise<PortalSession> {
  const r = await call<{ token: string; expires_at?: string | null }>({ action: 'verify', slug, email: email.trim().toLowerCase(), code: code.trim() });
  if (!r?.token) throw new Error('That code did not work. Check it and try again, or request a new one.');
  const s: PortalSession = { token: r.token, expires_at: r.expires_at ?? null, email: email.trim().toLowerCase() };
  await savePortalSession(slug, s);
  return s;
}

export async function fetchPortalData(token: string): Promise<PortalData> {
  const d = await call<PortalData>({ action: 'data', token });
  // Be forgiving about missing arrays so one empty section never breaks the page.
  return {
    ...d,
    assets: d.assets ?? [], services: d.services ?? [], upcoming_jobs: d.upcoming_jobs ?? [], past_jobs: d.past_jobs ?? [],
    quotes: d.quotes ?? [], invoices: d.invoices ?? [], requests: d.requests ?? [],
  };
}

/** Signed URLs for job photo paths, keyed by path. */
export async function fetchPortalFiles(token: string, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const r = await call<{ urls: Record<string, string> | (string | null)[] }>({ action: 'files', token, paths });
  if (Array.isArray(r?.urls)) {
    const out: Record<string, string> = {};
    r.urls.forEach((u, i) => { if (u) out[paths[i]!] = u; });
    return out;
  }
  return r?.urls ?? {};
}

export interface PortalRequestInput {
  kind: 'booking' | 'reschedule';
  aircraft_id?: string | null;
  service_id?: string | null;
  job_id?: string | null;
  preferred: string[];
  notes?: string | null;
}

export function sendPortalRequest(token: string, input: PortalRequestInput) {
  return call<{ ok: boolean }>({ action: 'request', token, ...input });
}
