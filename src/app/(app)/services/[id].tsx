import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { notify } from '../../../components/FormSheet';
import { categoryTone } from '../../../components/status';
import { MediaCard } from '../../../components/MediaCard';
import { Badge, Button, Card, ErrorBanner, IconTile, Ionicons, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { AIRCRAFT_CATEGORIES, headlinePrice, hoursLabel } from '../../../lib/pricing';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { openMedia, thumbnails } from '../../../lib/training';
import type { Service, TrainingMedia } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

const usd = (n: number) => `$${Math.round(Number(n)).toLocaleString('en-US')}`;

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role, session } = useOrg();
  const manager = canSeeMoney(role);
  const q = useQuery(async () => {
    const [s, m] = await Promise.all([
      supabase.from('services').select('*').eq('id', id).single(),
      supabase.from('training_media').select('*, service:services(name, category)').eq('service_id', id).order('sort_order'),
    ]);
    if (s.error) throw s.error;
    const media = (m.data ?? []) as TrainingMedia[];
    return { s: s.data as Service, media, thumbs: await thumbnails(media) };
  }, [id]);

  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><ErrorBanner message={q.error ?? 'Not found'} /></Screen>;
  const { s, media, thumbs } = q.data;
  const hours = hoursLabel(s.est_hours, s.est_hours_max);
  const classPrices = s.pricing_method === 'per_category'
    ? AIRCRAFT_CATEGORIES.filter((c) => s.category_prices?.[c.value] != null).map((c) => ({ name: c.label, detail: c.examples, price: Number(s.category_prices[c.value]) }))
    : [];
  const tiers = s.pricing_tiers?.length ? s.pricing_tiers : classPrices;

  return (
    <Screen footer={manager ? <Button kind="secondary" icon="create-outline" title="Edit Service" onPress={() => router.push({ pathname: '/services/edit', params: { id } })} /> : undefined}>
      <Stack.Screen options={{ title: s.name, headerRight: () => <Badge label={s.category} tone={categoryTone[s.category] ?? 'neutral'} large /> }} />
      <Card>
        {s.description ? <T style={{ color: colors.textMuted, lineHeight: 22 }}>{s.description}</T> : null}
        <Row style={{ justifyContent: 'space-between', marginTop: s.description ? space.md : 0 }}>
          {manager ? (
            <Row gap={4}>
              <Ionicons name="logo-usd" size={20} color={colors.success} />
              <T style={{ color: colors.success, fontSize: 24, fontWeight: '800' }}>{headlinePrice(s)}</T>
            </Row>
          ) : <View />}
          {hours ? <Row gap={4}><Ionicons name="time-outline" size={18} color={colors.textMuted} /><T variant="muted">{hours}</T></Row> : null}
        </Row>
        {manager && s.pricing_method === 'per_foot' ? <T variant="small" style={{ marginTop: 6 }}>Priced by aircraft length{Number(s.base_price) ? `, minimum ${usd(s.base_price)}` : ''}. A 50 ft light jet is {usd(Math.max(Number(s.base_price), 50 * Number(s.price_per_foot)))}.</T> : null}
      </Card>

      {manager && tiers.length ? (
        <Section title="Pricing Tiers">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {tiers.map((t, i) => (
              <Row key={t.name + i} style={{ justifyContent: 'space-between', padding: space.lg, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }}>{t.name}</T>
                  {t.detail ? <T variant="muted" numberOfLines={1}>{t.detail}</T> : null}
                </View>
                <T style={{ color: colors.success, fontWeight: '700', fontSize: 17 }}>{usd(t.price)}</T>
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}

      {media.length ? (
        <Section title="Training Media">
          {media.map((m) => (
            <MediaCard key={m.id} m={m} thumb={thumbs[m.id]} onPress={() => openMedia(m, session!.user.id).catch((e) => notify('Could not open', e.message))} />
          ))}
        </Section>
      ) : manager ? (
        <Section title="Training Media">
          <Button kind="secondary" icon="add" title="Add training video or document" onPress={() => router.push({ pathname: '/training', params: { add: id } })} />
        </Section>
      ) : null}

      {s.checklist.length ? (
        <Section title="Step-by-Step Instructions" icon="list-outline">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {s.checklist.map((step, i) => (
              <Row key={i} gap={space.md} style={{ padding: space.lg, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <T variant="small" style={{ color: colors.primaryText, fontWeight: '700' }}>{i + 1}</T>
                </View>
                <T style={{ flex: 1 }}>{step}</T>
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}

      {s.equipment?.length ? (
        <Section title="Equipment Needed" icon="construct-outline" iconColor={colors.warning}>
          <Card>
            <Row style={{ flexWrap: 'wrap' }}>
              {s.equipment.map((e) => (
                <View key={e} style={{ backgroundColor: colors.cardRaised, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <T variant="muted">{e}</T>
                </View>
              ))}
            </Row>
          </Card>
        </Section>
      ) : null}
      {s.recurring_interval_days ? (
        <Card style={{ marginTop: space.lg }}>
          <Row gap={space.md}><IconTile icon="repeat-outline" tone="info" /><T variant="muted" style={{ flex: 1 }}>Customers get a reminder to rebook every {s.recurring_interval_days} days after this service.</T></Row>
        </Card>
      ) : null}
    </Screen>
  );
}
