import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { crewList, EMPTY_SCHEDULE, fetchConflicts, isHardConflict, loadSchedule, localScheduleProblems, saveSchedule, conflictIcon, ask, type ScheduleValue } from '../../lib/conflicts';
import { initials } from '../../lib/format';
import { skillScore } from '../../lib/jobs';
import { canAdmin } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import type { Conflict } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';
import { DateTimeField } from '../DateTimeField';
import { Avatar, Badge, Button, ErrorBanner, Field, Ionicons, Loading, Row, Select, SheetModal, T } from '../ui';

export interface ScheduleMember { user_id: string; display_name: string | null; color: string | null; skills: string[]; role: string }
export interface BookableEquipment { id: string; name: string; status: string }
export interface HangarSite { id: string; name: string; airport_code: string | null; hangar_capacity: number }

/** Members, bookable equipment and hangars for the schedule editor. */
export function useScheduleResources() {
  const { orgId } = useOrg();
  return useQuery(async () => {
    const [m, e, l] = await Promise.all([
      supabase.from('memberships').select('user_id, display_name, color, skills, role').eq('org_id', orgId).eq('active', true).order('display_name'),
      supabase.from('equipment').select('id, name, status').eq('org_id', orgId).eq('bookable', true).neq('status', 'retired').order('name'),
      supabase.from('locations').select('id, name, airport_code, hangar_capacity, hangar_available').eq('org_id', orgId).eq('active', true).gt('hangar_capacity', 0).order('name'),
    ]);
    if (m.error) throw new Error(m.error.message);
    return {
      members: ((m.data ?? []) as ScheduleMember[]).filter((x) => x.role !== 'viewer'),
      equipment: (e.data ?? []) as BookableEquipment[],
      hangars: ((l.data ?? []) as (HangarSite & { hangar_available: boolean })[]).filter((x) => x.hangar_available),
    };
  }, [orgId]);
}

const toIso = (d: Date) => d.toISOString();
const addMin = (iso: string, min: number) => toIso(new Date(new Date(iso).getTime() + min * 60000));
const durationMin = (v: ScheduleValue) => (v.start && v.end ? Math.round((new Date(v.end).getTime() - new Date(v.start).getTime()) / 60000) : null);

function Chip({ on, label, onPress, color, sub, disabled }: { on: boolean; label: string; onPress: () => void; color?: string | null; sub?: string; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, paddingRight: 12, borderRadius: radius.pill, backgroundColor: on ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: on ? colors.primary : colors.border, opacity: disabled ? 0.5 : 1 }}>
      {color !== undefined ? <Avatar size={24} label={initials(label)} color={color ?? colors.primary} /> : null}
      <View>
        <T style={{ fontWeight: on ? '700' : '400', fontSize: 15 }}>{label}</T>
        {sub ? <T variant="small" style={{ color: colors.success }}>{sub}</T> : null}
      </View>
    </Pressable>
  );
}

/** List of conflict warnings. */
export function ConflictList({ conflicts, checking, memberName }: { conflicts: Conflict[]; checking?: boolean; memberName?: (id: string) => string }) {
  if (checking && !conflicts.length) {
    return <Row style={{ marginBottom: space.md }}><ActivityIndicator size="small" color={colors.textMuted} /><T variant="muted">Checking the schedule…</T></Row>;
  }
  if (!conflicts.length) return null;
  return (
    <View style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.warning + '66' }}>
      <Row style={{ marginBottom: 6 }}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <T style={{ fontWeight: '700', color: colors.warning, flex: 1 }}>{conflicts.length} scheduling conflict{conflicts.length === 1 ? '' : 's'}</T>
        {checking ? <ActivityIndicator size="small" color={colors.warning} /> : null}
      </Row>
      {conflicts.map((c, i) => (
        <Row key={i} style={{ alignItems: 'flex-start', marginTop: 4 }}>
          <Ionicons name={conflictIcon(c.type) as any} size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
          <T style={{ flex: 1, fontSize: 15 }}>{c.message || (c.user_id && memberName ? memberName(c.user_id) : 'Conflict')}</T>
        </Row>
      ))}
    </View>
  );
}

/**
 * Controlled editor for a job's time, crew and reservations, with live
 * conflict warnings (debounced calls to public.schedule_conflicts).
 */
