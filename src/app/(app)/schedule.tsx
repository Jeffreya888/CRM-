import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { priorityTone } from '../../components/status';
import { Badge, Button, Card, EmptyState, ErrorBanner, Fab, IconButton, Ionicons, Row, Screen, Segmented, Select, T } from '../../components/ui';
import { time } from '../../lib/format';
import { useIsDesktop } from '../../lib/layout';
import { JOB_STATUS_LABEL, statusTone } from '../../lib/jobs';
import { useLookups } from '../../lib/lookups';
import { isManager } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import type { Job } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';

type ViewMode = 'day' | 'week';

/** Week view with day strip, tentative jobs, company-location and "my jobs" filters. */
export default function Schedule() {
  const { orgId, role, session, can, branchId, setBranchId } = useOrg();
  const lk = useLookups();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [day, setDay] = useState(new Date());
  const [mine, setMine] = useState(role === 'technician');
  const [mode, setMode] = useState<ViewMode>('day');
  const manager = isManager(role);
  const desktop = useIsDesktop();

  const q = useQuery(async () => {
    let query = supabase.from('jobs')
      .select('id, number, title, status, priority, branch_id, scheduled_start, scheduled_end, weather_sensitive, flagged, aircraft:aircraft(tail_number, model), location:locations(airport_code, name), customer:customers(name), job_assignments(user_id, is_primary)')
      .eq('org_id', orgId)
      .gte('scheduled_start', weekStart.toISOString())
      .lt('scheduled_start', addDays(weekStart, 7).toISOString())
      .neq('status', 'cancelled')
      .order('scheduled_start');
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as Job[];
  }, [orgId, weekStart.getTime(), branchId]);

  const uid = session!.user.id;
  const jobs = (q.data ?? []).filter((j) => !mine || j.job_assignments?.some((a) => a.user_id === uid));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const jobsOn = (d: Date) => jobs.filter((j) => j.scheduled_start && isSameDay(new Date(j.scheduled_start), d));
  const tentativeCount = jobs.filter((j) => j.status === 'tentative').length;

  const shift = (n: number) => {
    const ws = addDays(weekStart, n * 7);
    setWeekStart(ws);
    setDay(ws);
  };
  const crewNames = (j: Job) => (j.job_assignments ?? []).map((a) => lk.memberName(a.user_id)).join(', ');

  const card = (j: Job) => {
    const tentative = j.status === 'tentative';
    return (
      <Card key={j.id} onPress={() => router.push(`/jobs/${j.id}`)}
        style={{ borderLeftWidth: 4, borderLeftColor: tentative ? colors.textMuted : j.flagged ? colors.danger : colors.primary, borderStyle: tentative ? 'dashed' : 'solid', opacity: tentative ? 0.92 : 1 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="h3">{time(j.scheduled_start)}{j.scheduled_end ? ` – ${time(j.scheduled_end)}` : ''}</T>
          <Row gap={4}>
            {j.priority !== 'normal' ? <Badge label={j.priority === 'aog' ? 'AOG' : j.priority} tone={priorityTone[j.priority]} /> : null}
            <Badge label={JOB_STATUS_LABEL[j.status] ?? j.status} tone={statusTone[j.status]} raw />
          </Row>
        </Row>
        <T style={{ fontWeight: '600', marginTop: 4 }}>{j.aircraft?.tail_number ?? '—'} · {j.customer?.name}</T>
        <T variant="muted" numberOfLines={2}>{j.title}</T>
        <Row gap={4} style={{ marginTop: 4, flexWrap: 'wrap' }}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <T variant="small">{[j.location?.airport_code, j.location?.name].filter(Boolean).join(' · ') || 'No facility'}</T>
          {j.weather_sensitive ? <><Ionicons name="rainy-outline" size={14} color={colors.warning} /><T variant="small">Weather-sensitive</T></> : null}
        </Row>
        <Row gap={4} style={{ marginTop: 2 }}>
          <Ionicons name="people-outline" size={14} color={colors.textMuted} />
          <T variant="small" numberOfLines={1} style={{ flex: 1 }}>{crewNames(j) || 'Unassigned'}</T>
        </Row>
      </Card>
    );
  };

  const newJob = () => router.push({ pathname: '/jobs/new', params: { start: (() => { const d = new Date(day); d.setHours(9, 0, 0, 0); return d.toISOString(); })() } });

  // Desktop: a compact job block for the 7-column week calendar.
  const chip = (j: Job) => {
    const tentative = j.status === 'tentative';
    return (
      <Pressable key={j.id} onPress={() => router.push(`/jobs/${j.id}`)}
        style={({ pressed }) => [{
          backgroundColor: pressed ? colors.cardRaised : colors.card, borderRadius: radius.sm + 2, padding: space.sm, marginBottom: 6,
          borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: tentative ? colors.textMuted : j.flagged ? colors.danger : colors.primary,
          borderStyle: tentative ? 'dashed' : 'solid',
        }]}>
        <Row style={{ justifyContent: 'space-between' }} gap={4}>
          <T style={{ fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{time(j.scheduled_start)}</T>
          {j.priority === 'aog' || j.priority === 'high' ? <Badge label={j.priority === 'aog' ? 'AOG' : 'High'} tone={priorityTone[j.priority]} raw /> : null}
        </Row>
        <T style={{ fontSize: 13, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>{j.customer?.name ?? '—'}</T>
        <T variant="small" numberOfLines={1}>{[j.aircraft?.tail_number, j.title].filter(Boolean).join(' · ')}</T>
        <T variant="small" numberOfLines={1} style={{ color: tentative ? colors.warning : colors.textFaint }}>{tentative ? 'Tentative' : crewNames(j) || 'Unassigned'}</T>
      </Pressable>
    );
  };

  const weekGrid = (
    <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md, marginBottom: space.md }}>
      {days.map((d) => {
        const list = jobsOn(d);
        const isToday = isSameDay(d, new Date());
        return (
          <View key={d.toISOString()} style={{ flex: 1, minWidth: 0, backgroundColor: colors.bgDeep, borderRadius: radius.md, borderWidth: 1, borderColor: isToday ? colors.accent : colors.border, padding: space.sm, minHeight: 420 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: space.sm, paddingHorizontal: 2 }}>
              <View>
                <T variant="small" style={{ color: isToday ? colors.accent : colors.textMuted }}>{format(d, 'EEE')}</T>
                <T variant="h3" style={{ color: isToday ? colors.white : colors.text }}>{format(d, 'd')}</T>
              </View>
              {list.length ? <Badge raw label={String(list.length)} tone="info" /> : null}
            </Row>
            {list.length ? list.map(chip) : <T variant="small" style={{ color: colors.textFaint, paddingHorizontal: 2 }}>No jobs</T>}
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={q.refreshing} onRefresh={q.refresh} wide>
        <Stack.Screen options={{ title: 'Schedule', headerRight: () => manager ? <IconButton icon="grid-outline" label="Dispatch board" onPress={() => router.push('/dispatch')} /> : null }} />
        {manager ? (
          <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
            <Button small kind="secondary" icon="grid-outline" title="Dispatch board" onPress={() => router.push('/dispatch')} />
            <Button small kind="secondary" icon="people-outline" title="Crew & resources" onPress={() => router.push('/scheduling')} />
            <Button small kind="secondary" icon="mail-unread-outline" title="Requests" onPress={() => router.push('/requests')} />
            {desktop ? <Button small icon="add" title="New job" onPress={newJob} /> : null}
          </Row>
        ) : (
          <Row style={{ marginBottom: space.md }}>
            <Button small kind="secondary" icon="airplane-outline" title="My hours & time off" onPress={() => router.push('/scheduling')} />
          </Row>
        )}
        {!desktop && can('branches') && lk.branches.length ? (
          <Select label="Company location" icon="business-outline" placeholder="All locations" value={branchId} allowClear options={lk.branchOptions} onChange={setBranchId} />
        ) : null}
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" onPress={() => shift(-1)} label="Previous week" />
          <Pressable onPress={() => { const ws = startOfWeek(new Date(), { weekStartsOn: 1 }); setWeekStart(ws); setDay(new Date()); }}>
            <T variant="h3">{format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}</T>
          </Pressable>
          <IconButton icon="chevron-forward" onPress={() => shift(1)} label="Next week" />
        </Row>
        {desktop ? null : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginVertical: space.md }}>
            {days.map((d) => {
              const active = mode === 'day' && isSameDay(d, day);
              const list = jobsOn(d);
              const tent = list.filter((j) => j.status === 'tentative').length;
              return (
                <Pressable key={d.toISOString()} onPress={() => { setDay(d); setMode('day'); }}
                  style={{ width: 52, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', backgroundColor: active ? colors.primary : colors.card, borderWidth: isSameDay(d, new Date()) ? 1 : 0, borderColor: colors.accent }}>
                  <T variant="small" style={{ color: active ? 'rgba(255,255,255,0.75)' : colors.textMuted }}>{format(d, 'EEE')}</T>
                  <T variant="h3" style={{ color: active ? colors.white : colors.text }}>{format(d, 'd')}</T>
                  <View style={{ height: 6, flexDirection: 'row', gap: 2, marginTop: 2 }}>
                    {Array.from({ length: Math.min(list.length - tent, 4) }).map((_, i) => (
                      <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: active ? colors.accent : colors.primary }} />
                    ))}
                    {Array.from({ length: Math.min(tent, 2) }).map((_, i) => (
                      <View key={`t${i}`} style={{ width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderColor: active ? colors.white : colors.textMuted }} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {desktop ? null : <Segmented value={mode} onChange={setMode} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: `Whole week (${jobs.length})` }]} />}
        <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
          <T variant="overline">{desktop ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} this week · ${tentativeCount} tentative` : mode === 'day' ? format(day, 'EEEE, MMMM d') : `${tentativeCount} tentative`}</T>
          <Pressable onPress={() => setMine((m) => !m)} accessibilityRole="checkbox" accessibilityState={{ checked: mine }}>
            <Row gap={4}>
              <Ionicons name={mine ? 'checkbox' : 'square-outline'} size={18} color={colors.primary} />
              <T variant="muted">My jobs only</T>
            </Row>
          </Pressable>
        </Row>
        <ErrorBanner message={q.error} onRetry={q.reload} />
        {desktop ? weekGrid : mode === 'day' ? (
          jobsOn(day).length === 0 ? (
            <EmptyState icon="calendar-clear-outline" title="No jobs this day" body={manager ? 'Tap + to schedule one.' : undefined} />
          ) : jobsOn(day).map(card)
        ) : jobs.length === 0 ? (
          <EmptyState icon="calendar-clear-outline" title="No jobs this week" />
        ) : days.filter((d) => jobsOn(d).length).map((d) => (
          <View key={d.toISOString()}>
            <T variant="overline" style={{ marginTop: space.md, marginBottom: space.sm }}>{format(d, 'EEEE, MMM d')}</T>
            {jobsOn(d).map(card)}
          </View>
        ))}
        <Row style={{ marginTop: space.md }}>
          <View style={{ width: 16, height: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textMuted, borderRadius: 3 }} />
          <T variant="small">Tentative — waiting to be confirmed</T>
        </Row>
      </Screen>
      {manager && !desktop ? <Fab onPress={newJob} label="New job" /> : null}
    </View>
  );
}
