// Subscription tiers. Product identifiers must match App Store Connect /
// Google Play and the RevenueCat entitlement ids (see README → Monetization).
// Keep in sync with public.plan_allows / plan_seat_limit in the database.
import type { Organization, Plan, Role } from './types';

export type Feature =
  | 'unlimited_customers' | 'team' | 'timesheet_approvals' | 'online_payments' | 'inventory' | 'reports'
  | 'pipeline' | 'reminders' | 'customer_portal' | 'branches' | 'integrations' | 'stock_locations'
  | 'expenses' | 'texting' | 'recurring'
  | 'photo_quotes' | 'certification' | 'quality_check' | 'job_costing';

export interface PlanInfo {
  id: Exclude<Plan, 'trial' | 'expired'>;
  name: string;
  monthly: number;     // USD, display fallback when store prices haven't loaded
  annual: number;      // USD per year (about two months free)
  seats: number;
  customerLimit: number | null;
  feeBps: number;      // platform fee on card payments
  texts: number;       // included customer texts per month
  aiChecks: number;    // included AI photo checks per month (staff)
  features: Feature[];
  blurb: string;
  highlights: string[];
}

/** AI photo checks included during the free trial (the demo workspace gets 5). */
export const TRIAL_AI_CHECKS = 15;

/** Team and above: customer photo quotes, technician certification, quality checks, job costing report. */
const TEAM_EXTRAS: Feature[] = ['photo_quotes', 'certification', 'quality_check', 'job_costing'];

const CORE: Feature[] = ['online_payments', 'customer_portal', 'reminders', 'expenses', 'recurring', 'texting', 'inventory', 'reports', 'pipeline', 'unlimited_customers'];

export const PLANS: PlanInfo[] = [
  {
    id: 'solo', name: 'Solo', monthly: 39.99, annual: 399.99, seats: 1, customerLimit: null, feeBps: 150, texts: 250, aiChecks: 25,
    features: CORE,
    blurb: 'For an independent detailer running the whole business from one phone.',
    highlights: ['Customers, assets, quotes, jobs & invoices', 'Step-by-step SOPs, condition & size pricing', 'FAA tail number lookup & quote margins', 'Customer portal & card payments', '25 AI photo checks / month', '250 customer texts / month'],
  },
  {
    id: 'team', name: 'Team', monthly: 89.99, annual: 899.99, seats: 10, customerLimit: null, feeBps: 100, texts: 1000, aiChecks: 150,
    features: [...CORE, 'team', 'timesheet_approvals', ...TEAM_EXTRAS],
    blurb: 'For a company coordinating a detailing crew.',
    highlights: ['Everything in Solo', 'Up to 10 team members with roles', 'Crew scheduling, dispatch & timesheet approvals', 'Technician certification & quality checks', 'Job costing: profit by class, model & type', 'Customer photo quotes in the portal', '150 AI photo checks / month', '1,000 customer texts / month'],
  },
  {
    id: 'fleet', name: 'Fleet', monthly: 189.99, annual: 1899.99, seats: Infinity, customerLimit: null, feeBps: 50, texts: 3000, aiChecks: 500,
    features: [...CORE, 'team', 'timesheet_approvals', ...TEAM_EXTRAS, 'branches', 'integrations', 'stock_locations'],
    blurb: 'For multi-location operations and aircraft management partners.',
    highlights: ['Everything in Team', 'Unlimited team members', 'Multiple company locations & stock by location', 'Scheduling-software integrations', '500 AI photo checks / month', '3,000 customer texts / month'],
  },
];

export const FEATURE_LABELS: Record<Feature, string> = {
  unlimited_customers: 'Unlimited customers & assets',
  team: 'Team members, roles & assignments',
  timesheet_approvals: 'Timesheet approvals & pay periods',
  online_payments: 'Card & ACH payments on invoices',
  inventory: 'Supply room & equipment maintenance',
  reports: 'Profit & loss and reports',
  pipeline: 'Leads & follow-ups',
  reminders: 'Automatic reminders & follow-ups',
  customer_portal: 'Customer portal',
  branches: 'Multiple company locations',
  integrations: 'Scheduling-software integrations',
  stock_locations: 'Stock by van & location',
  expenses: 'Business expenses & mileage',
  texting: 'Customer texting',
  recurring: 'Recurring care schedules',
  photo_quotes: 'Customer photo quotes',
  certification: 'Technician certification',
  quality_check: 'Quality check sign-off',
  job_costing: 'Job costing report',
};

