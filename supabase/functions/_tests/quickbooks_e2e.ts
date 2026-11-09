// QuickBooks sync end-to-end against a fake QuickBooks API (no Intuit account needed).
// Needs the local Supabase stack. Run: npx deno run -A --node-modules-dir=none supabase/functions/_tests/quickbooks_e2e.ts
import { createClient } from "npm:@supabase/supabase-js@2";

const PORT = 54631;
Deno.env.set("QBO_CLIENT_ID", "test-client");
Deno.env.set("QBO_CLIENT_SECRET", "test-secret");
Deno.env.set("QBO_API_BASE", `http://127.0.0.1:${PORT}`);
Deno.env.set("QBO_TOKEN_URL", `http://127.0.0.1:${PORT}/token`);
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
const { syncCompany, invoicePayload, verifyState, signState } = await import("../_shared/quickbooks.ts");

// ---------------------------------------------------------------- fake QuickBooks
type Rec = Record<string, any>;
const store: Record<string, Rec[]> = { Item: [], Account: [{ Id: "79", Name: "Sales", AccountType: "Income", Active: true }], Customer: [], Invoice: [], Payment: [] };
const log: { method: string; path: string; body?: Rec; query?: string }[] = [];
let nextId = 100;
let tokenCalls = 0;
const srv = Deno.serve({ port: PORT, hostname: "127.0.0.1", onListen() {} }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/token") {
    tokenCalls++;
    return Response.json({ access_token: `at-${tokenCalls}`, refresh_token: `rt-${tokenCalls}`, expires_in: 3600, x_refresh_token_expires_in: 8640000 });
  }
  if (req.headers.get("authorization")?.startsWith("Bearer ") !== true) return Response.json({ Fault: { Error: [{ Message: "Unauthorized" }] } }, { status: 401 });
  const path = url.pathname.replace(/^\/v3\/company\/[^/]+\//, "");
  const body = req.method === "POST" ? await req.json() : undefined;
  log.push({ method: req.method, path, body, query: url.searchParams.get("query") ?? undefined });
  if (path === "query") {
    const q = url.searchParams.get("query")!;
    const ent = q.match(/from (\w+)/i)![1];
    let rows = store[ent] ?? [];
    const eq = q.match(/(Name|DisplayName) = '((?:[^'\\]|\\.)*)'/);
    if (eq) rows = rows.filter((r) => r[eq[1]] === eq[2].replace(/\\'/g, "'"));
    if (/AccountType = 'Income'/.test(q)) rows = rows.filter((r) => r.AccountType === "Income");
    return Response.json({ QueryResponse: rows.length ? { [ent]: rows } : {} });
  }
  const [ent, id] = path.split("/");
  const Ent = ent.charAt(0).toUpperCase() + ent.slice(1);
  if (req.method === "GET" && id) return Response.json({ [Ent]: store[Ent].find((r) => r.Id === id) });
  if (url.searchParams.get("operation") === "void") {
    const r = store[Ent].find((x) => x.Id === body!.Id)!;
    r.voided = true;
    r.SyncToken = String(Number(r.SyncToken) + 1);
    return Response.json({ [Ent]: r });
  }
  if (body!.Id) {
    const i = store[Ent].findIndex((x) => x.Id === body!.Id);
    if (store[Ent][i].SyncToken !== body!.SyncToken) return Response.json({ Fault: { Error: [{ Message: "Stale object", code: "5010" }] } }, { status: 400 });
    store[Ent][i] = { ...body, SyncToken: String(Number(body!.SyncToken) + 1) };
    return Response.json({ [Ent]: store[Ent][i] });
  }
  const rec = { ...body, Id: String(nextId++), SyncToken: "0" };
  store[Ent].push(rec);
  return Response.json({ [Ent]: rec });
});

