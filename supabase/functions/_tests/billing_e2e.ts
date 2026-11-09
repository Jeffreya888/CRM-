// End-to-end billing test against the Stripe sandbox (test mode). Not part of npm test.
// Needs: the local Supabase stack (npx supabase@2 start), the functions franchise-billing, admin-action,
// billing-locations and stripe-webhook served on ports 54611-54614 with STRIPE_WEBHOOK_SECRET=whsec_localtest,
// STRIPE_PRICE_TEAM_MONTHLY / STRIPE_PRICE_FLEET_MONTHLY / STRIPE_PRICE_FLEET_ANNUAL set to sandbox prices, and a
// Stripe TEST secret key available to the run. Run: npx deno run -A --node-modules-dir=none supabase/functions/_tests/billing_e2e.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { Stripe } from "/home/user/CRM-/supabase/functions/_shared/deps.ts";

const URL = "http://127.0.0.1:54321";
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const stripe = new Stripe("proxy-injected", { httpClient: Stripe.createFetchHttpClient() });
const PORTS = { billing: 54611, admin: 54612, locations: 54613, webhook: 54614 };
const run = Date.now().toString(36);
const created: string[] = [];
let pass = 0, fail = 0;

function check(ok: unknown, label: string, detail?: unknown) {
  if (ok) { pass++; console.log(`  ✔ ${label}`); }
  else { fail++; console.log(`  ✘ ${label}`, detail === undefined ? "" : JSON.stringify(detail)); }
}

async function user(name: string) {
  const email = `${name}.${run}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Test-pass-12345", email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password: "Test-pass-12345" });
  if (s.error) throw s.error;
  return { id: data.user!.id, client, token: s.data.session!.access_token };
}

async function call(port: number, token: string, body: Record<string, unknown>) {
  const r = await fetch(`http://127.0.0.1:${port}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

async function webhook(type: string, object: unknown) {
  const payload = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, object: "event", type, data: { object }, api_version: "2025-01-01" });
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: "whsec_localtest" });
  const r = await fetch(`http://127.0.0.1:${PORTS.webhook}`, { method: "POST", headers: { "stripe-signature": header, "Content-Type": "application/json" }, body: payload });
  return r.status;
}

async function newOrg(u: Awaited<ReturnType<typeof user>>, name: string) {
  const { data, error } = await u.client.rpc("create_organization", { p_name: name, p_seed_services: false, p_business_types: ["aircraft"] });
  if (error) throw error;
  return data as string;
}

const org = async (id: string) => (await admin.from("organizations").select("*").eq("id", id).single()).data;
const net = async (id: string) => (await admin.from("franchise_networks").select("*").eq("id", id).single()).data;
// The next regular invoice, leaving out one-time mid-month (proration) adjustments.
const isProration = (l: any) => !!(l.proration ?? l.parent?.subscription_item_details?.proration ?? l.parent?.invoice_item_details?.proration);
const preview = async (sub: string) => {
  const p = await stripe.invoices.createPreview({ subscription: sub });
  return p.lines.data.filter((l) => !isProration(l)).reduce((n, l) => n + l.amount, 0);
};
const prorations = async (sub: string) => {
  const p = await stripe.invoices.createPreview({ subscription: sub });
  return p.lines.data.filter((l) => isProration(l)).reduce((n, l) => n + l.amount, 0);
};

