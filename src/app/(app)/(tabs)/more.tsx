import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import { Avatar, Badge, Card, Ionicons, ListRow, Row, Screen, Section, T, type IconName } from '../../../components/ui';
import { APP_NAME } from '../../../lib/config';
import { initials, titleCase } from '../../../lib/format';
import { canAdmin, canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { colors } from '../../../lib/theme';

type Item = { label: string; icon: IconName; href: Href; money?: boolean; admin?: boolean };

const SECTIONS: { title: string; items: Item[] }[] = [
  { title: 'Sales', items: [
    { label: 'Quotes', icon: 'document-text-outline', href: '/quotes', money: true },
    { label: 'Invoices', icon: 'receipt-outline', href: '/invoices', money: true },
    { label: 'Pipeline', icon: 'funnel-outline', href: '/pipeline', money: true },
    { label: 'Service menu & pricing', icon: 'pricetags-outline', href: '/services', money: true },
  ] },
  { title: 'Operations', items: [
    { label: 'Aircraft', icon: 'airplane-outline', href: '/aircraft' },
    { label: 'Service reminders', icon: 'notifications-outline', href: '/reminders' },
    { label: 'Tasks', icon: 'checkbox-outline', href: '/tasks' },
    { label: 'Airports & FBOs', icon: 'location-outline', href: '/locations' },
    { label: 'Inventory & equipment', icon: 'cube-outline', href: '/inventory' },
    { label: 'Time sheets', icon: 'time-outline', href: '/timesheets' },
  ] },
  { title: 'Business', items: [
    { label: 'Reports', icon: 'bar-chart-outline', href: '/reports', money: true },
    { label: 'Expenses', icon: 'wallet-outline', href: '/expenses', money: true },
    { label: 'Team', icon: 'people-circle-outline', href: '/team' },
    { label: 'Settings', icon: 'settings-outline', href: '/settings' },
  ] },
];

export default function More() {
  const { org, role, plan, profile, session, memberships, switchOrg } = useOrg();
  return (
    <Screen>
      <Card>
        <Row>
          <Avatar label={initials(profile?.full_name ?? session?.user.email)} size={48} />
          <View style={{ flex: 1 }}>
            <T variant="h3">{profile?.full_name ?? session?.user.email}</T>
            <T variant="muted">{org.name} · {titleCase(role)}</T>
          </View>
          <Badge label={plan} tone={plan === 'expired' ? 'danger' : plan === 'trial' ? 'warning' : 'success'} />
        </Row>
      </Card>
      {memberships.length > 1 ? (
        <Section title="Switch company">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {memberships.map((m) => (
              <ListRow key={m.org_id} icon="business-outline" title={m.organization?.name ?? ''} subtitle={titleCase(m.role)}
                right={m.org_id === org.id ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : undefined}
                onPress={() => switchOrg(m.org_id)} />
            ))}
          </Card>
        </Section>
      ) : null}
      {SECTIONS.map((s) => {
        const items = s.items.filter((i) => (!i.money || canSeeMoney(role)) && (!i.admin || canAdmin(role)));
        if (!items.length) return null;
        return (
          <Section key={s.title} title={s.title}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {items.map((i) => <ListRow key={i.label} icon={i.icon} title={i.label} onPress={() => router.push(i.href)} />)}
            </Card>
          </Section>
        );
      })}
      {canAdmin(role) ? (
        <Card onPress={() => router.push('/paywall')} style={{ backgroundColor: colors.primary, marginTop: 16 }}>
          <Row>
            <Ionicons name="rocket-outline" size={22} color={colors.accent} />
            <T style={{ color: colors.white, fontWeight: '700', flex: 1 }}>Subscription & plans</T>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </Row>
        </Card>
      ) : null}
      <T variant="small" style={{ textAlign: 'center', marginTop: 16 }}>{APP_NAME}</T>
    </Screen>
  );
}
