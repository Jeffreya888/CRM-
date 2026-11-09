// Founder dashboard helpers: group daily snapshots into weeks and work out funnel steps.

export interface DayStat {
  day: string; // YYYY-MM-DD (UTC)
  companies: number; paid_companies: number; trials: number; new_companies: number; churned: number;
  mrr: number; mrr_net: number;
}

export interface Bucket { label: string; start: string; value: number }

/** Monday (UTC) of the week a YYYY-MM-DD day falls in. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Weekly buckets: `sum` adds the days (sign-ups, cancellations); `last` keeps the latest day's value
 * (revenue, paying companies).
 */
export function byWeek(rows: DayStat[], pick: (r: DayStat) => number, mode: 'sum' | 'last'): Bucket[] {
  const out = new Map<string, Bucket>();
  for (const r of [...rows].sort((a, b) => a.day.localeCompare(b.day))) {
    const start = weekStart(r.day);
    const b = out.get(start) ?? { label: shortDate(start), start, value: 0 };
    b.value = mode === 'sum' ? b.value + Number(pick(r) || 0) : Number(pick(r) || 0);
    out.set(start, b);
  }
  return [...out.values()];
}

/** Change between the first and last value, as a % of the first (null when there's nothing to compare). */
export function growthPct(values: number[]): number | null {
  if (values.length < 2 || !values[0]) return null;
  return Math.round(((values[values.length - 1] - values[0]) / values[0]) * 1000) / 10;
}

export interface Funnel { signed_up: number; added_customer: number; sent_quote: number; completed_job: number; got_paid: number; subscribed: number }

export const FUNNEL_STEPS: { key: keyof Funnel; label: string }[] = [
  { key: 'signed_up', label: 'Signed up' },
  { key: 'added_customer', label: 'Added a customer' },
  { key: 'sent_quote', label: 'Sent a quote' },
  { key: 'completed_job', label: 'Completed a job' },
  { key: 'got_paid', label: 'Got paid through Tarmo' },
  { key: 'subscribed', label: 'Subscribed' },
];

/** Each step as a share of sign-ups, plus how many dropped off since the step before. */
export function funnelSteps(f: Funnel) {
  const base = f.signed_up || 0;
  return FUNNEL_STEPS.map((s, i) => {
    const count = Number(f[s.key] || 0);
    const prev = i === 0 ? count : Number(f[FUNNEL_STEPS[i - 1].key] || 0);
    return { ...s, count, pct: base ? Math.round((count / base) * 100) : 0, lost: Math.max(0, prev - count) };
  });
}