try {
  const boss = await user("platform-admin");
  await admin.from("platform_admins").insert({ user_id: boss.id });

  // ---------------------------------------------------------------- All-in network
  console.log("\n1. All-in franchise network");
  const hq = await user("hq");
  const hqOrg = await newOrg(hq, `Test Brand HQ ${run}`);
  let r = await call(PORTS.billing, hq.token, { action: "status", network_id: "00000000-0000-0000-0000-000000000000" });
  check(r.status === 404, "unknown network is refused");
  const blocked = await hq.client.rpc("franchise_create", { p_org: hqOrg, p_name: "Test Brand", p_royalty: 6, p_marketing: 2 });
  check(blocked.error?.message?.includes("Enterprise & Franchise"), "brand can't create a network before approval", blocked.error?.message);
  r = await call(PORTS.admin, boss.token, { action: "set_enterprise", org_id: hqOrg, franchise_hq_enabled: true });
  check(r.ok, "admin turns on Franchise HQ", r);
  const { data: netId, error: ce } = await hq.client.rpc("franchise_create", { p_org: hqOrg, p_name: "Test Brand", p_royalty: 6, p_marketing: 2 });
  check(!ce && netId, "brand creates its network", ce?.message);
  const code = (await net(netId)).invite_code;

  const locs: { u: Awaited<ReturnType<typeof user>>; org: string }[] = [];
  const addLocation = async (i: number, netCode: string) => {
    const u = await user(`loc${i}`);
    const o = await newOrg(u, `Location ${i} ${run}`);
    const j = await u.client.rpc("franchise_join", { p_org: o, p_code: netCode, p_location_name: `Location ${i}` });
    if (j.error) throw j.error;
    return { u, org: o };
  };
  locs.push(await addLocation(1, code));

  r = await call(PORTS.billing, hq.token, { action: "checkout", network_id: netId });
  check(r.status === 409, "HQ can't start billing before support sets the plan", r.error);
  r = await call(PORTS.admin, boss.token, { action: "set_franchise_billing", network_id: netId, mode: "all_in", founding: false });
  check(r.ok, "admin sets all-in", r);
  r = await call(PORTS.billing, hq.token, { action: "status", network_id: netId });
  check(r.mode === "all_in" && r.locations === 1 && r.monthly_cents === 49900, "status: 1 location, $499 minimum", r);
  r = await call(PORTS.billing, locs[0].u.token, { action: "status", network_id: netId });
  check(r.status === 403, "a franchisee can't see HQ billing");
  r = await call(PORTS.billing, hq.token, { action: "checkout", network_id: netId });
  check(typeof r.url === "string" && r.url.includes("checkout.stripe.com"), "HQ owner gets a Stripe Checkout link (card billing)", r);

  r = await call(PORTS.billing, boss.token, { action: "invoice", network_id: netId });
  check(r.ok, "admin starts invoice billing (net 30)", r);
  let n = await net(netId);
  let sub = await stripe.subscriptions.retrieve(n.stripe_subscription_id, { expand: ["latest_invoice"] });
  check(sub.collection_method === "send_invoice" && sub.days_until_due === 30, "Stripe: invoiced, due in 30 days");
  const inv = sub.latest_invoice as Stripe.Invoice;
  check(inv.amount_due === 49900, "Stripe: first invoice is $499 for 1 location", inv.amount_due);
  check((await webhook("customer.subscription.created", sub)) === 200, "webhook accepted");
  n = await net(netId);
  check(n.billing_status === "active" && n.paid_through, "network shows billing active and paid-through date", { s: n.billing_status, p: n.paid_through });
  let o = await org(locs[0].org);
  check(o.plan === "team" && o.billing_source === "franchise", "franchisee covered on Team by HQ", { plan: o.plan, src: o.billing_source });

  for (const i of [2, 3, 4]) locs.push(await addLocation(i, code));
  o = await org(locs[3].org);
  check(o.plan === "team" && o.billing_source === "franchise", "a new location is covered the moment it joins");
  r = await call(PORTS.billing, hq.token, { action: "sync", network_id: netId });
  check(r.locations === 4 && r.changed, "sync: Stripe updated to 4 locations", r);
  sub = await stripe.subscriptions.retrieve(n.stripe_subscription_id);
  check(sub.items.data[0].quantity === 4, "Stripe: quantity 4", sub.items.data[0].quantity);
  const next = await preview(sub.id);
  check(next === 59600, "Stripe: next month is 4 × $149 = $596", next);
  const pr = await prorations(sub.id);
  check(pr > 0 && pr <= 9700, "Stripe: plus a one-time charge for the rest of this month (up to $97)", pr);

  const leaving = locs.pop()!;
  const lv = await leaving.u.client.rpc("franchise_leave", { p_org: leaving.org });
  check(!lv.error, "a location leaves", lv.error?.message);
  o = await org(leaving.org);
  const days = (new Date(o.plan_expires_at).getTime() - Date.now()) / 864e5;
  check(days > 13.9 && days <= 14.01, "it gets 14 days to choose its own plan", days.toFixed(2));
  r = await call(PORTS.billing, hq.token, { action: "sync", network_id: netId });
  sub = await stripe.subscriptions.retrieve(n.stripe_subscription_id);
  check(sub.items.data[0].quantity === 3, "Stripe: back to 3 locations ($499 minimum)", sub.items.data[0].quantity);
  check((await preview(sub.id)) === 49900, "Stripe: next month back at the $499 minimum");
  created.push(sub.id);

  // ---------------------------------------------------------------- Founding rate
  console.log("\n2. Founding network rate");
  const hq2 = await user("hq2");
  const hq2Org = await newOrg(hq2, `Founding Brand ${run}`);
  await call(PORTS.admin, boss.token, { action: "set_enterprise", org_id: hq2Org, franchise_hq_enabled: true });
  const { data: net2 } = await hq2.client.rpc("franchise_create", { p_org: hq2Org, p_name: "Founding Brand", p_royalty: 5, p_marketing: 1 });
  const code2 = (await net(net2)).invite_code;
  for (const i of [21, 22, 23, 24, 25]) await addLocation(i, code2);
  r = await call(PORTS.admin, boss.token, { action: "set_franchise_billing", network_id: net2, mode: "all_in", founding: true });
  check(r.ok, "admin sets all-in with the founding rate");
  r = await call(PORTS.billing, boss.token, { action: "invoice", network_id: net2 });
  check(r.ok, "admin starts invoice billing with the founding coupon", r);
  sub =await stripe.subscriptions.retrieve((await net(net2)).stripe_subscription_id, { expand: ["latest_invoice"] });
  const fi = sub.latest_invoice as Stripe.Invoice;
  check(fi.subtotal === 5 * 14900, "Stripe: 5 × $149 = $745 before discount", fi.subtotal);
  check(Math.abs(fi.total - 5 * 12900) <= 100, "Stripe: founding rate ≈ 5 × $129 = $645", fi.total);
  created.push(sub.id);

  // ---------------------------------------------------------------- Split network
  console.log("\n3. Split network (franchisees pay their own plan, 15% off)");
  const hq3 = await user("hq3");
  const hq3Org = await newOrg(hq3, `Split Brand ${run}`);
  await call(PORTS.admin, boss.token, { action: "set_enterprise", org_id: hq3Org, franchise_hq_enabled: true });
  const { data: net3 } = await hq3.client.rpc("franchise_create", { p_org: hq3Org, p_name: "Split Brand", p_royalty: 6, p_marketing: 2 });
  const code3 = (await net(net3)).invite_code;
  const own = await addLocation(31, code3);
  // This franchisee already pays for Team on the web.
  const cust = await stripe.customers.create({ name: "Location 31", email: `loc31.${run}@example.com`, metadata: { org_id: own.org } });
  const teamSub = await stripe.subscriptions.create({
    customer: cust.id, collection_method: "send_invoice", days_until_due: 30,
    items: [{ price: Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY")! }], metadata: { kind: "platform_plan", org_id: own.org, plan: "team", period: "monthly" },
  });
  created.push(teamSub.id);
  await admin.from("organizations").update({ plan: "team", billing_source: "stripe", stripe_subscription_id: teamSub.id, stripe_billing_customer_id: cust.id, plan_expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }).eq("id", own.org);
  r = await call(PORTS.admin, boss.token, { action: "set_franchise_billing", network_id: net3, mode: "split" });
  check(r.ok, "admin sets split");
  r = await call(PORTS.billing, boss.token, { action: "invoice", network_id: net3 });
  const n3 = await net(net3);
  sub = await stripe.subscriptions.retrieve(n3.stripe_subscription_id, { expand: ["latest_invoice"] });
  created.push(sub.id);
  check((sub.latest_invoice as Stripe.Invoice).amount_due === 49900, "Stripe: HQ pays the $499 minimum (1 location × $47 is under it)");
  await webhook("customer.subscription.created", sub);
  o = await org(own.org);
  check(o.billing_source === "stripe" && o.plan === "team", "split: the franchisee keeps paying its own plan (not covered)");
  r = await call(PORTS.billing, hq3.token, { action: "sync", network_id: net3 });
  const ts = await stripe.subscriptions.retrieve(teamSub.id, { expand: ["discounts.source.coupon"] });
  const coupon = ts.discounts?.[0] && typeof ts.discounts[0] !== "string" ? ts.discounts[0].source?.coupon : null;
  check(coupon && typeof coupon !== "string" && coupon.id === "tarmo-network-15" && coupon.percent_off === 15, "Stripe: 15% network discount on the franchisee's own Team plan", coupon && typeof coupon !== "string" ? coupon.id : coupon);
  const tp = await stripe.invoices.createPreview({ subscription: teamSub.id });
  check(tp.total === 10199, "Stripe: franchisee's next invoice $101.99 (Team at 15% off)", tp.total);
  check((await org(own.org)).franchise_discount_applied === true, "discount recorded");

  await own.u.client.rpc("franchise_leave", { p_org: own.org });
  Deno.env.set("STRIPE_SECRET_KEY", "proxy-injected");
  Deno.env.set("SUPABASE_URL", URL);
  const { removeStaleDiscounts } = await import("/home/user/CRM-/supabase/functions/_shared/franchiseBilling.ts");
  await removeStaleDiscounts(admin);
  const ts2 = await stripe.subscriptions.retrieve(teamSub.id);
  check(!ts2.discounts?.length, "after leaving, the 15% comes off their subscription", ts2.discounts);
  check((await org(own.org)).franchise_discount_applied === false, "discount flag cleared");

  // ---------------------------------------------------------------- Fleet extra locations
  console.log("\n4. Fleet extra locations and monthly ↔ yearly");
  const fleet = await user("fleet");
  const fleetOrg = await newOrg(fleet, `Fleet Co ${run}`);
  const fcust = await stripe.customers.create({ name: "Fleet Co", email: `fleet.${run}@example.com`, metadata: { org_id: fleetOrg } });
  const fsub = await stripe.subscriptions.create({
    customer: fcust.id, collection_method: "send_invoice", days_until_due: 30,
    items: [{ price: Deno.env.get("STRIPE_PRICE_FLEET_MONTHLY")! }], metadata: { kind: "platform_plan", org_id: fleetOrg, plan: "fleet", period: "monthly" },
  });
  created.push(fsub.id);
  await admin.from("organizations").update({ stripe_billing_customer_id: fcust.id }).eq("id", fleetOrg);
  check((await webhook("customer.subscription.created", fsub)) === 200, "webhook: Fleet subscription applied");
  o = await org(fleetOrg);
  check(o.plan === "fleet" && o.billing_source === "stripe" && o.billing_period === "monthly", "company on Fleet, billed monthly on the web", { plan: o.plan, src: o.billing_source });
  r = await call(PORTS.locations, fleet.token, { org_id: fleetOrg, action: "set", extra: 7 });
  check(r.ok && r.extra === 7, "owner adds 7 extra locations", r);
  let fs = await stripe.subscriptions.retrieve(fsub.id);
  const extraItem = fs.items.data.find((i) => i.price.lookup_key?.startsWith("tarmo_extra_location_"));
  check(extraItem?.quantity === 7, "Stripe: extra-location line with quantity 7");
  check((await preview(fsub.id)) === 21999 + 7 * 3900, "Stripe: next month $219.99 + 7 × $39 = $492.99");
  await webhook("customer.subscription.updated", fs);
  o = await org(fleetOrg);
  check(o.extra_locations === 7, "webhook: company now has 7 extra locations");
  const { data: lim } = await fleet.client.rpc("org_branch_limit", { p_org: fleetOrg });
  check(lim === 12, "location limit is 12", lim);
  r = await call(PORTS.locations, fleet.token, { org_id: fleetOrg, action: "set", extra: 20 });
  fs = await stripe.subscriptions.retrieve(fsub.id);
  check((await preview(fsub.id)) === 21999 + 15 * 3900 + 5 * 2900, "Stripe: 20 extra = 15 × $39 + 5 × $29 (tiered)");
  await call(PORTS.locations, fleet.token, { org_id: fleetOrg, action: "set", extra: 7 });

  r = await call(PORTS.locations, fleet.token, { org_id: fleetOrg, action: "switch_period", period: "annual" });
  check(r.ok && r.period === "annual", "owner switches to yearly", r);
  fs = await stripe.subscriptions.retrieve(fsub.id);
  check(fs.items.data.every((i) => i.price.recurring?.interval === "year"), "Stripe: plan and extra locations both yearly");
  check((await preview(fsub.id)) === 219999 + 7 * 39000, "Stripe: next year $2,199.99 + 7 × $390 = $4,929.99");
  await webhook("customer.subscription.updated", fs);
  o = await org(fleetOrg);
  check(o.billing_period === "annual" && o.extra_locations === 7, "webhook: company billed yearly, still 7 extra");
  r = await call(PORTS.locations, hq.token, { org_id: fleetOrg, action: "set", extra: 1 });
  check(r.status === 403, "someone outside the company can't change its billing");
} catch (e) {
  fail++;
  console.log("  ✘ test stopped:", (e as Error).message);
} finally {
  for (const id of created) await stripe.subscriptions.cancel(id).catch(() => {});
  console.log(`\n${pass} passed, ${fail} failed (test subscriptions cancelled in the sandbox)`);
}
