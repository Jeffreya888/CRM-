import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { confirmAction, notify } from '../../../components/FormSheet';
import { Gate } from '../../../components/Gate';
import { CarePlanCard } from '../../../components/recurring/CarePlanCard';
import { STATE_TONE, type ScheduleListItem } from '../../../components/recurring/RecurringBits';
import { jobTone } from '../../../components/status';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconButton, KeyValue, ListRow, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { date, money } from '../../../lib/format';
import { useLookups } from '../../../lib/lookups';
import { canSeeMoney } from '../../../lib/plans';
import { describeRepeat, fmtInTz, monthlyValue, scheduleState, utcToZoned, type Pattern } from '../../../lib/recurring';
import { useOrg } from '../../../lib/session';
import { callFunction, friendlyError, must, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type VisitJob = { id: string; number: string; title: string | null; status: string; scheduled_start: string | null; occurrence_index: number | null };

export default function ScheduleDetail() {
  return (
    <Gate feature="recurring">
      <DetailInner />
    </Gate>
  );
}

function DetailInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, role, perm } = useOrg();
  const { memberName, locations } = useLookups();
  const showMoney = perm('see_prices');

  const q = useQuery(async () => {
    const s = (await must(supabase.from('recurring_schedules')
      .select('*, customer:customers(name), aircraft:aircraft(tail_number), service:services(name)').eq('id', id).maybeSingle())) as unknown as ScheduleListItem | null;
    if (!s) return null;
    const [jobs, planned] = await Promise.all([
      must(supabase.from('jobs').select('id, number, title, status, scheduled_start, occurrence_index').eq('recurring_schedule_id', id).order('scheduled_start', { ascending: true })),
      s.active
        ? must(supabase.rpc('recurring_preview', {
            p_first: s.first_at, p_tz: s.timezone, p_every: s.every, p_unit: s.unit, p_pattern: s.pattern, p_count: 6,
            p_end_rule: s.end_rule, p_end_on: s.end_on, p_max_visits: s.max_visits, p_skip: s.skip_dates ?? [], p_from_index: s.next_index,
          }))
        : Promise.resolve([]),
    ]);
    const plannedTimes = ((planned ?? []) as unknown[]).map((r) => (typeof r === 'string' ? r : String(Object.values(r as object)[0])));
    return { s, jobs: (jobs ?? []) as VisitJob[], planned: plannedTimes };
  }, [id]);

  if (!canSeeMoney(role)) return <Screen><Stack.Screen options={{ title: 'Schedule' }} /><EmptyState icon="lock-closed-outline" title="Managers only" /></Screen>;
  if (q.loading && !q.data) return <><Stack.Screen options={{ title: 'Schedule' }} /><Loading /></>;
  if (!q.data) return <Screen><Stack.Screen options={{ title: 'Schedule' }} /><ErrorBanner message={q.error ?? 'Schedule not found'} onRetry={q.reload} /></Screen>;

  const { s, jobs, planned } = q.data;
  const state = scheduleState(s);
  const tz = s.timezone;
  const now = Date.now();
  const past = jobs.filter((j) => j.scheduled_start && new Date(j.scheduled_start).getTime() < now).reverse();
  const upcomingJobs = jobs.filter((j) => !j.scheduled_start || new Date(j.scheduled_start).getTime() >= now);
  const jobDays = new Set(upcomingJobs.filter((j) => j.scheduled_start && j.status !== 'cancelled').map((j) => utcToZoned(j.scheduled_start!, tz).day));
  const plannedOnly = planned.filter((t) => !jobDays.has(utcToZoned(t, tz).day));
  const title = s.title || s.service?.name || 'Recurring care';
  const location = locations.find((l) => l.id === s.location_id);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try { await fn(); q.reload(); if (done) notify(done); } catch (e: any) { notify('Something went wrong', friendlyError(e.message ?? String(e))); }
  };
  const togglePause = () => run(async () => {
    await must(supabase.from('recurring_schedules').update({ paused: !s.paused }).eq('id', s.id));
    if (s.paused) await supabase.rpc('generate_recurring_jobs', { p_org: orgId });
  }, s.paused ? 'Schedule resumed' : 'Schedule paused');
  const skip = (iso: string) => {
    const day = utcToZoned(iso, tz).day;
    confirmAction('Skip this visit?', `${fmtInTz(iso, tz)} will be skipped. If the visit was already created it is cancelled.`,
      () => run(() => must(supabase.rpc('skip_occurrence', { p_schedule: s.id, p_date: day })), 'Visit skipped'));
  };
  const unskip = (day: string) => run(() => must(supabase.from('recurring_schedules').update({ skip_dates: (s.skip_dates ?? []).filter((d) => d !== day) }).eq('id', s.id)));
  const endNow = () => confirmAction('End this schedule?', 'No more visits will be created. Upcoming Tentative visits are cancelled.' + (s.billing === 'care_plan' && s.care_plan_status && s.care_plan_status !== 'canceled' ? ' The monthly care plan is canceled too.' : ''),
    () => run(async () => {
      await must(supabase.from('recurring_schedules').update({ active: false }).eq('id', s.id));
      await must(supabase.from('jobs').update({ status: 'cancelled' }).eq('recurring_schedule_id', s.id).eq('status', 'tentative').gt('scheduled_start', new Date().toISOString()));
      if (s.billing === 'care_plan' && s.care_plan_status && s.care_plan_status !== 'canceled') {
        await callFunction('care-plan', { action: 'cancel', schedule_id: s.id }).catch(() => {});
      }
    }, 'Schedule ended'));
  const reactivate = () => run(async () => {
    await must(supabase.from('recurring_schedules').update({ active: true, paused: false }).eq('id', s.id));
    await supabase.rpc('generate_recurring_jobs', { p_org: orgId });
  }, 'Schedule restarted');

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{
        title,
        headerRight: () => <IconButton icon="create-outline" label="Edit" onPress={() => router.push({ pathname: '/recurring/edit', params: { id: s.id } })} />,
      }} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
          <T variant="h3" style={{ flex: 1 }}>{[s.customer?.name, s.aircraft?.tail_number].filter(Boolean).join(' · ')}</T>
          <Badge label={state} tone={STATE_TONE[state]} large />
        </Row>
        <KeyValue label="Repeats" value={describeRepeat(s.every, s.unit, s.pattern as Pattern)} />
        <KeyValue label="First visit" value={fmtInTz(s.first_at, tz)} />
        <KeyValue label="Ends" value={s.end_rule === 'never' ? 'Never' : s.end_rule === 'on_date' ? `On ${date(s.end_on)}` : `After ${s.max_visits} visits`} />
        <KeyValue label="Technician" value={s.default_user_id ? memberName(s.default_user_id) : 'Unassigned'} />
        <KeyValue label="Facility" value={location ? [location.airport_code, location.name].filter(Boolean).join(' · ') : null} />
        <KeyValue label="Created" value={`${s.lead_days} days ahead as ${s.create_as === 'tentative' ? 'Tentative' : 'Scheduled'}`} />
        <KeyValue label="Heads-up" value={s.heads_up_days != null ? `${s.heads_up_days} days before` : 'Off'} />
        {showMoney ? (
          <>
            <KeyValue label="Billing" value={s.billing === 'care_plan' ? `Care plan ${money(s.care_plan_amount)}/mo` : `${money(s.price)} per visit`} />
            <KeyValue label="Monthly value" value={money(monthlyValue(s))} />
            {Number(s.annual_increase_pct) > 0 ? <KeyValue label="Annual increase" value={`${s.annual_increase_pct}%`} /> : null}
          </>
        ) : null}
        <KeyValue label="Notes" value={s.notes} />
      </Card>

      {showMoney && s.billing === 'care_plan' && s.active ? <CarePlanCard schedule={s} onChanged={q.reload} /> : null}

      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {s.active ? (
          <>
            <Button small kind="secondary" icon={s.paused ? 'play-outline' : 'pause-outline'} title={s.paused ? 'Resume' : 'Pause'} onPress={togglePause} />
            <Button small kind="secondary" icon="create-outline" title="Edit" onPress={() => router.push({ pathname: '/recurring/edit', params: { id: s.id } })} />
            <Button small kind="ghost" icon="stop-circle-outline" title="End now" onPress={endNow} />
          </>
        ) : (
          <Button small kind="secondary" icon="refresh-outline" title="Restart schedule" onPress={reactivate} />
        )}
      </Row>
      {s.paused && s.active ? <T variant="small" style={{ marginTop: space.sm }}>Paused: no new visits are created until you resume.</T> : null}

      <Section title="Upcoming" icon="calendar-outline">
        {upcomingJobs.length + plannedOnly.length === 0 ? (
          <T variant="muted">{s.active ? 'No upcoming visits.' : 'This schedule has ended.'}</T>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {upcomingJobs.map((j) => (
              <ListRow key={j.id} icon="briefcase-outline" tone={j.status === 'cancelled' ? 'neutral' : 'primary'}
                title={j.scheduled_start ? fmtInTz(j.scheduled_start, tz) : 'Not scheduled'} subtitle={`Job ${j.number}`}
                right={
                  <Row gap={4}>
                    <Badge label={j.status} tone={j.status === 'tentative' ? 'warning' : jobTone[j.status] ?? 'neutral'} />
                    {j.scheduled_start && ['tentative', 'scheduled'].includes(j.status) && s.active ? (
                      <Button small kind="ghost" title="Skip" onPress={() => skip(j.scheduled_start!)} />
                    ) : null}
                  </Row>
                }
                onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: j.id } })} />
            ))}
            {plannedOnly.map((t) => (
              <ListRow key={t} icon="time-outline" tone="neutral" title={fmtInTz(t, tz)} subtitle={s.paused ? 'Planned (paused)' : 'Planned · created automatically'}
                right={<Row gap={4}><Badge label="Planned" tone="neutral" />{!s.paused ? <Button small kind="ghost" title="Skip" onPress={() => skip(t)} /> : null}</Row>} />
            ))}
          </Card>
        )}
        {(s.skip_dates ?? []).length ? (
          <View style={{ marginTop: space.md }}>
            <T variant="overline" style={{ marginBottom: space.sm }}>Skipped</T>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {[...s.skip_dates].sort().map((d) => (
                <Button key={d} small kind="secondary" icon="arrow-undo-outline" title={date(d)} onPress={() => unskip(d)} />
              ))}
            </Row>
            <T variant="small" style={{ marginTop: 4 }}>Tap a date to stop skipping it (a cancelled visit is not brought back).</T>
          </View>
        ) : null}
      </Section>

      <Section title="Past visits" icon="checkmark-done-outline" count={String(past.length)}>
        {past.length ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {past.map((j) => (
              <ListRow key={j.id} icon="briefcase-outline" tone={j.status === 'completed' || j.status === 'invoiced' ? 'success' : 'neutral'}
                title={j.scheduled_start ? fmtInTz(j.scheduled_start, tz) : `Job ${j.number}`} subtitle={`Job ${j.number}`}
                right={<Badge label={j.status} tone={jobTone[j.status] ?? 'neutral'} />}
                onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: j.id } })} />
            ))}
          </Card>
        ) : <T variant="muted" style={{ color: colors.textMuted }}>No visits yet.</T>}
      </Section>
    </Screen>
  );
}
