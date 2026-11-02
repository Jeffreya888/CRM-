// Vendor order emails for low stock, shared by the one-tap reorder (send-reorder)
// and automatic reordering (automation worker). Each vendor gets one email listing
// its items; the items emailed get reorder_sent_at so they aren't ordered twice
// before they're restocked (a trigger clears it once stock is back above par).
import type { SupabaseClient } from "./deps.ts";
import { type Org, outbox, queueMessage } from "./automation.ts";
import { buildCarts } from "./orderLinks.ts";
import { emailLayout, esc, isEmail, sendEmail } from "./email.ts";

export const REORDER_COLS = "id, name, sku, unit, quantity, par_level, reorder_qty, vendor, vendor_email, vendor_url, order_online";
export type ReorderItem = {
  id: string; name: string; sku: string | null; unit: string | null; quantity: number; par_level: number;
  reorder_qty: number; vendor: string | null; vendor_email: string | null; vendor_url?: string | null; order_online?: boolean;
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

/**
 * Web-store supplies: one "ready to reorder" email to the business (and a push
 * to managers) with a pre-filled cart link per store where possible. The owner
 * reviews and pays on the store's site. Items are marked ordered so they aren't
 * flagged again until restocked.
 */
export async function notifyOnlineOrders(db: SupabaseClient, org: Org, items: ReorderItem[]) {
  const online = items.filter((i) => i.vendor_url);
  if (!online.length) return 0;
  const carts = buildCarts(online.map((i) => ({ name: i.name, url: String(i.vendor_url), qty: orderQty(i) })));
  if (!carts.length) return 0;
  const n = carts.reduce((s, c) => s + c.items.length, 0);
  const title = `${n} item${n === 1 ? "" : "s"} ready to reorder online`;
  const btn = (url: string, label: string) =>
    `<a href="${esc(url)}" style="display:inline-block;background:#0B3D91;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${esc(label)}</a>`;
  const blocks = carts.map((c) => `
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 12px">
      <div style="font-weight:700;margin:0 0 6px">${esc(c.store)}</div>
      <ul style="margin:0 0 10px;padding-left:18px">${c.items.map((i) => `<li><a href="${esc(i.url)}" style="color:#0B3D91">${esc(i.name)}</a> × ${i.qty}</li>`).join("")}</ul>
      ${c.cartUrl ? btn(c.cartUrl, "Open filled cart") : `<span style="color:#64748b;font-size:13px">Open each product link to order.</span>`}
    </div>`).join("");
  const html = emailLayout({
    brand: org,
    heading: "Ready to reorder",
    bodyHtml: `<p style="line-height:1.5">These supplies dropped to their par level. Review the cart and pay on the store's site:</p>${blocks}
      <p style="line-height:1.5;color:#64748b;font-size:13px">They're marked as ordered in Supply room until they're restocked.</p>`,
  });
  const text = `These supplies dropped to their par level:\n\n${carts.map((c) => `${c.store}\n${c.items.map((i) => `- ${i.name} x ${i.qty}: ${i.url}`).join("\n")}${c.cartUrl ? `\nFilled cart: ${c.cartUrl}` : ""}`).join("\n\n")}`;
  if (org.email && isEmail(org.email)) {
    try {
      await sendEmail({ to: org.email, subject: title, html, text, quota: { db, orgId: org.id } });
    } catch (err) {
      console.error("online reorder email failed", org.id, err);
    }
  }
  await outbox(db, { org_id: org.id, audience: "managers", kind: "reorder_ready", title, body: carts.map((c) => c.store).join(", "), url: "/inventory" });
  await db.from("inventory_items").update({ reorder_sent_at: new Date().toISOString() }).in("id", online.map((i) => i.id));
  return n;
}
