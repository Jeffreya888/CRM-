// QuickBooks Online connection and sync.
//   POST { action: 'connect', org_id }     → { url }  Owner/admin starts Intuit sign-in.
//   POST { action: 'sync', org_id }        → { invoices, payments, error? }  Sync now.
//   POST { action: 'disconnect', org_id }  → { ok }
//   GET  ?code&realmId&state               Intuit sends the person back here after sign-in.
// Public (verify_jwt = false) because of the Intuit redirect; POST actions check the caller themselves.
import { adminClient, callerRole } from "../_shared/clients.ts";
import { reportError } from "../_shared/errors.ts";
import { error, json, portalUrl, preflight, readJson } from "../_shared/http.ts";
import { authorizeUrl, exchangeCode, qboConfigured, qboEnvironment, revoke, syncCompany, tokenCols, verifyState } from "../_shared/quickbooks.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const back = (status: string) => Response.redirect(`${portalUrl()}/settings?quickbooks=${status}`, 302);
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      if (url.searchParams.get("error")) return back("cancelled");
      const code = url.searchParams.get("code");
      const realm = url.searchParams.get("realmId");
      const state = await verifyState(url.searchParams.get("state") ?? "");
      if (!code || !realm || !state || !qboConfigured()) return back("failed");
      const db = adminClient();
      const { data: m } = await db.from("memberships").select("role").eq("org_id", state.orgId).eq("user_id", state.userId).eq("active", true).maybeSingle();
      if (!m || !["owner", "admin"].includes(m.role)) return back("failed");
      const t = await exchangeCode(code);
      const { error: e } = await db.from("qbo_connections").upsert({
        org_id: state.orgId, realm_id: realm, environment: qboEnvironment(), connected_by: state.userId, connected_at: new Date().toISOString(),
        service_item_id: null, tax_item_id: null, last_error: null, last_error_at: null, ...tokenCols(t),
      }, { onConflict: "org_id" });
      if (e) throw e;
      // Name the connection after the QuickBooks company, and send what's waiting.
      try {
        const info = await fetch(`${(Deno.env.get("QBO_API_BASE") ?? (qboEnvironment() === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com"))}/v3/company/${realm}/companyinfo/${realm}?minorversion=75`,
          { headers: { Authorization: `Bearer ${t.access_token}`, Accept: "application/json" } }).then((r) => r.json());
        const name = info?.CompanyInfo?.CompanyName;
        if (name) await db.from("qbo_connections").update({ company_name: String(name).slice(0, 200) }).eq("org_id", state.orgId);
      } catch { /* the name is only a label */ }
      const first = syncCompany(db, state.orgId).catch((err) => reportError("quickbooks", err, state.orgId));
      (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(first);
      return back("connected");
    }

    const body = await readJson<{ action?: string; org_id?: string }>(req);
    if (typeof body.org_id !== "string") return error("org_id required");
    const caller = await callerRole(req, body.org_id);
    if (!caller || !["owner", "admin"].includes(caller.role)) return error("Only owners and admins can manage QuickBooks", 403);
    const db = adminClient();
    const { data: org } = await db.from("organizations").select("is_demo").eq("id", body.org_id).single();
    if (org?.is_demo) return error("DEMO: QuickBooks is turned off in the demo workspace");

    switch (body.action) {
      case "connect":
        if (!qboConfigured()) return error("QuickBooks isn't set up on Tarmo yet. Please try again later.", 503);
        return json({ url: await authorizeUrl(body.org_id, caller.userId) });
      case "sync":
        return json(await syncCompany(db, body.org_id));
      case "disconnect": {
        const { data: c } = await db.from("qbo_connections").select("refresh_token").eq("org_id", body.org_id).maybeSingle();
        if (c?.refresh_token) await revoke(c.refresh_token);
        await db.from("qbo_connections").delete().eq("org_id", body.org_id);
        return json({ ok: true });
      }
      default:
        return error("Unknown request");
    }
  } catch (e) {
    reportError("quickbooks", e);
    if (req.method === "GET") return back("failed");
    return error("Could not reach QuickBooks. Please try again in a moment.", 500);
  }
});
