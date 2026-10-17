import { router, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { View } from 'react-native';
import { appVersion, openSite, SITE } from '../../components/settings/links';
import { Badge, Card, Ionicons, ListRow, Row, Screen, Section, T, type IconName } from '../../components/ui';
import { APP_NAME, SUPPORT_EMAIL } from '../../lib/config';
import { PLANS, planInfo } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { colors, space, type Tone } from '../../lib/theme';

type LinkItem = { title: string; subtitle: string; icon: IconName; tone: Tone; url: string | null };

export default function About() {
  const { plan, org, role } = useOrg();
  const info = planInfo(plan);
  const admin = role === 'owner' || role === 'admin';

  const links: LinkItem[] = [
    { title: 'Flight Ready website', subtitle: 'Features, business types and FAQ', icon: 'globe-outline', tone: 'info', url: SITE.home },
    { title: 'Plans & pricing', subtitle: 'Solo, Team and Fleet', icon: 'pricetags-outline', tone: 'success', url: SITE.pricing },
    { title: 'Privacy policy', subtitle: 'How we handle your data', icon: 'shield-checkmark-outline', tone: 'purple', url: SITE.privacy },
    { title: 'Terms of service', subtitle: 'The agreement for using Flight Ready', icon: 'document-text-outline', tone: 'neutral', url: SITE.terms },
    { title: 'Support', subtitle: 'Help, getting started guide and contact form', icon: 'help-buoy-outline', tone: 'warning', url: SITE.support },
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Website & plan information' }} />
      <View style={{ alignItems: 'center', marginVertical: space.lg }}>
        <Ionicons name="airplane" size={40} color={colors.primary} />
        <T variant="h2" style={{ marginTop: space.sm }}>{APP_NAME} CRM</T>
        <T variant="muted">Aircraft care. Business ready.</T>
        <T variant="small" style={{ marginTop: 4 }}>Version {appVersion()}</T>
      </View>

      <Card onPress={admin ? () => router.push('/paywall') : undefined}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="muted">Your plan</T>
            <T variant="h3">{plan === 'trial' ? 'Free trial' : info?.name ?? 'No active plan'}</T>
            {info ? <T variant="small">{org.billing_period === 'annual' ? `$${info.annual.toFixed(2)} / year` : `$${info.monthly.toFixed(2)} / month`} · {info.texts.toLocaleString('en-US')} texts / month</T> : null}
          </View>
          <Badge label={plan} tone={plan === 'expired' ? 'danger' : plan === 'trial' ? 'warning' : 'success'} />
          {admin ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
        </Row>
      </Card>

      <Section title="Plans at a glance">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {PLANS.map((p) => (
            <ListRow key={p.id} icon="ribbon-outline" tone={p.id === plan ? 'success' : 'neutral'} title={`${p.name} · $${p.monthly.toFixed(2)}/mo`}
              subtitle={`or $${p.annual.toFixed(2)}/yr · ${(p.feeBps / 100).toFixed(1)}% card fee`}
              meta={p.seats === Infinity ? 'Unlimited team members' : p.seats === 1 ? 'Just you' : `Up to ${p.seats} team members`}
              right={p.id === plan ? <Badge raw label="Current" tone="success" /> : undefined} />
          ))}
        </Card>
      </Section>

      <Section title="Website">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {links.filter((l) => l.url).map((l) => (
            <ListRow key={l.title} icon={l.icon} tone={l.tone} title={l.title} subtitle={l.subtitle}
              right={<Ionicons name="open-outline" size={16} color={colors.textMuted} />} onPress={() => openSite(l.url)} />
          ))}
          <ListRow icon="mail-outline" tone="info" title="Email support" subtitle={SUPPORT_EMAIL}
            right={<Ionicons name="open-outline" size={16} color={colors.textMuted} />}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} support`)}`)} />
        </Card>
      </Section>

      <T variant="small" style={{ textAlign: 'center', marginTop: space.lg }}>© {new Date().getFullYear()} {APP_NAME}</T>
    </Screen>
  );
}
