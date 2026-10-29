// Stripe webhook: records invoice payments and quote deposits, runs monthly
// care plans, and keeps Connect status fresh.
//
// Configure TWO endpoints in Stripe Dashboard → Developers → Webhooks, both
// pointing at https://<project>.functions.supabase.co/stripe-webhook:
//   1. "Your account" events (secret → STRIPE_WEBHOOK_SECRET):
//        checkout.session.completed, checkout.session.async_payment_succeeded,
//        charge.refunded
//   2. "Connected accounts" events (secret → STRIPE_CONNECT_WEBHOOK_SECRET):
//        account.updated, checkout.session.completed, invoice.paid,
//        invoice.payment_failed, customer.subscription.updated,
//        customer.subscription.deleted
// A single secret still works if you only use one endpoint.
//
// Web subscriptions (billing-checkout, Stripe Billing on the PLATFORM account)
// arrive on endpoint 1 without `event.account`; add these events there:
//   customer.subscription.created, customer.subscription.updated,
//   customer.subscription.deleted (checkout.session.completed is already on).
// They are told apart from care plans (connected accounts) by `event.account`
// and metadata.kind ('platform_plan' | 'ai_pack' | 'text_pack').
import { Stripe, type SupabaseClient } from "../_shared/deps.ts";
import { adminClient, notifyManagers, stripe } from "../_shared/clients.ts";
import { env } from "../_shared/http.ts";
import { GRACE_MS, planForPriceId, type Period, type PlanId, PLAN_IDS } from "../_shared/billing.ts";
import { applyRefund, CARE_PLAN_COLS, type CarePlanSchedule, recordCarePlanCharge, recordDeposit, recordInvoicePayment } from "../_shared/payments.ts";

const crypto = Stripe.createSubtleCryptoProvider();

async function verify(raw: string, sig: string): Promise<Stripe.Event> {
  const secrets = [env("STRIPE_WEBHOOK_SECRET"), Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET")].filter((s): s is string => !!s);
  let last: unknown;
  for (const secret of secrets) {
    try {
      return await stripe().webhooks.constructEventAsync(raw, sig, secret, undefined, crypto);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const idOf = (x: string | { id: string } | null | undefined) => (typeof x === "string" ? x : x?.id ?? null);

Deno.serve(async (req) => {
  const sig = req.headers.get("Stripe-Signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await verify(raw, sig);
  } catch (e) {
    return new Response(`bad signature: ${(e as Error).message}`, { status: 400 });
  }

  const db = adminClient();
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const kind = session.metadata?.kind;
        if (!event.account && kind === "platform_plan") {
          await platformPlanCheckout(db, session);
          break;
        }
        if (!event.account && (kind === "ai_pack" || kind === "text_pack")) {
          if (session.payment_status === "paid") await platformPackPaid(db, session, kind);
          break;
        }
        if (kind === "care_plan") {
          await carePlanStarted(db, session, event.account ?? null);
          break;
        }
        if (session.payment_status !== "paid") break; // ACH settles later via async_payment_succeeded
        if (kind === "quote_deposit") {
          await depositPaid(db, session);
          break;
        }
        await invoicePaidOnline(db, session, event.type);
        break;
      }
      case "invoice.paid": {
        await carePlanCharged(db, event.data.object as Stripe.Invoice, event.account ?? null);
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const sched = await scheduleForInvoice(db, inv);
        if (!sched) break;
        await db.from("recurring_schedules").update({ care_plan_status: "past_due" }).eq("id", sched.id);
        const { data: c } = await db.from("customers").select("name").eq("id", sched.customer_id).maybeSingle();
        await notifyManagers(db, sched.org_id, "care_plan_failed", "Care plan payment failed",
          `${c?.name ?? "A customer"}'s monthly care plan card was declined. Stripe will retry automatically.`, `/recurring/${sched.id}`);
        break;
      }
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        if (!event.account && sub.metadata?.kind === "platform_plan") await applyPlatformSubscription(db, sub);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        if (!event.account && sub.metadata?.kind === "platform_plan") {
          await applyPlatformSubscription(db, sub);
          break;
        }
        const status = event.type === "customer.subscription.deleted" ? "canceled" : mapSubStatus(sub.status);
        if (!status) break;
        let q = db.from("recurring_schedules").update({ care_plan_status: status, stripe_subscription_id: sub.id });
        q = sub.metadata?.schedule_id ? q.eq("id", sub.metadata.schedule_id) : q.eq("stripe_subscription_id", sub.id);
        // Ignore stale events for a subscription this schedule no longer uses.
        const { error } = await q.or(`stripe_subscription_id.is.null,stripe_subscription_id.eq.${sub.id}`);
        if (error) throw error;
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = idOf(charge.payment_intent);
        if (!pi) break;
        await applyRefund(db, pi, charge.refunded ? 0 : (charge.amount_captured - charge.amount_refunded) / 100);
        break;
      }
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        await db.from("organizations")
          .update({ stripe_charges_enabled: !!acct.charges_enabled })
          .eq("stripe_account_id", acct.id);
        break;
      }
    }
  } catch (e) {
    console.error(e);
    return new Response("handler error", { status: 500 }); // Stripe will retry
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});

