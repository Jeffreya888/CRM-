// Franchise network billing (Stripe, platform account).
//
// POST { action: 'status', network_id }    → { mode, founding, status, locations, billed_locations, monthly_cents, paid_through }
//      HQ admins and platform admins.
// POST { action: 'checkout', network_id }  → { url }   HQ owner starts card billing (Stripe Checkout).
// POST { action: 'invoice', network_id }   → { ok }    Platform admin bills the HQ by invoice, net 30.
// POST { action: 'sync', network_id }      → { locations, changed }  Updates Stripe to the current number of locations.
// Support sets the mode (all_in / split) and founding rate in Platform admin first.
import { adminClient, callerRole, userClient } from "../_shared/clients.ts";
import { error, json, portalUrl, preflight, readJson } from "../_shared/http.ts";
import { billingCustomer } from "../_shared/stripeCustomer.ts";
import {
  type BillingMode, foundingNetworkCoupon, franchiseCents, franchisePrice, locationCount, NETWORK_COLS, type NetworkRow, syncNetwork,
} from "../_shared/franchiseBilling.ts";
import { stripe } from "../_shared/clients.ts";
import { reportError } from "../_shared/errors.ts";

type Body = { action?: string; network_id?: string };
const LIVE = ["active", "trialing", "past_due"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const body = await readJson<Body>(req);
    if (typeof body.network_id !== "string") return error("network_id required");
    const db = adminClient();
    const { data: net } = await db.from("franchise_networks").select(`${NETWORK_COLS}, paid_through`).eq("id", body.network_id).maybeSingle();
    if (!net) return error("Network not found", 404);
    const n = net as NetworkRow & { paid_through: string | null };

    const { data: { user } } = await userClient(req).auth.getUser();
    if (!user) return error("Sign in first", 401);
    const { data: pa } = await db.from("platform_admins").select("user_id, role").eq("user_id", user.id).maybeSingle();
    const platformAdmin = pa?.role === "owner";
    const caller = await callerRole(req, n.hq_org_id);
    const hqAdmin = !!caller && (caller.role === "owner" || caller.role === "admin");
    if (!platformAdmin && !hqAdmin) return error("Only franchise HQ admins can see network billing", 403);

    const locations = await locationCount(db, n.id);
    const active = !!n.stripe_subscription_id && LIVE.includes(n.billing_status ?? "");

    switch (body.action) {
      case "status":
        return json({
          mode: n.billing_mode, founding: n.founding_rate, status: n.billing_status, active, locations,
          billed_locations: n.billed_locations, paid_through: n.paid_through,
          monthly_cents: n.billing_mode ? franchiseCents(n.billing_mode, locations) : null,
        });

      case "checkout": {
        if (caller?.role !== "owner") return error("Only the HQ company owner can start billing", 403);
        if (!n.billing_mode) return error("Your network billing hasn't been set up yet. Contact us and we'll set it up.", 409);
        if (active) return error("Billing is already active. Use Manage billing to change your card or see invoices.", 409);
        const { data: org } = await db.from("organizations").select("id, name, email, stripe_billing_customer_id, is_demo").eq("id", n.hq_org_id).single();
        if (!org) return error("HQ company not found", 404);
        if (org.is_demo) return error("DEMO: purchases are turned off in the demo workspace");
        const customer = await billingCustomer(db, org, user.id);
        const price = await franchisePrice(n.billing_mode as BillingMode);
        const meta = { kind: "franchise_hq", network_id: n.id, org_id: n.hq_org_id, mode: n.billing_mode };
        const founding = n.billing_mode === "all_in" && n.founding_rate;
        const session = await stripe().checkout.sessions.create({
          mode: "subscription",
          customer,
          client_reference_id: n.hq_org_id,
          line_items: [{ price, quantity: Math.max(1, locations) }],
          ...(founding ? { discounts: [{ coupon: await foundingNetworkCoupon() }] } : {}),
          subscription_data: { metadata: meta },
          metadata: meta,
          success_url: `${portalUrl()}/franchise?billing=success`,
          cancel_url: `${portalUrl()}/franchise?billing=cancelled`,
        });
        return json({ url: session.url });
      }

      case "invoice": {
        if (!platformAdmin) return error("Only Tarmo support can set up invoice billing", 403);
        if (!n.billing_mode) return error("Choose all-in or split billing first");
        if (active) return error("Billing is already active for this network", 409);
        const { data: org } = await db.from("organizations").select("id, name, email, stripe_billing_customer_id").eq("id", n.hq_org_id).single();
        if (!org) return error("HQ company not found", 404);
        const { data: owner } = await db.from("memberships").select("user_id").eq("org_id", n.hq_org_id).eq("role", "owner").eq("active", true).limit(1).maybeSingle();
        if (!owner) return error("The HQ company has no owner");
        const customer = await billingCustomer(db, org, owner.user_id);
        const price = await franchisePrice(n.billing_mode as BillingMode);
        const founding = n.billing_mode === "all_in" && n.founding_rate;
        const sub = await stripe().subscriptions.create({
          customer,
          collection_method: "send_invoice",
          days_until_due: 30,
          items: [{ price, quantity: Math.max(1, locations) }],
          ...(founding ? { discounts: [{ coupon: await foundingNetworkCoupon() }] } : {}),
          metadata: { kind: "franchise_hq", network_id: n.id, org_id: n.hq_org_id, mode: n.billing_mode },
        });
        await db.from("franchise_networks").update({ stripe_subscription_id: sub.id, billing_status: sub.status, billed_locations: Math.max(1, locations) }).eq("id", n.id);
        await db.rpc("platform_audit", { p_action: "franchise_invoice_billing_started", p_org: n.hq_org_id, p_details: { mode: n.billing_mode, locations }, p_actor: user.id });
        return json({ ok: true });
      }

      case "sync":
        return json(await syncNetwork(db, n));

      default:
        return error("Unknown request");
    }
  } catch (e) {
    reportError("franchise-billing", e);
    return error("Could not update network billing. Please try again in a moment.", 500);
  }
});
