import { addDays, format } from 'date-fns';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTimeField } from '../../components/DateTimeField';
import { FormSheet, notify } from '../../components/FormSheet';
import { ConflictList, useSaveRules } from '../../components/jobs/ScheduleEditor';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, IconButton, Ionicons, ListRow, Loading, Row, Screen, Section, Segmented, Select, T } from '../../components/ui';
import { ask, EMPTY_SCHEDULE, fetchConflicts, localScheduleProblems } from '../../lib/conflicts';
import { date, isoDate } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import { canAdmin, isManager } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import type { Conflict } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';

type Tab = 'hours' | 'timeoff' | 'resources' | 'locations';
const WEEK: { d: number; label: string }[] = [
  { d: 1, label: 'Monday' }, { d: 2, label: 'Tuesday' }, { d: 3, label: 'Wednesday' }, { d: 4, label: 'Thursday' },
  { d: 5, label: 'Friday' }, { d: 6, label: 'Saturday' }, { d: 0, label: 'Sunday' },
];
interface HourRow { weekday: number; on: boolean; start: string; end: string }
const hhmm = (t: string) => t.slice(0, 5);
const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const defaultHours = (): HourRow[] => WEEK.map((w) => ({ weekday: w.d, on: w.d >= 1 && w.d <= 5, start: '07:00', end: '17:00' }));

/** Crew scheduling & resource reservations: working hours, time off, equipment/hangars, holds, company locations. */
export default function Scheduling() {
  const { role } = useOrg();
  const [tab, setTab] = useState<Tab>('hours');
  const manager = isManager(role);
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Crew scheduling' }} />
      <T variant="muted" style={{ marginBottom: space.md }}>Working hours, time off and resources are used to check every job for conflicts automatically.</T>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'hours', label: 'Working hours' },
        { value: 'timeoff', label: 'Time off' },
        ...(manager ? [{ value: 'resources' as Tab, label: 'Equipment & hangars' }] : []),
        { value: 'locations', label: 'Company locations' },
      ]} />
      {tab === 'hours' ? <HoursTab /> : tab === 'timeoff' ? <TimeOffTab /> : tab === 'resources' ? <ResourcesTab /> : <LocationsTab />}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
