// Public: Square payments from the customer pages (no login). The page shows
// Square's secure card form (Web Payments SDK), which turns the card into a
// one-time token; this function charges it on the detailing company's Square
// account with the platform fee, or saves it for a monthly care plan.
//
// POST { action: "config", kind: "invoice" | "deposit" | "care_plan", token }
//   → { application_id, location_id, environment, amount, currency, label, customer }
// POST { action: "pay", kind: "invoice" | "deposit", token, source_id, idempotency_key }
//   → { status: "paid" | "pending" }
// POST { action: "care_plan_start", token, source_id, idempotency_key, cardholder_name? }
//   → { status: "active" }   saves the card and charges the first month
import { adminClient, notifyManagers, orgFeeBps } from "../_shared/clients.ts";
import { env, error, json, preflight, readJson } from "../_shared/http.ts";
import { chargeCarePlan, recordSquarePayment } from "../_shared/squareBilling.ts";
import {
  createPayment, disableCard, ensureSquareCustomer, saveCard, sellerFor, SquareError, squareDeclineMessage, squareEnvironment,
  squareRef,
} from "../_shared/square.ts";
import type { SupabaseClient } from "../_shared/deps.ts";

type Body = { action?: string; kind?: string; token?: string; source_id?: string; idempotency_key?: string; cardholder_name?: string };
type Payable = {
  orgId: string; amountCents: number; currency: string; label: string; referenceId: string;
  customer: { name: string | null; email: string | null };
};

const orgCols = "name, currency, payment_mode, square_charges_enabled, square_location_id, is_demo";

// deno-lint-ignore no-explicit-any
function checkOrg(org: any): string | null {
  if (!org) return "Not found";
  if (org.is_demo) return "Payments are turned off in the demo workspace";
  if (org.payment_mode !== "square" || !org.square_charges_enabled || !org.square_location_id) {
    return `${org.name} isn't taking Square payments right now. Please contact them to pay.`;
  }
  return null;
}

