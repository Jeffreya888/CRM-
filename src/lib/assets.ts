// Helpers for customer assets (aircraft, vehicles, watercraft), facilities,
// leads and per-customer settings. Owned by the Customers/Assets area.
import { Platform } from 'react-native';
import { AIRCRAFT_CATEGORIES, WATERCRAFT_CATEGORIES, guessCategory } from './pricing';
import { supabase } from './supabase';
import type { Aircraft, AircraftCategory, AircraftModel, AssetType, Location, Stage } from './types';

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** Editable shape of an asset used by forms (strings for numeric inputs). */
export interface AssetDraft {
  asset_type: AssetType;
  tail_number: string;      // aircraft tail, vessel name, or vehicle nickname
  manufacturer: string;
  model: string;
  year: string;
  category: AircraftCategory;
  length_ft: string;
  wingspan_ft: string;      // wingspan (aircraft) or beam (watercraft)
  model_id: string | null;
  plate: string;
  vin: string;
  hull_id: string;
  serial_number: string;
}

export function emptyDraft(t: AssetType): AssetDraft {
  return {
    asset_type: t, tail_number: '', manufacturer: '', model: '', year: '',
    category: t === 'vehicle' ? 'car' : t === 'watercraft' ? 'boat_small' : 'other',
    length_ft: '', wingspan_ft: '', model_id: null, plate: '', vin: '', hull_id: '', serial_number: '',
  };
}

export function draftFromAsset(a: Partial<Aircraft>): AssetDraft {
  const s = (v: unknown) => (v == null ? '' : String(v));
  return {
    asset_type: a.asset_type ?? 'aircraft', tail_number: s(a.tail_number), manufacturer: s(a.manufacturer), model: s(a.model),
    year: s(a.year), category: a.category ?? 'other', length_ft: s(a.length_ft), wingspan_ft: s(a.wingspan_ft),
    model_id: a.model_id ?? null, plate: s(a.plate), vin: s(a.vin), hull_id: s(a.hull_id), serial_number: s(a.serial_number),
  };
}

const num = (v: string) => {
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return v.trim() && Number.isFinite(n) && n > 0 ? n : null;
};
const txt = (v: string) => (v.trim() ? v.trim() : null);

/** The identifier stored in `tail_number` (required and unique per company). */
export function draftIdentifier(d: AssetDraft): string {
  if (d.asset_type === 'aircraft') return d.tail_number.trim().toUpperCase().replace(/\s/g, '');
  if (d.asset_type === 'vehicle') {
    return d.tail_number.trim() || d.plate.trim().toUpperCase()
      || [d.year, d.manufacturer, d.model].map((x) => x.trim()).filter(Boolean).join(' ');
  }
  return d.tail_number.trim();
}

/** Returns an error sentence, or null when the draft can be saved. */
export function validateDraft(d: AssetDraft): string | null {
  if (!draftIdentifier(d)) {
    if (d.asset_type === 'aircraft') return 'Enter the tail number (registration)';
    if (d.asset_type === 'vehicle') return 'Enter a plate, nickname, or make and model';
    return 'Enter the vessel name';
  }
  if (d.year.trim() && !/^\d{4}$/.test(d.year.trim())) return 'Year must be four digits, e.g. 2019';
  return null;
}

/** Converts a draft to the columns of the `aircraft` table. */
export function draftToRow(d: AssetDraft): Record<string, unknown> {
  return {
    asset_type: d.asset_type,
    tail_number: draftIdentifier(d),
    manufacturer: txt(d.manufacturer),
    model: txt(d.model),
    year: d.year.trim() ? Number(d.year) : null,
    category: d.category,
    length_ft: num(d.length_ft),
    wingspan_ft: d.asset_type === 'vehicle' ? null : num(d.wingspan_ft),
    model_id: d.asset_type === 'vehicle' ? null : d.model_id,
    plate: d.asset_type === 'vehicle' ? txt(d.plate)?.toUpperCase() ?? null : null,
    vin: d.asset_type === 'vehicle' ? txt(d.vin)?.toUpperCase() ?? null : null,
    hull_id: d.asset_type === 'watercraft' ? txt(d.hull_id)?.toUpperCase() ?? null : null,
    serial_number: txt(d.serial_number),
  };
}

