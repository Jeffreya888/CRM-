import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadServices, prettyCategory } from '../../../components/services/data';
import { categoryTone } from '../../../components/status';
import { Badge, Button, EmptyState, ErrorBanner, Fab, Ionicons, PageTitle, Row, Segmented, T, type IconName } from '../../../components/ui';
import { assetTypeLabel, durationLabel, guideForService, loadGuideLibrary, recurLabel } from '../../../lib/guides';
import { assetTypeInfo, headlinePrice } from '../../../lib/pricing';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { AssetType } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

function Chip({ icon, label, color, bg }: { icon: IconName; label: string; color: string; bg: string }) {
  return (
    <Row gap={3} style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Ionicons name={icon} size={12} color={color} />
      <T variant="small" style={{ color }}>{label}</T>
    </Row>
  );
}

export default function Services() {
  const { orgId, role, perm, businessTypes } = useOrg();
  const money = perm('see_prices');
  const editor = money && canSeeMoney(role);
  const [type, setType] = useState<'all' | AssetType>('all');
  const [cat, setCat] = useState('all');

  const q = useQuery(async () => {
    const [services, lib, m] = await Promise.all([
      loadServices(orgId, money),
      loadGuideLibrary(orgId).catch(() => undefined),
      supabase.from('training_media').select('service_id, kind').eq('org_id', orgId),
    ]);
    return { services, lib, media: (m.data ?? []) as { service_id: string | null; kind: string }[] };
  }, [orgId, money]);

  const all = (q.data?.services ?? []).filter((s) => (editor || s.active) && businessTypes.includes(s.asset_type));
  const byType = all.filter((s) => type === 'all' || s.asset_type === type);
  const cats = [...new Set(byType.map((s) => s.category))];
  const activeCat = cat === 'all' || cats.includes(cat) ? cat : 'all';
  const rows = byType.filter((s) => activeCat === 'all' || s.category === activeCat);
  const hasMedia = (sid: string) => q.data?.media.some((m) => m.service_id === sid && m.kind === 'video');
  const multi = businessTypes.length > 1;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(s) => s.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            <PageTitle title="Services" subtitle={`${all.length} service${all.length === 1 ? '' : 's'}${money ? '' : ' · times and steps'}`}
              right={<Button small kind="secondary" icon="book-outline" title="SOPs" onPress={() => router.push('/training')} />} />
            {multi ? (
              <Segmented value={type} onChange={(v) => { setType(v); setCat('all'); }} options={[
                { value: 'all', label: 'All', count: all.length },
                ...businessTypes.map((t) => ({ value: t, label: assetTypeLabel(t), count: all.filter((s) => s.asset_type === t).length })),
              ]} />
            ) : null}
            {cats.length > 1 ? (
              <Segmented value={activeCat} onChange={setCat} options={[
                { value: 'all', label: 'All categories' },
                ...cats.map((c) => ({ value: c, label: prettyCategory(c), count: byType.filter((s) => s.category === c).length })),
              ]} />
            ) : null}
            <ErrorBanner message={q.error} onRetry={q.reload} />
          </View>
        }
        renderItem={({ item: s }) => {
          const dur = durationLabel(s.est_hours, s.est_hours_max);
          const recur = recurLabel(s.recur_every, s.recur_unit);
          const guide = guideForService(q.data?.lib, s);
          return (
            <Pressable onPress={() => router.push(`/services/${s.id}`)} accessibilityRole="button"
              style={({ pressed }) => [{ backgroundColor: pressed ? colors.cardRaised : colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md, opacity: s.active ? 1 : 0.55 }]}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Row gap={6} style={{ flex: 1 }}>
                  {multi ? <Ionicons name={assetTypeInfo(s.asset_type).icon} size={18} color={colors.textMuted} /> : null}
                  <T style={{ fontSize: 17, fontWeight: '700', flex: 1 }}>{s.name}{s.active ? '' : ' (hidden)'}</T>
                </Row>
                <Badge label={s.category} tone={categoryTone[s.category] ?? 'neutral'} />
              </Row>
              {s.description ? <T variant="muted" style={{ marginTop: 4 }} numberOfLines={2}>{s.description}</T> : null}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.md }} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={space.lg} style={{ flex: 1, flexWrap: 'wrap' }}>
                  {money ? <T style={{ color: colors.primaryText, fontWeight: '700' }}>{headlinePrice(s)}</T> : null}
                  {dur ? <Row gap={4}><Ionicons name="time-outline" size={16} color={colors.textMuted} /><T variant="muted">{dur}</T></Row> : null}
                  {recur ? <Row gap={4}><Ionicons name="repeat-outline" size={16} color={colors.textMuted} /><T variant="muted">{recur}</T></Row> : null}
                </Row>
                <Row gap={6}>
                  {guide ? <Chip icon="book-outline" label="SOP" color={colors.primaryText} bg={colors.primarySoft} /> : null}
                  {hasMedia(s.id) ? <Chip icon="play" label="Video" color={colors.success} bg={colors.successSoft} /> : null}
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Row>
              </Row>
            </Pressable>
          );
        }}
        ListEmptyComponent={q.loading ? null : (
          <EmptyState icon="sparkles-outline" title={all.length ? 'Nothing in this filter' : 'No services yet'}
            body={all.length ? 'Try another type or category.' : editor ? 'Add the services you offer with prices, time estimates and checklists.' : 'Your manager hasn’t added services yet.'} />
        )}
      />
      {editor ? <Fab onPress={() => router.push('/services/edit')} label="New service" /> : null}
    </SafeAreaView>
  );
}
