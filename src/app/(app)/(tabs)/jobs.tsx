import { format, isToday, isTomorrow } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { jobTone, priorityTone } from '../../../components/status';
import { Badge, EmptyState, ErrorBanner, Fab, Ionicons, PageTitle, Row, SearchBar, Segmented, T } from '../../../components/ui';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type Filter = 'all' | 'scheduled' | 'in_progress' | 'completed' | 'invoiced';
type JobCard = {
  id: string; number: string; title: string | null; status: string; priority: string; scheduled_start: string | null;
  customer: { name: string } | null; aircraft: { tail_number: string; manufacturer: string | null; model: string | null } | null;
  job_items: { description: string; sort_order: number }[];
};

const when = (d: string | null) => {
  if (!d) return 'Unscheduled';
  const x = new Date(d);
  return isToday(x) ? 'Today' : isTomorrow(x) ? 'Tomorrow' : format(x, 'MMM d');
};

export default function Jobs() {
  const params = useLocalSearchParams<{ filter?: Filter }>();
  const { orgId, role } = useOrg();
  const [filter, setFilter] = useState<Filter>(params.filter ?? 'all');
  const [search, setSearch] = useState('');
  const [lastParam, setLastParam] = useState(params.filter);
  if (params.filter !== lastParam) {
    setLastParam(params.filter);
    if (params.filter) setFilter(params.filter);
  }

  const q = useQuery(async () => {
    const { data, error } = await supabase.from('jobs')
      .select('id, number, title, status, priority, scheduled_start, customer:customers(name), aircraft:aircraft(tail_number, manufacturer, model), job_items(description, sort_order)')
      .eq('org_id', orgId).neq('status', 'cancelled')
      .order('scheduled_start', { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as unknown as JobCard[];
  }, [orgId]);

  const all = q.data ?? [];
  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((j) => j.status === f).length);
  const s = search.toLowerCase();
  const rows = all
    .filter((j) => filter === 'all' || j.status === filter)
    .filter((j) => !s || [j.number, j.title, j.aircraft?.tail_number, j.aircraft?.model, j.customer?.name].some((x) => x?.toLowerCase().includes(s)));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(j) => j.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            <PageTitle title="Jobs" subtitle={`${all.length} job${all.length === 1 ? '' : 's'}`} />
            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All', count: count('all') },
              { value: 'scheduled', label: 'Scheduled', count: count('scheduled') },
              { value: 'in_progress', label: 'In Progress', count: count('in_progress') },
              { value: 'completed', label: 'Completed', count: count('completed') },
              { value: 'invoiced', label: 'Invoiced', count: count('invoiced') },
            ]} />
            {all.length > 6 ? <SearchBar value={search} onChange={setSearch} placeholder="Customer, tail number, aircraft" /> : null}
            <ErrorBanner message={q.error} />
          </View>
        }
        renderItem={({ item: j }) => {
          const service = [...j.job_items].sort((a, b) => a.sort_order - b.sort_order)[0]?.description ?? j.title;
          const more = j.job_items.length - 1;
          return (
            <Pressable onPress={() => router.push(`/jobs/${j.id}`)}
              style={({ pressed }) => [{ backgroundColor: pressed ? colors.cardRaised : colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md }]}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontSize: 17, fontWeight: '700' }} numberOfLines={1}>{j.customer?.name ?? '—'}</T>
                  <Row gap={6} style={{ marginTop: 4 }}>
                    <Ionicons name="airplane-outline" size={15} color={colors.textMuted} />
                    <T variant="muted" numberOfLines={1}>{[j.aircraft?.manufacturer, j.aircraft?.model].filter(Boolean).join(' ') || 'No aircraft'}</T>
                  </Row>
                  {j.aircraft?.tail_number ? <T variant="small" style={{ color: colors.textFaint, marginTop: 2 }}>{j.aircraft.tail_number}</T> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge label={j.status} tone={jobTone[j.status]} />
                  {j.priority === 'aog' || j.priority === 'high' ? <Badge label={j.priority === 'aog' ? 'AOG' : 'High'} tone={priorityTone[j.priority]} /> : null}
                </View>
              </Row>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.md }} />
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 1 }}>
                  <T style={{ color: colors.primaryText, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{service ?? 'No services'}{more > 0 ? `  +${more}` : ''}</T>
                </View>
                <Row gap={6}>
                  <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                  <T variant="muted">{when(j.scheduled_start)}</T>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Row>
              </Row>
            </Pressable>
          );
        }}
        ListEmptyComponent={q.loading ? null : <EmptyState icon="briefcase-outline" title="No jobs here" body="Create a job or convert an accepted quote." />}
      />
      {canSeeMoney(role) ? <Fab onPress={() => router.push('/jobs/new')} label="New job" /> : null}
    </SafeAreaView>
  );
}
