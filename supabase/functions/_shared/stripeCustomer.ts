// The company's Stripe customer on the PLATFORM account (web subscriptions, packs, franchise billing).
import { stripe } from "./clients.ts";
import { type SupabaseClient } from "./deps.ts";

export type OrgRow = { id: string; name: string; email: string | null; stripe_billing_customer_id: string | null };

/** The org's Stripe customer on the platform account (created once, then reused). */
export async function billingCustomer(db: SupabaseClient, org: OrgRow, ownerId: string): Promise<string> {
  const s = stripe();
  if (org.stripe_billing_customer_id) {
    try {
      const c = await s.customers.retrieve(org.stripe_billing_customer_id);
      if (!("deleted" in c && c.deleted)) return c.id;
    } catch {
      // removed in Stripe or from another mode (test vs live): make a new one
    }
  }
  const { data: { user } } = await db.auth.admin.getUserById(ownerId);
  const c = await s.customers.create({
    name: org.name,
    email: user?.email ?? org.email ?? undefined,
    metadata: { org_id: org.id },
  });
  // Compare-and-set so two simultaneous checkouts end up on one customer.
  let q = db.from("organizations").update({ stripe_billing_customer_id: c.id }).eq("id", org.id);
  q = org.stripe_billing_customer_id ? q.eq("stripe_billing_customer_id", org.stripe_billing_customer_id) : q.is("stripe_billing_customer_id", null);
  const { data: saved, error: e } = await q.select("id");
  if (e) throw e;
  if (saved?.length) return c.id;
  const { data: now } = await db.from("organizations").select("stripe_billing_customer_id").eq("id", org.id).single();
  await s.customers.del(c.id).catch(() => {});
  if (!now?.stripe_billing_customer_id) throw new Error("billing customer not saved");
  return now.stripe_billing_customer_id;
}

