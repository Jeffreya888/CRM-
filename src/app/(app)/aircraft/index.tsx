import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Button, EmptyState, ErrorBanner, Fab, ListRow, SearchBar, Segmented } from '../../../components/ui';
import { assetIcon, assetModelName } from '../../../lib/assets';
import { assetTypeInfo, categoryLabel } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { must, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import type { AssetType } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

/** All customer assets (aircraft, vehicles, watercraft) with a filter per enabled type. */
export default function AssetList() {
  const { orgId, perm, businessTypes } = useOrg();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<AssetType | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);
  const q = useQuery(async () => (await must(supabase.from('aircraft')
    .select('id, tail_number, manufacturer, model, year, category, length_ft, active, asset_type, plate, vin, hull_id, customer:customers(name), location:locations(name, airport_code)')
    .eq('org_id', orgId).order('tail_number'))) as any[], [orgId]);

  const rows0 = (q.data ?? []).filter((a) => showInactive || a.active);
  const s = search.trim().toLowerCase();
  const rows = rows0
    .filter((a) => type === 'all' || a.asset_type === type)
    .filter((a) => !s || [a.tail_number, a.manufacturer, a.model, assetModelName(a), a.plate, a.vin, a.hull_id, a.customer?.name].some((x) => x?.toLowerCase().includes(s)));
  const types = (['aircraft', 'vehicle', 'watercraft'] as AssetType[]).filter((t) => businessTypes.includes(t) || rows0.some((a) => a.asset_type === t));
  const inactiveCount = (q.data ?? []).filter((a) => !a.active).length;
  const title = types.length > 1 ? 'Assets' : 'Aircraft';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title }} />
      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        ListHeaderComponent={
          <View style={{ padding: space.lg, paddingBottom: 0 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Tail number, plate, model, owner" />
            {types.length > 1 ? (
              <Segmented value={type} onChange={setType} options={[
                { value: 'all' as const, label: 'All', count: rows0.length },
                ...types.map((t) => ({ value: t, label: assetTypeInfo(t).plural, count: rows0.filter((a) => a.asset_type === t).length })),
              ]} />
            ) : null}
            {inactiveCount ? (
              <Button small kind="ghost" style={{ alignSelf: 'flex-start', marginBottom: space.sm }} icon={showInactive ? 'eye-off-outline' : 'eye-outline'}
                title={showInactive ? 'Hide inactive' : `Show inactive (${inactiveCount})`} onPress={() => setShowInactive((v) => !v)} />
            ) : null}
            <ErrorBanner message={q.error} onRetry={q.reload} />
          </View>
        }
        renderItem={({ item: a }) => (
          <ListRow icon={assetIcon(a.asset_type)} tone="warning" title={a.tail_number + (a.active ? '' : ' (inactive)')}
            subtitle={assetModelName(a) || categoryLabel(a.category)}
            meta={[a.customer?.name ?? 'No owner', a.location ? (a.location.airport_code ?? a.location.name) : null, categoryLabel(a.category), a.length_ft ? `${a.length_ft} ft` : null].filter(Boolean).join(' · ')}
            onPress={() => router.push(`/aircraft/${a.id}`)} />
        )}
        ListEmptyComponent={q.loading ? null : (
          <EmptyState icon={type === 'all' ? 'airplane-outline' : assetIcon(type)} title={s ? 'No matches' : 'No assets yet'}
            body={s ? 'Try a different tail number, plate or model.' : 'Add the aircraft, vehicles or boats you care for so quotes price by size.'} />
        )}
        contentContainerStyle={{ paddingBottom: 110 }}
      />
      {perm('edit_customers') ? <Fab onPress={() => router.push({ pathname: '/aircraft/edit', params: type !== 'all' ? { type } : {} })} label="New asset" /> : null}
    </View>
  );
}
