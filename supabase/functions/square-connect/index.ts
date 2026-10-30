// Connects a detailing company's Square account (OAuth) so customers can pay
// invoices, deposits and care plans through Square, and the team can take
// in-person payments with Tap to Pay or a Square reader. Same platform fee as Stripe.
//
// POST { org_id, action: "start", return_url? }  → { url }  Square sign-in page
// GET  ?code&state                                 Square redirects here after approval
// POST { org_id, action: "status" }               → { connected, charges_enabled, location_id, location_name, locations }
// POST { org_id, action: "set_location", location_id }
// POST { org_id, action: "disconnect" }
//
// Square Developer Console → OAuth → Redirect URL:
//   https://<project>.supabase.co/functions/v1/square-connect
import { adminClient, callerRole } from "../_shared/clients.ts";
import { corsHeaders, error, json, portalUrl } from "../_shared/http.ts";
import {
  authorizeUrl, cardLocations, obtainToken, revokeSeller, saveConnection, sellerFor, signState, squareConfigured,
  squareFetch, verifyState,
} from "../_shared/square.ts";

const ADMIN_ROLES = ["owner", "admin"];

/** Only our own app or website as the place to come back to (no open redirect). */
function safeBack(u: unknown): string {
  const portal = portalUrl();
  if (typeof u === "string") {
    if (u === portal || u.startsWith(`${portal}/`)) return u;
    if (/^tarmo:\/\//.test(u) || /^exp(s)?:\/\//.test(u)) return u;
  }
  return `${portal}/settings`;
}

function backTo(url: string, params: Record<string, string>) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return await callback(req);
  try {
    if (!squareConfigured()) return error("Square isn't set up on this platform yet.", 503);
    const { org_id, action, return_url, location_id } = await req.json();
    if (!org_id) return error("org_id required");
    const caller = await callerRole(req, org_id);
    if (!caller || !ADMIN_ROLES.includes(caller.role)) return error("Only owners and admins can manage payments", 403);
    const db = adminClient();
    const { data: org } = await db.from("organizations").select("id, is_demo, square_merchant_id, square_location_id, payment_mode, stripe_charges_enabled").eq("id", org_id).single();
    if (!org) return error("Organization not found", 404);

    if (action === "start") {
      if (org.is_demo) return error("Payments can't be connected in the demo workspace. Create your own company to set up Square.");
      const state = await signState({ org: org_id, user: caller.userId, back: safeBack(return_url), exp: Date.now() + 15 * 60_000 });
      return json({ url: authorizeUrl(state) });
    }

    if (action === "status" || action === "set_location") {
      const seller = await sellerFor(db, org_id);
      if (!seller) return json({ connected: false, charges_enabled: false, locations: [] });
      const locations = await cardLocations(seller.token);
      let chosen = locations.find((l) => l.id === (action === "set_location" ? location_id : org.square_location_id)) ?? null;
      if (action === "set_location" && !chosen) return error("That location can't take card payments");
      if (!chosen && locations.length === 1) chosen = locations[0];
      await db.from("organizations").update({
        square_location_id: chosen?.id ?? null,
        square_location_name: chosen?.name ?? null,
        square_charges_enabled: !!chosen,
      }).eq("id", org_id);
      return json({
        connected: true, charges_enabled: !!chosen, location_id: chosen?.id ?? null, location_name: chosen?.name ?? null,
        locations: locations.map((l) => ({ id: l.id, name: l.name ?? l.id })),
      });
    }

    if (action === "disconnect") {
      if (org.square_merchant_id) {
        try {
          await revokeSeller(org.square_merchant_id);
        } catch (e) {
          console.warn("Square revoke failed", (e as Error).message); // still disconnect here
        }
      }
      await db.from("square_connections").delete().eq("org_id", org_id);
      await db.from("organizations").update({
        square_merchant_id: null, square_location_id: null, square_location_name: null, square_charges_enabled: false, square_connected_at: null,
        ...(org.payment_mode === "square" ? { payment_mode: org.stripe_charges_enabled ? "stripe" : "direct" } : {}),
      }).eq("id", org_id);
      // Square care plans can't charge without the connection.
      await db.from("recurring_schedules").update({ care_plan_status: "canceled", care_plan_next_charge_at: null })
        .eq("org_id", org_id).eq("care_plan_provider", "square").in("care_plan_status", ["pending", "active", "past_due"]);
      return json({ ok: true });
    }
    return error("Unknown action");
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});

/** Square sends the owner back here with ?code&state (or ?error). */
async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = await verifyState(url.searchParams.get("state") ?? "");
  if (!state) return new Response("This Square sign-in link expired. Please start again from Settings → Payments.", { status: 400 });
  const code = url.searchParams.get("code");
  if (!code) return backTo(state.back, { square: "cancelled" });
  const db = adminClient();
  try {
    // The person who started must still be an owner/admin of the company.
    const { data: m } = await db.from("memberships").select("role").eq("org_id", state.org).eq("user_id", state.user).eq("active", true).maybeSingle();
    if (!m || !["owner", "admin"].includes(m.role)) return backTo(state.back, { square: "error", reason: "not_allowed" });

    const tok = await obtainToken({ code });
    const { data: other } = await db.from("organizations").select("id").eq("square_merchant_id", tok.merchant_id).neq("id", state.org).maybeSingle();
    if (other) return backTo(state.back, { square: "error", reason: "in_use" });
    if (!tok.refresh_token) throw new Error("Square did not return a refresh token");
    await saveConnection(db, state.org, tok, tok.refresh_token);

    const locations = await cardLocations(tok.access_token);
    const main = locations[0] ?? null;
    const { error: uErr } = await db.from("organizations").update({
      square_merchant_id: tok.merchant_id,
      square_location_id: main?.id ?? null,
      square_location_name: main?.name ?? null,
      square_charges_enabled: !!main,
      square_connected_at: new Date().toISOString(),
      payment_mode: "square",
    }).eq("id", state.org);
    if (uErr) throw uErr;

    // Apple Pay on our payment pages, for this seller (needs the domain file hosted; see docs).
    try {
      const host = new URL(portalUrl()).hostname;
      await squareFetch("v2/apple-pay/domains", { token: tok.access_token, body: { domain_name: host } });
    } catch (e) {
      console.warn("Apple Pay domain registration skipped", (e as Error).message);
    }
    await db.from("activities").insert({ org_id: state.org, kind: "system", body: "Square connected for payments", created_by: state.user });
    return backTo(state.back, { square: main ? "connected" : "no_location" });
  } catch (e) {
    console.error("Square connect failed", e);
    return backTo(state.back, { square: "error" });
  }
}
