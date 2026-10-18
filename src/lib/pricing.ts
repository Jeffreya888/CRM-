// Pure pricing logic shared by quotes, jobs and invoices. No React Native
// imports so it can be unit-tested with plain Node (see pricing.test.ts).
import type { AircraftCategory, AssetType, ConditionLevel, LineItem, PricingMethod } from './types';

export const AIRCRAFT_CATEGORIES: { value: AircraftCategory; label: string; typicalLengthFt: number; typicalSpanFt: number; examples: string }[] = [
  { value: 'piston_single', label: 'Piston Single', typicalLengthFt: 27, typicalSpanFt: 36, examples: 'Cessna 172, Cirrus SR22, Bonanza' },
  { value: 'piston_twin', label: 'Piston Twin', typicalLengthFt: 32, typicalSpanFt: 38, examples: 'Baron, Seneca, Aztec' },
  { value: 'turboprop', label: 'Turboprop', typicalLengthFt: 40, typicalSpanFt: 50, examples: 'King Air, PC-12, TBM' },
  { value: 'very_light_jet', label: 'Very Light Jet', typicalLengthFt: 40, typicalSpanFt: 40, examples: 'Phenom 100, HondaJet, Citation M2' },
  { value: 'light_jet', label: 'Light Jet', typicalLengthFt: 50, typicalSpanFt: 50, examples: 'CJ3/CJ4, Phenom 300, Learjet 45' },
  { value: 'midsize_jet', label: 'Midsize Jet', typicalLengthFt: 60, typicalSpanFt: 56, examples: 'Citation XLS, Hawker 800, Latitude' },
  { value: 'super_midsize_jet', label: 'Super-Mid Jet', typicalLengthFt: 68, typicalSpanFt: 63, examples: 'Challenger 350, Citation X, G280' },
  { value: 'large_jet', label: 'Large Cabin Jet', typicalLengthFt: 96, typicalSpanFt: 94, examples: 'G650, Global 6000, Falcon 7X' },
  { value: 'airliner', label: 'Airliner / BBJ', typicalLengthFt: 110, typicalSpanFt: 117, examples: 'BBJ, ACJ, Embraer Lineage' },
  { value: 'helicopter', label: 'Helicopter', typicalLengthFt: 42, typicalSpanFt: 36, examples: 'AS350, Bell 407, S-76' },
  { value: 'other', label: 'Other', typicalLengthFt: 40, typicalSpanFt: 40, examples: '' },
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const VEHICLE_CATEGORIES: { value: AircraftCategory; label: string; typicalLengthFt: number; typicalSpanFt: number; examples: string }[] = [
  { value: 'car', label: 'Car', typicalLengthFt: 15, typicalSpanFt: 6.2, examples: 'Sedan, coupe, hatchback' },
  { value: 'suv', label: 'SUV', typicalLengthFt: 16, typicalSpanFt: 6.6, examples: 'Range Rover, Tahoe, Model X' },
  { value: 'truck', label: 'Truck', typicalLengthFt: 19, typicalSpanFt: 6.8, examples: 'F-150, Silverado, RAM' },
  { value: 'van', label: 'Van', typicalLengthFt: 20, typicalSpanFt: 6.7, examples: 'Sprinter, Transit' },
  { value: 'rv', label: 'RV / Motorhome', typicalLengthFt: 35, typicalSpanFt: 8.5, examples: 'Class A, B, C' },
  { value: 'motorcycle', label: 'Motorcycle', typicalLengthFt: 7, typicalSpanFt: 3, examples: '' },
];

export const WATERCRAFT_CATEGORIES: { value: AircraftCategory; label: string; typicalLengthFt: number; typicalSpanFt: number; examples: string }[] = [
  { value: 'boat_small', label: 'Small boat (under 25 ft)', typicalLengthFt: 22, typicalSpanFt: 8.5, examples: 'Center console, bowrider, PWC' },
  { value: 'boat_medium', label: 'Medium boat (25–40 ft)', typicalLengthFt: 32, typicalSpanFt: 11.5, examples: 'Express cruiser, sportfish' },
  { value: 'boat_large', label: 'Large boat (40–65 ft)', typicalLengthFt: 50, typicalSpanFt: 15.5, examples: 'Flybridge, motor yacht' },
  { value: 'yacht', label: 'Yacht (65 ft+)', typicalLengthFt: 80, typicalSpanFt: 22, examples: 'Superyacht' },
];

export const ASSET_TYPES: { value: AssetType; label: string; plural: string; idLabel: string; icon: 'airplane-outline' | 'car-outline' | 'boat-outline' }[] = [
  { value: 'aircraft', label: 'Aircraft', plural: 'Aircraft', idLabel: 'Tail number', icon: 'airplane-outline' },
  { value: 'vehicle', label: 'Vehicle', plural: 'Vehicles', idLabel: 'Plate or nickname', icon: 'car-outline' },
  { value: 'watercraft', label: 'Watercraft', plural: 'Watercraft', idLabel: 'Vessel name', icon: 'boat-outline' },
];

export const BUSINESS_TYPE_CHOICES: { value: AssetType[]; label: string; hint: string }[] = [
  { value: ['aircraft'], label: 'Aircraft only', hint: 'Private, charter and corporate aircraft' },
  { value: ['aircraft', 'vehicle'], label: 'Aircraft + Vehicles', hint: 'Add cars, trucks, vans and RVs' },
  { value: ['aircraft', 'vehicle', 'watercraft'], label: 'Aircraft + Vehicles + Watercraft', hint: 'Everything, including boats and yachts' },
];

export const categoriesFor = (t: AssetType | null | undefined) =>
  t === 'vehicle' ? VEHICLE_CATEGORIES : t === 'watercraft' ? WATERCRAFT_CATEGORIES : AIRCRAFT_CATEGORIES;

export const assetTypeOf = (c: AircraftCategory | null | undefined): AssetType =>
  VEHICLE_CATEGORIES.some((x) => x.value === c) ? 'vehicle' : WATERCRAFT_CATEGORIES.some((x) => x.value === c) ? 'watercraft' : 'aircraft';

export const assetTypeInfo = (t: AssetType | null | undefined) => ASSET_TYPES.find((a) => a.value === t) ?? ASSET_TYPES[0]!;

export const categoryLabel = (c: AircraftCategory | null | undefined) =>
  [...AIRCRAFT_CATEGORIES, ...VEHICLE_CATEGORIES, ...WATERCRAFT_CATEGORIES].find((x) => x.value === c)?.label ?? 'Unknown';

/** Applies the company's regional price adjustment (e.g. +10%) to a guide price. */
export function adjustPrice(price: number, adjustPct: number | null | undefined): number {
  return round2(price * (1 + (Number(adjustPct) || 0) / 100));
}

export interface PriceableService {
  pricing_method: PricingMethod;
  base_price: number;
  price_per_foot: number;
  price_per_sqft?: number;
  hourly_rate: number;
  category_prices: Partial<Record<AircraftCategory, number>>;
  est_hours: number | null;
}

export interface PriceableAircraft {
  category: AircraftCategory;
  length_ft: number | null;
  wingspan_ft?: number | null;
}

const ALL_CATEGORIES = [...AIRCRAFT_CATEGORIES, ...VEHICLE_CATEGORIES, ...WATERCRAFT_CATEGORIES];

/** Length in feet: the asset's own, else the typical length for its size class. */
export function lengthOf(a?: PriceableAircraft | null): number {
  return Number(a?.length_ft) || ALL_CATEGORIES.find((c) => c.value === a?.category)?.typicalLengthFt || 0;
}

/** Footprint in square feet: length × wingspan (beam for boats, width for vehicles), typical size when unknown. */
export function footprintOf(a?: PriceableAircraft | null): number {
  const span = Number(a?.wingspan_ft) || ALL_CATEGORIES.find((c) => c.value === a?.category)?.typicalSpanFt || 0;
  return Math.round(lengthOf(a) * span);
}


/**
 * Suggested unit price for a service on an aircraft.
 * - flat: base_price
 * - per_foot: max(base_price, length × price_per_foot) — base acts as a minimum charge
 * - per_category: category_prices[category], falling back to base_price
 * - per_sqft: max(base_price, length × wingspan/beam × price_per_sqft)
 * - hourly: est_hours × hourly_rate (quantity can be adjusted on the line)
 */
export function priceService(service: PriceableService, aircraft?: PriceableAircraft | null): number {
  const base = Number(service.base_price) || 0;
  switch (service.pricing_method) {
    case 'flat':
      return round2(base);
    case 'per_foot':
      return round2(Math.max(base, lengthOf(aircraft) * (Number(service.price_per_foot) || 0)));
    case 'per_sqft':
      return round2(Math.max(base, footprintOf(aircraft) * (Number(service.price_per_sqft) || 0)));
    case 'per_category': {
      const p = aircraft ? service.category_prices?.[aircraft.category] : undefined;
      return round2(p != null ? Number(p) : base);
    }
    case 'hourly':
      return round2((Number(service.est_hours) || 1) * (Number(service.hourly_rate) || 0));
  }
}

export function pricingSummary(s: PriceableService): string {
  switch (s.pricing_method) {
    case 'flat': return `$${s.base_price} flat`;
    case 'per_foot': return `$${s.price_per_foot}/ft${s.base_price ? ` (min $${s.base_price})` : ''}`;
    case 'per_sqft': return `$${s.price_per_sqft ?? 0}/sq ft${s.base_price ? ` (min $${s.base_price})` : ''}`;
    case 'per_category': return 'By size class';
    case 'hourly': return `$${s.hourly_rate}/hr`;
  }
}

export interface Totals { subtotal: number; discount: number; taxable: number; tax: number; total: number }

/** Mirrors public.recalc_quote / recalc_invoice so the UI matches the database exactly. */
export function computeTotals(items: Pick<LineItem, 'quantity' | 'unit_price' | 'taxable'>[], discount: number, taxRate: number): Totals {
  const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const taxableGross = items.filter((i) => i.taxable).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const d = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const taxable = subtotal > 0 ? taxableGross - (d * taxableGross) / subtotal : 0;
  const tax = round2(taxable * (Number(taxRate) || 0));
  return { subtotal: round2(subtotal), discount: round2(d), taxable: round2(taxable), tax, total: round2(subtotal - d + tax) };
}

/** "4-6 hours", "2 hours", or null. */
export function hoursLabel(min: number | null | undefined, max: number | null | undefined): string | null {
  const a = Number(min) || 0;
  const b = Number(max) || 0;
  if (!a && !b) return null;
  const fmt = (n: number) => String(+n.toFixed(1));
  if (a && b && b > a) return `${fmt(a)}-${fmt(b)} hours`;
  const one = a || b;
  return `${fmt(one)} hour${one === 1 ? '' : 's'}`;
}

/** Headline price for list cards: a dollar figure, or a rate when it depends on the aircraft. */
export function headlinePrice(s: PriceableService & { pricing_tiers?: { price: number }[] }): string {
  const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
  const tiers = (s.pricing_tiers ?? []).map((t) => Number(t.price)).filter((n) => n > 0);
  if (tiers.length) return tiers.length > 1 ? `From ${usd(Math.min(...tiers))}` : usd(tiers[0]!);
  if (s.pricing_method === 'per_foot') return `${usd(s.price_per_foot)}/ft`;
  if (s.pricing_method === 'per_sqft') return `$${Number(s.price_per_sqft ?? 0).toFixed(2)}/sq ft`;
  if (s.pricing_method === 'hourly') return `${usd(s.hourly_rate)}/hr`;
  if (s.pricing_method === 'per_category') {
    const ps = Object.values(s.category_prices ?? {}).map(Number).filter((n) => n > 0);
    return ps.length ? `From ${usd(Math.min(...ps))}` : usd(s.base_price);
  }
  return usd(s.base_price);
}

// Keyword → class for quick aircraft entry ("Cessna 172", "Citation CJ4", "G650").
const CLASS_HINTS: [RegExp, AircraftCategory][] = [
  [/\b(r22|r44|r66|as350|h125|h130|h135|h145|bell|robinson|sikorsky|s-?76|aw1(09|39)|ec1(30|35|45)|helicopter)\b/i, 'helicopter'],
  [/\b(737|bbj|a3[12]\d|acj|lineage|767|777|787)\b/i, 'airliner'],
  [/\b(g[- ]?(iv|v|450|500|550|600|650|700|800)|gulfstream (iv|v|g[4-8])|global|falcon (7x|8x|900|2000|6x|10x)|challenger (6\d\d)|legacy (500|600|650))\b/i, 'large_jet'],
  [/\b(challenger (3[05]0)|citation (x|sovereign|longitude)|g280|praetor|falcon 50|hawker 4000|legacy 450)\b/i, 'super_midsize_jet'],
  [/\b(citation (xls|excel|latitude|vii|iii|vi)|hawker (800|850|900)|learjet (60|75)|lear(jet)? 6\d|g150|g200|praetor 500)\b/i, 'midsize_jet'],
  [/\b(phenom 100|hondajet|citation (m2|mustang)|eclipse|vision ?jet|sf50|cj1|pc-?24 lite)\b/i, 'very_light_jet'],
  [/\b(citation|cj[234]|cj3\+|phenom 300|learjet|lear|premier|pc-?24|beechjet|hawker 400)\b/i, 'light_jet'],
  [/\b(king ?air|pc-?12|tbm|caravan|pilatus|meridian|m600|kodiak|piaggio|avanti|conquest|cheyenne|commander 69|air tractor|dash ?8|atr)\b/i, 'turboprop'],
  [/\b(baron|seneca|aztec|navajo|seminole|twin comanche|310|340|414|421|da42|da62|duchess|travel air)\b/i, 'piston_twin'],
  [/\b(cessna|piper|cirrus|sr2[02]|bonanza|mooney|diamond|da40|cub|cherokee|archer|warrior|skyhawk|172|182|152|150|206|210|arrow|grumman|beech)\b/i, 'piston_single'],
];

export function guessCategory(type: string): AircraftCategory {
  return CLASS_HINTS.find(([re]) => re.test(type))?.[1] ?? 'other';
}

// ---------------------------------------------------------------------------
// Condition-based pricing and labor estimates (docs/competitive-edge.md §6–7)
// ---------------------------------------------------------------------------
export const CONDITION_LEVELS: { value: ConditionLevel; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Well kept, routine dirt' },
  { value: 'moderate', label: 'Moderate', hint: 'Visible grime, light oxidation or staining' },
  { value: 'heavy', label: 'Heavy', hint: 'Heavy exhaust, bugs, oxidation or wear' },
  { value: 'severe', label: 'Severe', hint: 'Neglected; extra correction work needed' },
];

export const DEFAULT_CONDITION_MULTIPLIERS: Record<ConditionLevel, number> = { light: 0, moderate: 15, heavy: 35, severe: 60 };

export const conditionLabel = (c: ConditionLevel | null | undefined) => CONDITION_LEVELS.find((x) => x.value === c)?.label ?? 'Not set';

/** Percent added for a condition, using the company's multipliers. */
export function conditionPct(level: ConditionLevel | null | undefined, multipliers?: Partial<Record<ConditionLevel, number>> | null): number {
  if (!level) return 0;
  const v = multipliers?.[level];
  return Number(v ?? DEFAULT_CONDITION_MULTIPLIERS[level]) || 0;
}

/** Applies a condition percentage to a unit price. */
export function withCondition(price: number, pct: number | null | undefined): number {
  return round2(price * (1 + (Number(pct) || 0) / 100));
}

/** Estimated labor hours for one unit of a service on an asset (mirrors public._service_estimate). */
export function estimateHours(
  service: Pick<PriceableService, 'pricing_method' | 'est_hours'> & { category_hours?: Partial<Record<AircraftCategory, number>> | null },
  aircraft?: PriceableAircraft | null,
): number | null {
  if (service.pricing_method === 'hourly') return 1;
  const byClass = aircraft ? service.category_hours?.[aircraft.category] : undefined;
  const h = byClass != null ? Number(byClass) : Number(service.est_hours);
  return Number.isFinite(h) && h > 0 ? h : null;
}
