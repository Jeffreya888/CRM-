import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { IconName } from '../ui';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';

export interface SetupStep {
  key: string;
  title: string;
  body: string;
  icon: IconName;
  href: string;
  action: string;
  done: boolean;
  note?: string;
}

const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count: n } = await q;
  return n ?? 0;
};

/**
 * The subscriber "Getting started" guide (first 7 steps). Each step's done
 * state is computed from the company's data, so it updates by itself.
 */
export function useSetupSteps() {
  const { org, orgId, plan } = useOrg();
  const q = useQuery(async () => {
    const head = { count: 'exact' as const, head: true };
    const [services, priced, customers, assets, members, invites, completed, photos, sent, automations] = await Promise.all([
      count(supabase.from('services').select('id', head).eq('org_id', orgId).eq('active', true)),
      count(supabase.from('services').select('id', head).eq('org_id', orgId).eq('active', true).or('base_price.gt.0,price_per_foot.gt.0,hourly_rate.gt.0')),
      count(supabase.from('customers').select('id', head).eq('org_id', orgId)),
      count(supabase.from('aircraft').select('id', head).eq('org_id', orgId)),
      count(supabase.from('memberships').select('id', head).eq('org_id', orgId).eq('active', true)),
      count(supabase.from('invitations').select('id', head).eq('org_id', orgId)),
      count(supabase.from('jobs').select('id', head).eq('org_id', orgId).in('status', ['completed', 'invoiced'])),
      count(supabase.from('job_photos').select('id', head).eq('org_id', orgId)),
      count(supabase.from('invoices').select('id', head).eq('org_id', orgId).neq('status', 'draft')),
      count(supabase.from('automations').select('key', head).eq('org_id', orgId).eq('enabled', true)),
    ]);
    return { services, priced, customers, assets, members, invites, completed, photos, sent, automations };
  }, [orgId]);

  const d = q.data;
  const solo = plan === 'solo';
  const steps: SetupStep[] = [
    {
      key: 'profile', title: 'Set up your company profile', icon: 'business-outline', href: '/settings', action: 'Open settings',
      body: 'Your name, logo, phone, email and address appear on every quote and invoice.',
      done: !!(org.name && (org.phone || org.email) && org.address),
    },
    {
      key: 'services', title: 'Choose business types & review prices', icon: 'pricetags-outline', href: '/services', action: 'Review services',
      body: 'Add vehicles or watercraft if you service them, then check your service menu and prices.',
      done: !!d && d.services > 0 && d.priced > 0,
    },
    {
      key: 'customers', title: 'Add customers & their assets', icon: 'people-outline', href: '/customers/new', action: 'Add a customer',
      body: 'Add your first customer and the aircraft (or vehicle or boat) you care for.',
      done: !!d && d.customers > 0 && d.assets > 0,
    },
    {
      key: 'crew', title: 'Invite your crew', icon: 'person-add-outline', href: '/team', action: 'Invite',
      body: 'Give your technicians their own login so they see their jobs, checklists and time clock.',
      done: solo || (!!d && (d.members > 1 || d.invites > 0)),
      note: solo ? 'The Solo plan is just you, so nothing to do here.' : undefined,
    },
    {
      key: 'payments', title: 'Connect payments', icon: 'card-outline', href: '/settings', action: 'Set up payments',
      body: 'Connect Stripe so customers can pay invoices online, or choose “arranged directly”.',
      done: org.payment_mode === 'direct' || !!org.stripe_charges_enabled,
    },
    {
      key: 'job', title: 'Create & complete your first job', icon: 'camera-outline', href: '/jobs/new', action: 'New job',
      body: 'Schedule a job, take before and after photos, and mark it complete.',
      done: !!d && d.completed > 0 && d.photos > 0,
    },
    {
      key: 'invoice', title: 'Send your first invoice & set up automations', icon: 'paper-plane-outline', href: '/invoices', action: 'Invoices',
      body: 'Send an invoice with a pay link, then turn on reminders and review requests in the Automation center.',
      done: !!d && d.sent > 0,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, total: steps.length, allDone: !!d && doneCount === steps.length, loading: q.loading, error: q.error, refresh: q.refresh, refreshing: q.refreshing };
}

/** Remembers on this device whether the dashboard setup card was dismissed. */
export function useSetupCardDismissed(orgId: string) {
  const key = `setup-card-dismissed:${orgId}`;
  const [state, setState] = useState<{ key: string; dismissed: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key)
      .then((v) => { if (alive) setState({ key, dismissed: v === '1' }); })
      .catch(() => { if (alive) setState({ key, dismissed: false }); });
    return () => { alive = false; };
  }, [key]);
  const dismiss = useCallback(() => {
    setState({ key, dismissed: true });
    AsyncStorage.setItem(key, '1').catch(() => {});
  }, [key]);
  // Until loaded, treat as dismissed so the card doesn't flash.
  const dismissed = state?.key === key ? state.dismissed : true;
  return { dismissed, dismiss };
}
