// Recording money that arrived through a processor (Stripe or Square), so both
// update invoices, deposits and care plans the same way. Every recorder is
// idempotent on the processor's payment id (payments.stripe_payment_intent_id
// holds it for both processors).
import type { SupabaseClient } from "./deps.ts";
import { MANAGER_ROLES, money, notifyManagers, orgFeeBps } from "./clients.ts";
import { sendPushes, tokensFor } from "./push.ts";

export type Provider = "stripe" | "square";
const label = (p: Provider) => (p === "square" ? "Square" : "Stripe");

/** Online or in-person payment on an invoice. Returns false when it was already recorded. */
export async function recordInvoicePayment(db: SupabaseClient, p: {
  orgId: string; invoiceId: string; amount: number; method: "card" | "ach"; externalId: string;
  fee: number; provider: Provider; reference?: string; receivedAt?: string;
}): Promise<boolean> {
  const { data: rows, error } = await db.from("payments").upsert({
    org_id: p.orgId,
    invoice_id: p.invoiceId,
    amount: p.amount,
    method: p.method,
    reference: p.reference ?? `${label(p.provider)} ${p.externalId}`,
    stripe_payment_intent_id: p.externalId,
    platform_fee: p.fee,
    provider: p.provider,
    ...(p.receivedAt ? { received_at: p.receivedAt } : {}),
  }, { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true }).select("id");
  if (error) throw error;
  if (!rows?.length) return false;

  const { data: inv } = await db.from("invoices").select("customer_id, number, customer:customers(name), org:organizations(currency)").eq("id", p.invoiceId).single();
  // deno-lint-ignore no-explicit-any
  const amount = money(p.amount, (inv?.org as any)?.currency ?? "USD");
  await db.from("activities").insert({ org_id: p.orgId, kind: "system", body: `Online payment received: ${amount}`, customer_id: inv?.customer_id });
  const { data: managers } = await db.from("memberships").select("user_id").eq("org_id", p.orgId).in("role", MANAGER_ROLES).eq("active", true);
  const tokens = await tokensFor(db, (managers ?? []).map((m) => m.user_id), "payments");
  // deno-lint-ignore no-explicit-any
  const who = (inv?.customer as any)?.name ?? "A customer";
  await sendPushes(tokens.map((t) => ({ to: t.token, title: "Payment received", body: `${who} paid ${amount} on invoice ${inv?.number ?? ""}`, data: { url: `/invoices/${p.invoiceId}` } })));
  return true;
}

/** Deposit on an accepted quote. Only the first delivery counts. */
export async function recordDeposit(db: SupabaseClient, p: {
  quoteId: string; orgId: string; externalId: string; amount: number; fee: number; provider: Provider;
}) {
  const { data: rows, error } = await db.from("quotes")
    .update({ deposit_paid_at: new Date().toISOString(), deposit_payment_intent: p.externalId, deposit_provider: p.provider })
    .eq("id", p.quoteId).eq("org_id", p.orgId).is("deposit_paid_at", null)
    .select("id, number, customer_id, currency:organizations(currency), customer:customers(name)");
  if (error) throw error;
  const q = rows?.[0];
  if (!q) return;
  // deno-lint-ignore no-explicit-any
  const currency = (q.currency as any)?.currency ?? "USD";
  // deno-lint-ignore no-explicit-any
  const who = (q.customer as any)?.name ?? "A customer";

  // If the job was already invoiced, apply the deposit to that invoice now.
  // (Otherwise _create_invoice_for_job applies it when the invoice is created.)
  const { data: jobs } = await db.from("jobs").select("id").eq("quote_id", p.quoteId);
  const jobIds = (jobs ?? []).map((j) => j.id);
  if (jobIds.length) {
    const { data: inv } = await db.from("invoices").select("id").in("job_id", jobIds).neq("status", "void")
      .order("created_at").limit(1).maybeSingle();
    if (inv) {
      const { error: pErr } = await db.from("payments").upsert({
        org_id: p.orgId, invoice_id: inv.id, amount: p.amount, method: "card",
        reference: `Deposit on quote ${q.number}`, stripe_payment_intent_id: p.externalId,
        platform_fee: p.fee, provider: p.provider,
      }, { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true });
      if (pErr) console.error("deposit payment insert failed", pErr);
    }
  }

  await db.from("activities").insert({
    org_id: p.orgId, customer_id: q.customer_id, kind: "system",
    body: `Deposit of ${money(p.amount, currency)} paid online for quote ${q.number}`,
  });
  await notifyManagers(db, p.orgId, "deposit_paid", "Deposit received",
    `${who} paid a ${money(p.amount, currency)} deposit on quote ${q.number}`, `/quotes/${p.quoteId}`);
}

