// Monthly care plans: a recurring schedule billed as a flat monthly amount,
// auto-charged to the customer's card on file (platform fee by plan) through
// the company's processor:
//   - Stripe: Stripe Billing subscription on the connected account.
//   - Square: card saved on the customer's Square profile, charged monthly by
//     the automation worker (see _shared/squareBilling.ts).
//
// POST { action: "start", schedule_id } → { url }  Card-on-file link (Stripe Checkout,
//                                                   or our Square page) for the detailer
//                                                   to send to the customer.
// POST { action: "cancel", schedule_id } → { ok: true }
//
// Caller must be an owner/admin/manager of the schedule's company.
// Stripe subscription events arrive on the Connect webhook (see stripe-webhook).
import { Stripe } from "../_shared/deps.ts";
import { disableCard, sellerFor } from "../_shared/square.ts";
import { adminClient, callerCanMoney, callerRole, MANAGER_ROLES, orgFeeBps, stripe } from "../_shared/clients.ts";
import { error, json, portalUrl, preflight, readJson } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const { action, schedule_id } = await readJson<{ action?: string; schedule_id?: string }>(req);
    if (!schedule_id || !["start", "cancel"].includes(action ?? "")) return error("action and schedule_id required");
    const db = adminClient();
    const { data: s } = await db
      .from("recurring_schedules")
      .select("id, org_id, title, billing, care_plan_amount, care_plan_status, care_plan_provider, care_plan_token, square_card_id, stripe_subscription_id, customer_id, customer:customers(id, name, email, phone, stripe_customer_id), asset:aircraft(tail_number, manufacturer, model), service:services(name), org:organizations(name, currency, stripe_account_id, stripe_charges_enabled, square_charges_enabled, payment_mode, is_demo, public_slug)")
      .eq("id", schedule_id)
      .maybeSingle();
    if (!s) return error("Schedule not found", 404);
    const caller = await callerRole(req, s.org_id);
    if (!caller || !MANAGER_ROLES.includes(caller.role) || !(await callerCanMoney(req, s.org_id))) {
      return error("Only owners, admins and managers who can see prices can manage care plans", 403);
    }

    // deno-lint-ignore no-explicit-any
    const org = s.org as any;
    // deno-lint-ignore no-explicit-any
    const customer = s.customer as any;
    // deno-lint-ignore no-explicit-any
    const asset = s.asset as any;
    const acct = org.stripe_account_id as string | null;
    const s_ = stripe();

    if (action === "cancel") {
      if (s.care_plan_provider === "square") {
        const seller = await sellerFor(db, s.org_id);
        if (seller && s.square_card_id) await disableCard(seller, s.square_card_id);
        await db.from("recurring_schedules").update({ care_plan_next_charge_at: null, square_card_id: null }).eq("id", s.id);
      } else if (s.stripe_subscription_id && acct) {
        try {
          await s_.subscriptions.cancel(s.stripe_subscription_id, {}, { stripeAccount: acct });
        } catch (e) {
          // Already canceled / gone on Stripe's side: still mark it canceled here.
          if ((e as { code?: string }).code !== "resource_missing") throw e;
        }
      }
      await db.from("recurring_schedules").update({ care_plan_status: "canceled" }).eq("id", s.id);
      await db.from("activities").insert({
        org_id: s.org_id, customer_id: s.customer_id, kind: "system", created_by: caller.userId,
        body: "Monthly care plan canceled",
      });
      return json({ ok: true });
    }

    // ---- start ----
    if (org.is_demo) return error("Payments are turned off in the demo workspace");
    if (s.billing !== "care_plan") return error("Set this schedule's billing to “Monthly care plan” first");
    if (org.payment_mode === "square") {
      if (!org.square_charges_enabled) return error("Finish connecting Square in Settings → Payments before starting a care plan");
      if (s.care_plan_provider !== "square" && s.care_plan_status === "active") return error("This care plan is active on Stripe. Cancel it first to move it to Square.");
      const amount = Math.round(Number(s.care_plan_amount ?? 0) * 100);
      if (amount < 100) return error("Enter the monthly care plan amount first");
      const token = s.care_plan_token ?? crypto.randomUUID().replace(/-/g, "");
      const firstTime = s.care_plan_status !== "active" && s.care_plan_status !== "past_due";
      await db.from("recurring_schedules").update({
        care_plan_provider: "square", care_plan_token: token,
        ...(firstTime ? { care_plan_status: "pending" } : {}),
      }).eq("id", s.id);
      await db.from("activities").insert({
        org_id: s.org_id, customer_id: s.customer_id, kind: "system", created_by: caller.userId,
        body: firstTime
          ? `Care plan sign-up link created (${(amount / 100).toFixed(2)} ${(org.currency ?? "USD").toUpperCase()}/month, Square)`
          : "Card update link sent for the monthly care plan (Square)",
      });
      return json({ url: `${portalUrl()}/portal/care/${token}` });
    }
    if (s.care_plan_status === "active" && s.care_plan_provider === "square") return error("This care plan is active on Square. Cancel it first to move it to Stripe.");
    if (org.payment_mode !== "stripe") return error("Card payments are off (payments are arranged directly). Turn on Stripe or Square in Settings to use care plans.");
    if (!acct || !org.stripe_charges_enabled) return error("Set up online payments (Stripe) in Settings before starting a care plan");
    const amountCents = Math.round(Number(s.care_plan_amount ?? 0) * 100);
    if (amountCents < 50) return error("Enter the monthly care plan amount first");
    if (s.care_plan_status === "active" && s.stripe_subscription_id) return error("This care plan is already active");

    // Customer on the connected account (reused across plans).
    let stripeCustomer: string | null = customer?.stripe_customer_id ?? null;
    if (stripeCustomer) {
      try {
        const c = await s_.customers.retrieve(stripeCustomer, {}, { stripeAccount: acct });
        if ((c as Stripe.DeletedCustomer).deleted) stripeCustomer = null;
      } catch {
        stripeCustomer = null; // belongs to another account or was removed
      }
    }
    if (!stripeCustomer) {
      const c = await s_.customers.create({
        name: customer?.name ?? undefined,
        email: customer?.email ?? undefined,
        phone: customer?.phone ?? undefined,
        metadata: { customer_id: s.customer_id, org_id: s.org_id },
      }, { stripeAccount: acct });
      stripeCustomer = c.id;
      await db.from("customers").update({ stripe_customer_id: stripeCustomer }).eq("id", s.customer_id);
    }

    const assetName = asset?.tail_number
      ? [asset.tail_number, [asset.manufacturer, asset.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
      : (s.title ?? (s.service as { name?: string } | null)?.name ?? "Monthly service");
    const price = await s_.prices.create({
      currency: (org.currency ?? "USD").toLowerCase(),
      unit_amount: amountCents,
      recurring: { interval: "month" },
      product_data: { name: `Care plan — ${assetName}` },
      metadata: { schedule_id: s.id, org_id: s.org_id },
    }, { stripeAccount: acct });

    const bps = await orgFeeBps(db, s.org_id);
    const meta = { kind: "care_plan", schedule_id: s.id, org_id: s.org_id };
    const back = `${portalUrl()}/portal/c/${org.public_slug}`;
    const session = await s_.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomer,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        application_fee_percent: Math.round(bps) / 100,
        description: `${org.name} monthly care plan — ${assetName}`,
        metadata: meta,
      },
      metadata: meta,
      success_url: `${back}?care_plan=active`,
      cancel_url: `${back}?care_plan=cancelled`,
    }, { stripeAccount: acct });

    await db.from("recurring_schedules").update({ care_plan_status: "pending", care_plan_provider: "stripe" }).eq("id", s.id);
    await db.from("activities").insert({
      org_id: s.org_id, customer_id: s.customer_id, kind: "system", created_by: caller.userId,
      body: `Care plan sign-up link created (${(amountCents / 100).toFixed(2)} ${(org.currency ?? "USD").toUpperCase()}/month)`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return error((e as Error).message || "Something went wrong", 500);
  }
});
