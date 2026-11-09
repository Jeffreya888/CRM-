// QuickBooks Online: OAuth, API calls and the one-way sync (Tarmo → QuickBooks) of customers,
// invoices and payments. Env: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_ENVIRONMENT ('sandbox' | 'production',
// default production). Redirect URI to register in the Intuit app: <SUPABASE_URL>/functions/v1/quickbooks
// QBO_API_BASE / QBO_TOKEN_URL can point at a test server.
import { type SupabaseClient } from "./deps.ts";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = () => Deno.env.get("QBO_TOKEN_URL") ?? "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const MINOR = "75";

export const qboConfigured = () => !!(Deno.env.get("QBO_CLIENT_ID") && Deno.env.get("QBO_CLIENT_SECRET"));
export const qboEnvironment = (): "sandbox" | "production" => (Deno.env.get("QBO_ENVIRONMENT") === "sandbox" ? "sandbox" : "production");
const apiBase = (env: string) =>
  Deno.env.get("QBO_API_BASE") ?? (env === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com");
export const redirectUri = () => `${Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "")}/functions/v1/quickbooks`;
const basic = () => "Basic " + btoa(`${Deno.env.get("QBO_CLIENT_ID")}:${Deno.env.get("QBO_CLIENT_SECRET")}`);

// ---------------------------------------------------------------- signed OAuth state (org, user, expiry)
async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("QBO_CLIENT_SECRET")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function signState(orgId: string, userId: string): Promise<string> {
  const body = btoa(JSON.stringify({ o: orgId, u: userId, e: Date.now() + 15 * 60e3 })).replace(/=+$/, "");
  return `${body}.${await hmac(body)}`;
}
export async function verifyState(state: string): Promise<{ orgId: string; userId: string } | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig || sig !== await hmac(body)) return null;
  try {
    const v = JSON.parse(atob(body));
    return typeof v.o === "string" && typeof v.u === "string" && v.e > Date.now() ? { orgId: v.o, userId: v.u } : null;
  } catch {
    return null;
  }
}
export async function authorizeUrl(orgId: string, userId: string): Promise<string> {
  const p = new URLSearchParams({
    client_id: Deno.env.get("QBO_CLIENT_ID")!, response_type: "code", scope: QBO_SCOPE, redirect_uri: redirectUri(), state: await signState(orgId, userId),
  });
  return `${AUTH_URL}?${p}`;
}

// ---------------------------------------------------------------- tokens
type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in?: number };
async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const r = await fetch(TOKEN_URL(), {
    method: "POST",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`QuickBooks sign-in failed: ${j.error_description ?? j.error ?? r.status}`);
  return j as TokenResponse;
}
export const exchangeCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
const tokenCols = (t: TokenResponse) => ({
  access_token: t.access_token,
  refresh_token: t.refresh_token,
  access_expires_at: new Date(Date.now() + (t.expires_in - 120) * 1000).toISOString(),
  refresh_expires_at: t.x_refresh_token_expires_in ? new Date(Date.now() + t.x_refresh_token_expires_in * 1000).toISOString() : null,
});
export { tokenCols };

export async function revoke(refreshToken: string) {
  await fetch(REVOKE_URL, {
    method: "POST", headers: { Authorization: basic(), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ token: refreshToken }),
  }).catch(() => {});
}

export type Connection = {
  org_id: string; realm_id: string; environment: string; access_token: string; refresh_token: string; access_expires_at: string;
  service_item_id: string | null; tax_item_id: string | null; sync_from: string;
};

