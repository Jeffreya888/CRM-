import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Pressable, View } from 'react-native';
import { confirmAction } from '../../../components/FormSheet';
import { Avatar, Badge, Button, Card, IconTile, Ionicons, ListRow, Row, Screen, Section, T, type IconName } from '../../../components/ui';
import { APP_NAME } from '../../../lib/config';
import { initials, titleCase } from '../../../lib/format';
import { canAdmin, canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { SOCIALS, socialDisplay, socialUrl } from '../../../lib/social';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space, type Tone } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type Item = { label: string; subtitle?: string; icon: IconName; tone: Tone; href: string; show?: boolean; badge?: string };

function Menu({ items }: { items: Item[] }) {
  const visible = items.filter((i) => i.show !== false);
  if (!visible.length) return null;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {visible.map((i) => (
        <ListRow key={i.label} icon={i.icon} tone={i.tone} title={i.label} subtitle={i.subtitle}
          right={i.badge ? <Row gap={6}><Badge raw label={i.badge} tone="primary" /><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Row> : undefined}
          onPress={() => router.push(i.href)} />
      ))}
    </Card>
  );
}

function Group({ title, items }: { title: string; items: Item[] }) {
  if (!items.some((i) => i.show !== false)) return null;
  return (
    <Section title={title}>
      <Menu items={items} />
    </Section>
  );
}

