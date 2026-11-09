// Franchise network billing (Stripe, platform account). Keep the numbers in sync with
// FRANCHISE_PRICING in src/lib/plans.ts.
//   all_in: $149 per franchisee location / month, $499 minimum (HQ pays; franchisees covered on Team)
//   split:  $47 per franchisee location / month for Franchise HQ, $499 minimum; franchisees get 15% off their own plan
//   founding network rate (all_in only): 13.42% off for 12 months = $129 per location
import { stripe } from "./clients.ts";
import { type Stripe, type SupabaseClient } from "./deps.ts";

export type BillingMode = "all_in" | "split";
export const FRANCHISE_CENTS = { all_in: 14900, split: 4700, minimum: 49900 } as const;
export const NETWORK_DISCOUNT_COUPON = "tarmo-network-15";
export const FOUNDING_NETWORK_COUPON = "tarmo-founding-network";
const LIVE = ["active", "trialing", "past_due"];

export type NetworkRow = {
  id: string; hq_org_id: string; name: string; billing_mode: BillingMode | null; founding_rate: boolean;
  stripe_subscription_id: string | null; billing_status: string | null; billed_locations: number;
};
export const NETWORK_COLS = "id, hq_org_id, name, billing_mode, founding_rate, stripe_subscription_id, billing_status, billed_locations";

/** Monthly amount in cents for n locations (the minimum applies to small networks). */
export function franchiseCents(mode: BillingMode, n: number): number {
  return Math.max(FRANCHISE_CENTS.minimum, Math.max(1, Math.floor(n)) * FRANCHISE_CENTS[mode]);
}

