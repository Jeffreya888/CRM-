// Creates a Stripe Checkout session for an invoice's open balance on the
// detailing company's connected account, with the platform fee applied.
// Callable by a team member (Authorization header + invoice_id) or by the
// end customer from the public portal (public_token, no login).
//
// POST { invoice_id } | { public_token }, optional { success_url, cancel_url }
// Card + ACH availability is configured in Stripe Dashboard → Payment methods.
import { adminClient, callerRole, platformFeeBps, stripe } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const db = adminClient();
    const query = db
      .from("invoices")
      .select("id, org_id, number, status, balance, public_token, customer:customers(name, email), org:organizations(name, currency, stripe_account_id, stripe_charges_enabled, plan)");
    const { data: inv } = body.public_token
      ? await query.eq("public_token", body.public_token).maybeSingle()
      : await query.eq("id", body.invoice_id ?? "").maybeSingle();
    if (!inv) return error("Invoice not found", 404);

    if (!body.public_token) {
      const caller = await callerRole(req, inv.org_id);
      if (!caller || !["owner", "admin", "manager"].includes(caller.role)) return error("Not allowed", 403);
    }

    // deno-lint-ignore no-explicit-any
    const org = inv.org as any;
    // deno-lint-ignore no-explicit-any
    const customer = inv.customer as any;
    if (["draft", "void", "paid"].includes(inv.status)) return error(`Invoice is ${inv.status}`);
    if (!org.stripe_account_id || !org.stripe_charges_enabled) return error("This business has not enabled online payments yet");
    const amountCents = Math.round(Number(inv.balance) * 100);
    if (amountCents < 50) return error("Nothing left to pay");

    const fee = Math.round((amountCents * platformFeeBps(org.plan)) / 10000);
    const portal = Deno.env.get("PORTAL_URL") ?? "https://example.com";
    const docUrl = `${portal}/portal/invoice/${inv.public_token}`;

    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: customer?.email ?? undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: (org.currency ?? "USD").toLowerCase(),
          unit_amount: amountCents,
          product_data: { name: `${org.name} — Invoice ${inv.number}` },
        },
      }],
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: { destination: org.stripe_account_id },
        on_behalf_of: org.stripe_account_id,
        metadata: { invoice_id: inv.id, org_id: inv.org_id },
      },
      metadata: { invoice_id: inv.id, org_id: inv.org_id, platform_fee_cents: String(fee) },
      success_url: body.success_url ?? `${docUrl}?paid=1`,
      cancel_url: body.cancel_url ?? docUrl,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
