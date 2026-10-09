// Subscription tiers. Product identifiers must match App Store Connect /
// Google Play and the RevenueCat entitlement ids (see README → Monetization).
import type { Plan, Role } from './types';

export type Feature =
  | 'unlimited_customers' | 'team' | 'online_payments' | 'inventory' | 'reports'
  | 'pipeline' | 'reminders' | 'customer_portal' | 'multi_location' | 'expenses';

export interface PlanInfo {
  id: Exclude<Plan, 'trial' | 'expired'>;
  name: string;
  priceHint: string;   // display fallback when store prices haven't loaded
  seats: number;
  customerLimit: number | null;
  feeBps: number;      // platform fee on card payments
  features: Feature[];
  blurb: string;
}

export const PLANS: PlanInfo[] = [
  {
    id: 'solo', name: 'Solo', priceHint: '$29.99/mo', seats: 1, customerLimit: 50, feeBps: 150,
    features: ['online_payments', 'customer_portal', 'reminders', 'expenses'],
    blurb: 'For owner-operators: quotes, jobs, invoices, photos and card payments.',
  },
  {
    id: 'team', name: 'Team', priceHint: '$79.99/mo', seats: 10, customerLimit: null, feeBps: 100,
    features: ['unlimited_customers', 'team', 'online_payments', 'customer_portal', 'reminders', 'expenses', 'inventory', 'reports', 'pipeline', 'multi_location'],
    blurb: 'Up to 10 staff, scheduling, time clock, inventory, pipeline and reports.',
  },
  {
    id: 'fleet', name: 'Fleet', priceHint: '$199.99/mo', seats: Infinity, customerLimit: null, feeBps: 50,
    features: ['unlimited_customers', 'team', 'online_payments', 'customer_portal', 'reminders', 'expenses', 'inventory', 'reports', 'pipeline', 'multi_location'],
    blurb: 'Unlimited staff and locations, lowest payment fee. For multi-base operations.',
  },
];

export const FEATURE_LABELS: Record<Feature, string> = {
  unlimited_customers: 'Unlimited customers & aircraft',
  team: 'Team members, assignments & time clock',
  online_payments: 'Card & ACH payments on invoices',
  inventory: 'Supply inventory & equipment tracking',
  reports: 'Revenue, profit & technician reports',
  pipeline: 'Sales pipeline',
  reminders: 'Automatic recurring service reminders',
  customer_portal: 'Customer portal: approve quotes, pay invoices',
  multi_location: 'Multiple airports / FBOs',
  expenses: 'Expense tracking',
};

/** Effective plan the same way the database computes it. */
export function effectivePlan(org: { plan: Plan; trial_ends_at: string; plan_expires_at: string | null }, now = new Date()): Plan {
  if (org.plan === 'trial') return new Date(org.trial_ends_at) > now ? 'trial' : 'expired';
  if (org.plan === 'expired') return 'expired';
  if (org.plan_expires_at && new Date(org.plan_expires_at) <= now) return 'expired';
  return org.plan;
}

export function hasFeature(plan: Plan, feature: Feature): boolean {
  if (plan === 'trial') return true; // full Team experience during the trial
  if (plan === 'expired') return false;
  return PLANS.find((p) => p.id === plan)?.features.includes(feature) ?? false;
}

export function trialDaysLeft(org: { plan: Plan; trial_ends_at: string }, now = new Date()): number {
  if (org.plan !== 'trial') return 0;
  return Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - now.getTime()) / 864e5));
}

export const canSeeMoney = (role: Role | null | undefined) => role === 'owner' || role === 'admin' || role === 'manager';
export const canAdmin = (role: Role | null | undefined) => role === 'owner' || role === 'admin';
export const canEdit = (role: Role | null | undefined) => !!role && role !== 'viewer';
