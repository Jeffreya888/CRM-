/**
 * AI photo condition report (docs/competitive-edge.md §2): upload photos,
 * run the `assess-photos` edge function, save the result to the asset and
 * turn it into a draft quote. Also the customer-portal side
 * (`portal` actions `upload_urls` and `photo_quote`).
 */
import { addDays, format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage } from './files';
import { PortalSessionExpired } from './portal';
import { conditionPct, priceService, withCondition, type PriceableAircraft } from './pricing';
import { callFunction, friendlyError, supabase } from './supabase';
import type { ConditionAssessment, ConditionLevel, Organization, Service } from './types';

export const MAX_ASSESS_PHOTOS = 6;

export interface PickedPhoto { uri: string; mime: string | null }

const HEIC = /hei[cf]/i;

/** Takes a photo, or picks up to `limit` photos from the library. Returns [] when cancelled. */
export async function pickAssessPhotos(source: 'camera' | 'library', limit: number): Promise<PickedPhoto[]> {
  if (limit <= 0) return [];
  // quality < 1 re-encodes to JPEG on iOS/Android, which keeps photos small (the AI reads up to 5 MB per photo).
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
  let res: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is needed to take photos. Enable it in Settings.');
    res = await ImagePicker.launchCameraAsync(opts);
  } else {
    res = await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: limit > 1, selectionLimit: limit, orderedSelection: true });
  }
  if (res.canceled || !res.assets?.length) return [];
  const picked = res.assets.slice(0, limit).map((a) => ({ uri: a.uri, mime: a.mimeType ?? null }));
  if (picked.some((p) => p.mime && HEIC.test(p.mime))) throw new Error('That photo format (HEIC) is not supported here. Please choose JPG or PNG photos.');
  return picked;
}

/** Uploads staff photos to "<orgId>/assessments/…" and returns the storage paths. */
export async function uploadAssessmentPhotos(orgId: string, uris: string[], onProgress?: (done: number) => void): Promise<string[]> {
  const paths: string[] = [];
  for (const uri of uris.slice(0, MAX_ASSESS_PHOTOS)) {
    paths.push(await uploadImage(orgId, 'assessments', uri));
    onProgress?.(paths.length);
  }
  return paths;
}

/** Runs the AI check on uploaded photos and returns the saved assessment (status 'done' or 'failed'). */
export function runAssessment(input: {
  orgId: string; paths: string[]; aircraftId?: string | null; customerId?: string | null; jobId?: string | null; quoteId?: string | null;
}): Promise<ConditionAssessment> {
  return callFunction<ConditionAssessment>('assess-photos', {
    org_id: input.orgId, paths: input.paths, aircraft_id: input.aircraftId ?? null, customer_id: input.customerId ?? null,
    job_id: input.jobId ?? null, quote_id: input.quoteId ?? null,
  });
}

/** Saves the assessed condition to the asset (managers). */
export async function applyAssessment(id: string): Promise<void> {
  const { error } = await supabase.rpc('apply_assessment', { p_assessment: id });
  if (error) throw new Error(friendlyError(error.message));
}

function defaultDeadline() {
  const d = addDays(new Date(), 30);
  d.setHours(17, 0, 0, 0);
  return d;
}

/**
 * Creates a draft quote for the customer (and asset) with the assessed
 * condition, one line per suggested service that still exists, priced with
 * priceService() and then the condition adjustment. Returns the quote id.
 * Numbering mirrors QuoteEditor (rpc next_number).
 */
