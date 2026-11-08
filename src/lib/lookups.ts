import { useQuery } from './useQuery';
import { supabase } from './supabase';
import { useOrg } from './session';
import type { Option } from '../components/ui';
import type { Aircraft, Branch, Customer, Location, Membership, Service } from './types';

/** Reads every row in pages of 1,000 (the API's per-request limit), up to 20,000. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ data: T[] }> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: out };
}

export type MemberLite = Pick<Membership, 'user_id' | 'display_name' | 'role' | 'color' | 'skills' | 'default_branch_id'>;

/**
 * Shared option lists for pickers. Cheap queries; refreshed on focus.
 * People without the "see prices" permission get the price-free service menu,
 * so `services` rows then have zeroed prices.
 */
export function useLookups() {
  const { orgId, perm } = useOrg();
  const money = perm('see_prices');
  const q = useQuery(async () => {
    const [c, a, l, s, m, b] = await Promise.all([
      allRows((from, to) => supabase.from('customers').select('id, name, company, discount_pct, tax_exempt').eq('org_id', orgId).neq('status', 'inactive')
        .order('name').order('id').range(from, to)),
      allRows((from, to) => supabase.from('aircraft').select('id, tail_number, manufacturer, model, category, length_ft, wingspan_ft, customer_id, asset_type, home_location_id, model_id, condition_level')
        .eq('org_id', orgId).eq('active', true).order('tail_number').order('id').range(from, to)),
      supabase.from('locations').select('id, name, airport_code, fbo_name, kind, hangar_capacity, access_notes').eq('org_id', orgId).eq('active', true).order('name'),
      money
        ? supabase.from('services').select('*').eq('org_id', orgId).order('sort_order')
        : supabase.from('service_menu').select('*').eq('org_id', orgId).order('sort_order'),
      supabase.from('memberships').select('user_id, display_name, role, color, skills, default_branch_id').eq('org_id', orgId).eq('active', true),
      supabase.from('branches').select('*').eq('org_id', orgId).eq('active', true).order('name'),
    ]);
    const services = ((s.data ?? []) as Partial<Service>[]).map((x) => ({
      pricing_method: 'flat', base_price: 0, price_per_foot: 0, hourly_rate: 0, category_prices: {}, pricing_tiers: [],
      taxable: true, asset_type: 'aircraft', guide_key: null, recur_every: null, recur_unit: null, est_hours_max: null,
      price_per_sqft: 0, category_hours: {}, requires_cert: false, ...x,
    })) as Service[];
    return {
      customers: (c.data ?? []) as Pick<Customer, 'id' | 'name' | 'company' | 'discount_pct' | 'tax_exempt'>[],
      aircraft: (a.data ?? []) as Aircraft[],
      locations: (l.data ?? []) as Location[],
      services,
      members: (m.data ?? []) as MemberLite[],
      branches: (b.data ?? []) as Branch[],
    };
  }, [orgId, money]);

  const d = q.data ?? { customers: [], aircraft: [], locations: [], services: [], members: [], branches: [] };
  return {
    ...d,
    loading: q.loading,
    reload: q.reload,
    customerOptions: d.customers.map<Option>((c) => ({ value: c.id, label: c.name, hint: c.company ?? undefined })),
    aircraftOptions: (customerId?: string | null) =>
      d.aircraft
        .filter((a) => !customerId || a.customer_id === customerId)
        .map<Option>((a) => ({ value: a.id, label: a.tail_number, hint: [a.manufacturer, a.model].filter(Boolean).join(' ') || undefined })),
    locationOptions: d.locations.map<Option>((l) => ({ value: l.id, label: [l.airport_code, l.name].filter(Boolean).join(' · '), hint: l.fbo_name ?? undefined })),
    memberOptions: d.members.map<Option>((m) => ({ value: m.user_id, label: m.display_name ?? 'Team member', hint: m.role })),
    branchOptions: d.branches.map<Option>((b) => ({ value: b.id, label: b.name, hint: b.address ?? undefined })),
    memberName: (id: string | null | undefined) => d.members.find((m) => m.user_id === id)?.display_name ?? 'Team member',
  };
}
