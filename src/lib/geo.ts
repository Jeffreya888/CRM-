import { callFunction } from './supabase';
import type { Point } from './travel';

/** Looks up a US street address. Returns null when it can't be found. */
export async function geocode(address: string): Promise<(Point & { matched: string }) | null> {
  const r = await callFunction<{ found: boolean; lat?: number; lng?: number; matched?: string }>('geocode', { address });
  return r.found && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng, matched: r.matched ?? address } : null;
}

/** A point from optional lat/lng columns, or null. */
export const pointOf = (lat?: number | null, lng?: number | null): Point | null =>
  lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null;
