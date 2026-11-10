// Works without signal: checklist steps, clocking in and out, and job photos are saved on the phone when
// there's no connection, and sent in order once it's back. Times are recorded when the tech acted, not when
// the update reaches the server. Other errors (permissions, closed pay period) are reported, not retried.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { reportClientError } from './errorReporter';
import { isOfflineError } from './offlineErrors';
import { supabase } from './supabase';

export { isOfflineError };

export type QueuedOp =
  | { kind: 'checklist'; id: string; itemId: string; done: boolean; userId: string; at: string }
  | { kind: 'clock_in'; id: string; entryId: string; orgId: string; userId: string; jobId: string | null; at: string }
  | { kind: 'clock_out'; id: string; entryId: string | null; orgId: string; userId: string; at: string }
  | { kind: 'photo'; id: string; orgId: string; jobId: string; userId: string; path: string; mime: string; ext: string; photoKind: string; caption: string | null; at: string };

const KEY = 'offline-queue:v1';
let flushing = false;

export const useOfflineQueue = create<{ ops: QueuedOp[]; lastError: string | null }>(() => ({ ops: [], lastError: null }));

async function save(ops: QueuedOp[]) {
  useOfflineQueue.setState({ ops });
  try { await AsyncStorage.setItem(KEY, JSON.stringify(ops)); } catch { /* storage full: keeps working in memory */ }
}

async function perform(op: QueuedOp) {
  switch (op.kind) {
    case 'checklist': {
      const { error } = await supabase.from('job_checklist_items')
        .update({ done: op.done, done_by: op.done ? op.userId : null, done_at: op.done ? op.at : null }).eq('id', op.itemId);
      if (error) throw error;
      return;
    }
    case 'clock_in': {
      // Close any clock left running (at the moment this one started), then start this one.
      await supabase.from('time_entries').update({ ended_at: op.at }).eq('org_id', op.orgId).eq('user_id', op.userId).is('ended_at', null).lt('started_at', op.at);
      const { error } = await supabase.from('time_entries').insert({ id: op.entryId, org_id: op.orgId, user_id: op.userId, job_id: op.jobId, started_at: op.at });
      if (error && !/duplicate key/i.test(error.message)) throw error;
      return;
    }
    case 'clock_out': {
      let q = supabase.from('time_entries').update({ ended_at: op.at }).eq('org_id', op.orgId).eq('user_id', op.userId).is('ended_at', null);
      if (op.entryId) q = q.eq('id', op.entryId);
      const { error } = await q;
      if (error) throw error;
      return;
    }
    case 'photo': {
      const file = new File(op.path);
      if (!file.exists) return; // removed from the phone: nothing to send
      const body = await file.arrayBuffer();
      const storagePath = `${op.orgId}/jobs/${op.jobId}/${op.id}.${op.ext}`;
      const up = await supabase.storage.from('org-files').upload(storagePath, body, { contentType: op.mime, upsert: true });
      if (up.error) throw new Error(up.error.message);
      const { error } = await supabase.from('job_photos').insert({
        org_id: op.orgId, job_id: op.jobId, kind: op.photoKind, storage_path: storagePath, caption: op.caption, taken_by: op.userId,
      });
      if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
      try { file.delete(); } catch { /* already gone */ }
      return;
    }
  }
}

/** Sends everything waiting, oldest first. Stops at the first "still offline" failure. */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let ops = [...useOfflineQueue.getState().ops];
    while (ops.length) {
      const op = ops[0];
      try {
        await perform(op);
      } catch (e) {
        if (isOfflineError(e)) break;
        reportClientError(e, `offline-queue:${op.kind}`);
        useOfflineQueue.setState({ lastError: `A saved ${op.kind === 'photo' ? 'photo' : op.kind === 'checklist' ? 'checklist step' : 'time clock'} update couldn’t be sent: ${(e as Error).message}` });
      }
      ops = ops.slice(1);
      await save(ops);
    }
  } finally {
    flushing = false;
  }
}

async function enqueue(op: QueuedOp) {
  await save([...useOfflineQueue.getState().ops, op]);
}

/** Tries now; with no connection, saves it for later. Returns true when it was saved for later. */
async function runOrQueue(op: QueuedOp): Promise<boolean> {
  // Keep order: if older updates are waiting, this one waits behind them.
  if (useOfflineQueue.getState().ops.length) {
    await enqueue(op);
    void flushQueue();
    return useOfflineQueue.getState().ops.some((o) => o.id === op.id);
  }
  try {
    await perform(op);
    return false;
  } catch (e) {
    if (!isOfflineError(e)) throw e;
    await enqueue(op);
    return true;
  }
}

const now = () => new Date().toISOString();

export const setChecklistStep = (itemId: string, done: boolean, userId: string) =>
  runOrQueue({ kind: 'checklist', id: randomUUID(), itemId, done, userId, at: now() });

export async function clockIn(orgId: string, userId: string, jobId: string | null) {
  const entryId = randomUUID();
  const at = now();
  const queued = await runOrQueue({ kind: 'clock_in', id: randomUUID(), entryId, orgId, userId, jobId, at });
  return { queued, entryId, at };
}

export const clockOut = (orgId: string, userId: string, entryId: string | null) =>
  runOrQueue({ kind: 'clock_out', id: randomUUID(), entryId, orgId, userId, at: now() });

/** Job photo: uploaded now, or (on iPhone/Android) kept on the phone and uploaded when the signal is back. */
export async function addJobPhotoOrQueue(args: {
  orgId: string; jobId: string; userId: string; uri: string; mime: string; ext: string; kind: string; caption: string | null;
  uploadNow: () => Promise<void>;
}): Promise<boolean> {
  try {
    if (useOfflineQueue.getState().ops.length === 0) {
      await args.uploadNow();
      return false;
    }
  } catch (e) {
    if (!isOfflineError(e) || Platform.OS === 'web') throw e;
  }
  if (Platform.OS === 'web') { await args.uploadNow(); return false; }
  const dir = new Directory(Paths.document, 'offline-photos');
  if (!dir.exists) dir.create();
  const id = randomUUID();
  const dest = new File(dir, `${id}.${args.ext}`);
  new File(args.uri).copy(dest);
  await enqueue({ kind: 'photo', id, orgId: args.orgId, jobId: args.jobId, userId: args.userId, path: dest.uri, mime: args.mime, ext: args.ext, photoKind: args.kind, caption: args.caption, at: now() });
  return true;
}

let started = false;
/** Loads what was waiting from last time and keeps trying: on launch, when the app comes back, and every 30 seconds. */
export async function startOfflineQueue() {
  if (started) return;
  started = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) useOfflineQueue.setState({ ops: JSON.parse(raw) as QueuedOp[] });
  } catch { /* nothing saved */ }
  void flushQueue();
  AppState.addEventListener('change', (s) => { if (s === 'active') void flushQueue(); });
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('online', () => void flushQueue());
  setInterval(() => { if (useOfflineQueue.getState().ops.length) void flushQueue(); }, 30_000);
}