/** A client for one company's QuickBooks, refreshing the access token when it runs out. */
export function qboClient(db: SupabaseClient, conn: Connection) {
  let c = conn;
  const fresh = async () => {
    if (new Date(c.access_expires_at).getTime() > Date.now()) return c.access_token;
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: c.refresh_token });
    const cols = tokenCols(t);
    await db.from("qbo_connections").update(cols).eq("org_id", c.org_id);
    c = { ...c, ...cols };
    return c.access_token;
  };
  const call = async <T = any>(method: "GET" | "POST", path: string, body?: unknown, query: Record<string, string> = {}): Promise<T> => {
    const url = `${apiBase(c.environment)}/v3/company/${c.realm_id}/${path}?${new URLSearchParams({ minorversion: MINOR, ...query })}`;
    const r = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await fresh()}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const f = j?.Fault?.Error?.[0];
      const err = new Error(f ? `${f.Message}${f.Detail ? `: ${f.Detail}` : ""}` : `QuickBooks error ${r.status}`) as Error & { code?: string; status?: number };
      err.code = f?.code;
      err.status = r.status;
      throw err;
    }
    return j as T;
  };
  const query = async (q: string) => (await call<any>("GET", "query", undefined, { query: q })).QueryResponse ?? {};
  return { call, query, conn: () => c };
}
type Qbo = ReturnType<typeof qboClient>;

// ---------------------------------------------------------------- payloads (pure; unit-tested)
const q = (s: string) => s.replace(/'/g, "\\'");
const money = (n: number) => Math.round(n * 100) / 100;

export type CustomerRow = { id: string; name: string; company: string | null; email: string | null; phone: string | null; billing_address: string | null };
export function customerPayload(c: CustomerRow, displayName = c.name) {
  return {
    DisplayName: displayName.slice(0, 500),
    ...(c.company ? { CompanyName: c.company.slice(0, 100) } : {}),
    ...(c.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email) ? { PrimaryEmailAddr: { Address: c.email } } : {}),
    ...(c.phone ? { PrimaryPhone: { FreeFormNumber: c.phone.slice(0, 30) } } : {}),
    ...(c.billing_address ? { BillAddr: { Line1: c.billing_address.slice(0, 500) } } : {}),
  };
}

export type InvoiceRow = {
  id: string; number: string; issue_date: string; due_date: string; discount: number; tax: number; total: number; notes: string | null;
  items: { description: string; quantity: number; unit_price: number }[];
};
/** Invoice lines in Tarmo's order; the discount and tax become their own lines so the total matches Tarmo exactly. */
export function invoicePayload(inv: InvoiceRow, refs: { customerId: string; itemId: string; taxItemId: string }) {
  const lines: Record<string, unknown>[] = inv.items.map((it) => ({
    DetailType: "SalesItemLineDetail",
    Amount: money(Number(it.quantity) * Number(it.unit_price)),
    Description: it.description.slice(0, 4000),
    SalesItemLineDetail: { ItemRef: { value: refs.itemId }, Qty: Number(it.quantity), UnitPrice: Number(it.unit_price) },
  }));
  if (Number(inv.discount) > 0) {
    lines.push({ DetailType: "DiscountLineDetail", Amount: money(Number(inv.discount)), DiscountLineDetail: { PercentBased: false } });
  }
  if (Number(inv.tax) > 0) {
    lines.push({
      DetailType: "SalesItemLineDetail", Amount: money(Number(inv.tax)), Description: "Sales tax (from Tarmo)",
      SalesItemLineDetail: { ItemRef: { value: refs.taxItemId }, Qty: 1, UnitPrice: money(Number(inv.tax)) },
    });
  }
  return {
    DocNumber: inv.number.slice(0, 21),
    TxnDate: inv.issue_date,
    DueDate: inv.due_date,
    CustomerRef: { value: refs.customerId },
    Line: lines,
    ...(inv.notes ? { CustomerMemo: { value: inv.notes.slice(0, 1000) } } : {}),
    PrivateNote: `From Tarmo invoice ${inv.number}`,
  };
}

export type PaymentRow = { id: string; amount: number; received_at: string; reference: string | null; method: string; customer_id: string };
export function paymentPayload(p: PaymentRow, refs: { customerId: string; invoiceQboId: string }) {
  return {
    TotalAmt: money(Number(p.amount)),
    TxnDate: p.received_at.slice(0, 10),
    CustomerRef: { value: refs.customerId },
    ...(p.reference ? { PaymentRefNum: p.reference.slice(0, 21) } : {}),
    PrivateNote: `From Tarmo (${p.method})`,
    Line: [{ Amount: money(Number(p.amount)), LinkedTxn: [{ TxnId: refs.invoiceQboId, TxnType: "Invoice" }] }],
  };
}

