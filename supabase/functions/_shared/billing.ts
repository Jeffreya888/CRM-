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