export async function quoteFromAssessment({ org, assessment, customerId, aircraft, services, branchId }: {
  org: Pick<Organization, 'id' | 'tax_rate' | 'default_quote_terms' | 'condition_multipliers'>;
  assessment: Pick<ConditionAssessment, 'overall' | 'suggestions'> | null;
  customerId: string;
  aircraft: (PriceableAircraft & { id: string }) | null;
  services: Service[];
  branchId?: string | null;
}): Promise<string> {
  const { data: auth } = await supabase.auth.getSession();
  const level: ConditionLevel | null = assessment?.overall ?? null;
  const pct = conditionPct(level, org.condition_multipliers);
  const deadline = defaultDeadline();

  const { data: n, error: nErr } = await supabase.rpc('next_number', { p_org: org.id, p_kind: 'quote' });
  if (nErr) throw new Error(friendlyError(nErr.message));
  const { data: q, error: qErr } = await supabase.from('quotes').insert({
    org_id: org.id, number: n, status: 'draft', created_by: auth.session?.user.id ?? null,
    customer_id: customerId, aircraft_id: aircraft?.id ?? null, branch_id: branchId ?? null,
    issue_date: format(new Date(), 'yyyy-MM-dd'), valid_until_at: deadline.toISOString(), valid_until: format(deadline, 'yyyy-MM-dd'),
    tax_rate: Number(org.tax_rate) || 0, terms: org.default_quote_terms ?? null,
    condition_level: level, condition_pct: pct,
  }).select('id').single();
  if (qErr) throw new Error(friendlyError(qErr.message));
  const quoteId = q.id as string;

  const byId = new Map(services.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const lines = (assessment?.suggestions ?? []).flatMap((sug) => {
    const s = sug.service_id ? byId.get(sug.service_id) : undefined;
    if (!s || !s.active || seen.has(s.id)) return [];
    seen.add(s.id);
    // Same defaults as LineItemsEditor: hourly services use the estimated hours as the quantity.
    const hourly = s.pricing_method === 'hourly';
    const unit = hourly ? Number(s.hourly_rate) || 0 : priceService(s, aircraft);
    return [{ service_id: s.id, description: s.name, quantity: hourly ? Number(s.est_hours) || 1 : 1, unit_price: withCondition(unit, pct), taxable: s.taxable }];
  });
  if (lines.length) {
    const { error: iErr } = await supabase.from('quote_items').insert(lines.map((l, i) => ({ ...l, org_id: org.id, quote_id: quoteId, option_id: null, sort_order: i + 1 })));
    if (iErr) throw new Error(friendlyError(iErr.message));
  }
  return quoteId;
}

// ---------------------------------------------------------------------------
// Customer portal: "Get a quote from photos"
// ---------------------------------------------------------------------------

async function portalCall<T>(body: Record<string, unknown>): Promise<T> {
  try {
    const r = await callFunction<T & { error?: string }>('portal', body);
    if (r && typeof r === 'object' && 'error' in r && r.error) throw new Error(r.error);
    return r;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/session expired|invalid session|revoked|unauthori[sz]ed/i.test(msg)) throw new PortalSessionExpired();
    if (/Failed to send a request|Failed to fetch|network/i.test(msg)) throw new Error('We could not reach the server. Check your connection and try again.');
    throw new Error(msg);
  }
}

const extOf = (p: PickedPhoto) => {
  const m = (p.mime ?? '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return 'jpg';
};

/** Uploads the photos through signed upload URLs and sends the photo quote request. */
export async function sendPhotoQuote(token: string, input: { photos: PickedPhoto[]; aircraftId?: string | null; notes?: string | null }, onProgress?: (done: number) => void) {
  const groups = new Map<string, PickedPhoto[]>();
  for (const p of input.photos.slice(0, MAX_ASSESS_PHOTOS)) groups.set(extOf(p), [...(groups.get(extOf(p)) ?? []), p]);
  const paths: string[] = [];
  for (const [ext, photos] of groups) {
    const { uploads } = await portalCall<{ uploads: { path: string; url: string; token: string }[] }>({ action: 'upload_urls', token, count: photos.length, ext });
    for (let i = 0; i < photos.length; i++) {
      const u = uploads[i];
      if (!u) throw new Error('Could not upload the photos. Please try again.');
      const body = await (await fetch(photos[i]!.uri)).arrayBuffer();
      const { error } = await supabase.storage.from('org-files').uploadToSignedUrl(u.path, u.token, body, { contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` });
      if (error) throw new Error('A photo did not upload. Please try again.');
      paths.push(u.path);
      onProgress?.(paths.length);
    }
  }
  return portalCall<{ ok: boolean; request_id: string }>({ action: 'photo_quote', token, paths, aircraft_id: input.aircraftId ?? null, notes: input.notes ?? null });
}
