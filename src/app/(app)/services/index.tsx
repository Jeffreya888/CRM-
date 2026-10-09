import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { Badge, Card, EmptyState, ErrorBanner, Fab, ListRow, Screen, Section, T } from '../../../components/ui';
import { money, titleCase } from '../../../lib/format';
import { AIRCRAFT_CATEGORIES, priceService, pricingSummary } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { space } from '../../../lib/theme';
import type { Service } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

export default function Services() {
  const { orgId } = useOrg();
  const q = useQuery(async () => {
    const { data, error } = await supabase.from('services').select('*').eq('org_id', orgId).order('sort_order').order('name');
    if (error) throw error;
    return (data ?? []) as Service[];
  }, [orgId]);
  const groups = [...new Set((q.data ?? []).map((s) => s.category))];
  const lj = AIRCRAFT_CATEGORIES.find((c) => c.value === 'light_jet')!;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Service menu' }} />
      <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
        <ErrorBanner message={q.error} />
        <T variant="muted">Prices auto-fill on quotes and jobs based on each aircraft's size or class. Example column shows a {lj.typicalLengthFt} ft light jet.</T>
        {!q.loading && !q.data?.length ? <EmptyState icon="pricetags-outline" title="No services yet" /> : null}
        {groups.map((g) => (
          <Section key={g} title={titleCase(g)}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {(q.data ?? []).filter((s) => s.category === g).map((s) => (
                <ListRow key={s.id} title={s.name + (s.active ? '' : ' (hidden)')}
                  subtitle={`${pricingSummary(s)}${s.recurring_interval_days ? ` · repeats every ${s.recurring_interval_days}d` : ''}`}
                  meta={s.checklist.length ? `${s.checklist.length}-step checklist` : null}
                  right={<Badge label={money(s.pricing_method === 'hourly' ? (Number(s.est_hours) || 1) * s.hourly_rate : priceService(s, { category: 'light_jet', length_ft: lj.typicalLengthFt }))} tone="primary" />}
                  onPress={() => router.push({ pathname: '/services/edit', params: { id: s.id } })} />
              ))}
            </Card>
          </Section>
        ))}
        <View style={{ height: space.xl }} />
      </Screen>
      <Fab onPress={() => router.push('/services/edit')} label="New service" />
    </View>
  );
}
