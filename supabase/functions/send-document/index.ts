// Emails a quote or invoice to the customer with a link to the online portal
// (view, accept, pay) and logs it in the message log. Invoices use the company
// snapshot taken when they were sent (branding) and include the Google review
// link when the company has one. Demo companies never send real email.
//
// POST { kind: "quote" | "invoice", id, to?, message? } → { sent: true, link }
import { adminClient, callerRole } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { emailLayout, esc, isEmail, textToHtml } from "../_shared/email.ts";
import { DEMO_BLOCKED, deliverMessage, fmtYmd, invoiceEmailText, links, loadOrg, money, queueMessage, type Row } from "../_shared/automation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { kind, id, to, message } = await req.json().catch(() => ({}));
    if (!["quote", "invoice"].includes(kind) || typeof id !== "string" || !id) return error("kind and id required");
    const db = adminClient();
    const table = kind === "quote" ? "quotes" : "invoices";
    const cols = kind === "quote"
      ? "id, org_id, number, total, public_token, status, valid_until, valid_until_at, customer_id, customer:customers(id, name, email)"
      : "id, org_id, number, total, balance, due_date, public_token, status, org_snapshot, customer_id, customer:customers(id, name, email)";
    const { data } = await db.from(table).select(cols).eq("id", id).maybeSingle();
    const doc = data as Row | null;
    if (!doc) return error("Not found", 404);
    const caller = await callerRole(req, doc.org_id);
    if (!caller || !["owner", "admin", "manager"].includes(caller.role)) return error("Not found", 404);
    if (doc.status === "void") return error("This invoice was voided");

    const org = await loadOrg(db, doc.org_id);
    if (!org) return error("Company not found", 404);
    const customer = (Array.isArray(doc.customer) ? doc.customer[0] : doc.customer) as Row | null;
    const recipient = String(to ?? customer?.email ?? "").trim();
    if (!recipient) return error("Customer has no email address");
    if (!isEmail(recipient)) return error("That email address does not look right");

    const snap = kind === "invoice" ? (doc.org_snapshot as Row | null) : null;
    const brand = { name: snap?.name ?? org.name, logo_url: snap?.logo_url ?? org.logo_url, email: snap?.email ?? org.email, phone: snap?.phone ?? org.phone };
    const link = kind === "quote" ? links.quote(doc.public_token) : links.invoice(doc.public_token);
    const label = kind === "quote" ? "Quote" : "Invoice";
    const reviewUrl = kind === "invoice" ? (snap?.google_review_url ?? org.google_review_url) : null;
    const note = typeof message === "string" && message.trim() ? message.trim().slice(0, 2000) : null;

    const text = kind === "invoice"
      ? (note ? `Hi ${customer?.name ?? "there"},\n\n${note}\n\nView and pay online: ${link}${reviewUrl ? `\n\nHappy with our work? A quick Google review means a lot: ${reviewUrl}` : ""}\n\nThank you,\n${brand.name}`
        : invoiceEmailText(org, customer, { ...doc, org_snapshot: snap }, reviewUrl))
      : `Hi ${customer?.name ?? "there"},\n\n${note ?? `Your quote ${doc.number} for ${money(doc.total, org.currency)} is ready.`}${
          doc.valid_until ? ` It is valid until ${fmtYmd(doc.valid_until)}.` : ""}\n\nReview and accept it here: ${link}\n\nThank you,\n${brand.name}`;

    const bodyHtml = textToHtml(text.replace(/\n\n(View and pay online|Review and accept it here): \S+/, "").replace(/\n\nHappy with our work\?[^\n]*/, ""));
    const html = emailLayout({
      brand,
      bodyHtml,
      button: { label: kind === "quote" ? "Review & accept" : "View & pay", url: link },
      footerHtml: [
        reviewUrl ? `<p style="line-height:1.5">Happy with our work? <a href="${esc(reviewUrl)}" style="color:#0B3D91">Leave us a Google review</a>. It means a lot.</p>` : "",
        `<p style="color:#64748b;font-size:13px">Questions? Reply to this email${brand.email ? ` or contact ${esc(brand.email)}` : ""}.</p>`,
      ].join(""),
    });
    const subject = `${label} ${doc.number} from ${brand.name}`;

    // First send uses "<kind>_sent:<id>" (the worker's auto-send checks it); resends get a unique suffix.
    const row = {
      org_id: doc.org_id, customer_id: customer?.id ?? null, channel: "email" as const, to_address: recipient, subject, body: text,
      invoice_id: kind === "invoice" ? doc.id : null, quote_id: kind === "quote" ? doc.id : null, created_by: caller.userId,
    };
    const messageId = await queueMessage(db, { ...row, dedupe_key: `${kind}_sent:${doc.id}` })
      ?? await queueMessage(db, { ...row, dedupe_key: `${kind}_sent:${doc.id}:${Date.now()}` });
    if (!messageId) return error("Could not log this email", 500);

    if (org.is_demo) {
      await db.from("messages").update({ status: "blocked", error: DEMO_BLOCKED }).eq("id", messageId).eq("status", "queued");
      return error("DEMO: emails are not sent from the demo workspace");
    }
    const r = await deliverMessage(db, messageId, { html });
    if (r.status !== "sent") return error(r.error ?? "The email could not be sent", 502);

    if (doc.status === "draft") {
      await db.from(table).update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
    } else if (kind === "invoice") {
      await db.from(table).update({ sent_at: new Date().toISOString() }).eq("id", id);
    }
    await db.from("activities").insert({
      org_id: doc.org_id, kind: "email", created_by: caller.userId, customer_id: doc.customer_id,
      body: `${label} ${doc.number} emailed to ${recipient}`,
    });
    return json({ sent: true, link });
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
