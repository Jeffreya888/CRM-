import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { categoryTone } from '../../../components/status';
import { Badge, EmptyState, ErrorBanner, Fab, Ionicons, PageTitle, Row, Segmented, T } from '../../../components/ui';
import { headlinePrice, hoursLabel } from '../../../lib/pricing';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { Service } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function Services() {
  const { orgId, role } = useOrg();
  const manager = canSeeMoney(role);
  const [cat, setCat] = useState('all');
  const q = useQuery(async () => {
    const [s, m] = await Promise.all([
      supabase.from('services').select('*').eq('org_id', orgId).order('sort_order').order('name'),
      supabase.from('training_media').select('service_id, kind').eq('org_id', orgId),
    ]);
    if (s.error) throw s.error;
    return { services: (s.data ?? []) as Service[], media: (m.data ?? []) as { service_id: string | null; kind: string }[] };
  }, [orgId]);

  const services = (q.data?.services ?? []).filter((s) => manager || s.active);
  const cats = [...new Set(services.map((s) => s.category))];
  const rows = services.filter((s) => cat === 'all' || s.category === cat);
  const has = (sid: string, kind: string) => q.data?.media.some((m) => m.service_id === sid && m.kind === kind);

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
            <PageTitle title="Services" subtitle={`${services.length} service${services.length === 1 ? '' : 's'} available`} />
            <Segmented value={cat} onChange={setCat} options={[
              { value: 'all', label: 'All', count: services.length },
              ...cats.map((c) => ({ value: c, label: pretty(c), count: services.filter((s) => s.category === c).length })),
            ]} />
            <ErrorBanner message={q.error} />
          </View>
        }
        renderItem={({ item: s }) => {
          const hours = hoursLabel(s.est_hours, s.est_hours_max);
          return (
            <Pressable onPress={() => router.push(`/services/${s.id}`)}
              style={({ pressed }) => [{ backgroundColor: pressed ? colors.cardRaised : colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md, opacity: s.active ? 1 : 0.55 }]}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <T style={{ fontSize: 17, fontWeight: '700', flex: 1 }}>{s.name}{s.active ? '' : ' (hidden)'}</T>
                <Badge label={s.category} tone={categoryTone[s.category] ?? 'neutral'} />
              </Row>
              {s.description ? <T variant="muted" style={{ marginTop: 4 }} numberOfLines={2}>{s.description}</T> : null}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.md }} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={space.lg}>
                  {manager ? (
                    <Row gap={4}>
                      <Ionicons name="logo-usd" size={16} color={colors.primary} />
                      <T style={{ color: colors.primaryText, fontWeight: '700' }}>{headlinePrice(s)}</T>
                    </Row>
                  ) : null}
                  {hours ? <Row gap={4}><Ionicons name="time-outline" size={16} color={colors.textMuted} /><T variant="muted">{hours}</T></Row> : null}
                </Row>
                <Row gap={6}>
                  {has(s.id, 'video') ? <Row gap={3} style={{ backgroundColor: colors.successSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Ionicons name="play" size={12} color={colors.success} /><T variant="small" style={{ color: colors.success }}>Video</T></Row> : null}
                  {has(s.id, 'document') ? <Row gap={3} style={{ backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Ionicons name="document-text-outline" size={12} color={colors.primaryText} /><T variant="small" style={{ color: colors.primaryText }}>Docs</T></Row> : null}
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Row>
              </Row>
            </Pressable>
          );
        }}
        ListEmptyComponent={q.loading ? null : <EmptyState icon="sparkles-outline" title="No services yet" body="Add the services you offer with prices, time estimates and checklists." />}
      />
      {manager ? <Fab onPress={() => router.push('/services/edit')} label="New service" /> : null}
    </SafeAreaView>
  );
}
