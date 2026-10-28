import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Pressable, View } from 'react-native';
import { confirmAction } from '../../../components/FormSheet';
import { useMenu, type MenuItem } from '../../../components/nav/menu';
import { Avatar, Badge, Button, Card, IconTile, Ionicons, ListRow, Row, Screen, Section, T } from '../../../components/ui';
import { APP_NAME } from '../../../lib/config';
import { initials, titleCase } from '../../../lib/format';
import { canAdmin } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { SOCIALS, socialDisplay, socialUrl } from '../../../lib/social';
import { colors, radius, space } from '../../../lib/theme';

type Item = MenuItem;

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
  const { org, role, plan, profile, session, memberships, switchOrg, signOut } = useOrg();
  const admin = canAdmin(role);
  const { group, query: q } = useMenu();
  const socials = SOCIALS.filter((s) => org[s.key]);
  const company = group('company');
  const operations = group('operations');
  const sales = group('sales');
  const workflow = group('workflow');
  const finance = group('finance');
  const help = group('help');

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
