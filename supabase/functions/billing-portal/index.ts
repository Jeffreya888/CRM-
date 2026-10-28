// Stripe Billing customer portal for a company's web subscription
// (change plan, update card, invoices, cancel). Owner only.
// POST { org_id } → { url }
import { adminClient, callerRole, stripe } from "../_shared/clients.ts";
import { error, json, portalUrl, preflight, readJson } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const { org_id } = await readJson<{ org_id?: string }>(req);
    if (typeof org_id !== "string" || !org_id) return error("org_id required");
    const caller = await callerRole(req, org_id);
    if (!caller || caller.role !== "owner") return error("Only the company owner can manage billing", 403);

    const { data: org } = await adminClient().from("organizations")
      .select("stripe_billing_customer_id").eq("id", org_id).maybeSingle();
    if (!org) return error("Company not found", 404);
    if (!org.stripe_billing_customer_id) return error("There is no web billing account for this company yet.", 404);

    const session = await stripe().billingPortal.sessions.create({
      customer: org.stripe_billing_customer_id,
      return_url: `${portalUrl()}/settings`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return error("Could not open billing. Please try again in a moment.", 500);
  }
});
