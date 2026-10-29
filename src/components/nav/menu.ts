// The app's business-tools menu, shared by the More tab (phones) and the
// desktop sidebar so labels, permissions and plan gating always match.
import { titleCase } from '../../lib/format';
import { APP_NAME } from '../../lib/config';
import { canAdmin, canEdit, canSeeMoney } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import type { Tone } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import type { IconName } from '../ui';

export type MenuItem = {
  label: string;
  /** Shorter label for the desktop sidebar. */
  short?: string;
  subtitle?: string;
  icon: IconName;
  tone: Tone;
  href: string;
  show?: boolean;
  badge?: string;
};
export type MenuGroup = { key: 'company' | 'operations' | 'sales' | 'workflow' | 'finance' | 'help'; title: string; items: MenuItem[] };

export const visibleItems = (items: MenuItem[]) => items.filter((i) => i.show !== false);

/** Menu groups with the same visibility rules as the More screen. */
export function useMenu() {
  const { org, orgId, role, plan, session, perm, can, businessTypes } = useOrg();
  const admin = canAdmin(role);
  const manager = canSeeMoney(role);
  const money = perm('see_prices');
  const uid = session?.user.id;

  const q = useQuery(async () => {
    const [{ count }, pa] = await Promise.all([
      supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('active', true),
      supabase.from('platform_admins').select('user_id').eq('user_id', uid ?? '').maybeSingle(),
    ]);
    return { team: count ?? 0, platformAdmin: !!pa.data };
  }, [orgId, uid]);

  const facilitiesLabel = businessTypes.includes('vehicle') ? 'Airports, FBOs, marinas & service sites' : 'Airports, FBOs & marinas';
  const fleetBadge = plan === 'fleet' || plan === 'trial' ? undefined : 'Fleet';
  const team = q.data?.team;

  const groups: MenuGroup[] = [
    {
      key: 'company', title: 'Company', items: [
        { label: 'Company profile & settings', short: 'Settings', subtitle: 'Invoice sender details, business types, payments', icon: 'business-outline', tone: 'info', href: '/settings' },
        { label: 'Team roles & access', short: 'Team', subtitle: team != null ? `${team} team member${team === 1 ? '' : 's'}` : 'Invite and manage your crew', icon: 'people-outline', tone: 'purple', href: '/team' },
        { label: 'Company locations', short: 'Locations', subtitle: 'Branches you operate from', icon: 'git-branch-outline', tone: 'info', href: '/branches', show: admin, badge: can('branches') ? undefined : 'Fleet' },
        { label: 'Account & security', short: 'Account & security', subtitle: 'Login, two-step verification, devices, notifications', icon: 'shield-checkmark-outline', tone: 'success', href: '/account' },
      ],
    },
    {
      key: 'operations', title: 'Operations', items: [
        { label: `Ask ${APP_NAME}`, short: `Ask ${APP_NAME}`, subtitle: 'AI answers from your SOPs and aircraft documents', icon: 'sparkles-outline', tone: 'primary', href: '/assistant', show: canEdit(role) },
        { label: 'Crew scheduling & resource reservations', short: 'Crew scheduling', subtitle: 'Availability, time off, hangar and equipment bookings', icon: 'people-circle-outline', tone: 'info', href: '/scheduling', show: manager },
        { label: 'Dispatch board', short: 'Dispatch', subtitle: 'Assign today’s jobs to your crew', icon: 'navigate-outline', tone: 'primary', href: '/dispatch', show: manager },
        { label: 'Schedule', subtitle: 'Week view of all jobs', icon: 'calendar-outline', tone: 'info', href: '/schedule' },
        { label: 'Route', subtitle: 'Today’s mobile stops in order, with directions', icon: 'map-outline', tone: 'primary', href: '/route', show: org.service_mode !== 'shop' },
        { label: 'Tasks', icon: 'checkbox-outline', tone: 'info', href: '/tasks' },
        { label: 'Assets', subtitle: 'Customers’ aircraft, vehicles and boats', icon: 'airplane-outline', tone: 'warning', href: '/aircraft' },
        { label: facilitiesLabel, short: 'Facilities', icon: 'location-outline', tone: 'danger', href: '/facilities' },
        { label: 'Supply room', subtitle: 'Stock levels and reorders', icon: 'cube-outline', tone: 'warning', href: '/inventory' },
        { label: 'Equipment & maintenance', short: 'Equipment', icon: 'construct-outline', tone: 'neutral', href: '/equipment' },
      ],
    },
    {
      key: 'sales', title: 'Customers & sales', items: [
        { label: 'Leads & follow-ups', short: 'Leads', icon: 'funnel-outline', tone: 'purple', href: '/leads', show: money },
        { label: 'Booking requests', subtitle: 'From your customer portal', icon: 'mail-unread-outline', tone: 'info', href: '/requests', show: manager },
        { label: 'Quotes & customer approvals', short: 'Quotes', icon: 'document-text-outline', tone: 'info', href: '/quotes', show: money },
        { label: 'Invoices & completion reports', short: 'Invoices', icon: 'receipt-outline', tone: 'purple', href: '/invoices', show: money },
        { label: 'Recurring asset care', short: 'Recurring care', subtitle: 'Repeat services and care plans', icon: 'repeat-outline', tone: 'success', href: '/recurring', show: manager },
        { label: 'Reminders', subtitle: 'Service reminders and delivery readiness', icon: 'notifications-outline', tone: 'warning', href: '/reminders' },
      ],
    },
    {
      key: 'workflow', title: 'Workflow & messaging', items: [
        { label: 'Workflow setup & customer portal', short: 'Workflow & portal', subtitle: 'Automation center, portal, templates', icon: 'git-network-outline', tone: 'primary', href: '/automations', show: manager },
        { label: 'Messages', subtitle: 'Every email and text sent', icon: 'chatbubbles-outline', tone: 'info', href: '/messages', show: manager },
        { label: 'Customer texting', icon: 'phone-portrait-outline', tone: 'success', href: '/texting', show: manager },
        { label: 'Scheduling integrations', short: 'Integrations', subtitle: 'FL3XX, Leon, Schedaero and more', icon: 'sync-outline', tone: 'purple', href: '/integrations', show: admin, badge: fleetBadge },
      ],
    },
    {
      key: 'finance', title: 'Money & time', items: [
        { label: 'Timesheet approvals', short: 'Timesheets', subtitle: 'Pay periods and hours', icon: 'time-outline', tone: 'neutral', href: '/timesheets', show: plan !== 'solo' },
        { label: 'Business expenses', short: 'Expenses', icon: 'wallet-outline', tone: 'danger', href: '/expenses', show: money },
        { label: 'Profit & loss', icon: 'bar-chart-outline', tone: 'success', href: '/reports', show: perm('see_reports') },
      ],
    },
    {
      key: 'help', title: 'Help & plan', items: [
        { label: 'Training center', short: 'Training & SOPs', subtitle: 'SOPs (standard operating procedures) and videos', icon: 'school-outline', tone: 'success', href: '/training' },
        { label: 'Getting started', subtitle: 'Your first 7 steps', icon: 'rocket-outline', tone: 'primary', href: '/getting-started', show: admin },
        { label: 'Flight Ready website & plan information', short: 'About Flight Ready', subtitle: 'Plans, privacy, terms and support', icon: 'globe-outline', tone: 'info', href: '/about' },
        { label: 'Plans & billing', subtitle: plan === 'trial' ? 'Free trial' : titleCase(plan), icon: 'card-outline', tone: 'warning', href: '/paywall', show: admin },
        { label: 'Platform admin', subtitle: 'Flight Ready platform health', icon: 'speedometer-outline', tone: 'danger', href: '/admin', show: !!q.data?.platformAdmin },
      ],
    },
  ];

  const group = (key: MenuGroup['key']) => groups.find((g) => g.key === key)!.items;
  return { groups, group, query: q };
}
