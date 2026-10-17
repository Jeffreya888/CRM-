import { format, isToday, isTomorrow } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notify } from '../../../components/FormSheet';
import { ScheduleSheet } from '../../../components/jobs/ScheduleEditor';
import { priorityTone } from '../../../components/status';
import { Badge, Button, EmptyState, ErrorBanner, Fab, IconButton, Ionicons, PageTitle, Row, SearchBar, Segmented, Select, T } from '../../../components/ui';
import { confirmTentative } from '../../../lib/conflicts';
import { assetTypeInfo } from '../../../lib/pricing';
import { JOB_STATUS_LABEL, statusTone } from '../../../lib/jobs';
import { canAdmin, isManager } from '../../../lib/plans';
import { useLookups } from '../../../lib/lookups';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { AssetType, JobStatus } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

type Filter = 'all' | 'tentative' | 'scheduled' | 'in_progress' | 'completed' | 'invoiced' | 'flagged' | 'mine';
const FILTERS: Filter[] = ['all', 'tentative', 'scheduled', 'in_progress', 'completed', 'invoiced', 'flagged', 'mine'];
type JobCard = {
  id: string; number: string; title: string | null; status: JobStatus; priority: string; scheduled_start: string | null;
  branch_id: string | null; flagged: boolean; flag_reason: string | null;
  customer: { name: string } | null; aircraft: { tail_number: string; manufacturer: string | null; model: string | null; asset_type: AssetType | null } | null;
  location: { name: string; airport_code: string | null } | null;
  job_assignments: { user_id: string }[];
};

const when = (d: string | null) => {
  if (!d) return 'Unscheduled';
  const x = new Date(d);
  return `${isToday(x) ? 'Today' : isTomorrow(x) ? 'Tomorrow' : format(x, 'EEE, MMM d')} · ${format(x, 'h:mm a')}`;
};

