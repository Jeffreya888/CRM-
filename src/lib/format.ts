import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';

export function money(n: number | string | null | undefined, currency = 'USD'): string {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v);
}

export function moneyShort(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `$${(v / 1000).toFixed(1)}k`;
  return money(v).replace(/\.00$/, '');
}

const toDate = (d: string | Date) => (typeof d === 'string' ? (d.length === 10 ? parseISO(d + 'T00:00:00') : parseISO(d)) : d);

export function date(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return format(toDate(d), 'MMM d, yyyy');
}

export function dateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const x = toDate(d);
  const day = isToday(x) ? 'Today' : isTomorrow(x) ? 'Tomorrow' : isYesterday(x) ? 'Yesterday' : format(x, 'EEE, MMM d');
  return `${day} · ${format(x, 'h:mm a')}`;
}

export function time(d: string | Date | null | undefined): string {
  return d ? format(toDate(d), 'h:mm a') : '—';
}

export function relative(d: string | Date | null | undefined): string {
  return d ? formatDistanceToNowStrict(toDate(d), { addSuffix: true }) : '—';
}

export function isoDate(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function titleCase(s: string | null | undefined): string {
  return (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string | null | undefined): string {
  return (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}
