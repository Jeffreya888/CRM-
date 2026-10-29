// Crew & resource scheduling helpers: live conflict checks and saving a job's
// schedule through public.schedule_job (owners/admins may override conflicts).
import { Alert, Platform } from 'react-native';
import { friendlyError, supabase } from './supabase';
import type { Conflict } from './types';

/** Everything the schedule editor controls for one job. */
export interface ScheduleValue {
  start: string | null;
  end: string | null;
  travelBefore: number;
  travelAfter: number;
  /** Primary technician (lead). */
  primary: string | null;
  /** Additional crew (never includes the primary). */
  crew: string[];
  equipment: string[];
  hangar: string | null;
}

export const EMPTY_SCHEDULE: ScheduleValue = {
  start: null, end: null, travelBefore: 0, travelAfter: 0, primary: null, crew: [], equipment: [], hangar: null,
};

/** Primary first, then the additional crew, without duplicates. */
export function crewList(v: Pick<ScheduleValue, 'primary' | 'crew'>): string[] {
  const out = v.primary ? [v.primary] : [];
  for (const u of v.crew) if (!out.includes(u)) out.push(u);
  return out;
}

/** Client-side checks that don't need the database. */
export function localScheduleProblems(v: ScheduleValue): string | null {
  if (!v.start && !v.end) return null;
  if (!v.start) return 'Choose a start time.';
  if (!v.end) return 'Choose an end time.';
  const a = new Date(v.start).getTime();
  const b = new Date(v.end).getTime();
  if (!(b > a)) return 'End time must be after the start time.';
  if (b - a > 24 * 3600e3) return 'A job can be at most 24 hours. Split longer work into several jobs.';
  if (v.travelBefore < 0 || v.travelBefore > 720 || v.travelAfter < 0 || v.travelAfter > 720) return 'Travel time must be between 0 and 720 minutes.';
  return null;
}

/** Calls public.schedule_conflicts. Returns [] when there is nothing to check. */
export async function fetchConflicts(args: {
  orgId: string; jobId?: string | null; value: ScheduleValue; locationId?: string | null;
}): Promise<Conflict[]> {
  const { value: v } = args;
  if (!v.start || !v.end) return [];
  const { data, error } = await supabase.rpc('schedule_conflicts', {
    p_org: args.orgId,
    p_job: args.jobId ?? null,
    p_start: v.start,
    p_end: v.end,
    p_users: crewList(v),
    p_equipment: v.equipment,
    p_hangar: v.hangar,
    p_travel_before: v.travelBefore || 0,
    p_travel_after: v.travelAfter || 0,
    p_location: args.locationId ?? null,
  });
  if (error) throw new Error(friendlyError(error.message));
  return (data ?? []) as Conflict[];
}

/** Conflicts that nobody can override (bad times). */
export const isHardConflict = (c: Conflict) => c.type === 'invalid' || c.type === 'too_long';

export const conflictIcon = (t: string) =>
  t === 'double_booked' ? 'people-outline'
  : t === 'time_off' ? 'airplane-outline'
  : t === 'off_day' || t === 'outside_hours' ? 'time-outline'
  : t === 'missing_requirement' ? 'id-card-outline'
  : t.startsWith('equipment') ? 'construct-outline'
  : t.startsWith('hangar') ? 'home-outline'
  : t === 'bays_full' ? 'car-sport-outline'
  : 'alert-circle-outline';

/** Promise-based confirm that works on native and web. */
export function ask(title: string, message: string, ok = 'OK', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof confirm === 'function' ? confirm(`${title}\n\n${message}`) : false);
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

const isConflictError = (msg: string) => msg.includes('SCHEDULE_CONFLICT');

/**
 * Saves a job's schedule. On conflicts: owners/admins are asked whether to
 * override (the DB logs the override); everyone else gets the error.
 * Returns true when saved, false when the user backed out.
 */
export async function saveSchedule(jobId: string, v: ScheduleValue, opts: { canOverride: boolean; confirm?: boolean; override?: boolean }): Promise<boolean> {
  const call = (override: boolean) => supabase.rpc('schedule_job', {
    p_job: jobId,
    p_start: v.start,
    p_end: v.end,
    p_crew: crewList(v),
    p_primary: v.primary ?? crewList(v)[0] ?? null,
    p_equipment: v.equipment,
    p_hangar: v.hangar,
    p_travel_before: v.travelBefore || 0,
    p_travel_after: v.travelAfter || 0,
    p_override: override,
    p_confirm: !!opts.confirm,
  });
  const local = localScheduleProblems(v);
  if (local) throw new Error(local);
  const first = await call(!!opts.override && opts.canOverride);
  if (!first.error) return true;
  const msg = first.error.message;
  if (!isConflictError(msg) || !opts.canOverride || opts.override) throw new Error(friendlyError(msg));
  // Hard problems (bad times) come back the same even with an override.
  if (/at most 24 hours|End time must be after/.test(msg)) throw new Error(friendlyError(msg));
  const go = await ask('Schedule conflict', `${friendlyError(msg)}\n\nSave anyway? The override is recorded on the job.`, 'Override and save', true);
  if (!go) return false;
  const second = await call(true);
  if (second.error) throw new Error(friendlyError(second.error.message));
  return true;
}

/** Loads a job's current schedule (times, crew, reservations). */
export async function loadSchedule(jobId: string): Promise<ScheduleValue & { locationId: string | null; status: string; confirmed: Record<string, boolean> }> {
  const [j, a, h] = await Promise.all([
    supabase.from('jobs').select('scheduled_start, scheduled_end, travel_before_min, travel_after_min, location_id, status').eq('id', jobId).single(),
    supabase.from('job_assignments').select('user_id, is_primary, confirmed').eq('job_id', jobId),
    supabase.from('resource_holds').select('equipment_id, location_id').eq('job_id', jobId),
  ]);
  if (j.error) throw new Error(friendlyError(j.error.message));
  const rows = (a.data ?? []) as { user_id: string; is_primary: boolean; confirmed: boolean }[];
  const primary = rows.find((r) => r.is_primary)?.user_id ?? rows[0]?.user_id ?? null;
  const holds = (h.data ?? []) as { equipment_id: string | null; location_id: string | null }[];
  return {
    start: j.data.scheduled_start, end: j.data.scheduled_end,
    travelBefore: j.data.travel_before_min ?? 0, travelAfter: j.data.travel_after_min ?? 0,
    primary, crew: rows.map((r) => r.user_id).filter((u) => u !== primary),
    equipment: holds.map((x) => x.equipment_id).filter((x): x is string => !!x),
    hangar: holds.find((x) => x.location_id)?.location_id ?? null,
    locationId: j.data.location_id, status: j.data.status,
    confirmed: Object.fromEntries(rows.map((r) => [r.user_id, r.confirmed])),
  };
}

/**
 * Confirms a tentative job, conflict-checked. Returns 'saved', 'cancelled'
 * or 'needs_time' (the job has no time yet — open the schedule editor).
 */
export async function confirmTentative(jobId: string, canOverride: boolean): Promise<'saved' | 'cancelled' | 'needs_time'> {
  const s = await loadSchedule(jobId);
  if (!s.start || !s.end) return 'needs_time';
  const ok = await saveSchedule(jobId, s, { canOverride, confirm: true });
  return ok ? 'saved' : 'cancelled';
}
