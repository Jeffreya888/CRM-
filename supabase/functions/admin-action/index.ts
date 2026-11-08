// Tarmo platform admin actions (users listed in platform_admins only).
// POST { action: 'set_sms', org_id, status, number? }
//      { action: 'set_integration', id, status }
//      { action: 'support_handled', id }
//      { action: 'find_orgs', query } → { orgs }
//      { action: 'set_enterprise', org_id, franchise_hq_enabled?, branch_limit? (number | null) }
// → { ok: true }
import { adminClient, userClient } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { outbox } from "../_shared/automation.ts";
import { toE164 } from "../_shared/sms.ts";

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
    const { data: admin } = await db.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!admin) return error("Not allowed", 403);

    const body = await req.json().catch(() => ({}));
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
        const { error: e } = await db.from("support_messages").update({ handled: body.handled !== false }).eq("id", body.id);
        if (e) throw e;
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
        const { data: nets } = ids.length ? await db.from("franchise_networks").select("hq_org_id").in("hq_org_id", ids) : { data: [] };
        const count = (id: string) => (br ?? []).filter((b) => b.org_id === id).length;
        return json({
          orgs: (orgs ?? []).map((o) => ({ ...o, active_locations: count(o.id), has_network: (nets ?? []).some((n) => n.hq_org_id === o.id) })),
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
        if (patch.franchise_hq_enabled === true) {
          await outbox(db, { org_id, audience: "owners", kind: "franchise_hq_ready", title: "Franchise HQ is ready", body: "Set up your franchise network in Franchise HQ.", url: "/franchise" });
        }
        return json({ ok: true });
      }
      default:
        return error("Unknown action");
    }
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
