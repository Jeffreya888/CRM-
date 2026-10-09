// Pure pricing logic shared by quotes, jobs and invoices. No React Native
// imports so it can be unit-tested with plain Node (see pricing.test.ts).
import type { AircraftCategory, LineItem, PricingMethod } from './types';

export const AIRCRAFT_CATEGORIES: { value: AircraftCategory; label: string; typicalLengthFt: number; examples: string }[] = [
  { value: 'piston_single', label: 'Piston Single', typicalLengthFt: 27, examples: 'Cessna 172, Cirrus SR22, Bonanza' },
  { value: 'piston_twin', label: 'Piston Twin', typicalLengthFt: 32, examples: 'Baron, Seneca, Aztec' },
  { value: 'turboprop', label: 'Turboprop', typicalLengthFt: 40, examples: 'King Air, PC-12, TBM' },
  { value: 'very_light_jet', label: 'Very Light Jet', typicalLengthFt: 40, examples: 'Phenom 100, HondaJet, Citation M2' },
  { value: 'light_jet', label: 'Light Jet', typicalLengthFt: 50, examples: 'CJ3/CJ4, Phenom 300, Learjet 45' },
  { value: 'midsize_jet', label: 'Midsize Jet', typicalLengthFt: 60, examples: 'Citation XLS, Hawker 800, Latitude' },
  { value: 'super_midsize_jet', label: 'Super-Mid Jet', typicalLengthFt: 68, examples: 'Challenger 350, Citation X, G280' },
  { value: 'large_jet', label: 'Large Cabin Jet', typicalLengthFt: 96, examples: 'G650, Global 6000, Falcon 7X' },
  { value: 'airliner', label: 'Airliner / BBJ', typicalLengthFt: 110, examples: 'BBJ, ACJ, Embraer Lineage' },
  { value: 'helicopter', label: 'Helicopter', typicalLengthFt: 42, examples: 'AS350, Bell 407, S-76' },
  { value: 'other', label: 'Other', typicalLengthFt: 40, examples: '' },
];

export const categoryLabel = (c: AircraftCategory | null | undefined) =>
  AIRCRAFT_CATEGORIES.find((x) => x.value === c)?.label ?? 'Unknown';

export interface PriceableService {
  pricing_method: PricingMethod;
  base_price: number;
  price_per_foot: number;
  hourly_rate: number;
  category_prices: Partial<Record<AircraftCategory, number>>;
  est_hours: number | null;
}

export interface PriceableAircraft {
  category: AircraftCategory;
  length_ft: number | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Suggested unit price for a service on an aircraft.
 * - flat: base_price
 * - per_foot: max(base_price, length × price_per_foot) — base acts as a minimum charge
 * - per_category: category_prices[category], falling back to base_price
 * - hourly: est_hours × hourly_rate (quantity can be adjusted on the line)
 */
export function priceService(service: PriceableService, aircraft?: PriceableAircraft | null): number {
  const base = Number(service.base_price) || 0;
  switch (service.pricing_method) {
    case 'flat':
      return round2(base);
    case 'per_foot': {
      const length = Number(aircraft?.length_ft) || AIRCRAFT_CATEGORIES.find((c) => c.value === aircraft?.category)?.typicalLengthFt || 0;
      return round2(Math.max(base, length * (Number(service.price_per_foot) || 0)));
    }
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
    case 'per_category': return 'By aircraft class';
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
