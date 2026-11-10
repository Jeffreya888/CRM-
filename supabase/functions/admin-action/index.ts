// Tarmo platform admin actions (users listed in platform_admins only).
// POST { action: 'set_sms', org_id, status, number? }
//      { action: 'set_integration', id, status }
//      { action: 'support_handled', id }
//      { action: 'find_orgs', query } → { orgs }
//      { action: 'set_enterprise', org_id, franchise_hq_enabled?, branch_limit? (number | null) }
//      { action: 'set_franchise_billing', network_id, mode: 'all_in'|'split', founding? }
//      { action: 'send_franchise_quote', to, brand, locations, contact_name?, current_per_location?, tech_fee?, founding? }
// → { ok: true }
import { adminClient, userClient } from "../_shared/clients.ts";
import { corsHeaders, error, json, portalUrl } from "../_shared/http.ts";
import { outbox } from "../_shared/automation.ts";
import { toE164 } from "../_shared/sms.ts";
import { emailLayout, isEmail, sendEmail } from "../_shared/email.ts";
import { quoteEmail } from "../_shared/franchiseQuote.ts";
import { reportError } from "../_shared/errors.ts";

const SMS_STATUSES = ["not_requested", "pending", "active", "suspended"];
const INTEGRATION_STATUSES = ["prepared", "sent_to_vendor", "approved", "live", "declined"];
const PROVIDERS: Record<string, string> = {
  fl3xx: "FL3XX", leon: "Leon", schedaero: "Schedaero", airplane_manager: "Airplane Manager", avianis: "Avianis", flight_schedule_pro: "Flight Schedule Pro",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { data: { user } } = await userClient(req).auth.getUser();
    if (!user) return error("Sign in first", 401);
    const db = adminClient();
    const { data: admin } = await db.from("platform_admins").select("user_id, role").eq("user_id", user.id).maybeSingle();
    if (!admin) return error("Not allowed", 403);

    const body = await req.json().catch(() => ({}));
    // Support staff answer messages and look up companies; everything that changes billing or settings is owners only.
    const SUPPORT_OK = ["support_handled", "find_orgs"];
    if (admin.role !== "owner" && !SUPPORT_OK.includes(body.action)) return error("Only Tarmo owners can do that", 403);
    // Activity log: who did what, for which company.
    const audit = (action: string, orgId: string | null, details: Record<string, unknown> = {}) =>
      db.rpc("platform_audit", { p_action: action, p_org: orgId, p_details: details, p_actor: user.id }).then(() => {}, () => {});
    switch (body.action) {
      case "set_sms": {
        const { org_id, status } = body;
        if (typeof org_id !== "string" || !SMS_STATUSES.includes(status)) return error("org_id and a valid status are required");
        const patch: Record<string, unknown> = { sms_status: status };
        if (body.number) {
          const n = toE164(body.number);
          if (!n) return error("Enter the number in international format, e.g. +15551234567");
          const { data: taken } = await db.from("organizations").select("id").eq("sms_number", n).neq("id", org_id).maybeSingle();
          if (taken) return error("That number is already assigned to another company");
          patch.sms_number = n;
        }
        const { data: org } = await db.from("organizations").select("id, sms_number, is_demo").eq("id", org_id).maybeSingle();
        if (!org) return error("Company not found", 404);
        if (status === "active" && !(patch.sms_number ?? org.sms_number)) return error("A texting number is required to activate texting");
        if (status === "active" && org.is_demo) return error("Demo companies cannot text");
        const { error: e } = await db.from("organizations").update(patch).eq("id", org_id);
        if (e) throw e;
        await audit("texting_status_set", org_id, { status, number: patch.sms_number ?? null });
        if (status === "active") {
          await outbox(db, { org_id, audience: "owners", kind: "texting_ready", title: "Customer texting is ready", body: `Your texting number is ${patch.sms_number ?? org.sms_number}. Turn texting on in Customer texting.`, url: "/texting" });
        } else if (status === "suspended") {
          await outbox(db, { org_id, audience: "owners", kind: "texting_suspended", title: "Customer texting is paused", body: "Contact Tarmo support for details.", url: "/texting" });
        }
        return json({ ok: true });
      }
      case "set_integration": {
        const { id, status } = body;
        if (typeof id !== "string" || !INTEGRATION_STATUSES.includes(status)) return error("id and a valid status are required");
        const { data: r, error: e } = await db.from("integration_requests").update({ status }).eq("id", id).select("org_id, provider").maybeSingle();
        if (e) throw e;
        if (!r) return error("Request not found", 404);
        await audit("integration_status_set", r.org_id, { provider: r.provider, status });
        if (status === "approved" || status === "live") {
          await outbox(db, {
            org_id: r.org_id, audience: "owners", kind: "integration_status",
            title: `${PROVIDERS[r.provider] ?? r.provider} connection ${status === "live" ? "is live" : "approved"}`,
            body: status === "live" ? "Your external schedule now shows in Tarmo." : "The vendor granted access. We are finishing the connection.",
            url: "/integrations",
          });
        }
        return json({ ok: true });
      }
      case "support_handled": {
        if (typeof body.id !== "string") return error("id required");
        const { data: sm, error: e } = await db.from("support_messages").update({ handled: body.handled !== false }).eq("id", body.id).select("org_id, email").maybeSingle();
        if (e) throw e;
        await audit("support_message_handled", sm?.org_id ?? null, { from: sm?.email ?? null });
        return json({ ok: true });
      }
      case "find_orgs": {
        // Enterprise & franchise setup: search companies by name or owner email.
        const q = typeof body.query === "string" ? body.query.trim() : "";
        if (q.length < 2) return error("Type at least 2 letters");
        const like = `%${q.replace(/[%_,()]/g, " ")}%`;
        const { data: orgs, error: e } = await db.from("organizations")
          .select("id, name, email, plan, plan_expires_at, billing_source, billing_period, extra_locations, branch_limit, franchise_hq_enabled, is_demo")
          .or(`name.ilike.${like},email.ilike.${like}`).eq("is_demo", false).order("name").limit(20);
        if (e) throw e;
        const ids = (orgs ?? []).map((o) => o.id);
        const { data: br } = ids.length ? await db.from("branches").select("org_id").in("org_id", ids).eq("active", true) : { data: [] };
        const { data: nets } = ids.length
          ? await db.from("franchise_networks").select("id, hq_org_id, name, billing_mode, founding_rate, billing_status, billed_locations, paid_through").in("hq_org_id", ids)
          : { data: [] };
        const count = (id: string) => (br ?? []).filter((b) => b.org_id === id).length;
        return json({
          orgs: (orgs ?? []).map((o) => {
            const network = (nets ?? []).find((n) => n.hq_org_id === o.id) ?? null;
            return { ...o, active_locations: count(o.id), has_network: !!network, network };
          }),
        });
      }
      case "set_enterprise": {
        const { org_id } = body;
        if (typeof org_id !== "string") return error("org_id required");
        const patch: Record<string, unknown> = {};
        if (typeof body.franchise_hq_enabled === "boolean") patch.franchise_hq_enabled = body.franchise_hq_enabled;
        if ("branch_limit" in body) {
          const n = body.branch_limit;
          if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= 1000)) return error("Location limit must be 1–1,000, or empty for the plan default");
          patch.branch_limit = n;
        }
        if (!Object.keys(patch).length) return error("Nothing to change");
        const { data: r, error: e } = await db.from("organizations").update(patch).eq("id", org_id).select("id").maybeSingle();
        if (e) throw e;
        if (!r) return error("Company not found", 404);
        await audit("enterprise_settings_set", org_id, patch);
        if (patch.franchise_hq_enabled === true) {
          await outbox(db, { org_id, audience: "owners", kind: "franchise_hq_ready", title: "Franchise HQ is ready", body: "Set up your franchise network in Franchise HQ.", url: "/franchise" });
        }
        return json({ ok: true });
      }
      case "set_franchise_billing": {
        // Which way the network pays, and whether it gets the founding network rate (all-in only).
        const { network_id, mode } = body;
        if (typeof network_id !== "string") return error("network_id required");
        if (mode !== "all_in" && mode !== "split") return error("Choose all-in or split");
        const { data: net } = await db.from("franchise_networks").select("id, stripe_subscription_id, billing_status, billing_mode").eq("id", network_id).maybeSingle();
        if (!net) return error("Network not found", 404);
        const live = !!net.stripe_subscription_id && ["active", "trialing", "past_due"].includes(net.billing_status ?? "");
        if (live && net.billing_mode !== mode) return error("Billing is already running. Cancel it in Stripe before switching all-in and split.", 409);
        const { error: e } = await db.from("franchise_networks").update({ billing_mode: mode, founding_rate: mode === "all_in" && body.founding === true }).eq("id", network_id);
        if (e) throw e;
        const { data: nw } = await db.from("franchise_networks").select("hq_org_id").eq("id", network_id).maybeSingle();
        await audit("franchise_billing_set", nw?.hq_org_id ?? null, { mode, founding: mode === "all_in" && body.founding === true });
        return json({ ok: true });
      }
      case "send_franchise_quote": {
        // Emails a brand its franchise network quote; the admin who sends it gets a copy and the replies.
        const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
        const brand = typeof body.brand === "string" ? body.brand.trim().slice(0, 120) : "";
        const locations = Number(body.locations);
        if (!isEmail(to)) return error("Enter the contact's email address");
        if (!brand) return error("Enter the brand name");
        if (!Number.isInteger(locations) || locations < 1 || locations > 5000) return error("Enter the number of locations");
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 100000 ? v : null);
        const q = quoteEmail({
          brand, locations, contactName: typeof body.contact_name === "string" ? body.contact_name.slice(0, 80) : null,
          currentPerLocation: num(body.current_per_location), techFee: num(body.tech_fee), founding: body.founding === true,
        }, portalUrl());
        await audit("franchise_quote_sent", null, { to, brand, locations, founding: body.founding === true });
        await sendEmail({
          to, cc: user.email ?? null, replyTo: user.email ?? null, fromName: "Tarmo", subject: q.subject, text: q.text,
          html: emailLayout({ heading: "Your franchise network quote", bodyHtml: q.html, button: { label: "See Franchise HQ", url: `${portalUrl()}/franchises` } }),
        });
        return json({ ok: true });
      }
      default:
        return error("Unknown action");
    }
  } catch (e) {
    reportError("admin-action", e);
    return error((e as Error).message, 500);
  }
});