function mapSubStatus(s: Stripe.Subscription.Status): string | null {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  if (s === "canceled" || s === "incomplete_expired") return "canceled";
  return null; // incomplete / paused: leave as is
}

// ---------------------------------------------------------------------------
// Invoice paid through invoice-checkout (existing behavior)
// ---------------------------------------------------------------------------
async function invoicePaidOnline(db: SupabaseClient, session: Stripe.Checkout.Session, type: string) {
  const invoiceId = session.metadata?.invoice_id;
  const orgId = session.metadata?.org_id;
  if (!invoiceId || !orgId) return;
  const pi = idOf(session.payment_intent);
  const method = session.payment_method_types?.includes("us_bank_account") && type.includes("async") ? "ach" : "card";
  await recordInvoicePayment(db, {
    orgId, invoiceId, amount: (session.amount_total ?? 0) / 100, method, provider: "stripe",
    externalId: pi ?? session.id, reference: `Stripe ${pi ?? session.id}`,
    fee: Number(session.metadata?.platform_fee_cents ?? 0) / 100,
  });
}

// ---------------------------------------------------------------------------
// Quote deposit (quote-deposit-checkout)
// ---------------------------------------------------------------------------
async function depositPaid(db: SupabaseClient, session: Stripe.Checkout.Session) {
  const quoteId = session.metadata?.quote_id;
  const orgId = session.metadata?.org_id;
  if (!quoteId || !orgId) return;
  await recordDeposit(db, {
    quoteId, orgId, provider: "stripe",
    externalId: idOf(session.payment_intent) ?? session.id,
    amount: (session.amount_total ?? 0) / 100,
    fee: Number(session.metadata?.platform_fee_cents ?? 0) / 100,
  });
}

// ---------------------------------------------------------------------------
// Monthly care plans (care-plan function; connected-account events)
// ---------------------------------------------------------------------------
async function carePlanStarted(db: SupabaseClient, session: Stripe.Checkout.Session, account: string | null) {
  const scheduleId = session.metadata?.schedule_id;
  const orgId = session.metadata?.org_id;
  const subId = idOf(session.subscription);
  if (!scheduleId || !orgId || !subId) return;
  if (session.status !== "complete") return;
  const { data: rows, error } = await db.from("recurring_schedules")
    .update({ stripe_subscription_id: subId, care_plan_status: "active" })
    .eq("id", scheduleId).eq("org_id", orgId).select("id, customer_id, customer:customers(name)");
  if (error) throw error;
  const s = rows?.[0];
  if (!s) return;
  if (account) {
    const cust = idOf(session.customer as string | { id: string } | null);
    if (cust) await db.from("customers").update({ stripe_customer_id: cust }).eq("id", s.customer_id).is("stripe_customer_id", null);
  }
  // deno-lint-ignore no-explicit-any
  const who = (s.customer as any)?.name ?? "A customer";
  await db.from("activities").insert({ org_id: orgId, customer_id: s.customer_id, kind: "system", body: "Monthly care plan started (card on file)" });
  await notifyManagers(db, orgId, "care_plan_started", "Care plan started", `${who} signed up for their monthly care plan`, `/recurring/${scheduleId}`);
}

type Sched = CarePlanSchedule;
function subscriptionOf(inv: Stripe.Invoice): { id: string | null; meta: Record<string, string> } {
  const d = inv.parent?.subscription_details;
  return { id: idOf(d?.subscription as string | { id: string } | undefined), meta: (d?.metadata ?? {}) as Record<string, string> };
}

