// Web subscriptions and packs through Stripe Billing on the PLATFORM account
// (the iPhone/Android apps keep using in-app purchase via RevenueCat).
//
// POST { action: 'catalog' }
//   → { plans: [{ plan, period, amount, currency }], packs: [{ id, kind, quantity, amount, currency }] }
//   Only prices configured in env (and found in Stripe) are listed.
// POST { org_id, kind: 'plan', plan: 'solo'|'team'|'fleet', period: 'monthly'|'annual' } → { url }
// POST { org_id, kind: 'ai_pack'|'text_pack', pack: 'ai_50'|'ai_200'|'texts_500'|'texts_2000' } → { url }
// Owner only. The stripe-webhook function applies the result.
import { adminClient, callerRole, stripe } from "../_shared/clients.ts";
import { type SupabaseClient } from "../_shared/deps.ts";
import { error, json, portalUrl, preflight, readJson } from "../_shared/http.ts";
import { PACKS, packPriceId, paidPlanActive, PERIODS, PLAN_IDS, planPriceId, type Period, type PlanId } from "../_shared/billing.ts";

type Body = { action?: string; org_id?: string; kind?: string; plan?: string; period?: string; pack?: string };

const STORE_NAME: Record<string, string> = { app_store: "the App Store", play_store: "Google Play" };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const body = await readJson<Body>(req);
    if (body.action === "catalog") return json(await catalog());

    const orgId = body.org_id;
    if (typeof orgId !== "string" || !orgId) return error("org_id required");
    const caller = await callerRole(req, orgId);
    if (!caller || caller.role !== "owner") return error("Only the company owner can change the subscription or buy packs", 403);

    const db = adminClient();
    const { data: org } = await db.from("organizations")
      .select("id, name, email, is_demo, plan, plan_expires_at, trial_ends_at, billing_source, stripe_billing_customer_id, stripe_subscription_id")
      .eq("id", orgId).maybeSingle();
    if (!org) return error("Company not found", 404);
    if (org.is_demo) return error("DEMO: purchases are turned off in the demo workspace");

    const portal = portalUrl();
    const success_url = `${portal}/paywall?billing=success`;
    const cancel_url = `${portal}/paywall?billing=cancelled`;
    const s = stripe();

    if (body.kind === "plan") {
      const plan = body.plan as PlanId;
      const period = body.period as Period;
      if (!PLAN_IDS.includes(plan) || !PERIODS.includes(period)) return error("Choose a plan and billing period");
      const price = planPriceId(plan, period);
      if (!price) return error("This plan is not available on the web yet. Please try again later.");

      // One subscription source per company: the stores manage their own.
      if ((org.billing_source === "app_store" || org.billing_source === "play_store") && paidPlanActive(org)) {
        return error(`Your subscription is managed in ${STORE_NAME[org.billing_source]}. Change it there.`, 409);
      }
      // An existing web subscription is changed in the billing portal, never doubled.
      if (org.stripe_subscription_id) {
        try {
          const sub = await s.subscriptions.retrieve(org.stripe_subscription_id);
          if (["active", "trialing", "past_due"].includes(sub.status)) {
            return error("You already have a subscription. Use Manage billing in Settings to change or cancel it.", 409);
          }
        } catch (e) {
          console.warn("could not read existing subscription", org.stripe_subscription_id, (e as Error).message);
        }
      }

      const customer = await billingCustomer(db, org, caller.userId);
      const meta = { org_id: org.id, kind: "platform_plan", plan, period };
      // Carry what is left of the free trial (Stripe needs the trial to end at least 48 hours out).
      const trialEnd = org.plan === "trial" && org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : 0;
      const keepTrial = trialEnd > Date.now() + 48 * 3600 * 1000;

      const session = await s.checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: org.id,
        line_items: [{ price, quantity: 1 }],
        allow_promotion_codes: true,
        subscription_data: {
          metadata: meta,
          ...(keepTrial ? { trial_end: Math.floor(trialEnd / 1000) } : {}),
        },
        metadata: meta,
        success_url,
        cancel_url,
      });
      return json({ url: session.url });
    }

    if (body.kind === "ai_pack" || body.kind === "text_pack") {
      const pack = PACKS.find((p) => p.id === body.pack && p.kind === body.kind);
      const price = pack ? packPriceId(pack) : null;
      if (!pack || !price) return error("This pack is not available right now.");
      const customer = await billingCustomer(db, org, caller.userId);
      const meta = { org_id: org.id, kind: pack.kind, quantity: String(pack.quantity), pack: pack.id };
      const session = await s.checkout.sessions.create({
        mode: "payment",
        customer,
        client_reference_id: org.id,
        line_items: [{ price, quantity: 1 }],
        allow_promotion_codes: true,
        payment_intent_data: { metadata: meta },
        metadata: meta,
        success_url,
        cancel_url,
      });
      return json({ url: session.url });
    }

    return error("Unknown request");
  } catch (e) {
    console.error(e);
    return error("Could not start checkout. Please try again in a moment.", 500);
  }
});