/** Free-text type ("Cessna 172") → manufacturer + model + guessed class. */
export function splitFreeText(text: string, t: AssetType, lengthFt?: number | null) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const manufacturer = parts.length > 1 ? parts[0]! : '';
  const model = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] ?? '';
  const category: AircraftCategory = t === 'watercraft' ? boatClassForLength(lengthFt) : guessCategory(text);
  return { manufacturer, model, category };
}

export function boatClassForLength(ft: number | null | undefined): AircraftCategory {
  const n = Number(ft) || 0;
  if (!n || n < 25) return 'boat_small';
  if (n < 40) return 'boat_medium';
  if (n < 65) return 'boat_large';
  return 'yacht';
}

/** "Gulfstream G650ER" or the identifier label fallback. */
export const assetModelName = (a: Pick<Aircraft, 'manufacturer' | 'model'> & { year?: number | null }) =>
  [a.year, a.manufacturer, a.model].filter(Boolean).join(' ');

export const assetIcon = (t: AssetType | null | undefined) =>
  t === 'vehicle' ? 'car-outline' as const : t === 'watercraft' ? 'boat-outline' as const : 'airplane-outline' as const;

/** Labels for the second dimension: wingspan (aircraft) or beam (boats). */
export const widthLabel = (t: AssetType) => (t === 'watercraft' ? 'Beam' : 'Wingspan');

/** Categories in the catalog per asset type (catalog holds aircraft and boats). */
export const catalogCategories = (t: AssetType): AircraftCategory[] =>
  (t === 'watercraft' ? WATERCRAFT_CATEGORIES : AIRCRAFT_CATEGORIES).map((c) => c.value);

