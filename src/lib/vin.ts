// VIN lookup for vehicles (the auto version of the FAA tail-number lookup).
// The vin-lookup function asks NHTSA's free vPIC database for year, make, model
// and body style; this file turns that into a size class for pricing.
// Pure TS so it runs in Node tests (see vin.test.ts).
import type { AircraftCategory } from './types';

/** NHTSA decode result (DecodeVinValues), the fields we use. */
export type VinDecode = {
  make: string | null; model: string | null; year: number | null; trim: string | null;
  body_class: string | null; vehicle_type: string | null; gvwr: string | null; series: string | null;
};

const VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export const normalizeVin = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** 17 characters, no I/O/Q, and the check digit (9th character) matches. */
export function isValidVin(raw: string): boolean {
  const v = normalizeVin(raw);
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = v[i]!;
    const n = /\d/.test(ch) ? Number(ch) : VALUES[ch];
    if (n === undefined) return false;
    sum += n * WEIGHTS[i]!;
  }
  const check = sum % 11 === 10 ? 'X' : String(sum % 11);
  return v[8] === check;
}

const EXOTIC_MAKES = ['ferrari', 'lamborghini', 'mclaren', 'rolls-royce', 'rolls royce', 'bentley', 'aston martin', 'bugatti', 'pagani', 'koenigsegg', 'lotus'];
const FULL_SIZE_SUV = ['tahoe', 'suburban', 'yukon', 'escalade', 'expedition', 'navigator', 'sequoia', 'armada', 'qx80', 'lx', 'gls', 'x7', 'wagoneer', 'range rover'];
const MIDSIZE_TRUCK = ['tacoma', 'ranger', 'colorado', 'canyon', 'frontier', 'ridgeline', 'gladiator', 'maverick', 'santa cruz'];
const EXOTIC_MODELS = ['911', '718', 'corvette', 'gt-r', 'r8', 'nsx', 'viper', 'amg gt', 'maybach'];

/** Heavy-duty: GVWR class 2H (8,501+ lb) and up, or a 2500/3500/HD/Super Duty name. */
function heavyDuty(gvwr: string | null, model: string): boolean {
  if (/class\s*(2h|[3-8])/i.test(gvwr ?? '')) return true;
  return /\b(2500|3500|4500|hd|super duty|f-?[2-4]50)\b/i.test(model);
}

/** Best size class from the decoded body style (used when the catalog has no exact match). */
export function classifyVehicle(d: Pick<VinDecode, 'make' | 'model' | 'body_class' | 'vehicle_type' | 'gvwr'>): AircraftCategory {
  const make = (d.make ?? '').toLowerCase();
  const model = (d.model ?? '').toLowerCase();
  const body = (d.body_class ?? '').toLowerCase();
  const type = (d.vehicle_type ?? '').toLowerCase();
  if (type.includes('motorcycle') || body.includes('motorcycle')) return 'motorcycle';
  if (body.includes('motorhome') || body.includes('motor home')) return 'rv';
  if (EXOTIC_MAKES.some((m) => make.includes(m)) || EXOTIC_MODELS.some((m) => model.startsWith(m))) return 'exotic';
  if (body.includes('van')) return 'van'; // minivan, cargo van, passenger van (NHTSA types big vans as trucks)
  if (body.includes('pickup') || type.includes('truck')) {
    if (heavyDuty(d.gvwr, model)) return 'truck_hd';
    return MIDSIZE_TRUCK.some((m) => model.includes(m)) ? 'truck_mid' : 'truck';
  }
  if (body.includes('crossover') || body.includes('cuv')) return 'crossover';
  if (body.includes('sport utility') || body.includes('suv') || body.includes('multi-purpose') || type.includes('multipurpose')) {
    return FULL_SIZE_SUV.some((m) => model.includes(m)) ? 'suv_full' : 'suv';
  }
  if (body.includes('coupe') || body.includes('hatchback') || body.includes('convertible') || body.includes('cabriolet') || body.includes('roadster')) return 'compact';
  return 'car'; // sedan / saloon / wagon / unknown passenger car
}

/** "TOYOTA" → "Toyota", keeping short brand names like "BMW" and "GMC" upper case. */
export function tidyMake(make: string | null): string {
  const m = (make ?? '').trim();
  if (!m) return '';
  if (m.length <= 4 && !/[aeiou]/i.test(m.slice(1))) return m.toUpperCase();
  return m.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

/** Reads an NHTSA DecodeVinValues reply (Results[0]). Returns null when nothing useful came back. */
export function parseNhtsa(body: unknown): VinDecode | null {
  const r = (body as { Results?: Record<string, string>[] })?.Results?.[0];
  if (!r) return null;
  const val = (k: string) => {
    const v = (r[k] ?? '').trim();
    return v && v !== 'Not Applicable' && v !== '0' ? v : null;
  };
  const d: VinDecode = {
    make: val('Make'), model: val('Model'), year: Number(val('ModelYear')) || null, trim: val('Trim'),
    body_class: val('BodyClass'), vehicle_type: val('VehicleType'), gvwr: val('GVWR'), series: val('Series'),
  };
  return d.make || d.model ? d : null;
}