export function ScheduleEditor({
  value, onChange, jobId, locationId, categories = [], confirmed, onConflicts,
}: {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
  jobId?: string | null;
  /** The job's facility (for badge/insurance requirements). */
  locationId?: string | null;
  /** Service categories on the job, for skill-based crew suggestions. */
  categories?: string[];
  /** Crew confirmations (job_assignments.confirmed). */
  confirmed?: Record<string, boolean>;
  onConflicts?: (c: Conflict[], checking: boolean) => void;
}) {
  const { orgId } = useOrg();
  const res = useScheduleResources();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const cb = useRef(onConflicts);
  useEffect(() => { cb.current = onConflicts; });

  const key = JSON.stringify([value, jobId, locationId]);
  useEffect(() => {
    let alive = true;
    cb.current?.(conflicts, true);
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const local = localScheduleProblems(value);
        const list = local ? [{ type: 'invalid', message: local }] : await fetchConflicts({ orgId, jobId, value, locationId });
        if (!alive) return;
        setConflicts(list);
        setCheckError(null);
        cb.current?.(list, false);
      } catch (e: any) {
        if (!alive) return;
        setCheckError(e.message);
        cb.current?.([], false);
      } finally {
        if (alive) setChecking(false);
      }
    }, 450);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, orgId]);

  const members = useMemo(() => {
    const list = res.data?.members ?? [];
    return [...list].map((m) => ({ ...m, score: skillScore(m.skills, categories) }))
      .sort((a, b) => b.score - a.score || (a.display_name ?? '').localeCompare(b.display_name ?? ''));
  }, [res.data?.members, categories]);
  const name = (u: string) => members.find((m) => m.user_id === u)?.display_name ?? 'Team member';

  const set = (patch: Partial<ScheduleValue>) => onChange({ ...value, ...patch });
  const dur = durationMin(value);

  const setStart = (s: string | null) => {
    if (!s) return set({ start: null });
    // Keep the same length when moving the start.
    set({ start: s, end: dur && dur > 0 ? addMin(s, dur) : value.end ?? addMin(s, 120) });
  };

  const setPrimary = (u: string) => {
    if (value.primary === u) return set({ primary: null });
    set({ primary: u, crew: value.crew.filter((x) => x !== u) });
  };
  const toggleCrew = (u: string) => {
    if (u === value.primary) return;
    set({ crew: value.crew.includes(u) ? value.crew.filter((x) => x !== u) : [...value.crew, u] });
  };
  const toggleEquip = (id: string) => set({ equipment: value.equipment.includes(id) ? value.equipment.filter((x) => x !== id) : [...value.equipment, id] });

  if (res.loading && !res.data) return <ActivityIndicator color={colors.primary} style={{ margin: space.lg }} />;
  const anySkills = categories.length > 0 && members.some((m) => m.score > 0);
  const crew = crewList(value);

  return (
    <View>
      <DateTimeField label="Start" value={value.start} onChange={setStart} />
      <DateTimeField label="End" value={value.end} onChange={(e) => set({ end: e })} />
      {value.start ? (
        <Row style={{ flexWrap: 'wrap', marginTop: -6, marginBottom: space.lg }}>
          {[60, 120, 240, 480].map((m) => (
            <Pressable key={m} onPress={() => set({ end: addMin(value.start!, m) })}
              style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: dur === m ? colors.primary : colors.borderStrong, backgroundColor: dur === m ? colors.primarySoft : 'transparent' }}>
              <T variant="muted" style={dur === m ? { color: colors.primaryText } : undefined}>{m / 60} h</T>
            </Pressable>
          ))}
          {dur != null && dur > 0 ? <T variant="small">Length: {Math.floor(dur / 60)}h {dur % 60 ? `${dur % 60}m` : ''} (max 24 h)</T> : null}
        </Row>
      ) : null}
      <Row gap={space.md}>
        <Field style={{ flex: 1 }} label="Travel before (min)" keyboardType="number-pad" value={String(value.travelBefore || '')} placeholder="0"
          onChangeText={(t) => set({ travelBefore: Math.min(720, Number(t.replace(/\D/g, '')) || 0) })} />
        <Field style={{ flex: 1 }} label="Travel after (min)" keyboardType="number-pad" value={String(value.travelAfter || '')} placeholder="0"
          onChangeText={(t) => set({ travelAfter: Math.min(720, Number(t.replace(/\D/g, '')) || 0) })} />
      </Row>

      <T style={{ fontWeight: '600', fontSize: 15, marginBottom: 4 }}>Primary technician</T>
      <T variant="small" style={{ marginBottom: 8 }}>{anySkills ? 'Qualified techs for these services are listed first.' : 'Tap to choose the lead for this job.'}</T>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.lg }}>
        {members.length ? members.map((m) => (
          <Chip key={m.user_id} on={value.primary === m.user_id} label={m.display_name ?? 'Member'} color={m.color}
            sub={m.score > 0 ? 'Skilled match' : undefined} onPress={() => setPrimary(m.user_id)} />
        )) : <T variant="muted">No team members yet.</T>}
      </Row>

      <T style={{ fontWeight: '600', fontSize: 15, marginBottom: 8 }}>Additional crew</T>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.lg }}>
        {members.filter((m) => m.user_id !== value.primary).map((m) => (
          <Chip key={m.user_id} on={value.crew.includes(m.user_id)} label={m.display_name ?? 'Member'} color={m.color}
            sub={m.score > 0 ? 'Skilled match' : undefined} onPress={() => toggleCrew(m.user_id)} />
        ))}
        {members.length <= 1 ? <T variant="muted">Invite more people under Team to add crew.</T> : null}
      </Row>

      {confirmed && crew.length ? (
        <View style={{ marginBottom: space.lg }}>
          <T style={{ fontWeight: '600', fontSize: 15, marginBottom: 6 }}>Crew confirmations</T>
          {crew.map((u) => (
            <Row key={u} style={{ marginBottom: 4 }}>
              <Ionicons name={confirmed[u] ? 'checkmark-circle' : 'time-outline'} size={18} color={confirmed[u] ? colors.success : colors.textMuted} />
              <T style={{ flex: 1 }}>{name(u)}{u === value.primary ? ' (primary)' : ''}</T>
              <T variant="small">{confirmed[u] ? 'Confirmed' : u in confirmed ? 'Waiting' : 'Not saved yet'}</T>
            </Row>
          ))}
        </View>
      ) : null}

      <T style={{ fontWeight: '600', fontSize: 15, marginBottom: 8 }}>Reserve equipment</T>
      <Row style={{ flexWrap: 'wrap', marginBottom: space.lg }}>
        {(res.data?.equipment ?? []).length ? res.data!.equipment.map((e) => (
          <Chip key={e.id} on={value.equipment.includes(e.id)} label={e.name}
            sub={e.status === 'out_of_service' ? 'Out of service' : e.status === 'needs_service' ? 'Needs service' : undefined}
            disabled={e.status === 'out_of_service' && !value.equipment.includes(e.id)} onPress={() => toggleEquip(e.id)} />
        )) : <T variant="muted">No bookable equipment. Mark equipment as bookable in Equipment.</T>}
      </Row>

      <Select label="Reserve hangar" placeholder={(res.data?.hangars ?? []).length ? 'No hangar' : 'No facilities with hangar space'} allowClear
        value={value.hangar} onChange={(h) => set({ hangar: h })}
        options={(res.data?.hangars ?? []).map((h) => ({ value: h.id, label: [h.airport_code, h.name].filter(Boolean).join(' · '), hint: `${h.hangar_capacity} space${h.hangar_capacity === 1 ? '' : 's'}${h.id === locationId ? ' · job facility' : ''}` }))} />

      <ErrorBanner message={checkError} />
      <ConflictList conflicts={conflicts} checking={checking} memberName={name} />
      {!checking && !conflicts.length && value.start && value.end && !checkError ? (
        <Row style={{ marginBottom: space.md }}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
          <T style={{ color: colors.success }}>No conflicts — crew and resources are free.</T>
        </Row>
      ) : null}
    </View>
  );
}