export default function Jobs() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const { orgId, role, session, can, branchId, setBranchId } = useOrg();
  const lk = useLookups();
  const uid = session!.user.id;
  const asFilter = (f?: string): Filter | null => (f && (FILTERS as string[]).includes(f) ? (f as Filter) : null);
  const [filter, setFilter] = useState<Filter>(asFilter(params.filter) ?? (role === 'technician' ? 'mine' : 'all'));
  const [search, setSearch] = useState('');
  const [lastParam, setLastParam] = useState(params.filter);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  if (params.filter !== lastParam) {
    setLastParam(params.filter);
    const f = asFilter(params.filter);
    if (f) setFilter(f);
  }

  const q = useQuery(async () => {
    let query = supabase.from('jobs')
      .select('id, number, title, status, priority, scheduled_start, branch_id, flagged, flag_reason, customer:customers(name), aircraft:aircraft(tail_number, manufacturer, model, asset_type), location:locations(name, airport_code), job_assignments(user_id)')
      .eq('org_id', orgId).neq('status', 'cancelled')
      .order('scheduled_start', { ascending: true, nullsFirst: false })
      .limit(500);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as JobCard[];
  }, [orgId, branchId]);

  const all = q.data ?? [];
  const match = (j: JobCard, f: Filter) =>
    f === 'all' ? true : f === 'flagged' ? j.flagged : f === 'mine' ? j.job_assignments.some((a) => a.user_id === uid) : j.status === f;
  const count = (f: Filter) => all.filter((j) => match(j, f)).length;
  const s = search.trim().toLowerCase();
  const rows = all
    .filter((j) => match(j, filter))
    .filter((j) => !s || [j.number, j.title, j.aircraft?.tail_number, j.aircraft?.model, j.customer?.name, j.location?.airport_code, j.location?.name].some((x) => x?.toLowerCase().includes(s)));
  const manager = isManager(role);
  const branchName = lk.branches.find((b) => b.id === branchId)?.name;

  const confirm = async (id: string) => {
    try {
      const r = await confirmTentative(id, canAdmin(role));
      if (r === 'needs_time') setScheduleFor(id);
      else if (r === 'saved') q.reload();
    } catch (e: any) {
      notify('Could not confirm', friendlyError(e.message));
    }
  };

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
            <PageTitle title="Jobs" subtitle={`${all.length} job${all.length === 1 ? '' : 's'}${branchName ? ` · ${branchName}` : ''}`}
              right={<Row gap={0}>
                <IconButton icon="calendar-outline" label="Schedule" onPress={() => router.push('/schedule')} />
                {manager ? <IconButton icon="grid-outline" label="Dispatch board" onPress={() => router.push('/dispatch')} /> : null}
              </Row>} />
            {can('branches') && lk.branches.length ? (
              <Select label="Company location" icon="business-outline" placeholder="All locations" value={branchId} allowClear
                options={lk.branchOptions} onChange={(v) => setBranchId(v)} />
            ) : null}
            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All', count: count('all') },
              { value: 'tentative', label: 'Tentative', count: count('tentative') },
              { value: 'scheduled', label: 'Scheduled', count: count('scheduled') },
              { value: 'in_progress', label: 'In progress', count: count('in_progress') },
              { value: 'completed', label: 'Completed', count: count('completed') },
              { value: 'invoiced', label: 'Invoiced', count: count('invoiced') },
              { value: 'flagged', label: 'Flagged', count: count('flagged') },
              { value: 'mine', label: 'My jobs', count: count('mine') },
            ]} />
            <SearchBar value={search} onChange={setSearch} placeholder="Customer, tail number, job #, airport" />
            <ErrorBanner message={q.error} onRetry={q.reload} />
          </View>
        }
        renderItem={({ item: j }) => {
          const tentative = j.status === 'tentative';
          const info = assetTypeInfo(j.aircraft?.asset_type ?? 'aircraft');
          return (
            <Pressable onPress={() => router.push(`/jobs/${j.id}`)}
              style={({ pressed }) => [{
                backgroundColor: pressed ? colors.cardRaised : colors.card, borderRadius: radius.lg, borderWidth: 1, padding: space.lg, marginBottom: space.md,
                borderColor: j.flagged ? colors.danger : tentative ? colors.borderStrong : colors.border, borderStyle: tentative ? 'dashed' : 'solid',
              }]}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontSize: 17, fontWeight: '700' }} numberOfLines={1}>{j.customer?.name ?? '—'}</T>
                  <Row gap={6} style={{ marginTop: 4 }}>
                    <Ionicons name={info.icon} size={15} color={colors.textMuted} />
                    <T variant="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {[j.aircraft?.tail_number, [j.aircraft?.manufacturer, j.aircraft?.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || `No ${info.label.toLowerCase()}`}
                    </T>
                  </Row>
                  {j.location ? (
                    <Row gap={6} style={{ marginTop: 2 }}>
                      <Ionicons name="location-outline" size={14} color={colors.textFaint} />
                      <T variant="small" numberOfLines={1}>{[j.location.airport_code, j.location.name].filter(Boolean).join(' · ')}</T>
                    </Row>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge label={JOB_STATUS_LABEL[j.status] ?? j.status} tone={statusTone[j.status]} raw />
                  {j.flagged ? <Badge label="Flagged" tone="danger" raw /> : null}
                  {j.priority === 'aog' || j.priority === 'high' ? <Badge label={j.priority === 'aog' ? 'AOG' : 'High'} tone={priorityTone[j.priority]} raw /> : null}
                </View>
              </Row>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.md }} />
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 1 }}>
                  <T style={{ color: colors.primaryText, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>{j.title ?? j.number}</T>
                </View>
                <Row gap={6}>
                  <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                  <T variant="muted">{when(j.scheduled_start)}</T>
                </Row>
              </Row>
              {tentative && manager ? (
                <Row style={{ marginTop: space.md, justifyContent: 'flex-end' }}>
                  <T variant="small" style={{ flex: 1 }}>Waiting for you to confirm</T>
                  <Button small icon="checkmark-circle-outline" title="Confirm" onPress={() => confirm(j.id)} />
                </Row>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={q.loading ? null : (
          <EmptyState icon="briefcase-outline" title={filter === 'all' && !s ? 'No jobs yet' : 'No jobs match'}
            body={filter === 'all' && !s ? 'Create a job, or accepted quotes and booking requests will show up here.' : 'Try another filter or search.'} />
        )}
      />
      {manager ? <Fab onPress={() => router.push('/jobs/new')} label="New job" /> : null}
      <ScheduleSheet visible={!!scheduleFor} jobId={scheduleFor} confirm title="Confirm job" onClose={() => setScheduleFor(null)} onSaved={q.reload} />
    </SafeAreaView>
  );
}
