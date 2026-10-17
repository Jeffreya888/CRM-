import { endOfMonth, startOfMonth } from 'date-fns';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Gate } from '../../../components/Gate';
import { PlanHealth, ScheduleRow, type ScheduleListItem } from '../../../components/recurring/RecurringBits';
import { Badge, Button, Card, EmptyState, ErrorBanner, Fab, ListRow, Loading, Screen, SearchBar, Section, Segmented, T } from '../../../components/ui';
import { date, dateTime } from '../../../lib/format';
import { useLookups } from '../../../lib/lookups';
import { canSeeMoney } from '../../../lib/plans';
import { describeRepeat, monthlyValue, scheduleState, type ScheduleState } from '../../../lib/recurring';
import { useOrg } from '../../../lib/session';
import { must, supabase } from '../../../lib/supabase';
import { space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type FollowUpJob = { id: string; number: string; title: string | null; scheduled_start: string | null; customer: { name: string } | null; aircraft: { tail_number: string } | null };
type ReminderRow = { id: string; title: string; due_on: string; status: string; recur_every: number | null; recur_unit: 'week' | 'month' | null; aircraft: { tail_number: string; customer: { name: string } | null } | null };

export default function RecurringList() {
  return (
    <Gate feature="recurring">
      <RecurringInner />
    </Gate>
  );
}

function RecurringInner() {
  const { orgId, role, perm, branchId } = useOrg();
  const { memberName } = useLookups();
  const showMoney = perm('see_prices');
  const [filter, setFilter] = useState<ScheduleState | 'unassigned'>('active');
  const [search, setSearch] = useState('');

  const q = useQuery(async () => {
    const now = new Date();
    let sq = supabase.from('recurring_schedules')
      .select('*, customer:customers(name), aircraft:aircraft(tail_number), service:services(name)')
      .eq('org_id', orgId).order('created_at', { ascending: false });
    if (branchId) sq = sq.or(`branch_id.eq.${branchId},branch_id.is.null`);
    const [schedules, monthJobs, upcoming, followUps, reminders] = await Promise.all([
      must(sq),
      must(supabase.from('jobs').select('id', { count: 'exact', head: false }).eq('org_id', orgId).not('recurring_schedule_id', 'is', null)
        .neq('status', 'cancelled').gte('scheduled_start', startOfMonth(now).toISOString()).lte('scheduled_start', endOfMonth(now).toISOString())),
      must(supabase.from('jobs').select('recurring_schedule_id, scheduled_start').eq('org_id', orgId).not('recurring_schedule_id', 'is', null)
        .in('status', ['tentative', 'scheduled']).gte('scheduled_start', now.toISOString()).order('scheduled_start').limit(1000)),
      must(supabase.from('jobs').select('id, number, title, scheduled_start, customer:customers(name), aircraft:aircraft(tail_number)')
        .eq('org_id', orgId).not('follow_up_of', 'is', null).in('status', ['tentative', 'scheduled']).order('scheduled_start').limit(200)),
      must(supabase.from('service_reminders').select('id, title, due_on, status, recur_every, recur_unit, aircraft:aircraft(tail_number, customer:customers(name))')
        .eq('org_id', orgId).in('status', ['upcoming', 'due']).not('recur_every', 'is', null).order('due_on').limit(200)),
    ]);
    const next: Record<string, string> = {};
    for (const j of (upcoming ?? []) as { recurring_schedule_id: string; scheduled_start: string }[]) {
      if (!next[j.recurring_schedule_id]) next[j.recurring_schedule_id] = j.scheduled_start;
    }
    return {
      schedules: (schedules ?? []) as unknown as ScheduleListItem[],
      visitsThisMonth: (monthJobs ?? []).length,
      next,
      followUps: (followUps ?? []) as unknown as FollowUpJob[],
      reminders: (reminders ?? []) as unknown as ReminderRow[],
    };
  }, [orgId, branchId]);

  if (!canSeeMoney(role)) {
    return <Screen><Stack.Screen options={{ title: 'Recurring care' }} /><EmptyState icon="lock-closed-outline" title="Managers only" body="Ask your manager about recurring care schedules." /></Screen>;
  }
  if (q.loading && !q.data) return <><Stack.Screen options={{ title: 'Recurring care' }} /><Loading /></>;

  const d = q.data ?? { schedules: [], visitsThisMonth: 0, next: {}, followUps: [], reminders: [] };
  const live = d.schedules.filter((s) => scheduleState(s) === 'active');
  const unassigned = d.schedules.filter((s) => s.active && !s.default_user_id);
  const mrr = live.reduce((sum, s) => sum + monthlyValue(s), 0);
  const counts = { active: live.length, paused: d.schedules.filter((s) => scheduleState(s) === 'paused').length, ended: d.schedules.filter((s) => !s.active).length };
  const needle = search.trim().toLowerCase();
  const matches = (parts: (string | null | undefined)[]) => !needle || parts.filter(Boolean).join(' ').toLowerCase().includes(needle);
  const shown = (filter === 'unassigned' ? unassigned : d.schedules.filter((s) => scheduleState(s) === filter))
    .filter((s) => matches([s.title, s.service?.name, s.customer?.name, s.aircraft?.tail_number]));
  const followUps = d.followUps.filter((j) => matches([j.title, j.customer?.name, j.aircraft?.tail_number]));
  const reminders = d.reminders.filter((r) => matches([r.title, r.aircraft?.customer?.name, r.aircraft?.tail_number]));

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Recurring care' }} />
      <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
        <ErrorBanner message={q.error} onRetry={q.reload} />
        <T variant="overline" style={{ marginBottom: space.sm }}>Plan health</T>
        <PlanHealth active={live.length} mrr={mrr} visitsThisMonth={d.visitsThisMonth} unassigned={unassigned.length} showMoney={showMoney}
          onUnassigned={() => setFilter('unassigned')} />
        <SearchBar value={search} onChange={setSearch} placeholder="Search customer, tail or service" />
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'active', label: 'Active', count: counts.active },
          { value: 'paused', label: 'Paused', count: counts.paused },
          { value: 'ended', label: 'Ended', count: counts.ended },
          ...(unassigned.length ? [{ value: 'unassigned' as const, label: 'No technician', count: unassigned.length }] : []),
        ]} />

        <Section title="Care schedules" icon="repeat-outline" count={String(shown.length)}>
          {shown.length ? (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {shown.map((s) => <ScheduleRow key={s.id} s={s} showMoney={showMoney} nextAt={d.next[s.id]} techName={s.default_user_id ? memberName(s.default_user_id) : null} />)}
            </Card>
          ) : (
            <EmptyState icon="repeat-outline" title={filter === 'active' ? 'No active schedules' : `Nothing ${filter === 'unassigned' ? 'without a technician' : filter}`}
              body={filter === 'active' ? 'Set up a monthly wash, a quarterly ceramic top-up or any visit that repeats. Visits are created ahead of time automatically.' : undefined} />
          )}
        </Section>

        {filter === 'active' ? (
          <>
            <Section title="Follow-ups from completed services" icon="git-branch-outline" count={String(followUps.length)}>
              <T variant="small" style={{ marginBottom: space.sm }}>
                When a service with a repeat interval is completed for a customer who opted in, the next visit is created as Tentative for you to confirm.
              </T>
              {followUps.length ? (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {followUps.map((j) => (
                    <ListRow key={j.id} icon="calendar-outline" tone="warning" title={j.title || `Job ${j.number}`}
                      subtitle={[j.customer?.name, j.aircraft?.tail_number].filter(Boolean).join(' · ')}
                      meta={j.scheduled_start ? dateTime(j.scheduled_start) : 'Not scheduled'}
                      right={<Badge label="Tentative" tone="warning" />}
                      onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: j.id } })} />
                  ))}
                </Card>
              ) : <T variant="muted">No follow-up visits waiting.</T>}
            </Section>
            <Section title="Service reminders" icon="notifications-outline" count={String(reminders.length)}
              action={<Button small kind="ghost" title="See all" onPress={() => router.push('/reminders')} />}>
              <T variant="small" style={{ marginBottom: space.sm }}>Customers who did not opt in get a reminder instead of an automatic visit.</T>
              {reminders.length ? (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {reminders.slice(0, 10).map((r) => (
                    <ListRow key={r.id} icon="notifications-outline" tone="info" title={`${r.aircraft?.tail_number ?? ''} · ${r.title}`}
                      subtitle={r.aircraft?.customer?.name}
                      meta={`Due ${date(r.due_on)}${r.recur_every && r.recur_unit ? ` · ${describeRepeat(r.recur_every, r.recur_unit)}` : ''}`}
                      onPress={() => router.push('/reminders')} />
                  ))}
                </Card>
              ) : <T variant="muted">No open reminders.</T>}
            </Section>
          </>
        ) : null}
      </Screen>
      <Fab label="New schedule" onPress={() => router.push('/recurring/edit')} />
    </View>
  );
}
