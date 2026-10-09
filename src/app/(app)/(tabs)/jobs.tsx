import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { jobTone, priorityTone } from '../../../components/status';
import { Badge, EmptyState, ErrorBanner, Fab, ListRow, Row, SearchBar, Segmented } from '../../../components/ui';
import { dateTime } from '../../../lib/format';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import type { Job } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'all', label: 'All' },
] as const;

export default function Jobs() {
  const { orgId, role } = useOrg();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('open');
  const [search, setSearch] = useState('');

  const q = useQuery(async () => {
    let query = supabase.from('jobs')
      .select('id, number, title, status, priority, scheduled_start, aircraft:aircraft(tail_number), customer:customers(name)')
      .eq('org_id', orgId)
      .order('scheduled_start', { ascending: filter === 'open', nullsFirst: false })
      .limit(200);
    if (filter === 'open') query = query.in('status', ['scheduled', 'in_progress', 'on_hold']);
    else if (filter !== 'all') query = query.eq('status', filter);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as Job[];
  }, [orgId, filter]);

  const s = search.toLowerCase();
  const rows = (q.data ?? []).filter((j) => !s || [j.number, j.title, j.aircraft?.tail_number, j.customer?.name].some((x) => x?.toLowerCase().includes(s)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(j) => j.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        ListHeaderComponent={
          <View style={{ padding: space.lg, paddingBottom: 0 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Tail number, customer, WO#" />
            <Segmented value={filter} options={[...FILTERS]} onChange={setFilter} />
            <ErrorBanner message={q.error} />
          </View>
        }
        renderItem={({ item: j }) => (
          <ListRow
            icon="construct-outline"
            title={`${j.aircraft?.tail_number ?? '—'} · ${j.customer?.name ?? ''}`}
            subtitle={j.title}
            meta={`${j.number} · ${dateTime(j.scheduled_start)}`}
            right={<Row gap={4}>{j.priority === 'aog' || j.priority === 'high' ? <Badge label={j.priority} tone={priorityTone[j.priority]} /> : null}<Badge label={j.status} tone={jobTone[j.status]} /></Row>}
            onPress={() => router.push(`/jobs/${j.id}`)}
          />
        )}
        ListEmptyComponent={q.loading ? null : <EmptyState icon="construct-outline" title="No jobs" body="Create a job or convert an accepted quote." />}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      {canSeeMoney(role) ? <Fab onPress={() => router.push('/jobs/edit')} label="New job" /> : null}
    </View>
  );
}
