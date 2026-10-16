import { router, type Href } from 'expo-router';
import * as Linking from 'expo-linking';
import { Pressable, View } from 'react-native';
import { Avatar, Badge, Card, IconTile, Ionicons, ListRow, Row, Screen, Section, T, type IconName } from '../../../components/ui';
import { APP_NAME } from '../../../lib/config';
import { initials, titleCase } from '../../../lib/format';
import { canAdmin, canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { SOCIALS, socialDisplay, socialUrl } from '../../../lib/social';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space, type Tone } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type Item = { label: string; subtitle?: string; icon: IconName; tone: Tone; href: Href; money?: boolean; admin?: boolean };

function Menu({ items }: { items: Item[] }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {items.map((i) => <ListRow key={i.label} icon={i.icon} tone={i.tone} title={i.label} subtitle={i.subtitle} onPress={() => router.push(i.href)} />)}
    </Card>
  );
}

export default function More() {
  const { org, orgId, role, plan, profile, session, memberships, switchOrg } = useOrg();
  const team = useQuery(async () => {
    const { count } = await supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('active', true);
    return count ?? 0;
  }, [orgId]);
  const allow = (i: Item) => (!i.money || canSeeMoney(role)) && (!i.admin || canAdmin(role));

  const main: Item[] = [
    { label: 'Training Center', subtitle: 'Videos and guides for your team', icon: 'school-outline', tone: 'success', href: '/training' },
    { label: 'Business Profile', subtitle: 'Edit your business information', icon: 'business-outline', tone: 'info', href: '/business', admin: true },
    { label: 'Team Members', subtitle: `${team.data ?? '…'} team member${team.data === 1 ? '' : 's'}`, icon: 'people-outline', tone: 'purple', href: '/team' },
    { label: 'Notifications', subtitle: 'Manage your notification preferences', icon: 'notifications-outline', tone: 'warning', href: '/notifications' },
    { label: 'Settings', subtitle: 'App preferences and settings', icon: 'settings-outline', tone: 'neutral', href: '/settings' },
  ];
  const tools: Item[] = [
    { label: 'Schedule', subtitle: 'Week view of all jobs', icon: 'calendar-outline', tone: 'info', href: '/schedule' },
    { label: 'Quotes', icon: 'document-text-outline', tone: 'info', href: '/quotes', money: true },
    { label: 'Invoices', icon: 'receipt-outline', tone: 'purple', href: '/invoices', money: true },
    { label: 'Aircraft', icon: 'airplane-outline', tone: 'warning', href: '/aircraft' },
    { label: 'Service Reminders', icon: 'repeat-outline', tone: 'success', href: '/reminders' },
    { label: 'Tasks', icon: 'checkbox-outline', tone: 'info', href: '/tasks' },
    { label: 'Pipeline', icon: 'funnel-outline', tone: 'purple', href: '/pipeline', money: true },
    { label: 'Airports & FBOs', icon: 'location-outline', tone: 'danger', href: '/locations' },
    { label: 'Inventory & Equipment', icon: 'cube-outline', tone: 'warning', href: '/inventory' },
    { label: 'Time Sheets', icon: 'time-outline', tone: 'neutral', href: '/timesheets' },
    { label: 'Expenses', icon: 'wallet-outline', tone: 'danger', href: '/expenses', money: true },
    { label: 'Reports', icon: 'bar-chart-outline', tone: 'success', href: '/reports', money: true },
  ];
  const socials = SOCIALS.filter((s) => org[s.key]);

  return (
    <Screen title="More" subtitle="Settings and resources" refreshing={team.refreshing} onRefresh={team.refresh}>
      <Card onPress={canAdmin(role) ? () => router.push('/business') : undefined}>
        <Row gap={space.md}>
          <Avatar label={initials(profile?.full_name ?? org.name)} size={56} />
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 20, fontWeight: '700' }} numberOfLines={1}>{org.name}</T>
            <T variant="muted" numberOfLines={1}>{org.email ?? session?.user.email}</T>
            <T variant="small" style={{ marginTop: 2 }}>{profile?.full_name} · {titleCase(role)}</T>
          </View>
          <Badge label={plan} tone={plan === 'expired' ? 'danger' : plan === 'trial' ? 'warning' : 'success'} />
        </Row>
      </Card>

      <Menu items={main.filter(allow)} />

      {socials.length || canAdmin(role) ? (
        <Section title="Social Media" icon="share-social-outline" iconColor={colors.textMuted}>
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
            <Card onPress={() => router.push('/business')}>
              <Row gap={space.md}><IconTile icon="add" tone="neutral" /><T variant="muted" style={{ flex: 1 }}>Add your Instagram, Facebook, YouTube and LinkedIn in Business Profile</T></Row>
            </Card>
          ) : null}
        </Section>
      ) : null}

      <Section title="Business Tools">
        <Menu items={tools.filter(allow)} />
      </Section>

      {memberships.length > 1 ? (
        <Section title="Switch Company">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {memberships.map((m) => (
              <ListRow key={m.org_id} icon="business-outline" title={m.organization?.name ?? ''} subtitle={titleCase(m.role)}
                right={m.org_id === org.id ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : undefined}
                onPress={() => switchOrg(m.org_id)} />
            ))}
          </Card>
        </Section>
      ) : null}

      {canAdmin(role) ? (
        <Section title="Subscription">
          <Menu items={[{ label: 'Plans & Billing', subtitle: plan === 'trial' ? 'Free trial' : titleCase(plan), icon: 'rocket-outline', tone: 'info', href: '/paywall' }]} />
        </Section>
      ) : null}
      <T variant="small" style={{ textAlign: 'center', marginTop: space.lg }}>{APP_NAME}</T>
    </Screen>
  );
}