function HoursTab() {
  const { orgId, role, session } = useOrg();
  const uid = session!.user.id;
  const manager = isManager(role);
  const lk = useLookups();
  const [who, setWho] = useState<string>(uid);
  const [rows, setRows] = useState<HourRow[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const q = useQuery(async () => {
    const { data, error: e } = await supabase.from('crew_hours').select('user_id, weekday, start_time, end_time').eq('org_id', orgId);
    if (e) throw e;
    return (data ?? []) as { user_id: string; weekday: number; start_time: string; end_time: string }[];
  }, [orgId]);

  if (q.data && loadedFor !== who) {
    setLoadedFor(who);
    const mine = q.data.filter((r) => r.user_id === who);
    setRows(mine.length ? WEEK.map((w) => {
      const r = mine.find((x) => x.weekday === w.d);
      return { weekday: w.d, on: !!r, start: r ? hhmm(r.start_time) : '07:00', end: r ? hhmm(r.end_time) : '17:00' };
    }) : defaultHours());
    setSaved(false);
    setError(null);
  }

  const save = async () => {
    if (!rows) return;
    setError(null);
    for (const r of rows.filter((x) => x.on)) {
      if (!validTime(r.start) || !validTime(r.end)) return setError('Use 24-hour times like 07:00 and 17:30.');
      if (r.end <= r.start) return setError(`${WEEK.find((w) => w.d === r.weekday)!.label}: end time must be after the start time.`);
    }
    const off = rows.filter((x) => !x.on).map((x) => x.weekday);
    try {
      if (off.length) {
        const del = await supabase.from('crew_hours').delete().eq('org_id', orgId).eq('user_id', who).in('weekday', off);
        if (del.error) throw del.error;
      }
      const on = rows.filter((x) => x.on).map((x) => ({ org_id: orgId, user_id: who, weekday: x.weekday, start_time: x.start, end_time: x.end }));
      if (on.length) {
        const up = await supabase.from('crew_hours').upsert(on, { onConflict: 'org_id,user_id,weekday' });
        if (up.error) throw up.error;
      }
      setSaved(true);
      q.reload();
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  const set = (d: number, patch: Partial<HourRow>) => { setSaved(false); setRows((rs) => rs!.map((r) => (r.weekday === d ? { ...r, ...patch } : r))); };
  const people = manager ? lk.members.filter((m) => m.role !== 'viewer') : lk.members.filter((m) => m.user_id === uid);

  return (
    <View>
      <ErrorBanner message={q.error ?? error} />
      {manager ? (
        <Select label="Team member" icon="person-outline" value={who} onChange={(v) => v && setWho(v)}
          options={people.map((m) => ({ value: m.user_id, label: m.display_name ?? 'Team member', hint: m.role }))} />
      ) : <T variant="muted" style={{ marginBottom: space.md }}>Your working hours. Ask a manager to change them.</T>}
      {!rows ? <Loading /> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {WEEK.map((w) => {
            const r = rows.find((x) => x.weekday === w.d)!;
            return (
              <Row key={w.d} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Switch value={r.on} disabled={!manager} onValueChange={(v) => set(w.d, { on: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.white} />
                <T style={{ width: 96, fontWeight: r.on ? '600' : '400', color: r.on ? colors.text : colors.textMuted }}>{w.label}</T>
                {r.on ? (
                  <Row style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <TimeBox value={r.start} editable={manager} onChange={(t) => set(w.d, { start: t })} />
                    <T variant="muted">to</T>
                    <TimeBox value={r.end} editable={manager} onChange={(t) => set(w.d, { end: t })} />
                  </Row>
                ) : <T variant="muted" style={{ flex: 1, textAlign: 'right' }}>Off</T>}
              </Row>
            );
          })}
        </Card>
      )}
      {manager && rows ? (
        <Row style={{ marginTop: space.md }}>
          <Button small kind="ghost" title="Reset to Mon–Fri 7–17" onPress={() => { setRows(defaultHours()); setSaved(false); }} />
          <Button title={saved ? 'Saved' : 'Save hours'} icon={saved ? 'checkmark' : undefined} onPress={save} style={{ flex: 1 }} />
        </Row>
      ) : null}
      <T variant="small" style={{ marginTop: space.md }}>New team members start with Monday–Friday, 7:00–17:00. Jobs outside these hours show a warning while scheduling.</T>
    </View>
  );
}

function TimeBox({ value, onChange, editable }: { value: string; onChange: (t: string) => void; editable: boolean }) {
  return (
    <TextInput value={value} editable={editable} onChangeText={(t) => onChange(t.replace(/[^0-9:]/g, '').slice(0, 5))} placeholder="07:00" placeholderTextColor={colors.textFaint}
      keyboardType="numbers-and-punctuation" maxLength={5}
      style={{ width: 66, textAlign: 'center', color: colors.text, fontSize: 16, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: validTime(value) ? colors.border : colors.danger }} />
  );
}

// ---------------------------------------------------------------------------
function TimeOffTab() {
  const { orgId, role, session } = useOrg();
  const uid = session!.user.id;
  const admin = canAdmin(role);
  const lk = useLookups();
  const [sheet, setSheet] = useState<null | 'request' | 'add'>(null);
  const q = useQuery(async () => {
    const { data, error } = await supabase.from('time_off').select('*').eq('org_id', orgId)
      .gte('ends_on', isoDate(addDays(new Date(), -60))).order('starts_on');
    if (error) throw error;
    return (data ?? []) as { id: string; user_id: string; starts_on: string; ends_on: string; reason: string | null; status: 'requested' | 'approved' | 'denied'; decided_at: string | null }[];
  }, [orgId]);
  const rows = q.data ?? [];
  const today = isoDate();
  const pending = rows.filter((r) => r.status === 'requested');
  const upcoming = rows.filter((r) => r.status === 'approved' && r.ends_on >= today);
  const past = rows.filter((r) => r.status === 'denied' || (r.status === 'approved' && r.ends_on < today)).reverse().slice(0, 15);
  const range = (r: { starts_on: string; ends_on: string }) => (r.starts_on === r.ends_on ? date(r.starts_on) : `${date(r.starts_on)} – ${date(r.ends_on)}`);
  const days = (r: { starts_on: string; ends_on: string }) => Math.round((new Date(r.ends_on).getTime() - new Date(r.starts_on).getTime()) / 864e5) + 1;

  const decide = (id: string, approve: boolean) => async () => {
    const { error } = await supabase.rpc('decide_time_off', { p_id: id, p_approve: approve });
    if (error) notify('Could not update', friendlyError(error.message)); else q.reload();
  };
  const remove = (id: string) => async () => {
    if (!(await ask('Remove this time off?', 'It will no longer block scheduling.', 'Remove', true))) return;
    const { error } = await supabase.from('time_off').delete().eq('id', id);
    if (error) notify('Could not remove', friendlyError(error.message)); else q.reload();
  };

  const row = (r: (typeof rows)[number], actions: ReactNode) => (
    <Card key={r.id} style={{ padding: space.md }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700' }}>{lk.memberName(r.user_id)}{r.user_id === uid ? ' (you)' : ''}</T>
          <T variant="muted">{range(r)} · {days(r)} day{days(r) === 1 ? '' : 's'}</T>
          {r.reason ? <T variant="small">{r.reason}</T> : null}
        </View>
        <Badge label={r.status === 'requested' ? 'Waiting for approval' : r.status} tone={r.status === 'approved' ? 'success' : r.status === 'denied' ? 'danger' : 'warning'} raw={r.status === 'requested'} />
      </Row>
      {actions}
    </Card>
  );

  return (
    <View>
      <ErrorBanner message={q.error} onRetry={q.reload} />
      <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
        <Button small icon="airplane-outline" title="Request time off" onPress={() => setSheet('request')} />
        {admin ? <Button small kind="secondary" icon="add" title="Add approved time off" onPress={() => setSheet('add')} /> : null}
      </Row>
      <Section title="Waiting for approval" count={String(pending.length)}>
        {pending.length ? pending.map((r) => row(r, (
          <Row style={{ marginTop: space.sm, justifyContent: 'flex-end' }}>
            {r.user_id === uid || admin ? <Button small kind="ghost" title={r.user_id === uid && !admin ? 'Withdraw' : 'Delete'} onPress={remove(r.id)} /> : null}
            {admin ? <Button small kind="secondary" title="Deny" onPress={decide(r.id, false)} /> : null}
            {admin ? <Button small icon="checkmark" title="Approve" onPress={decide(r.id, true)} /> : null}
          </Row>
        ))) : <Card><T variant="muted">No requests waiting.{admin ? '' : ' Owners and admins approve requests.'}</T></Card>}
      </Section>
      <Section title="Upcoming time off" count={String(upcoming.length)}>
        {upcoming.length ? upcoming.map((r) => row(r, admin ? <Button small kind="ghost" title="Remove" style={{ alignSelf: 'flex-end' }} onPress={remove(r.id)} /> : null))
          : <Card><T variant="muted">No approved time off coming up.</T></Card>}
      </Section>
      {past.length ? (
        <Section title="Recent">
          {past.map((r) => row(r, null))}
        </Section>
      ) : null}
      <FormSheet visible={!!sheet} title={sheet === 'add' ? 'Add time off' : 'Request time off'} onClose={() => setSheet(null)}
        initial={{ user_id: uid, starts_on: isoDate(addDays(new Date(), 7)), ends_on: isoDate(addDays(new Date(), 7)) }}
        fields={[
          ...(sheet === 'add' ? [{ key: 'user_id', label: 'Team member', type: 'select' as const, options: lk.memberOptions, required: true }] : []),
          { key: 'starts_on', label: 'First day off', type: 'date', required: true },
          { key: 'ends_on', label: 'Last day off', type: 'date', required: true },
          { key: 'reason', label: 'Reason (optional)', type: 'text', placeholder: 'Vacation, appointment…' },
        ]}
        onSubmit={async (v) => {
          if (v.ends_on < v.starts_on) throw new Error('The last day must be on or after the first day.');
          const add = sheet === 'add';
          const { error } = await supabase.from('time_off').insert({
            org_id: orgId, user_id: add ? v.user_id : uid, starts_on: v.starts_on, ends_on: v.ends_on, reason: v.reason,
            status: add ? 'approved' : 'requested', ...(add ? { decided_by: uid, decided_at: new Date().toISOString() } : {}),
          });
          if (error) throw error;
          q.reload();
        }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
interface Hold { id: string; equipment_id: string | null; location_id: string | null; job_id: string | null; starts_at: string; ends_at: string; note: string | null; job?: { number: string } | null }

function ResourcesTab() {
  const { orgId } = useOrg();
  const [holdSheet, setHoldSheet] = useState(false);
  const q = useQuery(async () => {
    const [e, l, h] = await Promise.all([
      supabase.from('equipment').select('id, name, status, category').eq('org_id', orgId).eq('bookable', true).neq('status', 'retired').order('name'),
      supabase.from('locations').select('id, name, airport_code, hangar_capacity, hangar_notes, hangar_available').eq('org_id', orgId).eq('active', true).gt('hangar_capacity', 0).eq('hangar_available', true).order('name'),
      supabase.from('resource_holds').select('id, equipment_id, location_id, job_id, starts_at, ends_at, note, job:jobs(number)').eq('org_id', orgId)
        .gt('ends_at', new Date().toISOString()).lt('starts_at', addDays(new Date(), 30).toISOString()).order('starts_at'),
    ]);
    if (e.error) throw e.error;
    return {
      equipment: (e.data ?? []) as { id: string; name: string; status: string; category: string | null }[],
      hangars: (l.data ?? []) as { id: string; name: string; airport_code: string | null; hangar_capacity: number; hangar_notes: string | null }[],
      holds: (h.data ?? []) as unknown as Hold[],
    };
  }, [orgId]);
  const d = q.data;
  const holdsFor = (k: 'equipment_id' | 'location_id', id: string) => (d?.holds ?? []).filter((h) => h[k] === id);
  const standalone = (d?.holds ?? []).filter((h) => !h.job_id);
  const label = (h: Hold) => h.equipment_id ? d?.equipment.find((e) => e.id === h.equipment_id)?.name ?? 'Equipment'
    : (() => { const x = d?.hangars.find((l) => l.id === h.location_id); return x ? `Hangar · ${[x.airport_code, x.name].filter(Boolean).join(' ')}` : 'Hangar'; })();
  const when = (h: Hold) => `${format(new Date(h.starts_at), 'EEE MMM d, h:mm a')} – ${format(new Date(h.ends_at), new Date(h.starts_at).toDateString() === new Date(h.ends_at).toDateString() ? 'h:mm a' : 'EEE MMM d, h:mm a')}`;

  const removeHold = (id: string) => async () => {
    if (!(await ask('Release this hold?', 'The resource becomes available for jobs again.', 'Release', true))) return;
    const { error } = await supabase.from('resource_holds').delete().eq('id', id);
    if (error) notify('Could not release', friendlyError(error.message)); else q.reload();
  };

  if (q.loading && !d) return <Loading />;
  return (
    <View>
      <ErrorBanner message={q.error} onRetry={q.reload} />
      <Section title="Holds (not tied to a job)" action={<Button small kind="ghost" icon="add" title="Add hold" onPress={() => setHoldSheet(true)} />}>
        {standalone.length ? standalone.map((h) => (
          <Card key={h.id} style={{ padding: space.md }}>
            <Row>
              <Ionicons name={h.equipment_id ? 'construct-outline' : 'home-outline'} size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }}>{label(h)}</T>
                <T variant="small">{when(h)}</T>
                {h.note ? <T variant="small">{h.note}</T> : null}
              </View>
              <IconButton icon="trash-outline" color={colors.textMuted} label="Release hold" onPress={removeHold(h.id)} />
            </Row>
          </Card>
        )) : <Card><T variant="muted">Reserve equipment or hangar space for maintenance, training or anything that isn&apos;t a job.</T></Card>}
      </Section>

      <Section title="Bookable equipment" count={String(d?.equipment.length ?? 0)}>
        {d?.equipment.length ? d.equipment.map((e) => {
          const hs = holdsFor('equipment_id', e.id);
          return (
            <Card key={e.id} onPress={() => router.push(`/equipment/${e.id}`)} style={{ padding: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '600', flex: 1 }}>{e.name}</T>
                {e.status !== 'in_service' ? <Badge label={e.status === 'out_of_service' ? 'Out of service' : 'Needs service'} tone={e.status === 'out_of_service' ? 'danger' : 'warning'} raw /> : <Badge label="Available" tone="success" raw />}
              </Row>
              {hs.slice(0, 3).map((h) => <T key={h.id} variant="small" style={{ marginTop: 2 }}>{when(h)} · {h.job ? `Job ${h.job.number}` : h.note ?? 'Hold'}</T>)}
              {hs.length > 3 ? <T variant="small">+{hs.length - 3} more in the next 30 days</T> : null}
            </Card>
          );
        }) : <Card><T variant="muted">No bookable equipment yet. Open an item in Equipment and turn on “Bookable”.</T></Card>}
      </Section>

      <Section title="Hangars" count={String(d?.hangars.length ?? 0)}>
        {d?.hangars.length ? d.hangars.map((l) => {
          const hs = holdsFor('location_id', l.id);
          return (
            <Card key={l.id} style={{ padding: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '600', flex: 1 }}>{[l.airport_code, l.name].filter(Boolean).join(' · ')}</T>
                <Badge label={`${l.hangar_capacity} space${l.hangar_capacity === 1 ? '' : 's'}`} tone="info" raw />
              </Row>
              {l.hangar_notes ? <T variant="small">{l.hangar_notes}</T> : null}
              {hs.slice(0, 3).map((h) => <T key={h.id} variant="small" style={{ marginTop: 2 }}>{when(h)} · {h.job ? `Job ${h.job.number}` : h.note ?? 'Hold'}</T>)}
            </Card>
          );
        }) : <Card><T variant="muted">No facilities with hangar space. Mark “Hangar available” and set the capacity on a facility.</T></Card>}
        <Button small kind="ghost" icon="location-outline" title="Facilities" onPress={() => router.push('/facilities')} style={{ alignSelf: 'flex-start' }} />
      </Section>

      <HoldSheet visible={holdSheet} equipment={d?.equipment ?? []} hangars={d?.hangars ?? []} onClose={() => setHoldSheet(false)} onSaved={() => { setHoldSheet(false); q.reload(); }} />
    </View>
  );
}

function HoldSheet({ visible, equipment, hangars, onClose, onSaved }: {
  visible: boolean; equipment: { id: string; name: string; status: string }[]; hangars: { id: string; name: string; airport_code: string | null }[];
  onClose: () => void; onSaved: () => void;
}) {
  const { orgId } = useOrg();
  const [kind, setKind] = useState<'equipment' | 'hangar'>('equipment');
  const [resource, setResource] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString(); });
  const [end, setEnd] = useState<string | null>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d.toISOString(); });
  const [note, setNote] = useState('');
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rules = useSaveRules(conflicts, checking);
  const alive = useRef(true);

  const key = JSON.stringify([visible, kind, resource, start, end]);
  useEffect(() => {
    if (!visible) return;
    alive.current = true;
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        let list: Conflict[] = [];
        if (start && end && end > start) {
          // Holds can be longer than a job; only the resource itself is checked.
          if (resource) {
            const v = { ...EMPTY_SCHEDULE, start, end, equipment: kind === 'equipment' ? [resource] : [], hangar: kind === 'hangar' ? resource : null };
            list = (await fetchConflicts({ orgId, value: v })).filter((c) => c.type !== 'too_long');
          }
        } else if (start && end) {
          list = [{ type: 'invalid', message: localScheduleProblems({ ...EMPTY_SCHEDULE, start, end }) ?? 'End time must be after the start time.' }];
        }
        if (alive.current) setConflicts(list);
      } catch (e: any) {
        if (alive.current) setError(e.message);
      } finally {
        if (alive.current) setChecking(false);
      }
    }, 400);
    return () => { alive.current = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = async () => {
    setError(null);
    if (!resource) return setError(kind === 'equipment' ? 'Choose the equipment to reserve.' : 'Choose the hangar to reserve.');
    if (!start || !end || end <= start) return setError('Choose a start and an end after it.');
    if (rules.needsOverride && !(await ask('Override conflicts?', `${conflicts.map((c) => '• ' + c.message).join('\n')}\n\nReserve anyway?`, 'Override and save', true))) return;
    const { error: e } = await supabase.from('resource_holds').insert({
      org_id: orgId, equipment_id: kind === 'equipment' ? resource : null, location_id: kind === 'hangar' ? resource : null,
      starts_at: start, ends_at: end, note: note.trim() || null,
    });
    if (e) return setError(friendlyError(e.message));
    setNote(''); setResource(null);
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
            <Button small kind="ghost" title="Cancel" onPress={onClose} />
            <T variant="h3">Reserve a resource</T>
            <Button small title={rules.needsOverride ? 'Override' : 'Save'} disabled={rules.blocked || checking} onPress={save} />
          </Row>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
            <ErrorBanner message={error} />
            <Segmented value={kind} onChange={(k) => { setKind(k); setResource(null); }} options={[{ value: 'equipment', label: 'Equipment' }, { value: 'hangar', label: 'Hangar' }]} />
            <Select label={kind === 'equipment' ? 'Equipment' : 'Hangar'} value={resource} onChange={setResource}
              placeholder={(kind === 'equipment' ? equipment : hangars).length ? 'Choose…' : 'Nothing bookable yet'}
              options={kind === 'equipment'
                ? equipment.map((e) => ({ value: e.id, label: e.name, hint: e.status === 'in_service' ? undefined : e.status.replace(/_/g, ' ') }))
                : hangars.map((h) => ({ value: h.id, label: [h.airport_code, h.name].filter(Boolean).join(' · ') }))} />
            <DateTimeField label="From" value={start} onChange={setStart} />
            <DateTimeField label="Until" value={end} onChange={setEnd} />
            <Field label="Note" placeholder="e.g. Pump service, training day" value={note} onChangeText={setNote} />
            <ConflictList conflicts={conflicts} checking={checking} />
            {rules.message ? <T variant="small" style={{ color: rules.blocked ? colors.danger : colors.warning }}>{rules.message}</T> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function LocationsTab() {
  const { role, can } = useOrg();
  const lk = useLookups();
  if (!can('branches')) {
    return (
      <EmptyState icon="business-outline" title="Multiple company locations" body="Run several shops or bases with their own jobs, schedules and profit reports on the Fleet plan."
        action={<Button title="See plans" icon="rocket-outline" onPress={() => router.push('/paywall')} />} />
    );
  }
  return (
    <View>
      <T variant="muted" style={{ marginBottom: space.md }}>Company locations are where your crews work from. They are different from the airports and marinas you service.</T>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {lk.branches.length ? lk.branches.map((b) => (
          <ListRow key={b.id} icon="business-outline" title={b.name} subtitle={b.address} meta={`${lk.members.filter((m) => m.default_branch_id === b.id).length} team member(s)`} />
        )) : <T variant="muted" style={{ padding: space.lg }}>No company locations yet.</T>}
      </Card>
      {canAdmin(role) ? <Button kind="secondary" icon="settings-outline" title="Manage company locations" onPress={() => router.push('/branches')} /> : null}
    </View>
  );
}
