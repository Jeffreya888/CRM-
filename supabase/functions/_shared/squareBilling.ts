// Square money flows shared by square-pay, square-reader, square-webhook and
// the automation worker: record a completed payment against whatever it paid
// for, and charge monthly care plans to the card on file.
import type { SupabaseClient } from "./deps.ts";
import { effectivePlan, money, notifyManagers, orgFeeBps } from "./clients.ts";
import { CARE_PLAN_COLS, type CarePlanSchedule, recordCarePlanCharge, recordDeposit, recordInvoicePayment } from "./payments.ts";
import { createPayment, type Seller, sellerFor, SquareError, squareRef, type SquarePayment } from "./square.ts";

/** Records a COMPLETED Square payment once. Safe to call from every path (direct reply, webhook, app). */
export async function recordSquarePayment(db: SupabaseClient, seller: Seller, p: SquarePayment, how: "online" | "in_person" = "online") {
  if (p.status !== "COMPLETED") return;
  const ref = squareRef.parse(p.reference_id);
  if (!ref) return; // not one of ours (e.g. a sale rung up in the Square app)
  const amount = (p.amount_money?.amount ?? 0) / 100;
  const fee = (p.app_fee_money?.amount ?? 0) / 100;
  if (amount <= 0) return;

  if (ref.kind === "invoice") {
    const { data: inv } = await db.from("invoices").select("id, org_id").eq("id", ref.id).maybeSingle();
    if (!inv || inv.org_id !== seller.orgId) return console.warn("Square payment for another company's invoice", p.id);
    const card = p.card_details?.card;
    await recordInvoicePayment(db, {
      orgId: inv.org_id, invoiceId: inv.id, amount, fee, provider: "square", externalId: p.id,
      method: p.source_type === "BANK_ACCOUNT" ? "ach" : "card",
      reference: [how === "in_person" ? "Square in person" : "Square", card?.card_brand && card.last_4 ? `${card.card_brand} •${card.last_4}` : null, p.id]
        .filter(Boolean).join(" · "),
    });
  } else if (ref.kind === "deposit") {
    const { data: q } = await db.from("quotes").select("id, org_id").eq("id", ref.id).maybeSingle();
    if (!q || q.org_id !== seller.orgId) return console.warn("Square payment for another company's quote", p.id);
    await recordDeposit(db, { quoteId: q.id, orgId: q.org_id, externalId: p.id, amount, fee, provider: "square" });
  } else {
    const { data: s } = await db.from("recurring_schedules").select(CARE_PLAN_COLS).eq("id", ref.id).maybeSingle();
    if (!s || s.org_id !== seller.orgId) return console.warn("Square payment for another company's care plan", p.id);
    await recordCarePlanCharge(db, s as CarePlanSchedule, {
      externalId: p.id, amountCents: p.amount_money.amount, currency: p.amount_money.currency, provider: "square",
      periodStart: new Date(p.created_at ?? Date.now()), paidAt: p.updated_at,
    });
  }
}

const RETRY_DAYS = [3, 3, 4]; // after the 1st, 2nd and 3rd failed attempt; the 4th failure stops retrying

function addMonth(d: Date): Date {
  const n = new Date(d);
  const day = n.getUTCDate();
  n.setUTCDate(1);
  n.setUTCMonth(n.getUTCMonth() + 1);
  const last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)).getUTCDate();
  n.setUTCDate(Math.min(day, last));
  return n;
}

type ChargeResult = { ok: true; payment: SquarePayment } | { ok: false; message: string; declined: boolean };

/**
 * Charges one month of a Square care plan to the saved card. `dueAt` is the
 * billing date being paid; the next one is a month after it.
 */