// ---------------------------------------------------------------- sync
async function link(db: SupabaseClient, orgId: string, kind: string, localId: string) {
  const { data } = await db.from("qbo_links").select("*").eq("org_id", orgId).eq("kind", kind).eq("local_id", localId).maybeSingle();
  return data as { qbo_id: string | null; sync_token: string | null; attempts: number } | null;
}
async function saveLink(db: SupabaseClient, orgId: string, kind: string, localId: string, v: { qbo_id?: string; sync_token?: string; error?: string | null }) {
  const prev = await link(db, orgId, kind, localId);
  const row = {
    org_id: orgId, kind, local_id: localId,
    ...(v.qbo_id ? { qbo_id: v.qbo_id, sync_token: v.sync_token ?? null, synced_at: new Date().toISOString(), error: null, error_at: null, attempts: 0 } : {}),
    ...(v.error ? { error: v.error.slice(0, 500), error_at: new Date().toISOString(), attempts: (prev?.attempts ?? 0) + 1 } : {}),
  };
  const { error } = await db.from("qbo_links").upsert(row, { onConflict: "org_id,kind,local_id" });
  if (error) throw error;
}

/** The two items Tarmo uses on invoices, found or created once (needs an income account). */
async function ensureItems(db: SupabaseClient, api: Qbo, conn: Connection) {
  if (conn.service_item_id && conn.tax_item_id) return { itemId: conn.service_item_id, taxItemId: conn.tax_item_id };
  const findOrCreate = async (name: string) => {
    const found = (await api.query(`select Id from Item where Name = '${q(name)}'`)).Item?.[0];
    if (found) return String(found.Id);
    const acct = (await api.query("select Id from Account where AccountType = 'Income' and Active = true maxresults 1")).Account?.[0];
    if (!acct) throw new Error("QuickBooks has no income account to record sales in. Add one in QuickBooks, then sync again.");
    const created = await api.call<any>("POST", "item", { Name: name, Type: "Service", IncomeAccountRef: { value: String(acct.Id) } });
    return String(created.Item.Id);
  };
  const itemId = conn.service_item_id ?? await findOrCreate("Detailing services");
  const taxItemId = conn.tax_item_id ?? await findOrCreate("Sales tax (from Tarmo)");
  await db.from("qbo_connections").update({ service_item_id: itemId, tax_item_id: taxItemId }).eq("org_id", conn.org_id);
  return { itemId, taxItemId };
}

async function ensureCustomer(db: SupabaseClient, api: Qbo, orgId: string, customerId: string): Promise<string> {
  const l = await link(db, orgId, "customer", customerId);
  if (l?.qbo_id) return l.qbo_id;
  const { data: c } = await db.from("customers").select("id, name, company, email, phone, billing_address").eq("id", customerId).single();
  if (!c) throw new Error("Customer not found");
  try {
    // Someone with the same name may already be in QuickBooks: use them instead of making a duplicate.
    const existing = (await api.query(`select Id, SyncToken from Customer where DisplayName = '${q(c.name)}'`)).Customer?.[0];
    const res = existing ?? (await api.call<any>("POST", "customer", customerPayload(c))).Customer;
    await saveLink(db, orgId, "customer", customerId, { qbo_id: String(res.Id), sync_token: String(res.SyncToken ?? "0") });
    return String(res.Id);
  } catch (e) {
    await saveLink(db, orgId, "customer", customerId, { error: (e as Error).message });
    throw e;
  }
}