async function scheduleForInvoice(db: SupabaseClient, inv: Stripe.Invoice): Promise<Sched | null> {
  const { id: subId, meta } = subscriptionOf(inv);
  if (!subId && !meta.schedule_id) return null;
  const cols = CARE_PLAN_COLS;
  if (subId) {
    const { data } = await db.from("recurring_schedules").select(cols).eq("stripe_subscription_id", subId).maybeSingle();
    if (data) return data as Sched;
  }
  if (meta.kind === "care_plan" && meta.schedule_id) {
    let q = db.from("recurring_schedules").select(cols).eq("id", meta.schedule_id);
    if (meta.org_id) q = q.eq("org_id", meta.org_id);
    const { data } = await q.maybeSingle();
    return (data as Sched) ?? null;
  }
  return null;
}

async function carePlanCharged(db: SupabaseClient, inv: Stripe.Invoice, account: string | null) {
  if (!inv.amount_paid || inv.amount_paid <= 0) return;
  const sched = await scheduleForInvoice(db, inv);
  if (!sched) return;
  const { id: subId } = subscriptionOf(inv);
  const stripeInvoiceId = inv.id;
  if (!stripeInvoiceId) return;

  const { data: org } = await db.from("organizations").select("stripe_account_id").eq("id", sched.org_id).single();
  if (account && org?.stripe_account_id && account !== org.stripe_account_id) {
    console.warn("care plan invoice from unexpected account", account, sched.org_id);
    return;
  }
  const periodStart = inv.lines?.data?.[0]?.period?.start ?? inv.period_start ?? Math.floor(Date.now() / 1000);
  // Idempotent by Stripe invoice id (stored as the payment's stripe_payment_intent_id).
  const recorded = await recordCarePlanCharge(db, sched, {
    externalId: stripeInvoiceId, amountCents: inv.amount_paid, currency: inv.currency, provider: "stripe",
    periodStart: new Date(periodStart * 1000),
    paidAt: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000).toISOString() : undefined,
  });
  if (!recorded) return;

  const update: Record<string, unknown> = {};
  if (sched.care_plan_status !== "active") update.care_plan_status = "active";
  if (subId && !sched.stripe_subscription_id) update.stripe_subscription_id = subId;
  if (Object.keys(update).length) await db.from("recurring_schedules").update(update).eq("id", sched.id);
}

// ---------------------------------------------------------------------------
// Web subscriptions & packs (billing-checkout; PLATFORM account events)
// ---------------------------------------------------------------------------
const iso = (sec: number) => new Date(sec * 1000).toISOString();

/** Checkout finished: link the subscription to the company, then apply its current state. */
async function platformPlanCheckout(db: SupabaseClient, session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.org_id ?? session.client_reference_id;
  const subId = idOf(session.subscription as string | { id: string } | null);
  if (!orgId || !subId || session.status !== "complete") return;
  const customer = idOf(session.customer as string | { id: string } | null);
  const { error } = await db.from("organizations")
    .update({ stripe_subscription_id: subId, billing_source: "stripe" }).eq("id", orgId);
  if (error) throw error;
  if (customer) {
    await db.from("organizations").update({ stripe_billing_customer_id: customer }).eq("id", orgId).is("stripe_billing_customer_id", null);
  }
  // Don't depend on the order Stripe delivers events in.
  const sub = await stripe().subscriptions.retrieve(subId);
  await applyPlatformSubscription(db, sub);
}

/** Plan + period from the subscription's price (portal plan switches change the price, not the metadata). */
function planOfSubscription(sub: Stripe.Subscription): { plan: PlanId | null; period: Period } {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  const known = planForPriceId(price?.id);
  if (known) return known;
  const hay = [price?.metadata?.plan, price?.lookup_key, sub.metadata?.plan].filter(Boolean).join(" ").toLowerCase();
  const plan = (["fleet", "team", "solo"] as PlanId[]).find((p) => hay.includes(p)) ?? null;
  const period: Period = price?.recurring?.interval === "year" ? "annual"
    : price?.recurring?.interval === "month" ? "monthly"
    : sub.metadata?.period === "annual" ? "annual" : "monthly";
  return { plan, period };
}

/**
 * Mirrors a web subscription onto organizations.plan:
 *  - active / trialing → plan, paid through the period end (+3 days grace)
 *  - past_due → keep the plan through the end of the last PAID period (+grace) while Stripe retries
 *  - canceled / unpaid / incomplete_expired / paused → 'expired' once the paid period is over
 *  - incomplete (first payment pending) → nothing yet
 */
