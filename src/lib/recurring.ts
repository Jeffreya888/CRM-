// Helpers for recurring care schedules (time zones, repeat labels, MRR).
// Pure TS so it can be unit-tested without React Native.
import type { RecurUnit, RecurringSchedule } from './types';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const NTH_LABELS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', [-1]: 'last' };

export type Pattern = { nth: number; weekday: number } | null;

/** Offset (minutes) of a time zone from UTC at a given instant. */
export function tzOffsetMinutes(at: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return -at.getTimezoneOffset();
  }
}

/** Wall-clock date ("yyyy-MM-dd") + time ("HH:mm") in `tz` → UTC ISO string. */
export function zonedToUtc(day: string, hhmm: string, tz: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  let off = tzOffsetMinutes(new Date(guess), tz);
  let t = guess - off * 60000;
  const off2 = tzOffsetMinutes(new Date(t), tz);
  if (off2 !== off) { off = off2; t = guess - off * 60000; }
  return new Date(t).toISOString();
}

/** UTC ISO → wall-clock { day: "yyyy-MM-dd", time: "HH:mm" } in `tz`. */
export function utcToZoned(iso: string, tz: string): { day: string; time: string } {
  const at = new Date(iso);
  const local = new Date(at.getTime() + tzOffsetMinutes(at, tz) * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    day: `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}`,
    time: `${p(local.getUTCHours())}:${p(local.getUTCMinutes())}`,
  };
}

/** Formats an instant in the company time zone, e.g. "Tue, Nov 4, 2026 · 9:00 AM". */
export function fmtInTz(iso: string, tz: string, withTime = true): string {
  try {
    const d = new Date(iso);
    const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(d);
    if (!withTime) return day;
    const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
    return `${day} · ${time}`;
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** "every 2 weeks", "every month on the 2nd Tuesday". */
export function describeRepeat(every: number, unit: RecurUnit, pattern?: Pattern): string {
  const base = every === 1 ? `every ${unit}` : `every ${every} ${unit}s`;
  if (unit === 'month' && pattern && pattern.weekday != null) {
    return `${base} on the ${NTH_LABELS[pattern.nth] ?? `${pattern.nth}th`} ${WEEKDAYS[pattern.weekday]}`;
  }
  return base;
}

/** Monthly revenue a schedule represents: care-plan amount, or per-visit price normalized to a month. */
export function monthlyValue(s: Pick<RecurringSchedule, 'billing' | 'care_plan_amount' | 'price' | 'every' | 'unit'>): number {
  if (s.billing === 'care_plan') return Number(s.care_plan_amount) || 0;
  const price = Number(s.price) || 0;
  const every = Math.max(1, Number(s.every) || 1);
  return s.unit === 'week' ? (price * 52) / 12 / every : price / every;
}

export type ScheduleState = 'active' | 'paused' | 'ended';
export function scheduleState(s: Pick<RecurringSchedule, 'active' | 'paused'>): ScheduleState {
  if (!s.active) return 'ended';
  return s.paused ? 'paused' : 'active';
}

/** Time choices every 15 minutes ("HH:mm" values with 12-hour labels). */
export const TIME_OPTIONS: { value: string; label: string }[] = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const label = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return { value, label };
});

export const CARE_PLAN_LABEL: Record<string, string> = {
  pending: 'Waiting for card', active: 'Active', past_due: 'Payment past due', canceled: 'Canceled',
};