/** Save button rules: hard problems block everyone; other conflicts block managers, owners/admins can override. */
export function useSaveRules(conflicts: Conflict[], checking: boolean) {
  const { role } = useOrg();
  const admin = canAdmin(role);
  const hard = conflicts.some(isHardConflict);
  return {
    admin,
    hard,
    blocked: hard || (conflicts.length > 0 && !admin),
    needsOverride: !hard && conflicts.length > 0 && admin,
    checking,
    message: hard ? 'Fix the times above to save.'
      : conflicts.length && !admin ? 'Resolve the conflicts above to save. Only an owner or admin can override a conflict.'
      : conflicts.length ? 'You can override these conflicts as an owner/admin. The override is recorded on the job.'
      : null,
  };
}

/** Full-screen sheet to edit an existing job's schedule (job detail, dispatch, list). */
export function ScheduleSheet({
  visible, jobId, onClose, onSaved, confirm, categories, patch, title = 'Time, crew & resources',
}: {
  visible: boolean;
  jobId: string | null;
  onClose: () => void;
  onSaved?: () => void;
  /** Confirm a tentative job when saving. */
  confirm?: boolean;
  categories?: string[];
  /** Overrides applied on top of the saved schedule (e.g. a drop on the dispatch board). */
  patch?: Partial<ScheduleValue> | null;
  title?: string;
}) {
  const [value, setValue] = useState<ScheduleValue>(EMPTY_SCHEDULE);
  const [meta, setMeta] = useState<{ locationId: string | null; status: string; confirmed: Record<string, boolean> } | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conf, setConf] = useState<{ list: Conflict[]; checking: boolean }>({ list: [], checking: false });
  const rules = useSaveRules(conf.list, conf.checking);
  const want = visible && jobId ? `${jobId}:${JSON.stringify(patch ?? null)}` : null;

  useEffect(() => {
    if (!want || want === loadedFor || !jobId) return;
    let alive = true;
    loadSchedule(jobId).then((s) => {
      if (!alive) return;
      const { locationId, status, confirmed, ...v } = s;
      setValue({ ...v, ...(patch ?? {}) });
      setMeta({ locationId, status, confirmed });
      setLoadedFor(want);
      setError(null);
    }).catch((e) => alive && setError(friendlyError(e.message)));
    return () => { alive = false; };
  }, [want, loadedFor, jobId, patch]);

  const save = async () => {
    if (!jobId) return;
    setError(null);
    try {
      if (rules.needsOverride) {
        const ok = await ask('Override conflicts?', `${conf.list.map((c) => '• ' + c.message).join('\n')}\n\nSave anyway? The override is recorded on the job.`, 'Override and save', true);
        if (!ok) return;
      }
      const ok = await saveSchedule(jobId, value, { canOverride: rules.admin, confirm: !!confirm, override: rules.needsOverride });
      if (!ok) return;
      setLoadedFor(null);
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  const ready = loadedFor === want && meta;
  return (
    <SheetModal visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
          <Button small kind="ghost" title="Cancel" onPress={() => { setLoadedFor(null); onClose(); }} />
          <T variant="h3" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>{title}</T>
          <View style={{ width: 70 }} />
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <ErrorBanner message={error} />
          {!ready ? <Loading /> : (
            <>
              {meta.status === 'tentative' ? (
                <View style={{ marginBottom: space.md }}><Badge label={confirm ? 'Tentative — saving confirms this job' : 'Tentative'} tone="warning" raw /></View>
              ) : null}
              <ScheduleEditor value={value} onChange={setValue} jobId={jobId} locationId={meta.locationId} categories={categories}
                confirmed={meta.confirmed} onConflicts={(list, checking) => setConf({ list, checking })} />
            </>
          )}
        </ScrollView>
        {ready ? (
          <SafeAreaView edges={['bottom']} style={{ padding: space.lg, paddingBottom: space.sm, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border }}>
            {rules.message ? <T variant="small" style={{ marginBottom: 8, color: rules.blocked ? colors.danger : colors.warning }}>{rules.message}</T> : null}
            <Button title={rules.needsOverride ? 'Override and save' : confirm ? 'Confirm & save' : 'Save schedule'}
              kind={rules.needsOverride ? 'danger' : 'primary'} icon={rules.needsOverride ? 'warning-outline' : 'checkmark'}
              disabled={rules.blocked || conf.checking} onPress={save} />
          </SafeAreaView>
        ) : null}
      </KeyboardAvoidingView>
    </SheetModal>
  );
}
