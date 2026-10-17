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
import { Stripe, type SupabaseClient } from "../_shared/deps.ts";
import { adminClient, MANAGER_ROLES, money, notifyManagers, orgFeeBps, stripe } from "../_shared/clients.ts";
import { env } from "../_shared/http.ts";
import { sendPushes, tokensFor } from "../_shared/push.ts";

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
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
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
        if (charge.refunded) {
          await db.from("payments").delete().eq("stripe_payment_intent_id", pi);
          // A refunded deposit no longer counts toward the quote.
          await db.from("quotes").update({ deposit_paid_at: null, deposit_payment_intent: null }).eq("deposit_payment_intent", pi);
        } else {
          await db.from("payments")
            .update({ amount: (charge.amount_captured - charge.amount_refunded) / 100 })
            .eq("stripe_payment_intent_id", pi);
        }
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
  // Unique stripe_payment_intent_id makes this idempotent across retries.
  const { error } = await db.from("payments").upsert({
    org_id: orgId,
    invoice_id: invoiceId,
    amount: (session.amount_total ?? 0) / 100,
    method,
    reference: `Stripe ${pi ?? session.id}`,
    stripe_payment_intent_id: pi ?? session.id,
    platform_fee: Number(session.metadata?.platform_fee_cents ?? 0) / 100,
  }, { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true });
  if (error) throw error;
  const { data: inv } = await db.from("invoices").select("customer_id, number, customer:customers(name)").eq("id", invoiceId).single();
  const amount = `$${((session.amount_total ?? 0) / 100).toFixed(2)}`;
  await db.from("activities").insert({ org_id: orgId, kind: "system", body: `Online payment received: ${amount}`, customer_id: inv?.customer_id });
  const { data: managers } = await db.from("memberships").select("user_id").eq("org_id", orgId).in("role", MANAGER_ROLES).eq("active", true);
  const tokens = await tokensFor(db, (managers ?? []).map((m) => m.user_id), "payments");
  // deno-lint-ignore no-explicit-any
  const who = (inv?.customer as any)?.name ?? "A customer";
  await sendPushes(tokens.map((t) => ({ to: t.token, title: "Payment received", body: `${who} paid ${amount} on invoice ${inv?.number ?? ""}`, data: { url: `/invoices/${invoiceId}` } })));
}