/** A refund on the processor's side: shrink or remove the payment. */
export async function applyRefund(db: SupabaseClient, externalId: string, remaining: number) {
  if (remaining <= 0) {
    await db.from("payments").delete().eq("stripe_payment_intent_id", externalId);
    // A refunded deposit no longer counts toward the quote.
    await db.from("quotes").update({ deposit_paid_at: null, deposit_payment_intent: null, deposit_provider: null }).eq("deposit_payment_intent", externalId);
  } else {
    await db.from("payments").update({ amount: remaining }).eq("stripe_payment_intent_id", externalId);
  }
}

export type CarePlanSchedule = {
  id: string; org_id: string; customer_id: string; aircraft_id: string | null; branch_id: string | null;
  title: string | null; stripe_subscription_id: string | null; care_plan_status: string | null;
};
export const CARE_PLAN_COLS = "id, org_id, customer_id, aircraft_id, branch_id, title, stripe_subscription_id, care_plan_status";

/**
 * A monthly care plan charge: creates the paid invoice for the company's books,
 * records the payment and queues the customer's receipt. Returns false when this
 * charge was already recorded (or could not be, e.g. the company's plan lapsed).
 */
export async function recordCarePlanCharge(db: SupabaseClient, sched: CarePlanSchedule, p: {
  externalId: string; amountCents: number; currency?: string | null; periodStart: Date; paidAt?: string; provider: Provider;
}): Promise<boolean> {
  const { data: existing } = await db.from("payments").select("id").eq("stripe_payment_intent_id", p.externalId).maybeSingle();
  if (existing) return false;

  const { data: org } = await db.from("organizations").select("name, currency, timezone").eq("id", sched.org_id).single();
  const { data: customer } = await db.from("customers").select("name, email, phone, sms_consent, sms_opted_out, email_opted_out").eq("id", sched.customer_id).maybeSingle();
  const { data: asset } = sched.aircraft_id
    ? await db.from("aircraft").select("tail_number, manufacturer, model").eq("id", sched.aircraft_id).maybeSingle()
    : { data: null };

  const amount = p.amountCents / 100;
  const currency = (org?.currency ?? p.currency ?? "USD").toUpperCase();
  let month: string;
  try {
    month = p.periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: org?.timezone ?? "UTC" });
  } catch {
    month = p.periodStart.toISOString().slice(0, 7);
  }
  const assetLabel = asset?.tail_number ?? sched.title ?? "your asset";
  const fee = Math.round((p.amountCents * (await orgFeeBps(db, sched.org_id))) / 10000) / 100;
  const ref = `${label(p.provider)} ${p.externalId}`;

  // Invoice record for the company's books, already paid by the card on file.
  const { data: number, error: nErr } = await db.rpc("_next_number", { p_org: sched.org_id, p_kind: "invoice" });
  if (nErr) throw nErr;
  const today = new Date().toISOString().slice(0, 10);
  const { data: created, error: iErr } = await db.from("invoices").insert({
    org_id: sched.org_id, number, customer_id: sched.customer_id, aircraft_id: sched.aircraft_id, branch_id: sched.branch_id,
    status: "sent", issue_date: today, due_date: today, tax_rate: 0, covered_by_plan: false,
    notes: `Monthly care plan — charged automatically to the card on file (${ref}).`,
  }).select("id").single();
  if (iErr) {
    // e.g. SUBSCRIPTION_REQUIRED when the company's own plan lapsed: log, don't retry forever.
    console.error("care plan invoice insert failed", iErr);
    if (String(iErr.message).includes("SUBSCRIPTION_REQUIRED")) return false;
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
    reference: `Care plan ${month} (${ref})`, stripe_payment_intent_id: p.externalId,
    platform_fee: fee, provider: p.provider, received_at: p.paidAt ?? new Date().toISOString(),
  }, { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true }).select("id");
  if (pErr || !pay?.length) {
    // Lost a race with a concurrent delivery: drop the duplicate invoice.
    await db.from("invoices").delete().eq("id", invoiceId);
    if (pErr) throw pErr;
    return false;
  }

  await db.from("activities").insert({
    org_id: sched.org_id, customer_id: sched.customer_id, kind: "system",
    body: `Care plan payment received: ${money(amount, currency)} for ${month}`,
  });

  // Receipt to the customer via the "care_plan_charge" automation (worker sends queued rows).
  const { data: auto } = await db.from("automations").select("enabled, channel, subject, body").eq("org_id", sched.org_id).eq("key", "care_plan_charge").maybeSingle();
  if (!auto?.enabled || !customer) return true;
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
    rows.push({ ...base, channel: "email", to_address: customer.email, subject: render(auto.subject), body: render(auto.body), dedupe_key: `care_plan:${p.externalId}` });
  }
  if ((auto.channel === "sms" || auto.channel === "both") && customer.phone && customer.sms_consent && !customer.sms_opted_out) {
    rows.push({ ...base, channel: "sms", to_address: customer.phone, body: render(auto.body), dedupe_key: auto.channel === "both" ? `care_plan:${p.externalId}:sms` : `care_plan:${p.externalId}` });
  }
  for (const row of rows) {
    const { error } = await db.from("messages").insert(row);
    if (error && error.code !== "23505") console.error("care plan message insert failed", error);
  }
  return true;
}
