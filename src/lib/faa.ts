// FAA aircraft registry helpers (docs/competitive-edge.md §1). Owned by the Assets area.
import { supabase } from './supabase';
import type { FaaLookup, FaaLookupFound } from './types';

/** "n-550 gv" → "N550GV". Removes spaces and dashes and uppercases. */
export function normalizeTail(tail: string | null | undefined): string {
  return String(tail ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/**
 * True for US registrations: "N" followed by a digit 1–9 and up to four more
 * digits/letters, or the same without the N. Letters I and O are never used.
 */
export function isUsTail(tail: string | null | undefined): boolean {
  const t = normalizeTail(tail);
  return /^N?[1-9][0-9A-HJ-NP-Z]{0,4}$/.test(t);
}

/** True when a US tail looks complete enough to look up (at least 2 characters after the N). */
export function isLookupReady(tail: string | null | undefined): boolean {
  const t = normalizeTail(tail);
  return isUsTail(t) && t.replace(/^N/, '').length >= 2;
}

/** Looks a tail number up in the FAA registry (rpc faa_lookup). Throws on network/DB errors. */
export async function lookupFaa(orgId: string, tail: string): Promise<FaaLookup> {
  const { data, error } = await supabase.rpc('faa_lookup', { p_org: orgId, p_tail: normalizeTail(tail) });
  if (error) throw new Error(error.message);
  return (data ?? { found: false, reason: 'not_found' }) as FaaLookup;
}

/** Teaches the lookup which catalog model this FAA type is (rpc remember_faa_model). */
export async function rememberFaaModel(orgId: string, tail: string, modelId: string): Promise<void> {
  const { error } = await supabase.rpc('remember_faa_model', { p_org: orgId, p_tail: normalizeTail(tail), p_model: modelId });
  if (error) throw new Error(error.message);
}

/** "GULFSTREAM AEROSPACE" → "Gulfstream Aerospace". */
export const titleCase = (s: string | null | undefined) =>
  String(s ?? '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();

/** "Gulfstream G550" from the catalog match, else the FAA strings ("Gulfstream Aerospace GV-SP (G550)"). */
export function faaTypeName(f: FaaLookupFound): string {
  if (f.catalog) return `${f.catalog.manufacturer} ${f.catalog.model}`;
  return [titleCase(f.faa_manufacturer), f.faa_model].filter(Boolean).join(' ');
}

/** "Wilmington DE" */
export function faaPlace(f: Pick<FaaLookupFound, 'city' | 'state' | 'country'>): string {
  const place = [titleCase(f.city), f.state].filter(Boolean).join(' ');
  return place || (f.country && f.country !== 'US' ? f.country : '');
}

/** "2008 Gulfstream G550 · S/N 5190 · Registered to XYZ LLC, Wilmington DE" */
export function faaSummary(f: FaaLookupFound): string {
  const owner = f.owner ? `Registered to ${[f.owner, faaPlace(f)].filter(Boolean).join(', ')}` : null;
  return [[f.year, faaTypeName(f)].filter(Boolean).join(' '), f.serial ? `S/N ${f.serial}` : null, owner].filter(Boolean).join(' · ');
}

/** Days until the registration expires (negative when past), or null when unknown. */
export function faaDaysLeft(f: Pick<FaaLookupFound, 'expires'>, now = new Date()): number | null {
  if (!f.expires) return null;
  return Math.ceil((new Date(f.expires + 'T23:59:59').getTime() - now.getTime()) / 864e5);
}

/** 'warn' when the registration is not Valid, or expires within 60 days or has expired. */
export function faaStatusTone(f: Pick<FaaLookupFound, 'status' | 'expires'>, now = new Date()): 'ok' | 'warn' {
  if (f.status && f.status.trim().toLowerCase() !== 'valid') return 'warn';
  const days = faaDaysLeft(f, now);
  return days != null && days <= 60 ? 'warn' : 'ok';
}

/** Plain sentence for the yellow note, or null when all is well. */
export function faaWarning(f: Pick<FaaLookupFound, 'status' | 'expires'>, now = new Date()): string | null {
  if (faaStatusTone(f, now) === 'ok') return null;
  if (f.status && f.status.trim().toLowerCase() !== 'valid') return `FAA status: ${f.status}. Check the registration with the owner.`;
  const days = faaDaysLeft(f, now)!;
  return days < 0 ? 'The FAA registration has expired.' : `The FAA registration expires in ${days} day${days === 1 ? '' : 's'}.`;
}
