// In-person payments on an invoice with Square: Tap to Pay on iPhone/Android
// or a paired Square reader, through Square's Mobile Payments SDK in the app.
//
// POST { action: "session", invoice_id, amount? }
//   → { application_id, location_id, access_token, environment, amount_cents, fee_cents, currency, reference_id, note }
//   The SDK signs in to the company's Square account with this token.
// POST { action: "record", invoice_id, payment_id } → { recorded: true }
//   Confirms the payment with Square and records it (the webhook does too).
//
// Caller: a team member who can see prices (owners, admins, and anyone given "See prices").
import { adminClient, callerCanMoney, callerRole, orgFeeBps } from "../_shared/clients.ts";
import { env, error, json, preflight, readJson } from "../_shared/http.ts";
import { getPayment, sellerFor, squareEnvironment, squareRef } from "../_shared/square.ts";
import { recordSquarePayment } from "../_shared/squareBilling.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const { action, invoice_id, payment_id, amount } = await readJson<{ action?: string; invoice_id?: string; payment_id?: string; amount?: number }>(req);
    if (!invoice_id) return error("invoice_id required");
    const db = adminClient();
    const { data: inv } = await db.from("invoices")
      .select("id, org_id, number, status, balance, org:organizations(name, currency, payment_mode, square_charges_enabled, square_location_id, is_demo)")
      .eq("id", invoice_id).maybeSingle();
    if (!inv) return error("Invoice not found", 404);
    const caller = await callerRole(req, inv.org_id);
    if (!caller || !(await callerCanMoney(req, inv.org_id))) return error("Only team members who can see prices can take payments", 403);
    // deno-lint-ignore no-explicit-any
    const org = inv.org as any;
    if (org.is_demo) return error("Payments are turned off in the demo workspace");
    if (!org.square_charges_enabled || !org.square_location_id) return error("Connect Square in Settings → Payments to take card payments in person");
    const seller = await sellerFor(db, inv.org_id);
    if (!seller) return error("Connect Square in Settings → Payments to take card payments in person");

    if (action === "session") {
      if (["draft", "void", "paid"].includes(inv.status)) return error(inv.status === "draft" ? "Send or finalize the invoice first" : `This invoice is ${inv.status}`);
      const balanceCents = Math.round(Number(inv.balance) * 100);
      const amountCents = amount ? Math.round(Number(amount) * 100) : balanceCents;
      if (!Number.isFinite(amountCents) || amountCents < 100) return error("Enter an amount of at least $1.00");
      if (amountCents > balanceCents) return error("That's more than the invoice balance");
      const fee = Math.round((amountCents * (await orgFeeBps(db, inv.org_id))) / 10000);
      return json({
        application_id: env("SQUARE_APPLICATION_ID"), environment: squareEnvironment(),
        access_token: seller.token, location_id: seller.locationId,
        amount_cents: amountCents, fee_cents: fee, currency: (org.currency ?? "USD").toUpperCase(),
        reference_id: squareRef.invoice(inv.id), note: `${org.name} — Invoice ${inv.number}`,
      });
    }

    if (action === "record") {
      if (!payment_id) return error("payment_id required");
      const p = await getPayment(seller, payment_id);
      if (p.reference_id !== squareRef.invoice(inv.id) || p.location_id !== seller.locationId) return error("That payment doesn't belong to this invoice", 400);
      if (p.status !== "COMPLETED") return json({ recorded: false, status: p.status });
      await recordSquarePayment(db, seller, p, "in_person");
      return json({ recorded: true });
    }
    return error("Unknown action");
  } catch (e) {
    console.error(e);
    return error((e as Error).message || "Something went wrong", 500);
  }
});
