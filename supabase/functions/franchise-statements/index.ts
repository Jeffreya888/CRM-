// Franchise HQ: create a month's royalty statements and email each location's owners and admins.
//
// POST { network_id, month: "YYYY-MM" } (signed-in HQ owner/admin)
//   → { statements, emailed, failed }
// Statements are created or refreshed with the caller's rights (franchise_generate_statements
// checks HQ access); emails go to the owners and admins of each location. Paid statements are
// left as they are and not emailed again.
import { adminClient, money, userClient } from "../_shared/clients.ts";
import { emailLayout, esc, sendEmail } from "../_shared/email.ts";
import { error, json, portalUrl, preflight, readJson } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return error("Method not allowed", 405);
  const body = await readJson<{ network_id?: string; month?: string }>(req);
  const networkId = String(body.network_id ?? "");
  const month = String(body.month ?? "");
  if (!UUID.test(networkId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return error("Invalid request");
  const monthDate = `${month}-01`;

  const user = userClient(req);
  const { data: count, error: genErr } = await user.rpc("franchise_generate_statements", { p_network: networkId, p_month: monthDate });
  if (genErr) return error(genErr.message, 403);

  const db = adminClient();
  const { data: net } = await db.from("franchise_networks").select("name, hq_org_id").eq("id", networkId).single();
  const { data: hq } = await db.from("organizations").select("name, email, phone, logo_url, currency").eq("id", net!.hq_org_id).single();
  const { data: rows, error: rErr } = await db.rpc("franchise_statement_recipients", { p_network: networkId, p_month: monthDate });
  if (rErr) return error("Could not load statements", 500);
  const label = new Date(`${monthDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  let emailed = 0;
  let failed = 0;
  for (const r of (rows ?? []) as { statement_id: string; location_name: string; emails: string[] }[]) {
    const { data: s } = await db.from("franchise_statements").select("*").eq("id", r.statement_id).single();
    if (!s || s.status === "paid" || !r.emails.length) continue;
    const cur = hq?.currency ?? "USD";
    const line = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#475569">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(v)}</td></tr>`;
    const html = emailLayout({
      brand: { name: net!.name, logo_url: hq?.logo_url, email: hq?.email, phone: hq?.phone },
      heading: `${label} statement: ${r.location_name}`,
      bodyHtml: `<table style="width:100%;border-collapse:collapse;font-size:15px">
        ${line("Gross sales collected in Tarmo", money(Number(s.gross_sales), cur))}
        ${line(`Royalty (${Number(s.royalty_pct)}%)`, money(Number(s.royalty), cur))}
        ${line(`Marketing fund (${Number(s.marketing_pct)}%)`, money(Number(s.marketing), cur))}
        <tr><td style="padding:10px 0;border-top:1px solid #e2e8f0;font-weight:700">Total due</td><td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;font-weight:800">${esc(money(Number(s.total), cur))}</td></tr>
      </table>
      <p style="font-size:14px;color:#475569;margin-top:16px">${esc(net!.name)} will invoice this amount as usual. Questions? Reply to this email.</p>`,
      button: { label: "Open Tarmo", url: portalUrl() },
    });
    try {
      await sendEmail({
        to: r.emails,
        subject: `${net!.name}: ${label} royalty statement for ${r.location_name}`,
        html,
        text: `${label} statement for ${r.location_name}\nGross sales: ${money(Number(s.gross_sales), cur)}\nRoyalty (${Number(s.royalty_pct)}%): ${money(Number(s.royalty), cur)}\nMarketing fund (${Number(s.marketing_pct)}%): ${money(Number(s.marketing), cur)}\nTotal due: ${money(Number(s.total), cur)}`,
        replyTo: hq?.email ?? null,
        fromName: net!.name,
      });
      await db.from("franchise_statements").update({ sent_at: new Date().toISOString() }).eq("id", s.id);
      emailed++;
    } catch (e) {
      console.error("statement email failed", r.statement_id, e);
      failed++;
    }
  }
  return json({ statements: count ?? 0, emailed, failed });
});
