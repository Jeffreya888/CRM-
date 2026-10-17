// Public: Stripe Checkout for the deposit on an accepted quote. The customer
// reaches this from the quote portal page right after signing.
//
// POST { token }  → { url }
// The charge settles to the detailing company's connected account (destination
// charge, like invoice-checkout) with the platform fee for their plan. The
// stripe-webhook marks the deposit paid (metadata.kind = "quote_deposit").
import { adminClient, orgFeeBps, stripe } from "../_shared/clients.ts";
import { error, json, portalUrl, preflight, readJson } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const { token } = await readJson<{ token?: string }>(req);
    if (!token || typeof token !== "string") return error("Missing quote link");
    const db = adminClient();
    const { data: q } = await db
      .from("quotes")
      .select("id, org_id, number, status, deposit_amount, deposit_paid_at, superseded_by, public_token, customer:customers(name, email), org:organizations(name, currency, stripe_account_id, stripe_charges_enabled, payment_mode, is_demo)")
      .eq("public_token", token)
      .maybeSingle();
    if (!q) return error("Quote not found", 404);
    // deno-lint-ignore no-explicit-any
    const org = q.org as any;
    // deno-lint-ignore no-explicit-any
    const customer = q.customer as any;

    if (q.status !== "accepted") return error("Please accept the quote before paying the deposit");
    if (q.deposit_paid_at) return error("The deposit for this quote is already paid");
    const amountCents = Math.round(Number(q.deposit_amount) * 100);
    if (amountCents < 50) return error("This quote has no deposit to pay");
    if (org.is_demo) return error("Payments are turned off in the demo workspace");
    if (org.payment_mode !== "stripe") return error(`${org.name} arranges payment directly. Please contact them to pay the deposit.`);
    if (!org.stripe_account_id || !org.stripe_charges_enabled) return error(`${org.name} has not turned on online payments yet`);

    const fee = Math.round((amountCents * (await orgFeeBps(db, q.org_id))) / 10000);
    const back = `${portalUrl()}/portal/quote/${q.public_token}`;
    const meta = { kind: "quote_deposit", quote_id: q.id, org_id: q.org_id, platform_fee_cents: String(fee) };

    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: customer?.email ?? undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: (org.currency ?? "USD").toLowerCase(),
          unit_amount: amountCents,
          product_data: { name: `${org.name} — Deposit for quote ${q.number}` },
        },
      }],
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: { destination: org.stripe_account_id },
        on_behalf_of: org.stripe_account_id,
        description: `Deposit for quote ${q.number}`,
        metadata: meta,
      },
      metadata: meta,
      success_url: `${back}?deposit=paid`,
      cancel_url: `${back}?deposit=cancelled`,
    }, { idempotencyKey: `deposit-${q.id}-${amountCents}-${Math.floor(Date.now() / 60000)}` });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return error("Could not start the payment. Please try again.", 500);
  }
});
