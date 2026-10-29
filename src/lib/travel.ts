// Mobile detailing: distance from the company's base and the travel fee it adds to a quote.

export type TravelSettings = {
  travel_fee_mode: 'off' | 'per_mile' | 'zones';
  travel_free_miles: number;
  travel_rate_per_mile: number;
  travel_min_fee: number;
  travel_zones: { up_to_miles: number; fee: number }[];
  service_radius_miles: number | null;
};

export type Point = { lat: number; lng: number };

/** Straight-line distances run about a quarter shorter than the drive. */
const ROAD_FACTOR = 1.25;

/** Estimated driving miles between two points (straight line × road factor), one decimal. */
export function drivingMiles(a: Point, b: Point): number {
  const R = 3958.8; // earth radius, miles
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const miles = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.round(miles * ROAD_FACTOR * 10) / 10;
}

export type TravelQuote = {
  /** Fee to add (0 when free or off). */
  fee: number;
  /** Line item text, e.g. "Travel fee (32 mi)". */
  label: string;
  /** Beyond the service area (still quotable; the owner decides). */
  outsideArea: boolean;
  /** No zone covers this distance. */
  noZone: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Travel fee for a one-way distance in miles. */
export function travelFee(s: TravelSettings, miles: number): TravelQuote {
  const m = Math.max(0, Number(miles) || 0);
  const outsideArea = !!s.service_radius_miles && m > Number(s.service_radius_miles);
  const label = `Travel fee (${Math.round(m)} mi)`;
  if (s.travel_fee_mode === 'per_mile') {
    const billable = Math.max(0, m - Number(s.travel_free_miles || 0));
    const raw = billable * Number(s.travel_rate_per_mile || 0);
    const fee = billable > 0 ? Math.max(raw, Number(s.travel_min_fee || 0)) : 0;
    return { fee: round2(fee), label, outsideArea, noZone: false };
  }
  if (s.travel_fee_mode === 'zones') {
    const zones = [...(s.travel_zones ?? [])].filter((z) => Number(z.up_to_miles) > 0).sort((a, b) => a.up_to_miles - b.up_to_miles);
    const zone = zones.find((z) => m <= Number(z.up_to_miles));
    if (!zone) return { fee: 0, label, outsideArea: true, noZone: zones.length > 0 };
    return { fee: round2(Number(zone.fee) || 0), label, outsideArea, noZone: false };
  }
  return { fee: 0, label, outsideArea, noZone: false };
}

/** Google Maps link for the day's stops in order (opens turn-by-turn in the Maps app on phones). */
export function routeUrl(stops: string[], origin?: string | null): string | null {
  const list = stops.filter(Boolean);
  if (!list.length) return null;
  const destination = list[list.length - 1];
  const waypoints = list.slice(0, -1);
  const q = new URLSearchParams({ api: '1', destination, travelmode: 'driving' });
  if (origin) q.set('origin', origin);
  if (waypoints.length) q.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}
