// Vendor order emails for low stock, shared by the one-tap reorder (send-reorder)
// and automatic reordering (automation worker). Each vendor gets one email listing
// its items; the items emailed get reorder_sent_at so they aren't ordered twice
// before they're restocked (a trigger clears it once stock is back above par).
import type { SupabaseClient } from "./deps.ts";
import { type Org, queueMessage } from "./automation.ts";
import { emailLayout, esc, isEmail, sendEmail } from "./email.ts";

export const REORDER_COLS = "id, name, sku, unit, quantity, par_level, reorder_qty, vendor, vendor_email, vendor_url";
export type ReorderItem = {
  id: string; name: string; sku: string | null; unit: string | null; quantity: number; par_level: number;
  reorder_qty: number; vendor: string | null; vendor_email: string | null;
};

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/** Each item's order quantity: its reorder quantity, else enough to reach twice par. */
export const orderQty = (i: ReorderItem) =>
  Number(i.reorder_qty) > 0 ? Number(i.reorder_qty) : Math.max(1, Math.ceil(Number(i.par_level) * 2 - Number(i.quantity)));

export async function emailVendorOrders(
  db: SupabaseClient, org: Org, items: ReorderItem[], opts: { sender?: string | null; createdBy?: string | null } = {},
) {
  const byVendor = new Map<string, ReorderItem[]>();
  let skipped = 0;
  for (const i of items) {
    const email = String(i.vendor_email ?? "").trim().toLowerCase();
    if (!isEmail(email)) { skipped++; continue; }
    byVendor.set(email, [...(byVendor.get(email) ?? []), i]);
  }

  let emailed = 0;
  const failures: string[] = [];
  const sentIds: string[] = [];
  for (const [email, rows] of byVendor) {
    const vendor = rows[0].vendor || "there";
    const lines = rows.map((i) => ({ name: i.name, sku: i.sku ?? "", qty: qty(orderQty(i)), unit: i.unit ?? "each" }));
    const td = 'style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:left"';
    const table = `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 16px">
      <tr><th ${td}>Item</th><th ${td}>SKU</th><th ${td}>Qty</th><th ${td}>Unit</th></tr>
      ${lines.map((l) => `<tr><td ${td}>${esc(l.name)}</td><td ${td}>${esc(l.sku || "-")}</td><td ${td}>${esc(l.qty)}</td><td ${td}>${esc(l.unit)}</td></tr>`).join("")}
    </table>`;
    const sender = opts.sender ? `${opts.sender}, ${org.name}` : org.name;
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
      const id = await sendEmail({ to: email, cc: org.email, replyTo: org.email, fromName: org.name, subject, html, text, quota: { db, orgId: org.id } });
      emailed++;
      sentIds.push(...rows.map((r) => r.id));
      await queueMessage(db, {
        org_id: org.id, channel: "email", to_address: email, subject, body: text, status: "sent", provider_id: id || null,
        sent_at: new Date().toISOString(), created_by: opts.createdBy ?? null,
      }).catch((err) => console.error("log failed", err));
    } catch (err) {
      failures.push(`${email}: ${(err as Error).message}`);
    }
  }
  if (sentIds.length) {
    await db.from("inventory_items").update({ reorder_sent_at: new Date().toISOString() }).in("id", sentIds);
  }
  return { emailed, skipped, failures, sentIds };
}