/** Volume-tier price: the minimum covers the first locations, then every location at the per-location rate. */
export async function franchisePrice(mode: BillingMode): Promise<string> {
  const s = stripe();
  const lookup_key = `tarmo_franchise_${mode}_${FRANCHISE_CENTS[mode]}_monthly`; // a new price if the rate changes
  const found = await s.prices.list({ lookup_keys: [lookup_key], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const per = FRANCHISE_CENTS[mode];
  const floorQty = Math.floor(FRANCHISE_CENTS.minimum / per); // locations the minimum already covers
  const price = await s.prices.create({
    currency: "usd",
    lookup_key,
    transfer_lookup_key: true,
    metadata: { kind: "franchise_hq", mode },
    recurring: { interval: "month" },
    billing_scheme: "tiered",
    tiers_mode: "volume",
    tiers: [{ up_to: floorQty, flat_amount: FRANCHISE_CENTS.minimum, unit_amount: 0 }, { up_to: "inf", unit_amount: per }],
    product_data: { name: mode === "all_in" ? "Franchise network, all locations" : "Franchise HQ", metadata: { kind: "franchise_hq" } },
  });
  return price.id;
}

async function ensureCoupon(id: string, params: Stripe.CouponCreateParams): Promise<string> {
  const s = stripe();
  try {
    const c = await s.coupons.retrieve(id);
    if (c.valid) return c.id;
  } catch { /* not created yet */ }
  try {
    return (await s.coupons.create({ id, ...params })).id;
  } catch {
    return id; // created at the same moment by another request
  }
}
export const networkDiscountCoupon = () =>
  ensureCoupon(NETWORK_DISCOUNT_COUPON, { percent_off: 15, duration: "forever", name: "Franchise network discount (15%)" });
export const foundingNetworkCoupon = () =>
  ensureCoupon(FOUNDING_NETWORK_COUPON, { percent_off: 13.42, duration: "repeating", duration_in_months: 12, name: "Founding network rate ($129 per location, 12 months)" });

export async function locationCount(db: SupabaseClient, networkId: string): Promise<number> {
  const { count } = await db.from("franchise_members").select("org_id", { count: "exact", head: true }).eq("network_id", networkId);
  return count ?? 0;
}

/**
 * Keeps one network's billing right: Stripe quantity = franchisee locations; all-in networks cover their
 * franchisees; split networks give franchisees billed on the web 15% off their own subscription.
 */
export async function syncNetwork(db: SupabaseClient, net: NetworkRow): Promise<{ locations: number; changed: boolean }> {
  const s = stripe();
  const locations = await locationCount(db, net.id);
  let changed = false;
  if (net.stripe_subscription_id && LIVE.includes(net.billing_status ?? "")) {
    const qty = Math.max(1, locations);
    if (qty !== net.billed_locations) {
      const sub = await s.subscriptions.retrieve(net.stripe_subscription_id);
      const item = sub.items.data[0];
      if (item && item.quantity !== qty) {
        await s.subscriptionItems.update(item.id, { quantity: qty, proration_behavior: "create_prorations" });
        changed = true;
      }
      await db.from("franchise_networks").update({ billed_locations: qty }).eq("id", net.id);
    }
    if (net.billing_mode === "all_in") await db.rpc("franchise_apply_coverage", { p_network: net.id });
    if (net.billing_mode === "split") await applyNetworkDiscounts(db, net.id);
  }
  return { locations, changed };
}

/** 15% off for franchisees of a billed split network who pay on the web (a better coupon, e.g. founding, is kept). */
async function applyNetworkDiscounts(db: SupabaseClient, networkId: string) {
  const s = stripe();
  const { data: members } = await db.from("franchise_members").select("org_id").eq("network_id", networkId);
  const ids = (members ?? []).map((m) => m.org_id);
  if (!ids.length) return;
  const { data: orgs } = await db.from("organizations").select("id, stripe_subscription_id")
    .in("id", ids).eq("billing_source", "stripe").eq("franchise_discount_applied", false).not("stripe_subscription_id", "is", null);
  if (!orgs?.length) return;
  const coupon = await networkDiscountCoupon();
  for (const o of orgs) {
    try {
      const sub = await s.subscriptions.retrieve(o.stripe_subscription_id!);
      if (!LIVE.includes(sub.status)) continue;
      if (!sub.discounts?.length) await s.subscriptions.update(sub.id, { discounts: [{ coupon }] });
      await db.from("organizations").update({ franchise_discount_applied: true }).eq("id", o.id);
    } catch (e) {
      console.warn("network discount not applied", o.id, (e as Error).message);
    }
  }
}

/** Removes the 15% network discount from companies that left a split network (or whose network stopped billing). */
export async function removeStaleDiscounts(db: SupabaseClient) {
  const s = stripe();
  const { data: orgs } = await db.from("organizations").select("id, stripe_subscription_id").eq("franchise_discount_applied", true).limit(50);
  for (const o of orgs ?? []) {
    const { data: m } = await db.from("franchise_members").select("network:franchise_networks(billing_mode, billing_status)").eq("org_id", o.id).maybeSingle();
    const net = (m as { network?: { billing_mode: string | null; billing_status: string | null } } | null)?.network;
    if (net?.billing_mode === "split" && LIVE.includes(net.billing_status ?? "")) continue;
    try {
      if (o.stripe_subscription_id) {
        const sub = await s.subscriptions.retrieve(o.stripe_subscription_id, { expand: ["discounts.source.coupon"] });
        const ours = (sub.discounts ?? []).some((d) => typeof d !== "string" && !d.deleted &&
          (typeof d.source?.coupon === "string" ? d.source.coupon : d.source?.coupon?.id) === NETWORK_DISCOUNT_COUPON);
        if (ours) await s.subscriptions.update(sub.id, { discounts: [] });
      }
      await db.from("organizations").update({ franchise_discount_applied: false }).eq("id", o.id);
    } catch (e) {
      console.warn("network discount not removed", o.id, (e as Error).message);
    }
  }
}

/** Mirrors the network's Stripe subscription (webhook). */
export async function applyFranchiseSubscription(db: SupabaseClient, sub: Stripe.Subscription) {
  let { data: net } = await db.from("franchise_networks").select(NETWORK_COLS).eq("stripe_subscription_id", sub.id).maybeSingle();
  if (!net && sub.metadata?.network_id) {
    ({ data: net } = await db.from("franchise_networks").select(NETWORK_COLS).eq("id", sub.metadata.network_id).maybeSingle());
  }
  if (!net) {
    console.warn("franchise subscription for unknown network", sub.id);
    return;
  }
  if (net.stripe_subscription_id && net.stripe_subscription_id !== sub.id && !LIVE.includes(sub.status)) return; // an old one ending
  if (sub.status === "incomplete") return;
  const item = sub.items?.data?.[0];
  const end = item?.current_period_end ?? null;
  const start = item?.current_period_start ?? null;
  const paidThrough = sub.status === "past_due" ? start : end;
  const update: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    billing_status: sub.status,
    billed_locations: item?.quantity ?? net.billed_locations,
  };
  if (LIVE.includes(sub.status) && paidThrough) update.paid_through = new Date(paidThrough * 1000).toISOString();
  const { error } = await db.from("franchise_networks").update(update).eq("id", net.id);
  if (error) throw error;
  if (net.billing_mode === "all_in" && LIVE.includes(sub.status)) await db.rpc("franchise_apply_coverage", { p_network: net.id });
}
