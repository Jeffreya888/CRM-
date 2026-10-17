// Jobs area helpers: photo validation/upload, guide lookup, crew suggestions,
// facility directions, price-guide pricing and the no-price service report.
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { jobReportHtml } from './documents';
import { dateTime } from './format';
import { adjustPrice } from './pricing';
import { supabase } from './supabase';
import type { JobStatus, Organization, ServiceGuide } from './types';

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  tentative: 'Tentative', scheduled: 'Scheduled', in_progress: 'In progress', on_hold: 'On hold',
  completed: 'Completed', invoiced: 'Invoiced', cancelled: 'Cancelled',
};
export const OPEN_STATUSES: JobStatus[] = ['tentative', 'scheduled', 'in_progress', 'on_hold'];

/** Raw error message → server code (BEFORE_PHOTOS_REQUIRED, ...), if any. */
export function errorCode(message: string | null | undefined): string | null {
  return /\b([A-Z][A-Z_]{3,}):/.exec(message ?? '')?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Photos: JPG/PNG/WebP, at most 10 MB each, at most 30 per job.
// ---------------------------------------------------------------------------
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_JOB_PHOTOS = 30;
const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface PickedPhoto { uri: string; mime: string; ext: string; size: number | null }

function mimeFrom(asset: ImagePicker.ImagePickerAsset): string | null {
  const m = asset.mimeType?.toLowerCase();
  if (m) return m === 'image/jpg' ? 'image/jpeg' : m;
  const ext = (asset.fileName ?? asset.uri).split('?')[0]!.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (asset.uri.startsWith('data:')) return asset.uri.slice(5, asset.uri.indexOf(';')) || null;
  return null;
}

/** Throws a friendly message when the file type or size is not allowed. */
export function validatePhoto(p: { mime: string | null; size: number | null }) {
  if (!p.mime || !MIME_EXT[p.mime]) throw new Error('Photos must be JPG, PNG or WebP. HEIC and other formats are not supported — change your camera to "Most Compatible" or pick another photo.');
  if (p.size != null && p.size > MAX_PHOTO_BYTES) throw new Error(`That photo is ${(p.size / 1048576).toFixed(1)} MB. Photos can be at most 10 MB.`);
}

/** Opens the camera or library and returns a validated photo, or null if cancelled. */
export async function pickJobPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is needed to take job photos. Enable it in Settings.');
  }
  // quality < 1 re-encodes camera shots as JPEG on device, which also keeps them small.
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, exif: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  let mime = mimeFrom(a);
  // iOS converts library picks to JPEG when re-encoding; trust the result extension.
  if (Platform.OS === 'ios' && mime === 'image/heic') mime = null;
  let size = a.fileSize ?? null;
  if (size == null && Platform.OS === 'web' && (a as any).file?.size) size = (a as any).file.size;
  validatePhoto({ mime, size });
  return { uri: a.uri, mime: mime!, ext: MIME_EXT[mime!]!, size };
}

/** Uploads a validated photo and inserts the job_photos row. */
export async function uploadJobPhoto(args: {
  orgId: string; jobId: string; userId: string; photo: PickedPhoto; kind: 'before' | 'after' | 'damage' | 'other'; caption?: string | null; currentCount: number;
}) {
  if (args.currentCount >= MAX_JOB_PHOTOS) throw new Error('A job can have at most 30 photos. Remove one before adding another.');
  const body = await (await fetch(args.photo.uri)).arrayBuffer();
  if (body.byteLength > MAX_PHOTO_BYTES) throw new Error(`That photo is ${(body.byteLength / 1048576).toFixed(1)} MB. Photos can be at most 10 MB.`);
  const path = `${args.orgId}/jobs/${args.jobId}/${randomUUID()}.${args.photo.ext}`;
  const up = await supabase.storage.from('org-files').upload(path, body, { contentType: args.photo.mime });
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase.from('job_photos').insert({
    org_id: args.orgId, job_id: args.jobId, kind: args.kind, storage_path: path, caption: args.caption?.trim() || null, taken_by: args.userId,
  });
  if (error) {
    await supabase.storage.from('org-files').remove([path]);
    throw new Error(error.message);
  }
}

// ---------------------------------------------------------------------------
// Service guides (company copy first, else the platform default).
// ---------------------------------------------------------------------------
export async function fetchGuide(orgId: string, key: string): Promise<ServiceGuide | null> {
  const { data, error } = await supabase.rpc('guide_for', { p_org: orgId, p_key: key });
  if (!error) {
    const g = (Array.isArray(data) ? data[0] : data) as ServiceGuide | null;
    if (g && g.id) return g;
  }
  // Fallback: read the table directly.
  const { data: rows } = await supabase.from('service_guides').select('*').eq('key', key).eq('hidden', false)
    .or(`org_id.eq.${orgId},org_id.is.null`);
  const list = (rows ?? []) as ServiceGuide[];
  return list.find((g) => g.org_id === orgId) ?? list.find((g) => g.org_id == null) ?? null;
}

