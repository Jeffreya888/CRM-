// One-tap reorder: emails each vendor the low-stock items they supply.
// POST { org_id, item_ids? } → { emailed, skipped_without_email }   (owners, admins, managers)
// Without item_ids: every active item at or below its par level.
import { adminClient, callerRole } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { emailLayout, esc, isEmail, sendEmail } from "../_shared/email.ts";
import { loadOrg, queueMessage } from "../_shared/automation.ts";

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { org_id, item_ids } = await req.json().catch(() => ({}));
    if (typeof org_id !== "string" || !org_id) return error("org_id required");
    if (item_ids != null && (!Array.isArray(item_ids) || item_ids.some((i) => typeof i !== "string") || item_ids.length > 500)) {
      return error("item_ids must be a list of item ids");
    }
    const caller = await callerRole(req, org_id);
    if (!caller || !["owner", "admin", "manager"].includes(caller.role)) return error("Not allowed", 403);
    const db = adminClient();
    const org = await loadOrg(db, org_id);
    if (!org) return error("Company not found", 404);
    if (org.is_demo) return error("DEMO: emails are not sent from the demo workspace");

    let q = db.from("inventory_items").select("id, name, sku, unit, quantity, par_level, reorder_qty, vendor, vendor_email, vendor_url")
      .eq("org_id", org_id).eq("active", true);
    if (item_ids?.length) q = q.in("id", item_ids);
    const { data: items, error: e } = await q;
    if (e) throw e;
    const list = (items ?? []).filter((i) => item_ids?.length || (Number(i.par_level) > 0 && Number(i.quantity) <= Number(i.par_level)));

    const byVendor = new Map<string, typeof list>();
    let skipped = 0;
    for (const i of list) {
      const email = String(i.vendor_email ?? "").trim().toLowerCase();
      if (!isEmail(email)) { skipped++; continue; }
      byVendor.set(email, [...(byVendor.get(email) ?? []), i]);
    }

    const { data: me } = await db.from("profiles").select("full_name").eq("id", caller.userId).maybeSingle();
    let emailed = 0;
    const failures: string[] = [];
    for (const [email, rows] of byVendor) {
      const vendor = rows[0].vendor || "there";
      const lines = rows.map((i) => {
        const n = Number(i.reorder_qty) > 0 ? Number(i.reorder_qty) : Math.max(1, Math.ceil(Number(i.par_level) * 2 - Number(i.quantity)));
        return { name: i.name, sku: i.sku ?? "", qty: qty(n), unit: i.unit ?? "each" };
      });
      const td = 'style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:left"';
      const table = `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 16px">
        <tr><th ${td}>Item</th><th ${td}>SKU</th><th ${td}>Qty</th><th ${td}>Unit</th></tr>
        ${lines.map((l) => `<tr><td ${td}>${esc(l.name)}</td><td ${td}>${esc(l.sku || "-")}</td><td ${td}>${esc(l.qty)}</td><td ${td}>${esc(l.unit)}</td></tr>`).join("")}
      </table>`;
      const sender = me?.full_name ? `${me.full_name}, ${org.name}` : org.name;
      const html = emailLayout({
        brand: org,
        heading: "Order request",
        bodyHtml: `<p style="line-height:1.5">Hi ${esc(vendor)},</p><p style="line-height:1.5">Please send us the following items:</p>${table}
          <p style="line-height:1.5">Please reply to confirm availability, price and delivery date.${org.phone ? ` You can also reach us at ${esc(org.phone)}.` : ""}</p>
          <p style="line-height:1.5">Thank you,<br>${esc(sender)}</p>`,
      });
      const text = `Hi ${vendor},\n\nPlease send us the following items:\n\n${lines.map((l) => `- ${l.name}${l.sku ? ` (SKU ${l.sku})` : ""}: ${l.qty} ${l.unit}`).join("\n")}\n\nPlease reply to confirm availability, price and delivery date.\n\nThank you,\n${sender}`;
      const subject = `Order request from ${org.name}`;
      try {
        const id = await sendEmail({ to: email, cc: org.email, replyTo: org.email, fromName: org.name, subject, html, text });
        emailed++;
        await queueMessage(db, {
          org_id, channel: "email", to_address: email, subject, body: text, status: "sent", provider_id: id || null,
          sent_at: new Date().toISOString(), created_by: caller.userId,
        }).catch((err) => console.error("log failed", err));
      } catch (err) {
        failures.push(`${email}: ${(err as Error).message}`);
      }
    }
    if (!emailed && failures.length) return error(failures.join("; "), 502);
    return json({ emailed, skipped_without_email: skipped, failed: failures.length });
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
