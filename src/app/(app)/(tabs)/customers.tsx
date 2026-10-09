import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Avatar, Badge, EmptyState, ErrorBanner, Fab, ListRow, SearchBar, Segmented } from '../../../components/ui';
import { initials, titleCase } from '../../../lib/format';
import { canEdit } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import type { Customer } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

export default function Customers() {
  const { orgId, role } = useOrg();
  const [status, setStatus] = useState<'active' | 'lead' | 'inactive' | 'all'>('active');
  const [search, setSearch] = useState('');

  const q = useQuery(async () => {
    let query = supabase.from('customers').select('id, name, company, kind, status, email, phone, tags, aircraft(tail_number)').eq('org_id', orgId).order('name');
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as (Customer & { aircraft: { tail_number: string }[] })[];
  }, [orgId, status]);

  const s = search.toLowerCase();
  const rows = (q.data ?? []).filter((c) =>
    !s || [c.name, c.company, c.email, c.phone, ...c.tags, ...c.aircraft.map((a) => a.tail_number)].some((x) => x?.toLowerCase().includes(s)),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        ListHeaderComponent={
          <View style={{ padding: space.lg, paddingBottom: 0 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Name, company, tail number, tag" />
            <Segmented value={status} onChange={setStatus} options={[
              { value: 'active', label: 'Active' }, { value: 'lead', label: 'Leads' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' },
            ]} />
            <ErrorBanner message={q.error} />
          </View>
        }
        renderItem={({ item: c }) => (
          <ListRow
            left={<Avatar label={initials(c.name)} />}
            title={c.name}
            subtitle={[c.company, titleCase(c.kind)].filter(Boolean).join(' · ')}
            meta={c.aircraft.map((a) => a.tail_number).join(', ') || c.email || c.phone}
            right={c.status === 'lead' ? <Badge label="Lead" tone="info" /> : undefined}
            onPress={() => router.push(`/customers/${c.id}`)}
          />
        )}
        ListEmptyComponent={q.loading ? null : <EmptyState icon="people-outline" title="No customers yet" body="Add aircraft owners, operators, charter and management companies." />}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      {canEdit(role) ? <Fab onPress={() => router.push('/customers/edit')} label="New customer" /> : null}
    </View>
  );
}