// ---------------------------------------------------------------------------
// Quote deposit (quote-deposit-checkout)
// ---------------------------------------------------------------------------
async function depositPaid(db: SupabaseClient, session: Stripe.Checkout.Session) {
  const quoteId = session.metadata?.quote_id;
  const orgId = session.metadata?.org_id;
  if (!quoteId || !orgId) return;
  const pi = idOf(session.payment_intent) ?? session.id;
  // Only the first delivery flips deposit_paid_at (idempotent).
  const { data: rows, error } = await db.from("quotes")
    .update({ deposit_paid_at: new Date().toISOString(), deposit_payment_intent: pi })
    .eq("id", quoteId).eq("org_id", orgId).is("deposit_paid_at", null)
    .select("id, number, customer_id, currency:organizations(currency), customer:customers(name)");
  if (error) throw error;
  const q = rows?.[0];
  if (!q) return;
  const amountNum = (session.amount_total ?? 0) / 100;
  // deno-lint-ignore no-explicit-any
  const currency = (q.currency as any)?.currency ?? "USD";
  // deno-lint-ignore no-explicit-any
  const who = (q.customer as any)?.name ?? "A customer";

  // If the job was already invoiced, apply the deposit to that invoice now.
  // (Otherwise _create_invoice_for_job applies it when the invoice is created.)
  const { data: jobs } = await db.from("jobs").select("id").eq("quote_id", quoteId);
  const jobIds = (jobs ?? []).map((j) => j.id);
  if (jobIds.length) {
    const { data: inv } = await db.from("invoices").select("id").in("job_id", jobIds).neq("status", "void")
      .order("created_at").limit(1).maybeSingle();
    if (inv) {
      const { error: pErr } = await db.from("payments").upsert({
        org_id: orgId, invoice_id: inv.id, amount: amountNum, method: "card",
        reference: `Deposit on quote ${q.number}`, stripe_payment_intent_id: pi,
        platform_fee: Number(session.metadata?.platform_fee_cents ?? 0) / 100,
      }, { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true });
      if (pErr) console.error("deposit payment insert failed", pErr);
    }
  }

  await db.from("activities").insert({
    org_id: orgId, customer_id: q.customer_id, kind: "system",
    body: `Deposit of ${money(amountNum, currency)} paid online for quote ${q.number}`,
  });
  await notifyManagers(db, orgId, "deposit_paid", "Deposit received",
    `${who} paid a ${money(amountNum, currency)} deposit on quote ${q.number}`, `/quotes/${quoteId}`);
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

type Sched = {
  id: string; org_id: string; customer_id: string; aircraft_id: string | null; branch_id: string | null;
  title: string | null; stripe_subscription_id: string | null; care_plan_status: string | null;
};

function subscriptionOf(inv: Stripe.Invoice): { id: string | null; meta: Record<string, string> } {
  const d = inv.parent?.subscription_details;
  return { id: idOf(d?.subscription as string | { id: string } | undefined), meta: (d?.metadata ?? {}) as Record<string, string> };
}

async function scheduleForInvoice(db: SupabaseClient, inv: Stripe.Invoice): Promise<Sched | null> {
  const { id: subId, meta } = subscriptionOf(inv);
  if (!subId && !meta.schedule_id) return null;
  const cols = "id, org_id, customer_id, aircraft_id, branch_id, title, stripe_subscription_id, care_plan_status";
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

  // Idempotent by Stripe invoice id (stored as the payment's stripe_payment_intent_id).
  const { data: existing } = await db.from("payments").select("id").eq("stripe_payment_intent_id", stripeInvoiceId).maybeSingle();
  if (existing) return;

  const { data: org } = await db.from("organizations").select("name, currency, timezone, stripe_account_id").eq("id", sched.org_id).single();
  if (account && org?.stripe_account_id && account !== org.stripe_account_id) {
    console.warn("care plan invoice from unexpected account", account, sched.org_id);
    return;
  }
  const { data: customer } = await db.from("customers").select("name, email, phone, sms_consent, sms_opted_out, email_opted_out").eq("id", sched.customer_id).maybeSingle();
  const { data: asset } = sched.aircraft_id
    ? await db.from("aircraft").select("tail_number, manufacturer, model").eq("id", sched.aircraft_id).maybeSingle()
    : { data: null };

  const amount = inv.amount_paid / 100;
  const currency = (org?.currency ?? inv.currency ?? "USD").toUpperCase();
  const periodStart = inv.lines?.data?.[0]?.period?.start ?? inv.period_start ?? Math.floor(Date.now() / 1000);
  let month: string;
  try {
    month = new Date(periodStart * 1000).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: org?.timezone ?? "UTC" });
  } catch {
    month = new Date(periodStart * 1000).toISOString().slice(0, 7);
  }
  const assetLabel = asset?.tail_number ?? sched.title ?? "your asset";
  const fee = Math.round((inv.amount_paid * (await orgFeeBps(db, sched.org_id))) / 10000) / 100;

  // Invoice record for the company's books, already paid by the card on file.
  const { data: number, error: nErr } = await db.rpc("_next_number", { p_org: sched.org_id, p_kind: "invoice" });
  if (nErr) throw nErr;
  const today = new Date().toISOString().slice(0, 10);
  const { data: created, error: iErr } = await db.from("invoices").insert({
    org_id: sched.org_id, number, customer_id: sched.customer_id, aircraft_id: sched.aircraft_id, branch_id: sched.branch_id,
    status: "sent", issue_date: today, due_date: today, tax_rate: 0, covered_by_plan: false,
    notes: `Monthly care plan — charged automatically to the card on file (Stripe ${stripeInvoiceId}).`,
  }).select("id").single();
  if (iErr) {
    // e.g. SUBSCRIPTION_REQUIRED when the company's own plan lapsed: log, don't retry forever.
    console.error("care plan invoice insert failed", iErr);
    if (String(iErr.message).includes("SUBSCRIPTION_REQUIRED")) return;
    throw iErr;
  }
  const invoiceId = created.id as string;
  const { error: liErr } = await db.from("invoice_items").insert({
    org_id: sched.org_id, invoice_id: invoiceId, description: `Care plan — ${month}${asset?.tail_number ? ` (${asset.tail_number})` : ""}`,
    quantity: 1, unit_price: amount, taxable: false, sort_order: 0,
  });
  if (liErr) {
    await db.from("invoices").delete().eq("id", invoiceId);
    throw liErr;
  }
  const { data: pay, error: pErr } = await db.from("payments").upsert({
    org_id: sched.org_id, invoice_id: invoiceId, amount, method: "card",
    reference: `Care plan ${month} (Stripe ${stripeInvoiceId})`, stripe_payment_intent_id: stripeInvoiceId,
    platform_fee: fee, received_at: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000).toISOString() : new Date().toISOString(),
  }, { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true }).select("id");
  if (pErr || !pay?.length) {
    // Lost a race with a concurrent delivery: drop the duplicate invoice.
    await db.from("invoices").delete().eq("id", invoiceId);
    if (pErr) throw pErr;
    return;
  }

  const update: Record<string, unknown> = {};
  if (sched.care_plan_status !== "active") update.care_plan_status = "active";
  if (subId && !sched.stripe_subscription_id) update.stripe_subscription_id = subId;
  if (Object.keys(update).length) await db.from("recurring_schedules").update(update).eq("id", sched.id);

  await db.from("activities").insert({
    org_id: sched.org_id, customer_id: sched.customer_id, kind: "system",
    body: `Care plan payment received: ${money(amount, currency)} for ${month}`,
  });

  // Receipt to the customer via the "care_plan_charge" automation (worker sends queued rows).
  const { data: auto } = await db.from("automations").select("enabled, channel, subject, body").eq("org_id", sched.org_id).eq("key", "care_plan_charge").maybeSingle();
  if (!auto?.enabled || !customer) return;
  const vars: Record<string, string> = {
    customer: customer.name ?? "there",
    company: org?.name ?? "",
    amount: money(amount, currency),
    asset: assetLabel,
    month,
    invoice_number: String(number),
  };
  const render = (t: string | null) => (t ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)).replace(/\\n/g, "\n");
  const rows: Record<string, unknown>[] = [];
  const base = { org_id: sched.org_id, customer_id: sched.customer_id, direction: "out", status: "queued", automation_key: "care_plan_charge", invoice_id: invoiceId, created_by: null };
  if ((auto.channel === "email" || auto.channel === "both") && customer.email && !customer.email_opted_out) {
    rows.push({ ...base, channel: "email", to_address: customer.email, subject: render(auto.subject), body: render(auto.body), dedupe_key: `care_plan:${stripeInvoiceId}` });
  }
  if ((auto.channel === "sms" || auto.channel === "both") && customer.phone && customer.sms_consent && !customer.sms_opted_out) {
    rows.push({ ...base, channel: "sms", to_address: customer.phone, body: render(auto.body), dedupe_key: auto.channel === "both" ? `care_plan:${stripeInvoiceId}:sms` : `care_plan:${stripeInvoiceId}` });
  }
  for (const row of rows) {
    const { error } = await db.from("messages").insert(row);
    if (error && error.code !== "23505") console.error("care plan message insert failed", error);
  }
}
