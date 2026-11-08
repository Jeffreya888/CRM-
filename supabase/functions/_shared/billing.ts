// Web subscriptions (Stripe Billing on the PLATFORM account): price catalog
// shared by billing-checkout and stripe-webhook. Prices are created in the
// Stripe Dashboard and configured through env vars (see .env.example).

export type PlanId = "solo" | "team" | "fleet";
export type Period = "monthly" | "annual";
export type PackKind = "ai_pack" | "text_pack";

export const PLAN_IDS: PlanId[] = ["solo", "team", "fleet"];
export const PERIODS: Period[] = ["monthly", "annual"];

/** Env var holding the recurring price id for a plan + period, e.g. STRIPE_PRICE_TEAM_ANNUAL. */
export const planPriceEnv = (plan: PlanId, period: Period) => `STRIPE_PRICE_${plan.toUpperCase()}_${period.toUpperCase()}`;

export function planPriceId(plan: PlanId, period: Period): string | null {
  return Deno.env.get(planPriceEnv(plan, period))?.trim() || null;
}

export interface PackDef {
  id: string; // what the app sends as `pack`
  kind: PackKind;
  quantity: number;
  env: string;
}

/** One-time packs. A pack is offered only when its env var is set. */
export const PACKS: PackDef[] = [
  { id: "ai_50", kind: "ai_pack", quantity: 50, env: "STRIPE_PRICE_AI_50" },
  { id: "ai_200", kind: "ai_pack", quantity: 200, env: "STRIPE_PRICE_AI_200" },
  { id: "texts_500", kind: "text_pack", quantity: 500, env: "STRIPE_PRICE_TEXTS_500" },
  { id: "texts_2000", kind: "text_pack", quantity: 2000, env: "STRIPE_PRICE_TEXTS_2000" },
];

export function packPriceId(p: PackDef): string | null {
  return Deno.env.get(p.env)?.trim() || null;
}

/** Plan + period for a Stripe price id configured in env (null when unknown). */
export function planForPriceId(priceId: string | null | undefined): { plan: PlanId; period: Period } | null {
  if (!priceId) return null;
  for (const plan of PLAN_IDS) {
    for (const period of PERIODS) {
      if (planPriceId(plan, period) === priceId) return { plan, period };
    }
  }
  return null;
}

/** Grace added to the paid-through date so a slightly late renewal webhook never locks a company out. */
export const GRACE_MS = 3 * 24 * 3600 * 1000;

/** True when a plan row is a paid plan that has not run out yet. */
export function paidPlanActive(org: { plan: string | null; plan_expires_at: string | null }, now = Date.now()): boolean {
  if (!org.plan || !PLAN_IDS.includes(org.plan as PlanId)) return false;
  return !org.plan_expires_at || new Date(org.plan_expires_at).getTime() > now;
}

// ---------------------------------------------------------------------------
// Extra locations (Fleet beyond 5): graduated per-location price, created in
// Stripe on first use and found again by lookup key. No env vars needed.
//   locations 6-20 (first 15 extras): $39/mo · location 21 and up: $29/mo · yearly = 10 months
// ---------------------------------------------------------------------------
export const EXTRA_LOCATION_TIER = 15;
export const EXTRA_LOCATION_CENTS = { monthly: [3900, 2900], annual: [39000, 29000] } as const;
export const extraLocationLookupKey = (period: Period) => `tarmo_extra_location_${period}`;

/** Price in cents for n extra locations per billing period. */
export function extraLocationsCents(n: number, period: Period): number {
  const [first, rest] = EXTRA_LOCATION_CENTS[period];
  const k = Math.max(0, Math.floor(n));
  return Math.min(k, EXTRA_LOCATION_TIER) * first + Math.max(0, k - EXTRA_LOCATION_TIER) * rest;
}

/** True for a subscription item that bills extra locations. */
export function isExtraLocationItem(item: { price?: { lookup_key?: string | null; metadata?: Record<string, string> | null } | null }): boolean {
  const p = item.price;
  return !!p && ((p.lookup_key ?? "").startsWith("tarmo_extra_location_") || p.metadata?.kind === "extra_location");
}