/** What the token is for and how much is owed right now (never trusts the page). */
async function payable(db: SupabaseClient, kind: string, token: string): Promise<Payable | string> {
  if (kind === "invoice") {
    const { data: inv } = await db.from("invoices")
      .select(`id, org_id, number, status, balance, customer:customers(name, email), org:organizations(${orgCols})`)
      .eq("public_token", token).maybeSingle();
    if (!inv) return "Invoice not found";
    // deno-lint-ignore no-explicit-any
    const org = inv.org as any;
    const bad = checkOrg(org);
    if (bad) return bad;
    if (["draft", "void", "paid"].includes(inv.status)) return `This invoice is ${inv.status}`;
    const amountCents = Math.round(Number(inv.balance) * 100);
    if (amountCents < 100) return "Nothing left to pay";
    return {
      orgId: inv.org_id, amountCents, currency: (org.currency ?? "USD").toUpperCase(),
      label: `${org.name} — Invoice ${inv.number}`, referenceId: squareRef.invoice(inv.id),
      // deno-lint-ignore no-explicit-any
      customer: { name: (inv.customer as any)?.name ?? null, email: (inv.customer as any)?.email ?? null },
    };
  }
  if (kind === "deposit") {
    const { data: q } = await db.from("quotes")
      .select(`id, org_id, number, status, deposit_amount, deposit_paid_at, customer:customers(name, email), org:organizations(${orgCols})`)
      .eq("public_token", token).maybeSingle();
    if (!q) return "Quote not found";
    // deno-lint-ignore no-explicit-any
    const org = q.org as any;
    const bad = checkOrg(org);
    if (bad) return bad;
    if (q.status !== "accepted") return "Please accept the quote before paying the deposit";
    if (q.deposit_paid_at) return "The deposit for this quote is already paid";
    const amountCents = Math.round(Number(q.deposit_amount) * 100);
    if (amountCents < 100) return "This quote has no deposit to pay";
    return {
      orgId: q.org_id, amountCents, currency: (org.currency ?? "USD").toUpperCase(),
      label: `${org.name} — Deposit for quote ${q.number}`, referenceId: squareRef.deposit(q.id),
      // deno-lint-ignore no-explicit-any
      customer: { name: (q.customer as any)?.name ?? null, email: (q.customer as any)?.email ?? null },
    };
  }
  if (kind === "care_plan") {
    const { data: s } = await db.from("recurring_schedules")
      .select(`id, org_id, title, care_plan_amount, care_plan_status, billing, active, care_plan_provider, customer:customers(name, email), org:organizations(${orgCols})`)
      .eq("care_plan_token", token).maybeSingle();
    if (!s || s.care_plan_provider !== "square" || s.billing !== "care_plan" || !s.active) return "Care plan not found";
    // deno-lint-ignore no-explicit-any
    const org = s.org as any;
    const bad = checkOrg(org);
    if (bad) return bad;
    if (s.care_plan_status === "canceled") return "This care plan was canceled. Please contact the business.";
    const amountCents = Math.round(Number(s.care_plan_amount ?? 0) * 100);
    if (amountCents < 100) return "The monthly amount isn't set yet. Please contact the business.";
    return {
      orgId: s.org_id, amountCents, currency: (org.currency ?? "USD").toUpperCase(),
      label: `${org.name} — Monthly care plan${s.title ? ` (${s.title})` : ""}`, referenceId: squareRef.carePlan(s.id),
      // deno-lint-ignore no-explicit-any
      customer: { name: (s.customer as any)?.name ?? null, email: (s.customer as any)?.email ?? null },
    };
  }
  return "Unknown payment";
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const body = await readJson<Body>(req);
  const { action, token } = body;
  const kind = action === "care_plan_start" ? "care_plan" : body.kind ?? "";
  if (!token || typeof token !== "string" || token.length > 200) return error("Missing payment link");
  const db = adminClient();
  try {
    const p = await payable(db, kind, token);
    if (typeof p === "string") return error(p);

    if (action === "config") {
      const { data: org } = await db.from("organizations").select("square_location_id").eq("id", p.orgId).single();
      return json({
        application_id: env("SQUARE_APPLICATION_ID"), location_id: org?.square_location_id,
        environment: squareEnvironment(), amount: p.amountCents / 100, currency: p.currency, label: p.label, customer: p.customer,
      });
    }

    const sourceId = body.source_id;
    const idem = body.idempotency_key;
    if (!sourceId || typeof sourceId !== "string" || !idem || typeof idem !== "string") return error("Missing card details");
    const seller = await sellerFor(db, p.orgId);
    if (!seller) return error("This business hasn't finished setting up Square payments");

    if (action === "pay" && (kind === "invoice" || kind === "deposit")) {
      const fee = Math.round((p.amountCents * (await orgFeeBps(db, p.orgId))) / 10000);
      let payment;
      try {
        payment = await createPayment(seller, {
          sourceId, idempotencyKey: idem, amountCents: p.amountCents, feeCents: fee, currency: p.currency,
          referenceId: p.referenceId, note: p.label, buyerEmail: p.customer.email,
        });
      } catch (e) {
        if (e instanceof SquareError && e.category === "PAYMENT_METHOD_ERROR") return error(squareDeclineMessage(e), 402);
        throw e;
      }
      if (payment.status === "COMPLETED") {
        await recordSquarePayment(db, seller, payment);
        return json({ status: "paid" });
      }
      if (payment.status === "APPROVED" || payment.status === "PENDING") return json({ status: "pending" }); // bank payments settle later (webhook)
      return error("The payment was not completed. Please try again.", 402);
    }

    if (action === "care_plan_start") {
      const { data: s } = await db.from("recurring_schedules")
        .select("id, customer_id, square_card_id, care_plan_status, care_plan_next_charge_at, customer:customers(id, name, email, phone, square_customer_id)")
        .eq("care_plan_token", token).single();
      // deno-lint-ignore no-explicit-any
      const customer = s!.customer as any;
      const squareCustomerId = await ensureSquareCustomer(db, seller, customer);
      let card;
      try {
        card = await saveCard(seller, {
          sourceId, squareCustomerId, referenceId: s!.id, idempotencyKey: idem, cardholderName: body.cardholder_name ?? customer.name,
        });
      } catch (e) {
        if (e instanceof SquareError && (e.category === "PAYMENT_METHOD_ERROR" || e.status === 400)) return error(squareDeclineMessage(e), 402);
        throw e;
      }
      const oldCard = s!.square_card_id;
      // A plan that is current keeps its billing date (this is a card update);
      // a new or overdue plan is charged now.
      const current = s!.care_plan_status === "active" && s!.care_plan_next_charge_at && new Date(s!.care_plan_next_charge_at) > new Date();
      await db.from("recurring_schedules").update({
        square_card_id: card.id, care_plan_failures: 0, care_plan_last_error: null,
        ...(current ? {} : { care_plan_next_charge_at: new Date().toISOString() }),
      }).eq("id", s!.id);
      if (oldCard && oldCard !== card.id) await disableCard(seller, oldCard);
      if (current) return json({ status: "active", updated: true });

      const r = await chargeCarePlan(db, s!.id, { firstCharge: s!.care_plan_status !== "past_due" });
      if (!r.ok) {
        await disableCard(seller, card.id);
        await db.from("recurring_schedules").update({ square_card_id: oldCard ?? null }).eq("id", s!.id);
        return error(r.declined ? "The card was declined. Please use another card." : r.message, 402);
      }
      await db.from("activities").insert({ org_id: p.orgId, customer_id: s!.customer_id, kind: "system", body: "Monthly care plan started (card on file with Square)" });
      await notifyManagers(db, p.orgId, "care_plan_started", "Care plan started", `${customer.name ?? "A customer"} signed up for their monthly care plan`, `/recurring/${s!.id}`);
      return json({ status: "active" });
    }
    return error("Unknown action");
  } catch (e) {
    console.error(e);
    return error("Could not complete the payment. Please try again.", 500);
  }
});