type OrgRow = { id: string; name: string; email: string | null; stripe_billing_customer_id: string | null };

/** The org's Stripe customer on the platform account (created once, then reused). */
async function billingCustomer(db: SupabaseClient, org: OrgRow, ownerId: string): Promise<string> {
  const s = stripe();
  if (org.stripe_billing_customer_id) {
    try {
      const c = await s.customers.retrieve(org.stripe_billing_customer_id);
      if (!("deleted" in c && c.deleted)) return c.id;
    } catch {
      // removed in Stripe or from another mode (test vs live): make a new one
    }
  }
  const { data: { user } } = await db.auth.admin.getUserById(ownerId);
  const c = await s.customers.create({
    name: org.name,
    email: user?.email ?? org.email ?? undefined,
    metadata: { org_id: org.id },
  });
  // Compare-and-set so two simultaneous checkouts end up on one customer.
  let q = db.from("organizations").update({ stripe_billing_customer_id: c.id }).eq("id", org.id);
  q = org.stripe_billing_customer_id ? q.eq("stripe_billing_customer_id", org.stripe_billing_customer_id) : q.is("stripe_billing_customer_id", null);
  const { data: saved, error: e } = await q.select("id");
  if (e) throw e;
  if (saved?.length) return c.id;
  const { data: now } = await db.from("organizations").select("stripe_billing_customer_id").eq("id", org.id).single();
  await s.customers.del(c.id).catch(() => {});
  if (!now?.stripe_billing_customer_id) throw new Error("billing customer not saved");
  return now.stripe_billing_customer_id;
}

/** Which plans and packs can be bought on the web, with Stripe's prices. */
async function catalog() {
  const s = stripe();
  const read = async (id: string) => {
    try {
      const p = await s.prices.retrieve(id);
      return p.active ? { amount: p.unit_amount != null ? p.unit_amount / 100 : null, currency: p.currency.toUpperCase() } : null;
    } catch (e) {
      console.warn("price not found", id, (e as Error).message);
      return null;
    }
  };
  const planRows = PLAN_IDS.flatMap((plan) => PERIODS.map((period) => ({ plan, period, price: planPriceId(plan, period) })))
    .filter((r): r is { plan: PlanId; period: Period; price: string } => !!r.price);
  const packRows = PACKS.map((p) => ({ p, price: packPriceId(p) })).filter((r): r is { p: typeof PACKS[number]; price: string } => !!r.price);
  const [planPrices, packPrices] = await Promise.all([
    Promise.all(planRows.map((r) => read(r.price))),
    Promise.all(packRows.map((r) => read(r.price))),
  ]);
  return {
    plans: planRows.flatMap((r, i) => (planPrices[i] ? [{ plan: r.plan, period: r.period, ...planPrices[i] }] : [])),
    packs: packRows.flatMap((r, i) => (packPrices[i] ? [{ id: r.p.id, kind: r.p.kind, quantity: r.p.quantity, ...packPrices[i] }] : [])),
  };
}
