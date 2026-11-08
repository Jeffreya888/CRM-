// Extra locations on a Fleet web subscription (Enterprise pricing for one owner with more than 5 locations).
//
// POST { org_id, action: 'quote', extra }  → { extra, period, amount_cents, currency }
// POST { org_id, action: 'set', extra }    → { ok: true, extra }
// Owner only, web (Stripe) Fleet subscriptions only. Stripe prorates the change on the next invoice;
// the stripe-webhook function mirrors the quantity onto organizations.extra_locations as well.
import { adminClient, callerRole, stripe } from "../_shared/clients.ts";
import { error, json, preflight, readJson } from "../_shared/http.ts";
import {
  EXTRA_LOCATION_CENTS, EXTRA_LOCATION_TIER, extraLocationLookupKey, extraLocationsCents, isExtraLocationItem, type Period,
} from "../_shared/billing.ts";

type Body = { org_id?: string; action?: string; extra?: number };
const MAX_EXTRA = 500;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const body = await readJson<Body>(req);
    const orgId = body.org_id;
    if (typeof orgId !== "string" || !orgId) return error("org_id required");
    const caller = await callerRole(req, orgId);
    if (!caller || caller.role !== "owner") return error("Only the company owner can change billed locations", 403);
    const extra = Number(body.extra);
    if (!Number.isInteger(extra) || extra < 0 || extra > MAX_EXTRA) return error(`Choose between 0 and ${MAX_EXTRA} extra locations`);

    const db = adminClient();
    const { data: org } = await db.from("organizations")
      .select("id, is_demo, plan, billing_period, billing_source, stripe_subscription_id, branch_limit")
      .eq("id", orgId).maybeSingle();
    if (!org) return error("Company not found", 404);
    if (org.is_demo) return error("DEMO: purchases are turned off in the demo workspace");
    if (org.branch_limit != null) return error("Your locations are set up on an Enterprise agreement. Contact us to change them.", 409);
    const { data: eplan } = await db.rpc("effective_plan", { p_org: orgId });
    if (eplan !== "fleet") return error("Extra locations are part of the Fleet plan. Upgrade to Fleet first.", 409);
    if (org.billing_source !== "stripe" || !org.stripe_subscription_id) {
      return error("Your plan is billed through the App Store or Google Play, which can't bill per location. Contact us and we'll set up your extra locations.", 409);
    }

    const s = stripe();
    const sub = await s.subscriptions.retrieve(org.stripe_subscription_id);
    if (!["active", "trialing", "past_due"].includes(sub.status)) return error("Your subscription isn't active. Update it in Manage billing first.", 409);
    const planItem = sub.items.data.find((i) => !isExtraLocationItem(i));
    const period: Period = planItem?.price?.recurring?.interval === "year" ? "annual" : "monthly";
    const current = sub.items.data.find((i) => isExtraLocationItem(i));

    if (body.action === "quote") {
      return json({ extra, period, amount_cents: extraLocationsCents(extra, period), currency: "USD" });
    }
    if (body.action !== "set") return error("Unknown request");

    // Never bill fewer locations than are active: turn one off first.
    const { count } = await db.from("branches").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("active", true);
    const needed = Math.max(0, (count ?? 0) - 5);
    if (extra < needed) return error(`You have ${count} active locations, so you need at least ${needed} extra. Turn a location off first.`, 409);

    if (current && extra === 0) {
      await s.subscriptionItems.del(current.id, { proration_behavior: "create_prorations" });
    } else if (current) {
      await s.subscriptionItems.update(current.id, { quantity: extra, proration_behavior: "create_prorations" });
    } else if (extra > 0) {
      const price = await extraLocationPrice(period);
      await s.subscriptionItems.create({ subscription: sub.id, price, quantity: extra, proration_behavior: "create_prorations" });
    }
    const { error: e } = await db.from("organizations").update({ extra_locations: extra }).eq("id", orgId);
    if (e) throw e;
    return json({ ok: true, extra });
  } catch (e) {
    console.error(e);
    return error("Could not update your locations. Please try again in a moment.", 500);
  }
});

/** The graduated extra-location price for a period, created in Stripe the first time it's needed. */
async function extraLocationPrice(period: Period): Promise<string> {
  const s = stripe();
  const lookup_key = extraLocationLookupKey(period);
  const found = await s.prices.list({ lookup_keys: [lookup_key], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const [first, rest] = EXTRA_LOCATION_CENTS[period];
  const price = await s.prices.create({
    currency: "usd",
    lookup_key,
    transfer_lookup_key: true,
    metadata: { kind: "extra_location" },
    recurring: { interval: period === "annual" ? "year" : "month" },
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    tiers: [{ up_to: EXTRA_LOCATION_TIER, unit_amount: first }, { up_to: "inf", unit_amount: rest }],
    product_data: { name: "Extra location", metadata: { kind: "extra_location" } },
  });
  return price.id;
}
