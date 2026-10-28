/**
 * "Ask" AI assistant (contract: scratchpad assistant-contract.md, migration
 * 20261028000200_assistant.sql). Questions go to the `assistant` edge
 * function; threads and messages are read straight from the database (RLS:
 * your own threads, or every thread in the company for managers+).
 * Also the per-aircraft documents the assistant cites.
 */
import * as DocumentPicker from 'expo-document-picker';
import { format } from 'date-fns';
import type { PickedPhoto } from './assess';
import { APP_NAME } from './config';
import { removeFile, uploadFile } from './files';
import { openStorageFile } from './inventory';
import { friendlyError, must, supabase } from './supabase';
import type { AircraftDocument, AircraftDocumentKind, AssistantMessage, AssistantSource, AssistantThread } from './types';

export const MAX_ASSISTANT_PHOTOS = 3;
export const MAX_AIRCRAFT_DOCS = 10;
export const MAX_AIRCRAFT_DOC_BYTES = 20 * 1024 * 1024;

export const ASSISTANT_SUGGESTIONS = [
  'How often do I rake the drum pad?',
  'What’s safe on acrylic windows?',
  'What do I do if I find corrosion?',
  'How do I remove bug residue from a leading edge?',
];

export const REVIEW_NOTICE = 'Questions you ask may be reviewed by your managers.';

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

/** Thrown when the company is out of questions (or AI checks, for photo questions). HTTP 402 `code: 'ai_limit'`. */
export class AiLimitError extends Error {
  code = 'ai_limit' as const;
  kind: 'question' | 'check';
  constructor(message: string, kind: 'question' | 'check') {
    super(message);
    this.kind = kind;
  }
}

export interface AskInput {
  orgId: string;
  threadId?: string | null;
  jobId?: string | null;
  aircraftId?: string | null;
  guideKey?: string | null;
  /** 0-based SOP step index. */
  stepIndex?: number | null;
  message: string;
  photoPaths?: string[];
}
export interface AskResult { thread_id: string; user_message: AssistantMessage; assistant_message: AssistantMessage }

/**
 * Asks a question. Like callFunction('assistant'), but keeps the 402 code and
 * kind so the screen can show the right out-of-allowance card.
 */
export async function askAssistant(input: AskInput): Promise<AskResult> {
  const body = {
    org_id: input.orgId,
    thread_id: input.threadId ?? undefined,
    job_id: input.jobId ?? undefined,
    aircraft_id: input.aircraftId ?? undefined,
    guide_key: input.guideKey ?? undefined,
    step_index: input.stepIndex ?? undefined,
    message: input.message,
    photo_paths: input.photoPaths?.length ? input.photoPaths.slice(0, MAX_ASSISTANT_PHOTOS) : undefined,
  };
  const { data, error } = await supabase.functions.invoke('assistant', { body });
  if (error) {
    let msg = error.message;
    let payload: { error?: string; code?: string; kind?: string } | null = null;
    const ctx = (error as any).context;
    try {
      if (ctx?.json) payload = await ctx.json();
    } catch { /* not JSON */ }
    if (payload?.code === 'ai_limit' || ctx?.status === 402 || /AI_LIMIT/.test(payload?.error ?? '')) {
      throw new AiLimitError((payload?.error ?? 'AI_LIMIT').replace(/^AI_LIMIT:\s*/, ''), payload?.kind === 'check' ? 'check' : 'question');
    }
    if (payload?.error) msg = payload.error;
    if (/Edge Function|non-2xx|Failed to send a request|Relay Error/i.test(msg)) msg = 'The assistant is temporarily unavailable. Please try again in a moment.';
    throw new Error(friendlyError(msg));
  }
  const r = data as AskResult & { error?: string };
  if (r?.error) throw new Error(friendlyError(r.error));
  return { ...r, user_message: normalizeMessage(r.user_message), assistant_message: normalizeMessage(r.assistant_message) };
}

export function normalizeMessage(m: AssistantMessage): AssistantMessage {
  return { ...m, photo_paths: m?.photo_paths ?? [], sources: Array.isArray(m?.sources) ? m.sources : [] };
}

