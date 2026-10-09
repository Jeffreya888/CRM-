import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { EmptyState, ErrorBanner, Fab, ListRow, SearchBar } from '../../../components/ui';
import { categoryLabel } from '../../../lib/pricing';
import { canEdit } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

export default function AircraftList() {
  const { orgId, role } = useOrg();
  const [search, setSearch] = useState('');
  const q = useQuery(async () => {
    const { data, error } = await supabase.from('aircraft')
      .select('id, tail_number, manufacturer, model, category, length_ft, active, customer:customers(name), location:locations(airport_code)')
      .eq('org_id', orgId).order('tail_number');
    if (error) throw error;
    return (data ?? []) as any[];
  }, [orgId]);
  const s = search.toLowerCase();
  const rows = (q.data ?? []).filter((a) => !s || [a.tail_number, a.manufacturer, a.model, a.customer?.name].some((x) => x?.toLowerCase().includes(s)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Aircraft' }} />
      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        ListHeaderComponent={<View style={{ padding: space.lg, paddingBottom: 0 }}><SearchBar value={search} onChange={setSearch} placeholder="Tail number, type, owner" /><ErrorBanner message={q.error} /></View>}
        renderItem={({ item: a }) => (
          <ListRow icon="airplane-outline" title={a.tail_number + (a.active ? '' : ' (inactive)')} subtitle={[a.manufacturer, a.model].filter(Boolean).join(' ') || categoryLabel(a.category)}
            meta={[a.customer?.name, a.location?.airport_code, a.length_ft ? `${a.length_ft} ft` : null].filter(Boolean).join(' · ')}
            onPress={() => router.push(`/aircraft/${a.id}`)} />
        )}
        ListEmptyComponent={q.loading ? null : <EmptyState icon="airplane-outline" title="No aircraft yet" body="Add aircraft so quotes price automatically by size." />}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      {canEdit(role) ? <Fab onPress={() => router.push('/aircraft/edit')} label="New aircraft" /> : null}
    </View>
  );
}