// ---------------------------------------------------------------------------
// Crew suggestions: skill tags that match the job's service categories first.
// ---------------------------------------------------------------------------
const norm = (s: string) => s.toLowerCase().replace(/[_-]+/g, ' ').trim();
const SKILL_ALIASES: Record<string, string[]> = {
  coating: ['ceramic', 'coating', 'ceramic coating', 'sealant', 'wax'],
  paint_correction: ['paint correction', 'polish', 'polishing', 'compound'],
  brightwork: ['brightwork', 'metal polish', 'polish'],
  interior: ['interior', 'leather', 'carpet', 'upholstery'],
  exterior: ['exterior', 'wash', 'wet wash', 'dry wash'],
  specialty: ['specialty', 'de ice', 'windshield'],
  engine: ['engine', 'engine bay'],
};

/** Number of the member's skills that match the categories. */
export function skillScore(skills: string[] | null | undefined, categories: string[]): number {
  if (!skills?.length || !categories.length) return 0;
  const mine = skills.map(norm);
  let n = 0;
  for (const c of new Set(categories)) {
    const want = [norm(c), ...(SKILL_ALIASES[c] ?? [])].map(norm);
    if (mine.some((s) => want.some((w) => s === w || s.includes(w) || w.includes(s)))) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Facility directions
// ---------------------------------------------------------------------------
export function directionsUrl(l: { latitude?: number | null; longitude?: number | null; name?: string | null; fbo_name?: string | null; airport_code?: string | null; address?: string | null }): string | null {
  const q = l.latitude != null && l.longitude != null
    ? `${l.latitude},${l.longitude}`
    : [l.fbo_name, l.name, l.airport_code, l.address].filter(Boolean).join(' ');
  if (!q) return null;
  const enc = encodeURIComponent(q);
  return Platform.OS === 'ios' ? `http://maps.apple.com/?q=${enc}` : `https://www.google.com/maps/search/?api=1&query=${enc}`;
}

// ---------------------------------------------------------------------------
// Flight Ready price guide
// ---------------------------------------------------------------------------
/** Suggested prices by guide_key for an asset model, with the company's regional adjustment. */
export async function guidePrices(modelId: string | null | undefined, keys: string[], adjustPct: number | null | undefined): Promise<Record<string, number>> {
  const ks = [...new Set(keys.filter(Boolean))];
  if (!modelId || !ks.length) return {};
  const { data } = await supabase.from('price_guide').select('guide_key, price').eq('model_id', modelId).in('guide_key', ks);
  return Object.fromEntries(((data ?? []) as { guide_key: string; price: number }[]).map((r) => [r.guide_key, adjustPrice(Number(r.price), adjustPct)]));
}

// ---------------------------------------------------------------------------
// Service report (never includes prices)
// ---------------------------------------------------------------------------
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function serviceReportHtml(r: {
  org: Organization;
  job: Parameters<typeof jobReportHtml>[0]['job'] & {
    condition_report?: string | null; condition_signature_svg?: string | null; condition_signed_by?: string | null; condition_signed_at?: string | null; condition_version?: number;
  };
  customer: { name: string };
  aircraft?: { tail_number: string; manufacturer?: string | null; model?: string | null } | null;
  location?: { name: string; airport_code: string | null } | null;
  checklist: { label: string; done: boolean }[];
  photos: { url: string; kind: string; caption: string | null }[];
}): string {
  const base = jobReportHtml(r as any);
  const j = r.job;
  if (!j.condition_report) return base;
  const block = `<div class="box"><b>Condition &amp; service acceptance</b> <span class="muted">(version ${esc(j.condition_version ?? 1)})</span>
    <div style="white-space:pre-wrap;margin-top:6px">${esc(j.condition_report)}</div>
    ${j.condition_signature_svg ? `<div>${j.condition_signature_svg}</div><div>${esc(j.condition_signed_by)} · ${esc(dateTime(j.condition_signed_at))}</div>` : '<div class="muted">Not signed</div>'}
  </div>`;
  return base.replace('</body>', `${block}</body>`);
}

/** Badge tones per status (adds Tentative to the shared map). */
export const statusTone: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple'> = {
  tentative: 'neutral', scheduled: 'info', in_progress: 'warning', on_hold: 'neutral', completed: 'success', invoiced: 'purple', cancelled: 'danger',
};