export const planInfo = (plan: Plan) => PLANS.find((p) => p.id === plan) ?? null;
export const priceLabel = (p: PlanInfo, period: 'monthly' | 'annual') =>
  period === 'annual' ? `$${p.annual.toFixed(2)}/yr` : `$${p.monthly.toFixed(2)}/mo`;
/** Savings of the yearly price versus twelve monthly payments. */
export const annualSavings = (p: PlanInfo) => Math.round(p.monthly * 12 - p.annual);

/** Effective plan the same way the database computes it. */
export function effectivePlan(org: { plan: Plan; trial_ends_at: string; plan_expires_at: string | null }, now = new Date()): Plan {
  if (org.plan === 'trial') return new Date(org.trial_ends_at) > now ? 'trial' : 'expired';
  if (org.plan === 'expired') return 'expired';
  if (org.plan_expires_at && new Date(org.plan_expires_at) <= now) return 'expired';
  return org.plan;
}

/** The free trial unlocks every feature so owners can evaluate Fleet. */
export function hasFeature(plan: Plan, feature: Feature): boolean {
  if (plan === 'trial') return true;
  if (plan === 'expired') return false;
  return planInfo(plan)?.features.includes(feature) ?? false;
}

/** The cheapest plan that includes a feature (for upgrade prompts). */
export function planFor(feature: Feature): PlanInfo {
  return PLANS.find((p) => p.features.includes(feature)) ?? PLANS[PLANS.length - 1]!;
}

/** Included AI photo checks per month for a plan (trial = TRIAL_AI_CHECKS). */
export function aiChecksFor(plan: Plan): number {
  if (plan === 'trial') return TRIAL_AI_CHECKS;
  if (plan === 'expired') return 0;
  return planInfo(plan)?.aiChecks ?? 0;
}

export function seatLimit(plan: Plan): number {
  if (plan === 'trial') return 10;
  if (plan === 'expired') return 0;
  return planInfo(plan)?.seats ?? 0;
}

export function trialDaysLeft(org: { plan: Plan; trial_ends_at: string }, now = new Date()): number {
  if (org.plan !== 'trial') return 0;
  return Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - now.getTime()) / 864e5));
}

// ---------------------------------------------------------------------------
// Role permissions (owner-editable toggles for managers and technicians).
// Mirrors public.has_perm: owners/admins can do everything, viewers nothing.
// ---------------------------------------------------------------------------
export type Permission = 'see_prices' | 'see_reports' | 'edit_customers' | 'approve_timesheets' | 'give_discounts' | 'delete_records';

export const PERMISSIONS: { key: Permission; label: string; hint: string }[] = [
  { key: 'see_prices', label: 'See prices, quotes & invoices', hint: 'Service prices, quotes, invoices, payments and expenses' },
  { key: 'see_reports', label: 'See profit & loss and reports', hint: 'P&L, job profitability and business reports' },
  { key: 'edit_customers', label: 'Add & edit customers', hint: 'Customers, contacts and their assets' },
  { key: 'approve_timesheets', label: 'Approve timesheets', hint: 'Approve hours for the team' },
  { key: 'give_discounts', label: 'Give discounts', hint: 'Add discounts on quotes and invoices' },
  { key: 'delete_records', label: 'Delete records', hint: 'Delete customers, assets, jobs, quotes and invoices' },
];

export type RolePermissions = Partial<Record<'manager' | 'technician', Partial<Record<Permission, boolean>>>>;

export const DEFAULT_PERMISSIONS: Required<RolePermissions> = {
  manager: { see_prices: true, see_reports: false, edit_customers: true, approve_timesheets: true, give_discounts: true, delete_records: false },
  technician: { see_prices: false, see_reports: false, edit_customers: false, approve_timesheets: false, give_discounts: false, delete_records: false },
};

export function hasPerm(role: Role | null | undefined, org: Pick<Organization, 'role_permissions'> | null | undefined, perm: Permission): boolean {
  if (role === 'owner' || role === 'admin') return true;
  if (!role || role === 'viewer') return false;
  const set = org?.role_permissions?.[role] ?? DEFAULT_PERMISSIONS[role];
  return set?.[perm] ?? DEFAULT_PERMISSIONS[role][perm] ?? false;
}

/** Role-only checks (prefer `perm()` from useSession for money/report access). */
export const canSeeMoney = (role: Role | null | undefined) => role === 'owner' || role === 'admin' || role === 'manager';
export const canAdmin = (role: Role | null | undefined) => role === 'owner' || role === 'admin';
export const isOwner = (role: Role | null | undefined) => role === 'owner';
export const canEdit = (role: Role | null | undefined) => !!role && role !== 'viewer';
export const isManager = canSeeMoney;
