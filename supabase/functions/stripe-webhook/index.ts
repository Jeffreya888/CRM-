// Stripe webhook: records invoice payments and keeps Connect status fresh.
// Configure in Stripe Dashboard → Developers → Webhooks with events:
//   checkout.session.completed, checkout.session.async_payment_succeeded,
//   account.updated, charge.refunded
// Enable "Listen to events on Connected accounts" for account.updated.
import { Stripe } from "../_shared/deps.ts";
import { adminClient, stripe } from "../_shared/clients.ts";
import { env } from "../_shared/http.ts";

const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const sig = req.headers.get("Stripe-Signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(raw, sig, env("STRIPE_WEBHOOK_SECRET"), undefined, crypto);
  } catch (e) {
    return new Response(`bad signature: ${(e as Error).message}`, { status: 400 });
  }

  const db = adminClient();
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") break; // ACH settles later via async_payment_succeeded
        const invoiceId = session.metadata?.invoice_id;
        const orgId = session.metadata?.org_id;
        if (!invoiceId || !orgId) break;
        const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
        const method = session.payment_method_types?.includes("us_bank_account") && event.type.includes("async") ? "ach" : "card";
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
        await db.from("activities").insert({
          org_id: orgId,
          kind: "system",
          body: `Online payment received: $${((session.amount_total ?? 0) / 100).toFixed(2)}`,
          customer_id: (await db.from("invoices").select("customer_id").eq("id", invoiceId).single()).data?.customer_id,
        });
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (!pi) break;
        if (charge.refunded) {
          await db.from("payments").delete().eq("stripe_payment_intent_id", pi);
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