export default function More() {
  const { org, orgId, role, plan, profile, session, memberships, switchOrg, signOut, perm, can, businessTypes } = useOrg();
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
  const socials = SOCIALS.filter((s) => org[s.key]);

  const company: Item[] = [
    { label: 'Company profile & settings', subtitle: 'Invoice sender details, business types, payments', icon: 'business-outline', tone: 'info', href: '/settings' },
    { label: 'Team roles & access', subtitle: team != null ? `${team} team member${team === 1 ? '' : 's'}` : 'Invite and manage your crew', icon: 'people-outline', tone: 'purple', href: '/team' },
    { label: 'Company locations', subtitle: 'Branches you operate from', icon: 'git-branch-outline', tone: 'info', href: '/branches', show: admin, badge: can('branches') ? undefined : 'Fleet' },
    { label: 'Account & security', subtitle: 'Login, two-step verification, devices, notifications', icon: 'shield-checkmark-outline', tone: 'success', href: '/account' },
  ];
  const operations: Item[] = [
    { label: 'Crew scheduling & resource reservations', subtitle: 'Availability, time off, hangar and equipment bookings', icon: 'people-circle-outline', tone: 'info', href: '/scheduling', show: manager },
    { label: 'Dispatch board', subtitle: 'Assign today’s jobs to your crew', icon: 'navigate-outline', tone: 'primary', href: '/dispatch', show: manager },
    { label: 'Schedule', subtitle: 'Week view of all jobs', icon: 'calendar-outline', tone: 'info', href: '/schedule' },
    { label: 'Tasks', icon: 'checkbox-outline', tone: 'info', href: '/tasks' },
    { label: 'Assets', subtitle: 'Customers’ aircraft, vehicles and boats', icon: 'airplane-outline', tone: 'warning', href: '/aircraft' },
    { label: facilitiesLabel, icon: 'location-outline', tone: 'danger', href: '/facilities' },
    { label: 'Supply room', subtitle: 'Stock levels and reorders', icon: 'cube-outline', tone: 'warning', href: '/inventory' },
    { label: 'Equipment & maintenance', icon: 'construct-outline', tone: 'neutral', href: '/equipment' },
  ];
  const sales: Item[] = [
    { label: 'Leads & follow-ups', icon: 'funnel-outline', tone: 'purple', href: '/leads', show: money },
    { label: 'Booking requests', subtitle: 'From your customer portal', icon: 'mail-unread-outline', tone: 'info', href: '/requests', show: manager },
    { label: 'Quotes & customer approvals', icon: 'document-text-outline', tone: 'info', href: '/quotes', show: money },
    { label: 'Invoices & completion reports', icon: 'receipt-outline', tone: 'purple', href: '/invoices', show: money },
    { label: 'Recurring asset care', subtitle: 'Repeat services and care plans', icon: 'repeat-outline', tone: 'success', href: '/recurring', show: manager },
    { label: 'Reminders', subtitle: 'Service reminders and delivery readiness', icon: 'notifications-outline', tone: 'warning', href: '/reminders' },
  ];
  const workflow: Item[] = [
    { label: 'Workflow setup & customer portal', subtitle: 'Automation center, portal, templates', icon: 'git-network-outline', tone: 'primary', href: '/automations', show: manager },
    { label: 'Messages', subtitle: 'Every email and text sent', icon: 'chatbubbles-outline', tone: 'info', href: '/messages', show: manager },
    { label: 'Customer texting', icon: 'phone-portrait-outline', tone: 'success', href: '/texting', show: manager },
    { label: 'Scheduling integrations', subtitle: 'FL3XX, Leon, Schedaero and more', icon: 'sync-outline', tone: 'purple', href: '/integrations', show: admin, badge: fleetBadge },
  ];
  const finance: Item[] = [
    { label: 'Timesheet approvals', subtitle: 'Pay periods and hours', icon: 'time-outline', tone: 'neutral', href: '/timesheets', show: plan !== 'solo' },
    { label: 'Business expenses', icon: 'wallet-outline', tone: 'danger', href: '/expenses', show: money },
    { label: 'Profit & loss', icon: 'bar-chart-outline', tone: 'success', href: '/reports', show: perm('see_reports') },
  ];
  const help: Item[] = [
    { label: 'Training center', subtitle: 'Step-by-step service guides and videos', icon: 'school-outline', tone: 'success', href: '/training' },
    { label: 'Getting started', subtitle: 'Your first 7 steps', icon: 'rocket-outline', tone: 'primary', href: '/getting-started', show: admin },
    { label: 'Flight Ready website & plan information', subtitle: 'Plans, privacy, terms and support', icon: 'globe-outline', tone: 'info', href: '/about' },
    { label: 'Plans & billing', subtitle: plan === 'trial' ? 'Free trial' : titleCase(plan), icon: 'card-outline', tone: 'warning', href: '/paywall', show: admin },
    { label: 'Platform admin', subtitle: 'Flight Ready platform health', icon: 'speedometer-outline', tone: 'danger', href: '/admin', show: !!q.data?.platformAdmin },
  ];

  return (
    <Screen title="More" subtitle="Settings and business tools" refreshing={q.refreshing} onRefresh={q.refresh}>
      <Card onPress={() => router.push('/settings')}>
        <Row gap={space.md}>
          <Avatar label={initials(profile?.full_name ?? org.name)} size={56} />
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 20, fontWeight: '700' }} numberOfLines={1}>{org.name}</T>
            <T variant="muted" numberOfLines={1}>{org.email ?? session?.user.email}</T>
            <T variant="small" style={{ marginTop: 2 }}>{profile?.full_name ?? session?.user.email} · {titleCase(role)}</T>
          </View>
          <Badge label={plan} tone={plan === 'expired' ? 'danger' : plan === 'trial' ? 'warning' : 'success'} />
        </Row>
      </Card>

      <Group title="Company" items={company} />

      {memberships.length > 1 ? (
        <Section title="Company access" icon="swap-horizontal-outline" iconColor={colors.textMuted}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {memberships.map((m) => (
              <ListRow key={m.org_id} icon="business-outline" title={m.organization?.name ?? 'Company'} subtitle={titleCase(m.role)}
                right={m.org_id === org.id ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : undefined}
                onPress={m.org_id === org.id ? undefined : () => switchOrg(m.org_id)} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Group title="Operations" items={operations} />
      <Group title="Customers & sales" items={sales} />
      <Group title="Workflow & messaging" items={workflow} />
      <Group title="Money & time" items={finance} />

      {socials.length || admin ? (
        <Section title="Social media" icon="share-social-outline" iconColor={colors.textMuted}>
          {socials.map((s) => (
            <Pressable key={s.key} onPress={() => Linking.openURL(socialUrl(s.base, org[s.key]!))}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: s.bg, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, borderWidth: 1, borderColor: s.fg + '33' }, pressed && { opacity: 0.8 }]}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: s.fg + '26', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={s.icon} size={22} color={s.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700', fontSize: 15 }}>{s.label}</T>
                <T variant="small">{socialDisplay(org[s.key]!, org)}</T>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
          {!socials.length ? (
            <Card onPress={() => router.push('/settings')}>
              <Row gap={space.md}><IconTile icon="add" tone="neutral" /><T variant="muted" style={{ flex: 1 }}>Add your Instagram, Facebook, YouTube and LinkedIn in Company profile & settings</T></Row>
            </Card>
          ) : null}
        </Section>
      ) : null}

      <Group title="Help & plan" items={help} />

      <Button style={{ marginTop: space.xl }} kind="secondary" icon="log-out-outline" title="Sign out"
        onPress={() => confirmAction('Sign out?', 'You can sign back in any time.', () => { signOut(); })} />
      <T variant="small" style={{ textAlign: 'center', marginTop: space.lg }}>{APP_NAME} CRM</T>
    </Screen>
  );
}