export async function chargeCarePlan(db: SupabaseClient, scheduleId: string, opts: { firstCharge?: boolean } = {}): Promise<ChargeResult> {
  const { data: s } = await db.from("recurring_schedules")
    .select(`${CARE_PLAN_COLS}, care_plan_amount, care_plan_next_charge_at, care_plan_failures, square_card_id, active, paused, billing, care_plan_provider, customer:customers(square_customer_id, email, name), org:organizations(name, currency)`)
    .eq("id", scheduleId).maybeSingle();
  if (!s || s.care_plan_provider !== "square" || s.billing !== "care_plan") return { ok: false, message: "Not a Square care plan", declined: false };
  // deno-lint-ignore no-explicit-any
  const customer = s.customer as any;
  // deno-lint-ignore no-explicit-any
  const org = s.org as any;
  if (!s.square_card_id || !customer?.square_customer_id) return { ok: false, message: "No card on file", declined: false };
  if (!s.active || s.paused) return { ok: false, message: "The plan is paused or ended", declined: false };
  if ((await effectivePlan(db, s.org_id)) === "expired") return { ok: false, message: "The company's subscription has ended", declined: false };
  const seller = await sellerFor(db, s.org_id);
  if (!seller) return { ok: false, message: "Square is not connected", declined: false };

  const amountCents = Math.round(Number(s.care_plan_amount ?? 0) * 100);
  if (amountCents < 100) return { ok: false, message: "The monthly amount is not set", declined: false };
  const dueAt = s.care_plan_next_charge_at ? new Date(s.care_plan_next_charge_at) : new Date();
  const currency = (org?.currency ?? "USD").toUpperCase();
  const fee = Math.round((amountCents * (await orgFeeBps(db, s.org_id))) / 10000);
  try {
    const payment = await createPayment(seller, {
      sourceId: s.square_card_id,
      customerId: customer.square_customer_id,
      // One charge per plan per billing date, even if the worker runs twice.
      idempotencyKey: `cp-${s.id.slice(0, 13)}-${dueAt.toISOString().slice(0, 10)}-${s.square_card_id.slice(-8)}-${s.care_plan_failures ?? 0}`,
      amountCents, feeCents: fee, currency,
      referenceId: squareRef.carePlan(s.id),
      note: `${org?.name ?? ""} monthly care plan${s.title ? ` — ${s.title}` : ""}`,
      buyerEmail: customer.email,
    });
    if (payment.status !== "COMPLETED") throw new Error(`Payment ${payment.status.toLowerCase()}`);
    await recordCarePlanCharge(db, s as CarePlanSchedule, {
      externalId: payment.id, amountCents, currency, provider: "square", periodStart: dueAt, paidAt: payment.updated_at,
    });
    await db.from("recurring_schedules").update({
      care_plan_status: "active", care_plan_failures: 0, care_plan_last_error: null,
      care_plan_next_charge_at: addMonth(opts.firstCharge ? new Date() : dueAt).toISOString(),
    }).eq("id", s.id);
    return { ok: true, payment };
  } catch (e) {
    const declined = e instanceof SquareError && e.category === "PAYMENT_METHOD_ERROR";
    const message = (e as Error).message;
    if (opts.firstCharge) return { ok: false, message, declined };
    const failures = (s.care_plan_failures ?? 0) + 1;
    const retryIn = RETRY_DAYS[failures - 1];
    await db.from("recurring_schedules").update({
      care_plan_status: "past_due", care_plan_failures: failures, care_plan_last_error: message.slice(0, 300),
      care_plan_next_charge_at: retryIn ? new Date(Date.now() + retryIn * 86400_000).toISOString() : null,
    }).eq("id", s.id);
    if (failures === 1 || !retryIn) {
      await notifyManagers(db, s.org_id, "care_plan_failed", "Care plan payment failed",
        `${customer?.name ?? "A customer"}'s ${money(amountCents / 100, currency)} care plan charge was declined. ${retryIn
          ? `We'll retry in ${retryIn} days.`
          : "We stopped retrying. Send them the card link to update their card."}`, `/recurring/${s.id}`);
    }
    return { ok: false, message, declined };
  }
}

/** Worker step: charge every Square care plan whose billing date has come. */
export async function chargeDueCarePlans(db: SupabaseClient) {
  const { data: due, error } = await db.from("recurring_schedules").select("id")
    .eq("care_plan_provider", "square").in("care_plan_status", ["active", "past_due"])
    .lte("care_plan_next_charge_at", new Date().toISOString()).limit(200);
  if (error) throw error;
  let charged = 0, failed = 0;
  for (const row of due ?? []) {
    try {
      const r = await chargeCarePlan(db, row.id);
      if (r.ok) charged++; else failed++;
    } catch (e) {
      failed++;
      console.error("care plan charge crashed", row.id, e);
    }
  }
  return { due: due?.length ?? 0, charged, failed };
}
