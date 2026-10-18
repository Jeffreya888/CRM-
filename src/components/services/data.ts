import { supabase } from '../../lib/supabase';
import type { Service } from '../../lib/types';

/** Fills in fields the price-free service menu (public.service_menu) does not return. */
export function withServiceDefaults(x: Partial<Service>): Service {
  return {
    pricing_method: 'flat', base_price: 0, price_per_foot: 0, hourly_rate: 0, category_prices: {}, pricing_tiers: [],
    taxable: true, asset_type: 'aircraft', guide_key: null, recur_every: null, recur_unit: null, est_hours_max: null,
    checklist: [], equipment: [], price_per_sqft: 0, category_hours: {}, requires_cert: false, ...x,
  } as Service;
}

/**
 * Services for this company. People with "see prices" read the services table;
 * everyone else reads the price-free menu.
 */
export async function loadServices(orgId: string, money: boolean): Promise<Service[]> {
  const r = money
    ? await supabase.from('services').select('*').eq('org_id', orgId).order('sort_order').order('name')
    : await supabase.from('service_menu').select('*').eq('org_id', orgId).order('sort_order').order('name');
  if (r.error) throw r.error;
  return ((r.data ?? []) as Partial<Service>[]).map(withServiceDefaults);
}

export async function loadService(id: string, money: boolean): Promise<Service | null> {
  const r = money
    ? await supabase.from('services').select('*').eq('id', id).maybeSingle()
    : await supabase.from('service_menu').select('*').eq('id', id).maybeSingle();
  if (r.error) throw r.error;
  return r.data ? withServiceDefaults(r.data as Partial<Service>) : null;
}

export const prettyCategory = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
