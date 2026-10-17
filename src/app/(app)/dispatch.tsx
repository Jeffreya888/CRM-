import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notify } from '../../components/FormSheet';
import { DispatchCard, type DispatchJob } from '../../components/jobs/DispatchCard';
import { ScheduleSheet } from '../../components/jobs/ScheduleEditor';
import { Avatar, Badge, Button, EmptyState, ErrorBanner, IconButton, Ionicons, Loading, Row, Screen, Select, T } from '../../components/ui';
import { loadSchedule, saveSchedule } from '../../lib/conflicts';
import { initials, isoDate, time } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import { canAdmin, isManager } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

const HOUR_H = 64;
const COL_W = 176;
const TIME_W = 48;
const HEAD_H = 56;
const SNAP = 15;
const UNASSIGNED = '__unassigned__';

interface Column { id: string; name: string; color: string | null; hours: { start: number; end: number } | null; timeOff: string | null }
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const minutesOfDay = (iso: string, day: Date) => Math.round((new Date(iso).getTime() - startOfDay(day).getTime()) / 60000);

/** Visual dispatch board: a column per technician for one day, drag & drop to reassign or retime. */
export default function Dispatch() {
  const { orgId, role, can, branchId, setBranchId } = useOrg();
  const lk = useLookups();
  const manager = isManager(role);
  const admin = canAdmin(role);
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<{ jobId: string; from: string } | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const colRefs = useRef<Record<string, View | null>>({});
  const rects = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});

  const q = useQuery(async () => {
    const from = startOfDay(day);
    const to = addDays(from, 1);
    let jq = supabase.from('jobs')
      .select('id, number, title, status, flagged, scheduled_start, scheduled_end, branch_id, customer:customers(name), aircraft:aircraft(tail_number), location:locations(airport_code, name), job_assignments(user_id, is_primary, confirmed)')
      .eq('org_id', orgId).in('status', ['tentative', 'scheduled', 'in_progress', 'on_hold'])
      .gte('scheduled_start', from.toISOString()).lt('scheduled_start', to.toISOString()).order('scheduled_start');
    let uq = supabase.from('jobs')
      .select('id, number, title, status, flagged, scheduled_start, scheduled_end, branch_id, customer:customers(name), aircraft:aircraft(tail_number), location:locations(airport_code, name), job_assignments(user_id, is_primary, confirmed)')
      .eq('org_id', orgId).in('status', ['tentative', 'scheduled']).is('scheduled_start', null).order('created_at', { ascending: false }).limit(30);
    if (branchId) { jq = jq.eq('branch_id', branchId); uq = uq.eq('branch_id', branchId); }
    const [jobs, unscheduled, hours, off] = await Promise.all([
      jq, uq,
      supabase.from('crew_hours').select('user_id, weekday, start_time, end_time').eq('org_id', orgId).eq('weekday', day.getDay()),
      supabase.from('time_off').select('user_id, reason, starts_on, ends_on').eq('org_id', orgId).eq('status', 'approved').lte('starts_on', isoDate(day)).gte('ends_on', isoDate(day)),
    ]);
    if (jobs.error) throw jobs.error;
    return {
      jobs: (jobs.data ?? []) as unknown as DispatchJob[],
      unscheduled: (unscheduled.data ?? []) as unknown as DispatchJob[],
      hours: (hours.data ?? []) as { user_id: string; start_time: string; end_time: string }[],
      off: (off.data ?? []) as { user_id: string; reason: string | null }[],
    };
  }, [orgId, day.getTime(), branchId]);

  if (!manager) {
    return <Screen><Stack.Screen options={{ title: 'Dispatch board' }} /><EmptyState icon="lock-closed-outline" title="Managers only" body="Owners and managers use the dispatch board. Your jobs are on the Schedule." /></Screen>;
  }
  if (q.loading && !q.data) return <Loading />;
  const d = q.data ?? { jobs: [], unscheduled: [], hours: [], off: [] };

  const techs = lk.members.filter((m) => m.role !== 'viewer' && (!branchId || !m.default_branch_id || m.default_branch_id === branchId));
  const columns: Column[] = [
    { id: UNASSIGNED, name: 'Unassigned', color: null, hours: null, timeOff: null },
    ...techs.map((m) => {
      const h = d.hours.find((x) => x.user_id === m.user_id);
      const o = d.off.find((x) => x.user_id === m.user_id);
      return { id: m.user_id, name: m.display_name ?? 'Team member', color: m.color, hours: h ? { start: toMin(h.start_time), end: toMin(h.end_time) } : null, timeOff: o ? o.reason || 'Time off' : null };
    }),
  ];

  // Visible hours: 6:00–20:00, stretched to fit jobs and working hours.
  let startH = 6;
  let endH = 20;
  for (const j of d.jobs) {
    if (!j.scheduled_start) continue;
    const s = minutesOfDay(j.scheduled_start, day);
    const e = j.scheduled_end ? minutesOfDay(j.scheduled_end, day) : s + 120;
    startH = Math.max(0, Math.min(startH, Math.floor(s / 60)));
    endH = Math.min(24, Math.max(endH, Math.ceil(e / 60)));
  }
  for (const c of columns) if (c.hours) { startH = Math.min(startH, Math.floor(c.hours.start / 60)); endH = Math.max(endH, Math.ceil(c.hours.end / 60)); }
  const hoursList = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const boardH = (endH - startH) * HOUR_H;
  const yOf = (min: number) => ((min - startH * 60) / 60) * HOUR_H;

  const jobsIn = (colId: string) => d.jobs.filter((j) => (colId === UNASSIGNED ? !j.job_assignments.length : j.job_assignments.some((a) => a.user_id === colId)));
  const allJobs = [...d.jobs, ...d.unscheduled];
  const jobById = (id: string) => allJobs.find((j) => j.id === id);

  /** Lane layout for overlapping cards in one column. */
  const layout = (list: DispatchJob[]) => {
    const items = list.map((j) => {
      const s = minutesOfDay(j.scheduled_start!, day);
      const e = Math.max(s + 30, j.scheduled_end ? minutesOfDay(j.scheduled_end, day) : s + 120);
      return { j, s, e, lane: 0 };
    }).sort((a, b) => a.s - b.s);
    const laneEnds: number[] = [];
    for (const it of items) {
      let lane = laneEnds.findIndex((end) => end <= it.s);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(it.e); } else laneEnds[lane] = it.e;
      it.lane = lane;
    }
    const lanes = Math.max(1, laneEnds.length);
    return items.map((it) => ({ ...it, lanes }));
  };

  const measureColumns = () => {
    for (const c of columns) {
      colRefs.current[c.id]?.measureInWindow((x, y, w, h) => { rects.current[c.id] = { x, y, w, h }; });
    }
  };

  /** Move a job to a column at a time of day (minutes from midnight). */
  const move = async (jobId: string, fromCol: string, toCol: string, startMin: number) => {
    const job = jobById(jobId);
    if (!job) return;
    const snapped = Math.max(0, Math.min(24 * 60 - SNAP, Math.round(startMin / SNAP) * SNAP));
    setSaving(true);
    try {
      const s = await loadSchedule(jobId);
      const len = s.start && s.end ? new Date(s.end).getTime() - new Date(s.start).getTime() : 2 * 3600e3;
      const start = new Date(startOfDay(day).getTime() + snapped * 60000);
      let crew = [s.primary, ...s.crew].filter((x): x is string => !!x);
      let primary = s.primary;
      if (toCol === UNASSIGNED) { crew = []; primary = null; }
      else if (fromCol !== toCol) {
        const wasPrimary = fromCol === primary || fromCol === UNASSIGNED || !primary;
        crew = crew.filter((u) => u !== fromCol);
        if (!crew.includes(toCol)) crew = wasPrimary ? [toCol, ...crew] : [...crew, toCol];
        if (wasPrimary) primary = toCol;
      }
      if (primary && !crew.includes(primary)) primary = crew[0] ?? null;
      if (!primary) primary = crew[0] ?? null;
      const ok = await saveSchedule(jobId, {
        ...s, start: start.toISOString(), end: new Date(start.getTime() + len).toISOString(),
        primary, crew: crew.filter((u) => u !== primary),
      }, { canOverride: admin });
      if (ok) { setSelected(null); q.reload(); }
    } catch (e: any) {
      notify('Could not move the job', friendlyError(e.message));
    } finally {
      setSaving(false);
    }
  };

  const onDrop = (jobId: string, fromCol: string) => (absX: number, absY: number, grabY: number) => {
    setDragging(null);
    const hit = Object.entries(rects.current).find(([, r]) => absX >= r.x && absX <= r.x + r.w);
    if (!hit) return;
    const [colId, r] = hit;
    const topPx = absY - r.y - grabY;
    const startMin = startH * 60 + (topPx / HOUR_H) * 60;
    const job = jobById(jobId);
    const same = colId === fromCol && job?.scheduled_start && Math.abs(minutesOfDay(job.scheduled_start, day) - startMin) < SNAP / 2;
    if (same) return;
    move(jobId, fromCol, colId, startMin);
  };

  const onColumnPress = (colId: string) => (e: GestureResponderEvent) => {
    if (!selected) return;
    const startMin = startH * 60 + (e.nativeEvent.locationY / HOUR_H) * 60;
    move(selected.jobId, selected.from, colId, startMin);
  };

  const sel = selected ? jobById(selected.jobId) : null;
  const isWeb = Platform.OS === 'web';
  const today = isSameDay(day, new Date());

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Dispatch board', headerRight: () => <IconButton icon="refresh" label="Refresh" onPress={q.reload} /> }} />
      <View style={{ paddingHorizontal: space.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" label="Previous day" onPress={() => setDay((x) => addDays(x, -1))} />
          <Pressable onPress={() => setDay(startOfDay(new Date()))}>
            <T variant="h3">{today ? 'Today · ' : ''}{format(day, 'EEE, MMM d')}</T>
          </Pressable>
          <IconButton icon="chevron-forward" label="Next day" onPress={() => setDay((x) => addDays(x, 1))} />
        </Row>
        {can('branches') && lk.branches.length ? (
          <Select icon="business-outline" placeholder="All locations" value={branchId} allowClear options={lk.branchOptions} onChange={setBranchId} />
        ) : null}
        <T variant="small" style={{ marginBottom: space.sm }}>
          {isWeb ? 'Tap a job, then tap a technician column at the new time.' : 'Long-press a job and drag it to another technician or time. Tap a job for options.'}
        </T>
        <ErrorBanner message={q.error} onRetry={q.reload} />
        {d.unscheduled.length ? (
          <View style={{ marginBottom: space.sm }}>
            <T variant="overline" style={{ marginBottom: 4 }}>Not scheduled yet ({d.unscheduled.length})</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} scrollEnabled={!dragging}>
              {d.unscheduled.map((j) => (
                <DispatchCard key={j.id} job={j} style={{ width: 150, height: 62 }} selected={selected?.jobId === j.id} isPrimary label="No time"
                  onTap={() => setSelected(selected?.jobId === j.id ? null : { jobId: j.id, from: UNASSIGNED })}
                  onDragStart={() => { measureColumns(); setDragging(j.id); }} onDrop={onDrop(j.id, UNASSIGNED)} />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} scrollEnabled={!dragging} contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={{ flexDirection: 'row', paddingLeft: space.sm }}>
          {/* Time axis */}
          <View style={{ width: TIME_W, paddingTop: HEAD_H }}>
            {hoursList.map((h) => (
              <View key={h} style={{ height: HOUR_H }}>
                <T variant="small" style={{ marginTop: -7 }}>{format(new Date(2000, 0, 1, h), 'ha').toLowerCase()}</T>
              </View>
            ))}
          </View>
          <ScrollView horizontal scrollEnabled={!dragging} showsHorizontalScrollIndicator contentContainerStyle={{ paddingRight: space.lg }}>
            {columns.map((c) => {
              const list = c.id === UNASSIGNED ? jobsIn(UNASSIGNED) : jobsIn(c.id);
              const laid = layout(list.filter((j) => j.scheduled_start));
              return (
                <View key={c.id} style={{ width: COL_W, marginRight: 6, zIndex: laid.some((x) => x.j.id === dragging) ? 50 : 1 }}>
                  <Row style={{ height: HEAD_H, paddingHorizontal: 4 }} gap={6}>
                    {c.id === UNASSIGNED ? <Ionicons name="help-circle-outline" size={26} color={colors.textMuted} /> : <Avatar size={28} label={initials(c.name)} color={c.color ?? colors.primary} />}
                    <View style={{ flex: 1 }}>
                      <T style={{ fontWeight: '700' }} numberOfLines={1}>{c.name}</T>
                      <T variant="small" numberOfLines={1}>
                        {c.id === UNASSIGNED ? `${list.length} job${list.length === 1 ? '' : 's'}` : c.timeOff ? 'Time off' : c.hours ? `${format(new Date(2000, 0, 1, 0, c.hours.start), 'h:mm')}–${format(new Date(2000, 0, 1, 0, c.hours.end), 'h:mm a')}` : 'Day off'}
                      </T>
                    </View>
                  </Row>
                  <Pressable ref={(r) => { colRefs.current[c.id] = r as unknown as View | null; }} onPress={onColumnPress(c.id)} disabled={!selected}
                    style={{ height: boardH, borderRadius: radius.md, backgroundColor: c.id === UNASSIGNED ? colors.bgDeep : colors.card, borderWidth: 1, borderColor: selected ? colors.accent + '88' : colors.border, overflow: 'visible' }}>
                    {/* Hour lines */}
                    {hoursList.map((h, i) => <View key={h} pointerEvents="none" style={{ position: 'absolute', top: i * HOUR_H, left: 0, right: 0, height: 1, backgroundColor: colors.border }} />)}
                    {/* Outside working hours / day off */}
                    {c.id !== UNASSIGNED && !c.hours ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} /> : null}
                    {c.hours ? (
                      <>
                        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.max(0, yOf(c.hours.start)), backgroundColor: 'rgba(0,0,0,0.35)' }} />
                        <View pointerEvents="none" style={{ position: 'absolute', top: Math.max(0, yOf(c.hours.end)), left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
                      </>
                    ) : null}
                    {c.timeOff ? (
                      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.warningSoft + 'CC', alignItems: 'center', paddingTop: space.lg }}>
                        <Ionicons name="airplane-outline" size={22} color={colors.warning} />
                        <T variant="small" style={{ color: colors.warning, textAlign: 'center' }}>{c.timeOff}</T>
                      </View>
                    ) : null}
                    {today ? (() => {
                      const nowMin = minutesOfDay(new Date().toISOString(), day);
                      return nowMin >= startH * 60 && nowMin <= endH * 60 ? <View pointerEvents="none" style={{ position: 'absolute', top: yOf(nowMin), left: 0, right: 0, height: 2, backgroundColor: colors.accent }} /> : null;
                    })() : null}
                    {laid.map(({ j, s, e, lane, lanes }) => {
                      const w = (COL_W - 6) / lanes;
                      const isPrimary = c.id === UNASSIGNED || !!j.job_assignments.find((a) => a.user_id === c.id)?.is_primary;
                      return (
                        <DispatchCard key={j.id} job={j} isPrimary={isPrimary} selected={selected?.jobId === j.id}
                          label={`${time(j.scheduled_start)}${j.scheduled_end ? `–${time(j.scheduled_end)}` : ''}`}
                          style={{ position: 'absolute', top: yOf(s), left: 3 + lane * w, width: w, height: Math.max(30, ((e - s) / 60) * HOUR_H - 2) }}
                          onTap={() => setSelected(selected?.jobId === j.id ? null : { jobId: j.id, from: c.id })}
                          onDragStart={() => { measureColumns(); setDragging(j.id); }}
                          onDrop={onDrop(j.id, c.id)} />
                      );
                    })}
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
        {!techs.length ? <EmptyState icon="people-outline" title="No technicians yet" body="Invite your crew under Team to dispatch jobs to them." /> : null}
      </ScrollView>

      {sel ? (
        <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.cardRaised, borderTopWidth: 1, borderTopColor: colors.borderStrong, padding: space.lg }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }} numberOfLines={1}>{sel.number} · {sel.aircraft?.tail_number ?? ''} · {sel.customer?.name ?? ''}</T>
              <T variant="small" numberOfLines={1}>{sel.title ?? ''}{sel.scheduled_start ? ` · ${time(sel.scheduled_start)}` : ' · no time yet'}</T>
              {isWeb ? <T variant="small" style={{ color: colors.accent, marginTop: 2 }}>Tap a column at the new time to move it.</T> : null}
            </View>
            {sel.status === 'tentative' ? <Badge label="Tentative" raw /> : null}
            <IconButton icon="close" label="Clear selection" onPress={() => setSelected(null)} />
          </Row>
          <Row style={{ marginTop: space.sm }}>
            <Button small kind="secondary" icon="open-outline" title="Open job" onPress={() => router.push(`/jobs/${sel.id}`)} />
            <Button small icon="calendar-outline" title="Edit time & crew" onPress={() => setSheet(sel.id)} />
          </Row>
        </SafeAreaView>
      ) : null}
      {saving ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 8, alignSelf: 'center', backgroundColor: colors.cardRaised, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill }}>
          <T variant="small">Saving…</T>
        </View>
      ) : null}
      <ScheduleSheet visible={!!sheet} jobId={sheet} onClose={() => setSheet(null)} onSaved={() => { setSelected(null); q.reload(); }} />
    </GestureHandlerRootView>
  );
}
