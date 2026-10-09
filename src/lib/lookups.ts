import { useQuery } from './useQuery';
import { supabase } from './supabase';
import { useOrg } from './session';
import type { Option } from '../components/ui';
import type { Aircraft, Customer, Location, Membership, Service } from './types';

/** Shared option lists for pickers. Cheap queries; refreshed on focus. */
export function useLookups() {
  const { orgId, role } = useOrg();
  const money = role === 'owner' || role === 'admin' || role === 'manager';
  const q = useQuery(async () => {
    const [c, a, l, s, m] = await Promise.all([
      supabase.from('customers').select('id, name, company, discount_pct, tax_exempt').eq('org_id', orgId).neq('status', 'inactive').order('name'),
      supabase.from('aircraft').select('id, tail_number, manufacturer, model, category, length_ft, customer_id').eq('org_id', orgId).eq('active', true).order('tail_number'),
      supabase.from('locations').select('id, name, airport_code, fbo_name').eq('org_id', orgId).order('name'),
      supabase.from('services').select('*').eq('org_id', orgId).order('sort_order'),
      supabase.from('memberships').select('user_id, display_name, role, color, hourly_rate').eq('org_id', orgId).eq('active', true),
    ]);
    return {
      customers: (c.data ?? []) as Pick<Customer, 'id' | 'name' | 'company' | 'discount_pct' | 'tax_exempt'>[],
      aircraft: (a.data ?? []) as Aircraft[],
      locations: (l.data ?? []) as Location[],
      services: (s.data ?? []) as Service[],
      members: (m.data ?? []) as Pick<Membership, 'user_id' | 'display_name' | 'role' | 'color' | 'hourly_rate'>[],
    };
  }, [orgId, money]);

  const d = q.data ?? { customers: [], aircraft: [], locations: [], services: [], members: [] };
  return {
    ...d,
    loading: q.loading,
    customerOptions: d.customers.map<Option>((c) => ({ value: c.id, label: c.name, hint: c.company ?? undefined })),
    aircraftOptions: (customerId?: string | null) =>
      d.aircraft
        .filter((a) => !customerId || a.customer_id === customerId)
        .map<Option>((a) => ({ value: a.id, label: a.tail_number, hint: [a.manufacturer, a.model].filter(Boolean).join(' ') || undefined })),
    locationOptions: d.locations.map<Option>((l) => ({ value: l.id, label: [l.airport_code, l.name].filter(Boolean).join(' · '), hint: l.fbo_name ?? undefined })),
    memberOptions: d.members.map<Option>((m) => ({ value: m.user_id, label: m.display_name ?? 'Team member', hint: m.role })),
  };
}
