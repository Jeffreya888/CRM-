import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { effectivePlan, hasFeature, hasPerm, trialDaysLeft, type Feature, type Permission } from './plans';
import { identifyOrg } from './purchases';
import { supabase } from './supabase';
import type { AssetType, Membership, Organization, Plan, Profile, Role } from './types';

interface SessionState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  org: Organization | null;
  role: Role | null;
  plan: Plan;
  trialDays: number;
  can: (f: Feature) => boolean;
  /** Role permission (owner-editable toggles), e.g. perm('see_prices'). */
  perm: (p: Permission) => boolean;
  /** Business types enabled for the company (always includes aircraft). */
  businessTypes: AssetType[];
  isDemo: boolean;
  /** Company location filter (Fleet). null = all locations. */
  branchId: string | null;
  setBranchId: (id: string | null) => void;
  refresh: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [branchByOrg, setBranchByOrg] = useState<Record<string, string | null>>({});

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setMemberships([]);
      return;
    }
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('memberships').select('*, organization:organizations(*)').eq('user_id', s.user.id).eq('active', true),
    ]);
    setProfile(p as Profile | null);
    setMemberships((m ?? []) as Membership[]);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const current = useMemo(
    () => memberships.find((m) => m.org_id === profile?.current_org_id) ?? memberships[0] ?? null,
    [memberships, profile?.current_org_id],
  );
  const org = current?.organization ?? null;
  const plan: Plan = org ? effectivePlan(org) : 'expired';

  // Subscriptions belong to the organization, not the device user.
  useEffect(() => {
    if (org?.id) identifyOrg(org.id).catch(() => {});
  }, [org?.id]);

  // Remember the chosen company location per company on this device.
  useEffect(() => {
    if (!org?.id || org.id in branchByOrg) return;
    AsyncStorage.getItem(`branch:${org.id}`)
      .then((v) => setBranchByOrg((b) => ({ ...b, [org.id]: v || null })))
      .catch(() => setBranchByOrg((b) => ({ ...b, [org.id]: null })));
  }, [org?.id, branchByOrg]);
  const branchId = org ? branchByOrg[org.id] ?? null : null;

  const value: SessionState = {
    loading,
    session,
    profile,
    memberships,
    org,
    role: current?.role ?? null,
    plan,
    trialDays: org ? trialDaysLeft(org) : 0,
    can: (f) => hasFeature(plan, f),
    perm: (p) => hasPerm(current?.role, org, p),
    businessTypes: org?.business_types?.length ? org.business_types : ['aircraft'],
    isDemo: !!org?.is_demo,
    branchId,
    setBranchId: (id) => {
      if (!org) return;
      setBranchByOrg((b) => ({ ...b, [org.id]: id }));
      AsyncStorage.setItem(`branch:${org.id}`, id ?? '').catch(() => {});
    },
    // Read the current session so a refresh right after sign-in isn't stale.
    refresh: async () => load((await supabase.auth.getSession()).data.session),
    switchOrg: async (orgId) => {
      if (!session) return;
      await supabase.from('profiles').update({ current_org_id: orgId }).eq('id', session.user.id);
      await load(session);
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

/** Shortcut for screens that require an org (always true inside the (app) group). */
export function useOrg() {
  const s = useSession();
  return { ...s, org: s.org!, orgId: s.org?.id ?? '' };
}
