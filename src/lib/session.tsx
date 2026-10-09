import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { effectivePlan, hasFeature, trialDaysLeft, type Feature } from './plans';
import { identifyOrg } from './purchases';
import { supabase } from './supabase';
import type { Membership, Organization, Plan, Profile, Role } from './types';

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
    refresh: () => load(session),
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
