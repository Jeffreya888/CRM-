import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { notify } from '../../../components/FormSheet';
import { MediaCard } from '../../../components/MediaCard';
import { loadService } from '../../../components/services/data';
import { PriceGuideCard } from '../../../components/services/PriceGuideCard';
import { SuppliesCard } from '../../../components/services/SuppliesCard';
import { categoryTone } from '../../../components/status';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconTile, Ionicons, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { assetTypeLabel, durationLabel, guideForService, loadGuideLibrary, recurLabel } from '../../../lib/guides';
import { assetTypeInfo, categoriesFor, headlinePrice } from '../../../lib/pricing';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { openMedia, thumbnails } from '../../../lib/training';
import type { TrainingMedia } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

const usd = (n: number) => `$${Math.round(Number(n)).toLocaleString('en-US')}`;

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, org, role, perm, session } = useOrg();
  const money = perm('see_prices');
  const manager = canSeeMoney(role);
  const editor = money && manager;

  const q = useQuery(async () => {
    const [s, lib, m] = await Promise.all([
      loadService(id, money),
      loadGuideLibrary(orgId).catch(() => undefined),
      supabase.from('training_media').select('*, service:services(name, category)').eq('org_id', orgId).eq('service_id', id).order('sort_order'),
    ]);
    const media = (m.data ?? []) as TrainingMedia[];
    return { s, lib, media, thumbs: await thumbnails(media) };
  }, [id, orgId, money]);

  if (q.loading && !q.data) return <Loading />;
  const s = q.data?.s;
  if (!s) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Service' }} />
        <ErrorBanner message={q.error} onRetry={q.reload} />
        {!q.error ? <EmptyState icon="sparkles-outline" title="Service not found" body="It may have been deleted." /> : null}
      </Screen>
    );
  }
  const { media, thumbs } = q.data!;
  const guide = guideForService(q.data?.lib, s);
  const dur = durationLabel(s.est_hours, s.est_hours_max);
  const recur = recurLabel(s.recur_every, s.recur_unit);
  const classPrices = s.pricing_method === 'per_category'
    ? categoriesFor(s.asset_type).filter((c) => s.category_prices?.[c.value] != null).map((c) => ({ name: c.label, detail: c.examples, price: Number(s.category_prices[c.value]) }))
    : [];
  const tiers = s.pricing_tiers?.length ? s.pricing_tiers : classPrices;
  const classHours = categoriesFor(s.asset_type).filter((c) => s.category_hours?.[c.value] != null && Number(s.category_hours[c.value]) > 0)
    .map((c) => ({ name: c.label, hours: Number(s.category_hours[c.value]) }));
  const hoursText = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${+h.toFixed(1)} h`);
  const lengthNoun = s.asset_type === 'aircraft' ? 'aircraft' : s.asset_type === 'vehicle' ? 'vehicle' : 'boat';

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}
      footer={<Button icon="calendar-outline" title="Schedule a job" onPress={() => router.push({ pathname: '/jobs/new', params: { service: s.id, service_id: s.id } })} />}>
      <Stack.Screen options={{ title: s.name }} />
      <ErrorBanner message={q.error} />
      <Card>
        <Row style={{ flexWrap: 'wrap', marginBottom: space.md }} gap={6}>
          <Badge label={s.category} tone={categoryTone[s.category] ?? 'neutral'} />
          <Row gap={4} style={{ backgroundColor: colors.cardRaised, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Ionicons name={assetTypeInfo(s.asset_type).icon} size={13} color={colors.textMuted} />
            <T variant="small">{assetTypeLabel(s.asset_type)}</T>
          </Row>
          {!s.active ? <Badge label="Hidden from menu" tone="warning" raw /> : null}
          {s.requires_cert && s.guide_key ? <Badge label="Certified technicians only" tone="purple" raw /> : null}
          {money && !s.taxable ? <Badge label="Not taxable" tone="neutral" raw /> : null}
        </Row>
        {s.description ? <T style={{ color: colors.textMuted, lineHeight: 22 }}>{s.description}</T> : null}
        <Row style={{ justifyContent: 'space-between', marginTop: s.description ? space.md : 0, flexWrap: 'wrap' }}>
          {money ? <T style={{ color: colors.success, fontSize: 24, fontWeight: '800' }}>{headlinePrice(s)}</T> : <View />}
          {dur ? <Row gap={4}><Ionicons name="time-outline" size={18} color={colors.textMuted} /><T variant="muted">{dur}</T></Row> : null}
        </Row>
        {money && s.pricing_method === 'per_foot' ? (
          <T variant="small" style={{ marginTop: 6 }}>
            Priced by {lengthNoun} length{Number(s.base_price) ? `, minimum ${usd(s.base_price)}` : ''}.
            {s.asset_type === 'aircraft' ? ` A 50 ft light jet is ${usd(Math.max(Number(s.base_price), 50 * Number(s.price_per_foot)))}.` : ''}
          </T>
        ) : null}
        {money && s.pricing_method === 'per_sqft' ? (
          <T variant="small" style={{ marginTop: 6 }}>
            Priced per square foot (length × {s.asset_type === 'watercraft' ? 'beam' : s.asset_type === 'vehicle' ? 'width' : 'wingspan'}){Number(s.base_price) ? `, minimum ${usd(s.base_price)}` : ''}.
          </T>
        ) : null}
        {money && s.pricing_method === 'hourly' && dur ? <T variant="small" style={{ marginTop: 6 }}>Charged by the hour; estimate {dur}.</T> : null}
        {editor ? (
          <Button small kind="secondary" icon="create-outline" title="Edit service" style={{ alignSelf: 'flex-start', marginTop: space.md }}
            onPress={() => router.push({ pathname: '/services/edit', params: { id: s.id } })} />
        ) : null}
      </Card>

      {money && tiers.length ? (
        <Section title={s.pricing_tiers?.length ? 'Pricing tiers' : 'Price by size'}>
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

      {classHours.length ? (
        <Section title="Time by size" icon="time-outline">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {classHours.map((c, i) => (
              <Row key={c.name} style={{ justifyContent: 'space-between', padding: space.md, paddingHorizontal: space.lg, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <T style={{ flex: 1 }}>{c.name}</T>
                <T style={{ fontWeight: '700' }}>{hoursText(c.hours)}</T>
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}

      {recur ? (
        <Section title="Recurring care" icon="repeat-outline" iconColor={colors.info}>
          <Card>
            <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
              <IconTile icon="repeat-outline" tone="info" />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }}>Recommended {recur.toLowerCase()}</T>
                <T variant="muted" style={{ marginTop: 2 }}>
                  When a job with this service is completed, customers who opted in to follow-up care get an automatic Tentative follow-up job for you to confirm. Everyone else gets a reminder to rebook.
                </T>
              </View>
            </Row>
          </Card>
        </Section>
      ) : null}

      <Section title="SOP (standard operating procedure)" icon="book-outline">
        {guide ? (
          <Card onPress={() => router.push(`/guides/${guide.guide.key}`)}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <T style={{ fontWeight: '700', fontSize: 16, flex: 1 }}>{guide.guide.title}</T>
              <Badge label={guide.isCopy ? 'Company copy' : 'Flight Ready'} tone={guide.isCopy ? 'purple' : 'success'} raw />
            </Row>
            <T variant="muted" numberOfLines={3} style={{ marginTop: 4 }}>{guide.guide.summary}</T>
            <Row gap={space.lg} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
              <Row gap={4}><Ionicons name="list-outline" size={16} color={colors.textMuted} /><T variant="muted">{guide.guide.steps.length} steps</T></Row>
              {guide.guide.crew ? <Row gap={4}><Ionicons name="people-outline" size={16} color={colors.textMuted} /><T variant="muted">{guide.guide.crew}</T></Row> : null}
              <Row gap={4} style={{ marginLeft: 'auto' }}><T style={{ color: colors.primaryText, fontWeight: '600' }}>Open SOP</T><Ionicons name="chevron-forward" size={16} color={colors.primaryText} /></Row>
            </Row>
          </Card>
        ) : (
          <Card>
            <T variant="muted">
              {s.guide_key ? 'The SOP for this service is hidden or was removed.' : 'No SOP linked to this service.'}
              {editor ? ' Choose one in Edit service.' : ''}
            </T>
            <Button small kind="ghost" title="Browse SOPs" style={{ alignSelf: 'flex-start', marginTop: space.sm }} onPress={() => router.push('/guides')} />
          </Card>
        )}
      </Section>

      {s.checklist.length ? (
        <Section title="Job checklist" icon="checkbox-outline" count={`${s.checklist.length} steps`}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {s.checklist.map((step, i) => (
              <Row key={i} gap={space.md} style={{ padding: space.md, paddingHorizontal: space.lg, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <T variant="small" style={{ color: colors.primaryText, fontWeight: '700' }}>{i + 1}</T>
                </View>
                <T style={{ flex: 1 }}>{step}</T>
              </Row>
            ))}
          </Card>
          <T variant="small" style={{ marginTop: space.sm }}>Copied onto every job that includes this service.</T>
        </Section>
      ) : null}

      {s.equipment?.length ? (
        <Section title="Equipment needed" icon="construct-outline" iconColor={colors.warning}>
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

      <SuppliesCard serviceId={s.id} orgId={orgId} manager={manager} />

      {media.length ? (
        <Section title="Training videos" icon="play-circle-outline" iconColor={colors.success}>
          {media.map((m) => (
            <MediaCard key={m.id} m={m} thumb={thumbs[m.id]} onPress={() => openMedia(m, session!.user.id).catch((e) => notify('Could not open', e.message))} />
          ))}
        </Section>
      ) : manager ? (
        <Section title="Training videos" icon="play-circle-outline" iconColor={colors.success}>
          <Button kind="secondary" icon="add" title="Add a training video or document" onPress={() => router.push({ pathname: '/training', params: { add: s.id } })} />
        </Section>
      ) : null}

      {money && s.asset_type === 'aircraft' ? <PriceGuideCard guideKey={s.guide_key} adjustPct={org.price_adjust_pct} /> : null}
    </Screen>
  );
}
