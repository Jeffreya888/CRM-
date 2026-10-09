// Onboards a detailing company onto Stripe Connect (Express) so their
// customers can pay invoices by card/ACH. The platform earns an application
// fee on each payment (see invoice-checkout).
//
// POST { org_id, action: "onboard" | "status" | "dashboard", return_url? }
import { adminClient, callerRole, stripe } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { org_id, action = "onboard", return_url } = await req.json();
    if (!org_id) return error("org_id required");
    const caller = await callerRole(req, org_id);
    if (!caller || !["owner", "admin"].includes(caller.role)) return error("Only owners and admins can manage payments", 403);

    const db = adminClient();
    const { data: org, error: orgErr } = await db
      .from("organizations")
      .select("id, name, email, stripe_account_id")
      .eq("id", org_id)
      .single();
    if (orgErr || !org) return error("Organization not found", 404);

    const s = stripe();
    let accountId: string | null = org.stripe_account_id;

    if (action === "status") {
      if (!accountId) return json({ connected: false, charges_enabled: false });
      const acct = await s.accounts.retrieve(accountId);
      await db.from("organizations").update({ stripe_charges_enabled: !!acct.charges_enabled }).eq("id", org_id);
      return json({ connected: true, charges_enabled: !!acct.charges_enabled, details_submitted: !!acct.details_submitted });
    }

    if (action === "dashboard") {
      if (!accountId) return error("Payments are not set up yet");
      const link = await s.accounts.createLoginLink(accountId);
      return json({ url: link.url });
    }

    if (!accountId) {
      const acct = await s.accounts.create({
        type: "express",
        email: org.email ?? undefined,
        business_profile: { name: org.name, mcc: "7542" }, // car washes / detailing
        capabilities: { card_payments: { requested: true }, transfers: { requested: true }, us_bank_account_ach_payments: { requested: true } },
        metadata: { org_id },
      });
      accountId = acct.id;
      await db.from("organizations").update({ stripe_account_id: accountId }).eq("id", org_id);
    }

    const back = return_url ?? Deno.env.get("PORTAL_URL") ?? "https://example.com";
    const link = await s.accountLinks.create({
      account: accountId,
      refresh_url: back,
      return_url: back,
      type: "account_onboarding",
    });
    return json({ url: link.url });
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