/** Uploads picked photos to "<orgId>/assistant/<userId>/<uuid>.<ext>" and returns the storage paths. */
export async function uploadAssistantPhotos(orgId: string, userId: string, photos: PickedPhoto[]): Promise<string[]> {
  const paths: string[] = [];
  for (const p of photos.slice(0, MAX_ASSISTANT_PHOTOS)) {
    const m = (p.mime ?? '').toLowerCase();
    const [mime, ext] = m.includes('png') ? ['image/png', 'png'] : m.includes('webp') ? ['image/webp', 'webp'] : ['image/jpeg', 'jpg'];
    paths.push(await uploadFile(orgId, `assistant/${userId}`, p.uri, mime, ext));
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------
export type ThreadRow = AssistantThread & { askerName: string };

/** Your conversations (`mine`) or every conversation in the company (`team`, managers+), newest first. */
export async function loadThreads(orgId: string, userId: string, scope: 'mine' | 'team'): Promise<ThreadRow[]> {
  let q = supabase.from('assistant_threads').select('*').eq('org_id', orgId).order('updated_at', { ascending: false }).limit(200);
  if (scope === 'mine') q = q.eq('user_id', userId);
  const threads = ((await must(q)) ?? []) as AssistantThread[];
  const names = scope === 'team' ? await memberNames(orgId) : {};
  return threads.map((t) => ({ ...t, askerName: t.user_id === userId ? 'You' : names[t.user_id] ?? 'Team member' }));
}

export async function memberNames(orgId: string): Promise<Record<string, string>> {
  const { data } = await supabase.from('memberships').select('user_id, display_name').eq('org_id', orgId);
  return Object.fromEntries(((data ?? []) as { user_id: string; display_name: string | null }[]).map((m) => [m.user_id, m.display_name || 'Team member']));
}

export interface ThreadDetail {
  thread: AssistantThread;
  messages: AssistantMessage[];
  askerName: string;
  job: { id: string; number: string | null; title: string | null } | null;
}

export async function loadThread(orgId: string, id: string): Promise<ThreadDetail | null> {
  const t = await must(supabase.from('assistant_threads').select('*').eq('id', id).maybeSingle());
  if (!t) return null;
  const thread = t as AssistantThread;
  const [msgs, names, job] = await Promise.all([
    must(supabase.from('assistant_messages').select('*').eq('thread_id', id).order('created_at')),
    memberNames(orgId),
    thread.job_id ? supabase.from('jobs').select('id, number, title').eq('id', thread.job_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    thread,
    messages: ((msgs ?? []) as AssistantMessage[]).map(normalizeMessage),
    askerName: names[thread.user_id] ?? 'Team member',
    job: (job.data as ThreadDetail['job']) ?? null,
  };
}

export async function deleteThread(id: string) {
  await must(supabase.from('assistant_threads').delete().eq('id', id));
}

/** Small context for a new question (job number, SOP title) shown above the chat. */
export async function loadNewThreadContext(jobId?: string | null, aircraftId?: string | null) {
  const [job, aircraft] = await Promise.all([
    jobId ? supabase.from('jobs').select('id, number, title, aircraft_id').eq('id', jobId).maybeSingle() : Promise.resolve({ data: null }),
    aircraftId ? supabase.from('aircraft').select('id, tail_number').eq('id', aircraftId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    job: job.data as { id: string; number: string | null; title: string | null; aircraft_id: string | null } | null,
    aircraft: aircraft.data as { id: string; tail_number: string } | null,
  };
}

// ---------------------------------------------------------------------------
// Answer text helpers
// ---------------------------------------------------------------------------

/** Plain text of an answer (markdown markers removed), trimmed to `max` characters. */
export function plainSummary(content: string, max = 600): string {
  const text = content
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Appends an answer summary to the job's staff (internal) notes. */
export async function appendToJobNotes(jobId: string, question: string | null, answer: string) {
  const job = await must(supabase.from('jobs').select('internal_notes').eq('id', jobId).single());
  const existing = ((job as { internal_notes: string | null }).internal_notes ?? '').trim();
  const entry = [
    `[${format(new Date(), 'MMM d, h:mm a')}] Ask ${APP_NAME}${question ? ` — ${question.trim().slice(0, 160)}` : ''}`,
    plainSummary(answer, 800),
  ].join('\n');
  await must(supabase.from('jobs').update({ internal_notes: existing ? `${existing}\n\n${entry}` : entry }).eq('id', jobId));
}

export function sourceLabel(s: AssistantSource): string {
  if (s.type === 'sop') return s.step ? `${s.title} · step ${s.step}` : s.title;
  return s.title || (s.type === 'general' ? 'General knowledge' : s.type === 'job' ? 'This job' : 'Document');
}

export async function openAircraftDocument(documentId: string) {
  const d = await must(supabase.from('aircraft_documents').select('storage_path').eq('id', documentId).maybeSingle());
  if (!d) throw new Error('This document was removed.');
  await openStorageFile((d as { storage_path: string }).storage_path);
}

// ---------------------------------------------------------------------------
// Aircraft documents
// ---------------------------------------------------------------------------
export const DOC_KINDS: { value: AircraftDocumentKind; label: string }[] = [
  { value: 'manual', label: 'Manual chapter' },
  { value: 'approved_products', label: 'Approved products' },
  { value: 'instructions', label: 'Customer instructions' },
  { value: 'other', label: 'Other' },
];
export const docKindLabel = (k: AircraftDocumentKind) => DOC_KINDS.find((d) => d.value === k)?.label ?? 'Other';

export function fileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function loadAircraftDocs(aircraftId: string): Promise<AircraftDocument[]> {
  return ((await must(supabase.from('aircraft_documents').select('*').eq('aircraft_id', aircraftId).order('created_at', { ascending: false }))) ?? []) as AircraftDocument[];
}

export interface PickedDoc { uri: string; name: string; mime: AircraftDocument['mime_type']; ext: string; size: number | null }

const DOC_MIME: Record<string, AircraftDocument['mime_type']> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

/** Picks a PDF or image (≤ 20 MB). Returns null when cancelled; throws a friendly error for other files. */
export async function pickAircraftDoc(): Promise<PickedDoc | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const ext = (a.name.includes('.') ? a.name.split('.').pop()! : '').toLowerCase();
  const fromMime = Object.values(DOC_MIME).includes(a.mimeType as any) ? (a.mimeType as AircraftDocument['mime_type']) : null;
  const mime = fromMime ?? DOC_MIME[ext];
  if (!mime) throw new Error('Choose a PDF or a JPG, PNG or WebP image.');
  const size = a.size ?? (a.file as { size?: number } | undefined)?.size ?? null;
  if (size && size > MAX_AIRCRAFT_DOC_BYTES) throw new Error('That file is larger than 20 MB. Split the manual into chapters or choose a smaller file.');
  const cleanExt = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return { uri: a.uri, name: a.name, mime, ext: cleanExt, size };
}

/** Uploads to "<org>/aircraft/<aircraft>/docs/<uuid>.<ext>" and saves the row (removes the file again if the row is refused). */
export async function addAircraftDoc(input: { orgId: string; aircraftId: string; title: string; kind: AircraftDocumentKind; notes?: string | null; file: PickedDoc; userId: string }) {
  const path = await uploadFile(input.orgId, `aircraft/${input.aircraftId}/docs`, input.file.uri, input.file.mime, input.file.ext);
  const { error } = await supabase.from('aircraft_documents').insert({
    org_id: input.orgId, aircraft_id: input.aircraftId, title: input.title.trim().slice(0, 200), kind: input.kind,
    storage_path: path, mime_type: input.file.mime, size_bytes: input.file.size || null, notes: input.notes?.trim() || null, created_by: input.userId,
  });
  if (error) {
    removeFile(path).catch(() => {});
    throw new Error(/up to 10 documents/i.test(error.message)
      ? `An asset can have up to ${MAX_AIRCRAFT_DOCS} documents. Remove one to add another.`
      : /size_bytes/.test(error.message) ? 'That file is larger than 20 MB.' : friendlyError(error.message));
  }
}

export async function deleteAircraftDoc(d: AircraftDocument) {
  await must(supabase.from('aircraft_documents').delete().eq('id', d.id));
  await removeFile(d.storage_path).catch(() => {});
}
