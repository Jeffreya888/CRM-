// Customer texting setup (owner only).
// POST { action: 'request_number', org_id } → { status }
// Marks the company "pending" and tells the Tarmo platform admin, who
// buys the number, completes carrier (10DLC) registration on the platform
// Telnyx account and then calls admin-action { action: 'set_sms' }.
import { adminClient, callerRole } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { emailLayout, esc, isEmail, sendEmail } from "../_shared/email.ts";
import { sendPushes, tokensFor, pushesFor } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { action, org_id } = await req.json().catch(() => ({}));
    if (action !== "request_number") return error("Unknown action");
    if (typeof org_id !== "string" || !org_id) return error("org_id required");
    const caller = await callerRole(req, org_id);
    if (!caller || caller.role !== "owner") return error("Only the company owner can set up texting", 403);

    const db = adminClient();
    const { data: org } = await db.from("organizations").select("id, name, email, phone, is_demo, sms_status, plan").eq("id", org_id).single();
    if (!org) return error("Company not found", 404);
    if (org.is_demo) return error("DEMO: texting cannot be set up in the demo workspace");
    if (org.sms_status === "active" || org.sms_status === "pending") return json({ status: org.sms_status });

    const { error: e } = await db.from("organizations").update({ sms_status: "pending" }).eq("id", org_id);
    if (e) throw e;

    const { data: { user } } = await db.auth.admin.getUserById(caller.userId);
    const support = Deno.env.get("SUPPORT_EMAIL");
    if (support && isEmail(support)) {
      await sendEmail({
        to: support,
        subject: `Texting number requested: ${org.name}`,
        html: emailLayout({
          heading: "A company asked for customer texting",
          bodyHtml: `<p><b>${esc(org.name)}</b> (plan: ${esc(org.plan)})<br>Owner: ${esc(user?.email ?? "")}<br>Company email: ${esc(org.email ?? "-")}<br>Phone: ${esc(org.phone ?? "-")}<br>Company id: ${esc(org.id)}</p>
            <p>Buy a number on the platform Telnyx account, complete the 10DLC brand/campaign registration, then open Platform admin in the app and activate texting with the number.</p>`,
        }),
        replyTo: user?.email ?? undefined,
      }).catch((err) => console.error("support email failed", err));
    }
    const { data: admins } = await db.from("platform_admins").select("user_id");
    const tokens = await tokensFor(db, (admins ?? []).map((a) => a.user_id), null);
    await sendPushes(pushesFor(tokens, "Texting number requested", `${org.name} wants customer texting.`, { url: "/admin" }));

    return json({ status: "pending" });
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