// ---------------------------------------------------------------- test
const db = createClient("http://127.0.0.1:54321", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const check = (ok: unknown, label: string, detail?: unknown) => {
  if (ok) { pass++; console.log(`  ✔ ${label}`); } else { fail++; console.log(`  ✘ ${label}`, detail === undefined ? "" : JSON.stringify(detail)); }
};
const sum = (lines: Rec[]) => Math.round(lines.reduce((n, l) => n + (l.DetailType === "DiscountLineDetail" ? -l.Amount : l.Amount), 0) * 100) / 100;

let orgId = "";
try {
  console.log("\nQuickBooks sync");
  const st = await signState("org-1", "user-1");
  check((await verifyState(st))?.orgId === "org-1", "sign-in state is signed and verified");
  check((await verifyState(st.replace(/.$/, (c) => (c === "A" ? "B" : "A")))) === null, "tampered sign-in state is rejected");

  const { data: org } = await db.from("organizations").insert({ name: `QBO Test ${Date.now()}`, plan: "team", plan_expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }).select("id").single();
  orgId = org!.id;
  const { data: cust } = await db.from("customers").insert({ org_id: orgId, name: "Sky Management Group", email: "ap@skymgmt.com", phone: "555-0100", company: "Sky Management" }).select("id").single();
  const { data: inv } = await db.from("invoices").insert({
    org_id: orgId, number: "INV-1001", customer_id: cust!.id, status: "sent", issue_date: new Date().toISOString().slice(0, 10),
    discount: 50, tax_rate: 0.0825, subtotal: 1500, tax: 119.63, total: 1569.63,
  }).select("id").single();
  await db.from("invoice_items").insert([
    { org_id: orgId, invoice_id: inv!.id, description: "Exterior wash · N350EJ", quantity: 1, unit_price: 900, sort_order: 0 },
    { org_id: orgId, invoice_id: inv!.id, description: "Brightwork polish", quantity: 2, unit_price: 300, sort_order: 1 },
  ]);
  const { data: draft } = await db.from("invoices").insert({ org_id: orgId, number: "INV-1002", customer_id: cust!.id, status: "draft", total: 100, subtotal: 100 }).select("id").single();
  await db.from("qbo_connections").insert({
    org_id: orgId, realm_id: "9130", environment: "sandbox", access_token: "old", refresh_token: "rt-0",
    access_expires_at: new Date(Date.now() - 1000).toISOString(), sync_from: new Date(Date.now() - 864e5).toISOString().slice(0, 10),
  });

  let r = await syncCompany(db, orgId);
  check(!r.error && r.invoices === 1, "first sync sends 1 invoice (the draft stays in Tarmo)", r);
  check(tokenCalls === 1, "expired access token was refreshed first");
  const { data: c1 } = await db.from("qbo_connections").select("refresh_token, service_item_id, tax_item_id").eq("org_id", orgId).single();
  check(c1!.refresh_token === "rt-1", "new refresh token saved");
  check(store.Item.map((i) => i.Name).sort().join("|") === "Detailing services|Sales tax (from Tarmo)", "created the two QuickBooks items");
  check(store.Customer.length === 1 && store.Customer[0].DisplayName === "Sky Management Group" && store.Customer[0].PrimaryEmailAddr?.Address === "ap@skymgmt.com", "customer created with email");
  const qi = store.Invoice[0];
  check(qi?.DocNumber === "INV-1001" && qi.CustomerRef.value === store.Customer[0].Id, "invoice created with Tarmo's number, for that customer");
  check(sum(qi.Line) === 1569.63, "QuickBooks total matches Tarmo: $1,500 − $50 discount + $119.63 tax = $1,569.63", sum(qi.Line));
  check(!store.Invoice.some((i) => i.DocNumber === "INV-1002"), "draft not sent");

  // A payment arrives.
  await db.from("payments").insert({ org_id: orgId, invoice_id: inv!.id, amount: 569.63, method: "card", reference: "pi_123" });
  r = await syncCompany(db, orgId);
  check(r.payments === 1 && store.Payment.length === 1, "payment sent", r);
  check(store.Payment[0].TotalAmt === 569.63 && store.Payment[0].Line[0].LinkedTxn[0].TxnId === qi.Id, "payment applied to that invoice");

  // Nothing changed: nothing is sent again.
  const before = log.filter((l) => l.method === "POST").length;
  r = await syncCompany(db, orgId);
  check(log.filter((l) => l.method === "POST").length === before, "a second sync with no changes sends nothing", r);

  // An edit in Tarmo updates the same QuickBooks invoice.
  await new Promise((res) => setTimeout(res, 1100));
  await db.from("invoice_items").insert({ org_id: orgId, invoice_id: inv!.id, description: "Interior detail", quantity: 1, unit_price: 400, sort_order: 2 });
  await db.from("invoices").update({ subtotal: 1900, tax: 152.63, total: 2002.63, notes: "Thanks!" }).eq("id", inv!.id);
  r = await syncCompany(db, orgId);
  check(store.Invoice.length === 1 && store.Invoice[0].Line.length === 5 && sum(store.Invoice[0].Line) === 2002.63, "edited invoice updated in place (no duplicate)", { n: store.Invoice.length, total: sum(store.Invoice[0].Line) });

  // Voiding in Tarmo voids it in QuickBooks.
  await new Promise((res) => setTimeout(res, 1100));
  await db.from("invoices").update({ status: "void" }).eq("id", inv!.id);
  await syncCompany(db, orgId);
  check(store.Invoice[0].voided === true, "voided in Tarmo → voided in QuickBooks");

  // Same customer name already in QuickBooks: reused, not duplicated.
  const { data: cust2 } = await db.from("customers").insert({ org_id: orgId, name: "Existing Buyer" }).select("id").single();
  store.Customer.push({ Id: "555", DisplayName: "Existing Buyer", SyncToken: "3" });
  await db.from("invoices").insert({ org_id: orgId, number: "INV-1003", customer_id: cust2!.id, status: "sent", subtotal: 200, total: 200, issue_date: new Date().toISOString().slice(0, 10) })
    .select("id").single().then(async ({ data }) => db.from("invoice_items").insert({ org_id: orgId, invoice_id: data!.id, description: "Wash", quantity: 1, unit_price: 200 }));
  await syncCompany(db, orgId);
  check(store.Customer.filter((c) => c.DisplayName === "Existing Buyer").length === 1 && store.Invoice.find((i) => i.DocNumber === "INV-1003")?.CustomerRef.value === "555", "existing QuickBooks customer reused");

  // A rejected record is saved with its error and retried, without stopping the rest.
  const p = invoicePayload({ id: "x", number: "INV-1", issue_date: "2026-11-01", due_date: "2026-11-16", discount: 0, tax: 0, total: 10, notes: null, items: [{ description: "Wash", quantity: 2, unit_price: 5 }] }, { customerId: "1", itemId: "2", taxItemId: "3" });
  check(p.Line.length === 1 && p.Line[0].Amount === 10, "payload: no discount or tax line when there is none");
  void draft;
} catch (e) {
  fail++;
  console.log("  ✘ test stopped:", (e as Error).message);
} finally {
  if (orgId) await db.from("organizations").delete().eq("id", orgId);
  await srv.shutdown();
  console.log(`\n${pass} passed, ${fail} failed`);
}