/** Searches the built-in model catalog by manufacturer and/or model words. */
export async function searchModels(query: string, t: AssetType, limit = 25): Promise<AircraftModel[]> {
  const tokens = query.toLowerCase().replace(/[%,()*\\"'.:]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4);
  if (!tokens.length) return [];
  let q = supabase.from('aircraft_models').select('id, manufacturer, model, category, length_ft, wingspan_ft')
    .in('category', catalogCategories(t));
  for (const tok of tokens) q = q.or(`manufacturer.ilike.%${tok}%,model.ilike.%${tok}%`);
  const { data, error } = await q.order('manufacturer').order('model').limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AircraftModel[];
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export const AUTOMATION_EXCEPTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'job_reminder', label: 'Job reminders', hint: 'Reminder before a scheduled visit' },
  { key: 'on_our_way', label: 'On our way', hint: 'Heads-up when the crew leaves' },
  { key: 'ready_for_pickup', label: 'Ready for pickup', hint: 'Text when a shop job is finished' },
  { key: 'quote_win_back', label: 'Win back lost quotes', hint: 'After a quote expires or is declined' },
  { key: 'customer_win_back', label: 'Win back quiet customers', hint: 'After months without a visit' },
  { key: 'service_due', label: 'Service due', hint: 'When a recurring service comes due' },
  { key: 'job_rebook', label: 'Rebook canceled jobs', hint: 'After a job is canceled' },
  { key: 'job_complete', label: 'Job complete + photos', hint: 'Summary when a job is finished' },
  { key: 'invoice_reminders', label: 'Invoice reminders', hint: 'e.g. turn off for net-60 accounts' },
  { key: 'review_request', label: 'Review requests', hint: 'Ask for a review after a job' },
  { key: 'quote_follow_up', label: 'Quote follow-ups', hint: 'Nudges on quotes not yet answered' },
  { key: 'recurring_heads_up', label: 'Recurring visit heads-up', hint: 'Notice before a recurring visit' },
];

export const CUSTOMER_KINDS = [
  ['owner', 'Owner'], ['management_company', 'Management company'], ['charter', 'Charter operator'], ['flight_school', 'Flight school'],
  ['fbo', 'FBO'], ['corporate', 'Corporate / fleet'], ['government', 'Government / military'], ['other', 'Other'],
].map(([value, label]) => ({ value: value!, label: label! }));

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
export const LEAD_STAGES: { value: Stage; label: string; p: number }[] = [
  { value: 'new', label: 'New', p: 10 }, { value: 'contacted', label: 'Contacted', p: 25 }, { value: 'quoted', label: 'Quoted', p: 50 },
  { value: 'negotiating', label: 'Negotiating', p: 75 }, { value: 'won', label: 'Won', p: 100 }, { value: 'lost', label: 'Lost', p: 0 },
];

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------
export type FacilityKind = Location['kind'];
export const FACILITY_KINDS: { value: FacilityKind; label: string; plural: string; forType: AssetType; icon: 'airplane-outline' | 'boat-outline' | 'home-outline' }[] = [
  { value: 'airport', label: 'Airport / FBO', plural: 'Airports & FBOs', forType: 'aircraft', icon: 'airplane-outline' },
  { value: 'marina', label: 'Marina', plural: 'Marinas', forType: 'watercraft', icon: 'boat-outline' },
  { value: 'service_site', label: 'Service site', plural: 'Service sites', forType: 'vehicle', icon: 'home-outline' },
];
export const facilityKindsFor = (types: AssetType[]) => FACILITY_KINDS.filter((k) => types.includes(k.forType));
export const facilityKindInfo = (k: FacilityKind | null | undefined) => FACILITY_KINDS.find((x) => x.value === k) ?? FACILITY_KINDS[0]!;

export const SITE_TYPES: { value: NonNullable<Location['site_type']>; label: string }[] = [
  { value: 'residence', label: 'Residence' },
  { value: 'fleet_yard', label: 'Business / fleet yard' },
  { value: 'dealership', label: 'Dealership' },
  { value: 'shop', label: 'Your shop' },
  { value: 'other', label: 'Other' },
];
export const siteTypeLabel = (v: string | null | undefined) => SITE_TYPES.find((s) => s.value === v)?.label ?? null;

export const REQUIREMENT_KINDS = [
  { value: 'coi', label: 'Insurance certificate (COI)' },
  { value: 'badge', label: 'Badge' },
  { value: 'registration', label: 'Vendor registration' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
];

export const facilityTitle = (l: Pick<Location, 'airport_code' | 'name'>) => [l.airport_code, l.name].filter(Boolean).join(' · ');

/** Directions to a facility: Apple Maps on iOS, Google Maps elsewhere. Uses the pin, else the address. */
export function directionsUrl(l: Pick<Location, 'latitude' | 'longitude' | 'address' | 'name'>): string | null {
  const dest = l.latitude != null && l.longitude != null ? `${l.latitude},${l.longitude}` : l.address?.trim() || null;
  if (!dest) return null;
  const d = encodeURIComponent(dest);
  return Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${d}` : `https://www.google.com/maps/dir/?api=1&destination=${d}`;
}

/** Opens the pin (or address) in a map without directions. */
export function mapUrl(l: Pick<Location, 'latitude' | 'longitude' | 'address' | 'name'>): string | null {
  const hasPin = l.latitude != null && l.longitude != null;
  const where = hasPin ? `${l.latitude},${l.longitude}` : l.address?.trim();
  if (!where) return null;
  const q = encodeURIComponent(where);
  if (Platform.OS === 'ios') return hasPin ? `http://maps.apple.com/?ll=${where}&q=${encodeURIComponent(l.name)}` : `http://maps.apple.com/?q=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** Expiration state of a document. */
export function expiryState(expires: string | null | undefined, now = new Date()): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (!expires) return { label: 'No expiry', tone: 'success' };
  const days = Math.ceil((new Date(expires + 'T23:59:59').getTime() - now.getTime()) / 864e5);
  if (days < 0) return { label: 'Expired', tone: 'danger' };
  if (days <= 30) return { label: `Expires in ${days} day${days === 1 ? '' : 's'}`, tone: 'warning' };
  return { label: 'Valid', tone: 'success' };
}

/** Same rule the scheduler uses: linked to the requirement, or same kind and name. */
export function certMatches(c: { requirement_id: string | null; kind: string; name: string }, r: { id: string; kind: string; name: string }) {
  return c.requirement_id === r.id || (c.kind === r.kind && c.name.trim().toLowerCase() === r.name.trim().toLowerCase());
}
