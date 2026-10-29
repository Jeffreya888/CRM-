// Square webhook: confirms payments (bank payments settle later, and it backs
// up the direct reply), applies refunds, and notices when a company
// disconnects us from inside Square.
//
// Square Developer Console → Webhooks → Add subscription:
//   URL: https://<project>.supabase.co/functions/v1/square-webhook  (also set as SQUARE_WEBHOOK_URL)
//   Events: payment.created, payment.updated, refund.created, refund.updated, oauth.authorization.revoked
//   Signature key → SQUARE_WEBHOOK_SIGNATURE_KEY
import { adminClient } from "../_shared/clients.ts";
import { env, safeEqual } from "../_shared/http.ts";
import { applyRefund } from "../_shared/payments.ts";
import { getPayment, sellerForMerchant, type SquarePayment } from "../_shared/square.ts";
import { recordSquarePayment } from "../_shared/squareBilling.ts";

async function validSignature(raw: string, sig: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("SQUARE_WEBHOOK_SIGNATURE_KEY")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const url = Deno.env.get("SQUARE_WEBHOOK_URL") ?? `${env("SUPABASE_URL")}/functions/v1/square-webhook`;
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(url + raw)));
  return safeEqual(btoa(String.fromCharCode(...mac)), sig);
}

type Event = {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  data?: { object?: { payment?: SquarePayment; refund?: { payment_id?: string; status?: string } } };
};

Deno.serve(async (req) => {
  const sig = req.headers.get("x-square-hmacsha256-signature");
  const raw = await req.text();
  if (!sig || !(await validSignature(raw, sig))) return new Response("bad signature", { status: 401 });
  let event: Event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad body", { status: 400 });
  }
  const db = adminClient();
  try {
    const merchant = event.merchant_id;
    if (!merchant) return new Response("ok");

    if (event.type === "oauth.authorization.revoked") {
      const { data: org } = await db.from("organizations").select("id, payment_mode, stripe_charges_enabled").eq("square_merchant_id", merchant).maybeSingle();
      if (org) {
        await db.from("square_connections").delete().eq("org_id", org.id);
        await db.from("organizations").update({
          square_merchant_id: null, square_location_id: null, square_location_name: null, square_charges_enabled: false, square_connected_at: null,
          ...(org.payment_mode === "square" ? { payment_mode: org.stripe_charges_enabled ? "stripe" : "direct" } : {}),
        }).eq("id", org.id);
        await db.from("recurring_schedules").update({ care_plan_status: "canceled", care_plan_next_charge_at: null })
          .eq("org_id", org.id).eq("care_plan_provider", "square").in("care_plan_status", ["pending", "active", "past_due"]);
        await db.from("activities").insert({ org_id: org.id, kind: "system", body: "Square was disconnected from the Square dashboard" });
      }
      return new Response("ok");
    }

    const seller = await sellerForMerchant(db, merchant);
    if (!seller) return new Response("ok"); // a seller no longer connected

    if (event.type === "payment.created" || event.type === "payment.updated") {
      const p = event.data?.object?.payment;
      if (p?.status === "COMPLETED") await recordSquarePayment(db, seller, p);
    } else if (event.type === "refund.created" || event.type === "refund.updated") {
      const r = event.data?.object?.refund;
      if (r?.payment_id && r.status === "COMPLETED") {
        const { data: row } = await db.from("payments").select("id").eq("stripe_payment_intent_id", r.payment_id).eq("provider", "square").maybeSingle();
        const { data: dep } = await db.from("quotes").select("id").eq("deposit_payment_intent", r.payment_id).maybeSingle();
        if (row || dep) {
          // The payment's own totals are the source of truth for partial refunds.
          const p = await getPayment(seller, r.payment_id);
          const remaining = ((p.amount_money?.amount ?? 0) - (p.refunded_money?.amount ?? 0)) / 100;
          await applyRefund(db, r.payment_id, remaining);
        }
      }
    }
  } catch (e) {
    console.error(e);
    return new Response("handler error", { status: 500 }); // Square retries
  }
  return new Response("ok");
});