async function syncInvoice(db: SupabaseClient, api: Qbo, orgId: string, invoiceId: string, items: { itemId: string; taxItemId: string }) {
  const { data: inv } = await db.from("invoices")
    .select("id, number, customer_id, status, issue_date, due_date, discount, tax, total, notes, invoice_items(description, quantity, unit_price, sort_order)")
    .eq("id", invoiceId).single();
  if (!inv) return;
  const l = await link(db, orgId, "invoice", invoiceId);
  try {
    if (inv.status === "void") {
      if (l?.qbo_id) {
        const res = await api.call<any>("POST", "invoice", { Id: l.qbo_id, SyncToken: l.sync_token ?? "0" }, { operation: "void" });
        await saveLink(db, orgId, "invoice", invoiceId, { qbo_id: l.qbo_id, sync_token: String(res.Invoice?.SyncToken ?? l.sync_token) });
      }
      return;
    }
    const customerId = await ensureCustomer(db, api, orgId, inv.customer_id);
    const sorted = [...(inv.invoice_items ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
    const body = invoicePayload({ ...inv, items: sorted } as InvoiceRow, { customerId, ...items });
    let res;
    if (l?.qbo_id) {
      // Full update: QuickBooks needs the latest SyncToken; read it so edits made there don't block us.
      const current = (await api.call<any>("GET", `invoice/${l.qbo_id}`)).Invoice;
      res = (await api.call<any>("POST", "invoice", { ...body, Id: l.qbo_id, SyncToken: String(current?.SyncToken ?? l.sync_token ?? "0") })).Invoice;
    } else {
      res = (await api.call<any>("POST", "invoice", body)).Invoice;
    }
    await saveLink(db, orgId, "invoice", invoiceId, { qbo_id: String(res.Id), sync_token: String(res.SyncToken) });
  } catch (e) {
    await saveLink(db, orgId, "invoice", invoiceId, { error: (e as Error).message });
  }
}

async function syncPayment(db: SupabaseClient, api: Qbo, orgId: string, paymentId: string) {
  const { data: p } = await db.from("payments").select("id, amount, received_at, reference, method, invoice_id, invoices(customer_id)").eq("id", paymentId).single();
  if (!p) return;
  try {
    const inv = await link(db, orgId, "invoice", p.invoice_id);
    if (!inv?.qbo_id) return;
    const customerId = await ensureCustomer(db, api, orgId, (p as any).invoices.customer_id);
    const res = (await api.call<any>("POST", "payment", paymentPayload({ ...p, customer_id: (p as any).invoices.customer_id } as PaymentRow, { customerId, invoiceQboId: inv.qbo_id }))).Payment;
    await saveLink(db, orgId, "payment", paymentId, { qbo_id: String(res.Id), sync_token: String(res.SyncToken) });
  } catch (e) {
    await saveLink(db, orgId, "payment", paymentId, { error: (e as Error).message });
  }
}

/** One sync run for a company. Errors on single records are saved on the record; a connection-level error is returned. */
export async function syncCompany(db: SupabaseClient, orgId: string): Promise<{ invoices: number; payments: number; error?: string }> {
  const { data: conn } = await db.from("qbo_connections").select("*").eq("org_id", orgId).maybeSingle();
  if (!conn) return { invoices: 0, payments: 0, error: "Not connected" };
  const api = qboClient(db, conn as Connection);
  try {
    const items = await ensureItems(db, api, conn as Connection);
    const { data: pending, error } = await db.rpc("quickbooks_pending", { p_org: orgId, p_limit: 40 });
    if (error) throw error;
    const invoices: string[] = pending?.invoices ?? [];
    for (const id of invoices) await syncInvoice(db, api, orgId, id, items);
    const { data: again } = await db.rpc("quickbooks_pending", { p_org: orgId, p_limit: 40 });
    const payments: string[] = again?.payments ?? [];
    for (const id of payments) await syncPayment(db, api, orgId, id);
    await db.from("qbo_connections").update({ last_sync_at: new Date().toISOString(), last_error: null, last_error_at: null }).eq("org_id", orgId);
    return { invoices: invoices.length, payments: payments.length };
  } catch (e) {
    const msg = (e as Error).message;
    await db.from("qbo_connections").update({ last_error: msg.slice(0, 500), last_error_at: new Date().toISOString() }).eq("org_id", orgId);
    return { invoices: 0, payments: 0, error: msg };
  }
}
