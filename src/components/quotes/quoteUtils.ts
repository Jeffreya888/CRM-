import { differenceInMinutes, format, isThisWeek, isToday, parseISO } from 'date-fns';
import { useQuery } from '../../lib/useQuery';
import { supabase } from '../../lib/supabase';
import { adjustPrice } from '../../lib/pricing';
import type { LineItem, Quote, QuoteStatus, Service } from '../../lib/types';

export const DECLINE_REASONS: { value: 'price' | 'timing' | 'went_elsewhere' | 'other'; label: string }[] = [
  { value: 'price', label: 'Price' },
  { value: 'timing', label: 'Timing' },
  { value: 'went_elsewhere', label: 'Went elsewhere' },
  { value: 'other', label: 'Other' },
];
export const declineLabel = (r: string | null | undefined) => DECLINE_REASONS.find((x) => x.value === r)?.label ?? 'Not given';

export const DEFAULT_OPTION_NAMES = ['Good', 'Better', 'Best'];

type Deadline = Pick<Quote, 'valid_until_at' | 'valid_until'>;

/** The approval deadline as a Date (falls back to end of the valid-until day). */
export function deadlineOf(q: Deadline): Date | null {
  if (q.valid_until_at) return new Date(q.valid_until_at);
  if (q.valid_until) return new Date(`${q.valid_until}T23:59:00`);
  return null;
}

/** Sent/viewed quotes past their deadline count as expired even before the server marks them. */
export function effectiveStatus(q: Pick<Quote, 'status'> & Deadline): QuoteStatus {
  if ((q.status === 'sent' || q.status === 'viewed')) {
    const d = deadlineOf(q);
    if (d && d.getTime() < Date.now()) return 'expired';
  }
  return q.status;
}

const when = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d)) return `today ${format(d, 'h:mm a')}`;
  if (isThisWeek(d)) return format(d, 'EEE h:mm a');
  return format(d, 'MMM d, h:mm a');
};

/** "Opened 2× · last viewed Tue 3:14 PM", or null when never opened. */
export function viewedLabel(q: Pick<Quote, 'view_count' | 'last_viewed_at'>): string | null {
  if (!q.view_count) return null;
  return `Opened ${q.view_count}×${q.last_viewed_at ? ` · last viewed ${when(q.last_viewed_at)}` : ''}`;
}

/** "3 days 4 hours left", "45 minutes left", or "Deadline passed". */
export function countdown(deadline: Date | null, now = new Date()): string | null {
  if (!deadline) return null;
  const mins = differenceInMinutes(deadline, now);
  if (mins <= 0) return 'Deadline passed';
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}${hours ? ` ${hours} hour${hours === 1 ? '' : 's'}` : ''} left`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ${mins % 60} min left`;
  return `${mins} minute${mins === 1 ? '' : 's'} left`;
}

export interface TemplateContent {
  options: { name: string | null; description?: string | null; items: Pick<LineItem, 'service_id' | 'description' | 'quantity' | 'unit_price' | 'taxable'>[] }[];
  notes?: string | null;
  terms?: string | null;
}

const cleanItems = (items: LineItem[]) =>
  items.filter((i) => i.description.trim()).map((i) => ({
    service_id: i.service_id, description: i.description.trim(), quantity: Number(i.quantity) || 1, unit_price: Number(i.unit_price) || 0, taxable: i.taxable,
  }));

/** Builds quote_templates.content from the editor state. */
export function buildTemplateContent(
  packages: { name: string; description?: string | null; items: LineItem[] }[] | null,
  items: LineItem[],
  notes: string | null | undefined,
  terms: string | null | undefined,
): TemplateContent {
  return {
    options: packages
      ? packages.map((p) => ({ name: p.name.trim() || 'Option', description: p.description ?? null, items: cleanItems(p.items) }))
      : [{ name: null, items: cleanItems(items) }],
    notes: notes || null,
    terms: terms || null,
  };
}

/**
 * Suggested prices from the Tarmo price guide for an aircraft with a
 * catalog model, with the company's regional adjustment applied.
 * Returns a lookup (service → price or null) for LineItemsEditor.priceFor.
 */
export function usePriceGuide(modelId: string | null | undefined, adjustPct: number | null | undefined) {
  const q = useQuery(async () => {
    if (!modelId) return {} as Record<string, number>;
    const { data, error } = await supabase.from('price_guide').select('guide_key, price').eq('model_id', modelId);
    if (error) return {} as Record<string, number>;
    return Object.fromEntries((data ?? []).map((r: any) => [r.guide_key, Number(r.price)])) as Record<string, number>;
  }, [modelId]);
  const guide = q.data ?? {};
  const has = Object.keys(guide).length > 0;
  return {
    hasGuide: has,
    priceFor: (s: Service): number | null => {
      if (!has || !s.guide_key) return null;
      const p = guide[s.guide_key];
      return p == null ? null : adjustPrice(p, adjustPct);
    },
  };
}