async function applyPlatformSubscription(db: SupabaseClient, sub: Stripe.Subscription) {
  const customer = idOf(sub.customer as string | { id: string } | null);
  const cols = "id, plan, plan_expires_at, billing_source, stripe_subscription_id";
  let org: { id: string; plan: string; plan_expires_at: string | null; billing_source: string | null; stripe_subscription_id: string | null } | null = null;
  if (sub.metadata?.org_id) {
    ({ data: org } = await db.from("organizations").select(cols).eq("id", sub.metadata.org_id).maybeSingle());
  }
  if (!org) ({ data: org } = await db.from("organizations").select(cols).eq("stripe_subscription_id", sub.id).maybeSingle());
  if (!org && customer) ({ data: org } = await db.from("organizations").select(cols).eq("stripe_billing_customer_id", customer).maybeSingle());
  if (!org) {
    console.warn("platform subscription for unknown company", sub.id);
    return;
  }

  const live = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
  const isCurrent = org.stripe_subscription_id === sub.id;
  if (sub.status === "incomplete") return;
  if (!live && org.stripe_subscription_id && !isCurrent) return; // an old subscription ending: not the one in use
  if (!live && org.billing_source && org.billing_source !== "stripe") {
    console.warn("ignoring ended Stripe subscription; company now billed by", org.billing_source, org.id);
    return;
  }

  const { plan, period } = planOfSubscription(sub);
  const items = sub.items?.data ?? [];
  const periodEnd = items.length ? Math.min(...items.map((i) => i.current_period_end)) : null;
  const periodStart = items.length ? Math.min(...items.map((i) => i.current_period_start)) : null;
  let update: Record<string, unknown>;

  if (live) {
    if (!plan || !PLAN_IDS.includes(plan)) {
      console.error("platform subscription with unknown price", sub.id, sub.items?.data?.[0]?.price?.id);
      return;
    }
    if (org.billing_source && org.billing_source !== "stripe") {
      console.warn("company billed by", org.billing_source, "also has an active Stripe subscription", org.id, sub.id);
    }
    // past_due: the renewal failed, so the period Stripe moved to is unpaid; access runs to its start (+grace).
    const paidThrough = sub.status === "past_due" ? periodStart : periodEnd;
    update = {
      plan, billing_period: period, billing_source: "stripe", stripe_subscription_id: sub.id,
      plan_expires_at: paidThrough ? new Date(paidThrough * 1000 + GRACE_MS).toISOString() : null,
    };
  } else {
    // canceled / unpaid / incomplete_expired / paused
    const end = sub.ended_at ?? (sub.status === "unpaid" ? periodStart : periodEnd) ?? Math.floor(Date.now() / 1000);
    update = end * 1000 > Date.now()
      ? { plan_expires_at: iso(end), stripe_subscription_id: sub.id }
      : { plan: "expired", plan_expires_at: iso(end), stripe_subscription_id: sub.id };
  }
  if (customer) update.stripe_billing_customer_id = customer;
  const { error } = await db.from("organizations").update(update).eq("id", org.id);
  if (error) throw error;
}

/** One-time AI check / text pack paid on the web: add credits once per Checkout session. */
async function platformPackPaid(db: SupabaseClient, session: Stripe.Checkout.Session, kind: "ai_pack" | "text_pack") {
  const orgId = session.metadata?.org_id ?? session.client_reference_id;
  const quantity = Number(session.metadata?.quantity ?? 0);
  if (!orgId || !Number.isFinite(quantity) || quantity <= 0) return;
  const worker = kind === "ai_pack" ? "stripe_ai" : "stripe_texts";
  const { data: seen } = await db.from("worker_runs").select("id").eq("worker", worker).eq("details->>event_id", session.id).limit(1);
  if (seen?.length) return;

  if (kind === "ai_pack") {
    const { data: balance, error } = await db.rpc("add_ai_credits", { p_org: orgId, p_checks: quantity });
    if (error) throw error;
    await db.from("worker_runs").insert({ worker, ok: true, details: { event_id: session.id, org_id: orgId, pack: session.metadata?.pack, checks: quantity, balance } });
    return;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: org } = await db.from("organizations").select("sms_extra_credits").eq("id", orgId).maybeSingle();
    if (!org) return; // unknown company: nothing to credit
    const current = Number(org.sms_extra_credits ?? 0);
    // Compare-and-set so concurrent purchases never overwrite each other.
    const { data: updated, error } = await db.from("organizations")
      .update({ sms_extra_credits: current + quantity }).eq("id", orgId).eq("sms_extra_credits", current).select("id");
    if (error) throw error;
    if (updated?.length) {
      await db.from("worker_runs").insert({ worker, ok: true, details: { event_id: session.id, org_id: orgId, pack: session.metadata?.pack, texts: quantity, balance: current + quantity } });
      return;
    }
  }
  throw new Error("could not add texts (busy); Stripe will retry");
}
