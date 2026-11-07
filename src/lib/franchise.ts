// Franchise networks: HQ setup, locations, reports, royalties and pushed standards.
import { friendlyError, supabase } from './supabase';
import type { LocationStats, RoyaltyRow } from './franchiseReport';

export interface FranchiseNetwork {
  id: string; hq_org_id: string; name: string; royalty_pct: number; marketing_pct: number; public_slug: string | null; booking_enabled: boolean;
  invite_code: string; hq_playbook: string | null; standards_pushed_at: string | null; created_at: string;
}
export interface FranchiseMember {
  network_id: string; org_id: string; location_name: string | null; territory: string | null; share_details: boolean; joined_at: string;
}
export interface LocationJob {
  job_number: string; status: string; finished_at: string; asset: string | null; invoice_total: number | null; qc_status: string; rating: number | null;
}

const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendlyError(error.message.replace(/^(HQ_LOCKED|PLAN|TERRITORY):\s*/, '')));
  return data as T;
};

/** The network this company runs as HQ, and the one it belongs to as a location (either may be null). */
export async function loadFranchise(orgId: string): Promise<{ hq: FranchiseNetwork | null; membership: (FranchiseMember & { network: FranchiseNetwork | null }) | null }> {
  const [hq, mem] = await Promise.all([
    supabase.from('franchise_networks').select('*').eq('hq_org_id', orgId).maybeSingle(),
    supabase.from('franchise_members').select('*').eq('org_id', orgId).maybeSingle(),
  ]);
  if (hq.error) throw hq.error;
  if (mem.error) throw mem.error;
  let network: FranchiseNetwork | null = null;
  if (mem.data) {
    const n = await supabase.from('franchise_networks').select('*').eq('id', mem.data.network_id).maybeSingle();
    network = (n.data as FranchiseNetwork | null) ?? null;
  }
  return { hq: (hq.data as FranchiseNetwork | null) ?? null, membership: mem.data ? { ...(mem.data as FranchiseMember), network } : null };
}

export const loadMembers = async (networkId: string) => {
  const { data, error } = await supabase.from('franchise_members').select('*').eq('network_id', networkId).order('location_name');
  if (error) throw error;
  return (data ?? []) as FranchiseMember[];
};

export const createNetwork = (orgId: string, name: string, royalty: number, marketing: number) =>
  rpc<string>('franchise_create', { p_org: orgId, p_name: name, p_royalty: royalty, p_marketing: marketing });
export const updateNetwork = (id: string, name: string, royalty: number, marketing: number, playbook: string) =>
  rpc<void>('franchise_update', { p_network: id, p_name: name, p_royalty: royalty, p_marketing: marketing, p_playbook: playbook });
export const newInviteCode = (id: string) => rpc<string>('franchise_new_code', { p_network: id });
export const joinNetwork = (orgId: string, code: string, locationName: string) =>
  rpc<string>('franchise_join', { p_org: orgId, p_code: code, p_location_name: locationName });
export const leaveNetwork = (orgId: string) => rpc<void>('franchise_leave', { p_org: orgId });
export const updateMember = (orgId: string, patch: { locationName?: string; territory?: string; shareDetails?: boolean }) =>
  rpc<void>('franchise_update_member', {
    p_org: orgId, p_location_name: patch.locationName ?? null, p_territory: patch.territory ?? null, p_share_details: patch.shareDetails ?? null,
  });
export const pushStandards = (id: string) => rpc<number>('franchise_push_standards', { p_network: id });

const num = (v: unknown) => Number(v ?? 0) || 0;
export async function loadDashboard(id: string, from: Date, to: Date): Promise<LocationStats[]> {
  const rows = await rpc<any[]>('franchise_dashboard', { p_network: id, p_from: from.toISOString(), p_to: to.toISOString() });
  return (rows ?? []).map((r) => ({
    ...r, revenue: num(r.revenue), invoiced: num(r.invoiced), avg_rating: r.avg_rating == null ? null : Number(r.avg_rating),
  }));
}
export async function loadRoyalties(id: string, month: string): Promise<RoyaltyRow[]> {
  const rows = await rpc<any[]>('franchise_royalties', { p_network: id, p_month: `${month}-01` });
  return (rows ?? []).map((r) => ({
    ...r, gross_sales: num(r.gross_sales), royalty_pct: num(r.royalty_pct), royalty: num(r.royalty), marketing_pct: num(r.marketing_pct), marketing: num(r.marketing),
  }));
}
export const loadLocationJobs = (id: string, orgId: string, from: Date, to: Date) =>
  rpc<LocationJob[]>('franchise_location_jobs', { p_network: id, p_org: orgId, p_from: from.toISOString(), p_to: to.toISOString() });

/** Demo only: makes the demo company HQ of a sample network with four sample locations. */
export const createDemoFranchise = () => rpc<string>('create_demo_franchise', {});

export interface Territory { org_id: string; kind: 'airport' | 'zip'; code: string }
export const loadTerritories = async (networkId: string) => {
  const { data, error } = await supabase.from('franchise_territories').select('org_id, kind, code').eq('network_id', networkId).order('code');
  if (error) throw error;
  return (data ?? []) as Territory[];
};
/** Splits "KHOU, kiah  77001" into clean codes. */
export const parseCodes = (text: string) => text.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
export const setTerritories = (networkId: string, orgId: string, airports: string[], zips: string[]) =>
  rpc<void>('franchise_set_territories', { p_network: networkId, p_org: orgId, p_airports: airports, p_zips: zips });
export const setBookingPage = (networkId: string, enabled: boolean, slug: string) =>
  rpc<string>('franchise_set_booking', { p_network: networkId, p_enabled: enabled, p_slug: slug });
export async function loadLeadCounts(networkId: string, from: Date, to: Date) {
  const rows = await rpc<{ org_id: string | null; matched_by: string; leads: number }[]>('franchise_lead_counts', {
    p_network: networkId, p_from: from.toISOString(), p_to: to.toISOString(),
  });
  const byOrg: Record<string, number> = {};
  let unassigned = 0;
  for (const r of rows ?? []) {
    if (r.matched_by === 'hq') unassigned += r.leads;
    else if (r.org_id) byOrg[r.org_id] = (byOrg[r.org_id] ?? 0) + r.leads;
  }
  return { byOrg, unassigned, total: Object.values(byOrg).reduce((a, b) => a + b, 0) + unassigned };
}
