// Step-by-step service guides: platform defaults (org_id null) plus company copies.
// A company sees, for each guide key, its own copy first, else the platform default
// unless it hid that default (public.hidden_guides). Mirrors public.guide_for().
import { supabase } from './supabase';
import type { AssetType, GuideStep, RecurUnit, ServiceGuide } from './types';

export const GUIDE_DISCLAIMER = "Always follow the aircraft manufacturer's maintenance manual and OEM-approved products.";

export interface ResolvedGuide {
  guide: ServiceGuide;
  /** True when this is the company's own copy (or its own guide). */
  isCopy: boolean;
  /** The platform default with the same key, if any. */
  platform: ServiceGuide | null;
}

export interface GuideLibraryData {
  /** One guide per key, as the company sees it. */
  guides: ResolvedGuide[];
  /** Platform defaults the company hid (and has no copy of). */
  hiddenDefaults: ServiceGuide[];
  hiddenIds: Set<string>;
  all: ServiceGuide[];
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function normalizeSteps(steps: unknown): GuideStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((s: any) => (typeof s === 'string'
    ? { title: s, detail: '', caution: null }
    : { title: String(s?.title ?? ''), detail: String(s?.detail ?? ''), caution: s?.caution ? String(s.caution) : null }));
}

function clean(g: ServiceGuide): ServiceGuide {
  return {
    ...g,
    products: g.products ?? [], tools: g.tools ?? [], prep: g.prep ?? [], donts: g.donts ?? [],
    quality_checks: g.quality_checks ?? [], photos: g.photos ?? [], steps: normalizeSteps(g.steps),
  };
}

export function resolveGuides(all: ServiceGuide[], hiddenIds: Set<string>, orgId: string): GuideLibraryData {
  const byKey = new Map<string, { platform: ServiceGuide | null; copy: ServiceGuide | null }>();
  for (const g of all) {
    const e = byKey.get(g.key) ?? { platform: null, copy: null };
    if (g.org_id == null) e.platform = g;
    else if (g.org_id === orgId && !g.hidden) e.copy = g;
    byKey.set(g.key, e);
  }
  const guides: ResolvedGuide[] = [];
  const hiddenDefaults: ServiceGuide[] = [];
  for (const { platform, copy } of byKey.values()) {
    if (copy) guides.push({ guide: copy, isCopy: true, platform });
    else if (platform && !hiddenIds.has(platform.id)) guides.push({ guide: platform, isCopy: false, platform });
    else if (platform) hiddenDefaults.push(platform);
  }
  guides.sort((a, b) => a.guide.title.localeCompare(b.guide.title));
  hiddenDefaults.sort((a, b) => a.title.localeCompare(b.title));
  return { guides, hiddenDefaults, hiddenIds, all };
}

/** Loads every guide the company can see (defaults + its copies) and its hidden list. */
export async function loadGuideLibrary(orgId: string): Promise<GuideLibraryData> {
  const [g, h] = await Promise.all([
    supabase.from('service_guides').select('*').or(`org_id.is.null,org_id.eq.${orgId}`).order('title'),
    supabase.from('hidden_guides').select('guide_id').eq('org_id', orgId),
  ]);
  if (g.error) throw g.error;
  const all = ((g.data ?? []) as ServiceGuide[]).map(clean);
  return resolveGuides(all, new Set((h.data ?? []).map((x: { guide_id: string }) => x.guide_id)), orgId);
}

/** Finds the guide for a route param: a guide id or a guide key. */
export function findGuide(lib: GuideLibraryData, idOrKey: string): (ResolvedGuide & { hiddenDefault: boolean }) | null {
  if (isUuid(idOrKey)) {
    const g = lib.all.find((x) => x.id === idOrKey);
    if (!g) return null;
    const resolved = lib.guides.find((r) => r.guide.id === g.id);
    if (resolved) return { ...resolved, hiddenDefault: false };
    // A default that is overridden by a copy, or hidden: still viewable.
    return { guide: g, isCopy: g.org_id != null, platform: g.org_id == null ? g : lib.all.find((x) => x.key === g.key && x.org_id == null) ?? null, hiddenDefault: lib.hiddenIds.has(g.id) };
  }
  const r = lib.guides.find((x) => x.guide.key === idOrKey);
  if (r) return { ...r, hiddenDefault: false };
  const h = lib.hiddenDefaults.find((x) => x.key === idOrKey);
  return h ? { guide: h, isCopy: false, platform: h, hiddenDefault: true } : null;
}

/** Guide for a service: by guide_key, else by matching title (techs' price-free menu has no guide_key). */
export function guideForService(lib: GuideLibraryData | undefined, s: { guide_key?: string | null; name: string }): ResolvedGuide | null {
  if (!lib) return null;
  if (s.guide_key) return lib.guides.find((r) => r.guide.key === s.guide_key) ?? null;
  const n = s.name.trim().toLowerCase();
  return lib.guides.find((r) => r.guide.title.trim().toLowerCase() === n) ?? null;
}

export const stepTitles = (g: Pick<ServiceGuide, 'steps'>) => normalizeSteps(g.steps).map((s) => s.title.trim()).filter(Boolean);

export function recurLabel(every: number | null | undefined, unit: RecurUnit | null | undefined): string | null {
  const n = Number(every) || 0;
  if (!n || !unit) return null;
  if (unit === 'month' && n % 12 === 0) return n === 12 ? 'Every year' : `Every ${n / 12} years`;
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
}

/** "30-45 min", "4-6 hours", "2 hours" or null. Hours are stored as decimals. */
export function durationLabel(min: number | null | undefined, max: number | null | undefined): string | null {
  const a = Number(min) || 0;
  const b = Number(max) || 0;
  if (!a && !b) return null;
  const top = Math.max(a, b);
  if (top < 1) {
    const m = (h: number) => Math.round(h * 60);
    return a && b && b > a ? `${m(a)}-${m(b)} min` : `${m(a || b)} min`;
  }
  const fmt = (n: number) => String(+n.toFixed(1));
  if (a && b && b > a) return `${fmt(a)}-${fmt(b)} hours`;
  const one = a || b;
  return `${fmt(one)} hour${one === 1 ? '' : 's'}`;
}

export const assetTypeLabel = (t: AssetType) => (t === 'vehicle' ? 'Automotive' : t === 'watercraft' ? 'Watercraft' : 'Aircraft');

export const newGuideKey = () => `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
