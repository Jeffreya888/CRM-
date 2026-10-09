// Emails a quote or invoice to the customer with a link to the online portal
// (view, accept, pay). Uses Resend (https://resend.com) — set RESEND_API_KEY
// and EMAIL_FROM (e.g. "SkyShine <billing@yourdomain.com>").
//
// POST { kind: "quote" | "invoice", id, to?, message? }
import { adminClient, callerRole } from "../_shared/clients.ts";
import { corsHeaders, env, error, json } from "../_shared/http.ts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { kind, id, to, message } = await req.json();
    if (!["quote", "invoice"].includes(kind) || !id) return error("kind and id required");
    const db = adminClient();
    const table = kind === "quote" ? "quotes" : "invoices";
    const { data: doc } = await db.from(table)
      .select("id, org_id, number, total, public_token, status, customer:customers(name, email), org:organizations(name, email)")
      .eq("id", id).maybeSingle();
    if (!doc) return error("Not found", 404);
    const caller = await callerRole(req, doc.org_id);
    if (!caller || !["owner", "admin", "manager"].includes(caller.role)) return error("Not allowed", 403);

    // deno-lint-ignore no-explicit-any
    const customer = doc.customer as any;
    // deno-lint-ignore no-explicit-any
    const org = doc.org as any;
    const recipient = to ?? customer?.email;
    if (!recipient) return error("Customer has no email address");

    const link = `${env("PORTAL_URL")}/portal/${kind}/${doc.public_token}`;
    const label = kind === "quote" ? "Quote" : "Invoice";
    const action = kind === "quote" ? "Review & accept" : "View & pay";
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#0f172a">
        <h2 style="margin:0 0 8px">${esc(org.name)}</h2>
        <p>Hi ${esc(customer?.name ?? "there")},</p>
        <p>${message ? esc(message) : `Your ${label.toLowerCase()} <b>${esc(doc.number)}</b> for <b>$${Number(doc.total).toFixed(2)}</b> is ready.`}</p>
        <p><a href="${link}" style="display:inline-block;background:#0B3D91;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${action}</a></p>
        <p style="color:#64748b;font-size:13px">Questions? Reply to this email${org.email ? ` or contact ${esc(org.email)}` : ""}.</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env("EMAIL_FROM"),
        to: [recipient],
        reply_to: org.email ?? undefined,
        subject: `${label} ${doc.number} from ${org.name}`,
        html,
      }),
    });
    if (!res.ok) return error(`Email failed: ${await res.text()}`, 502);

    if (doc.status === "draft") {
      await db.from(table).update(kind === "invoice" ? { status: "sent", sent_at: new Date().toISOString() } : { status: "sent" }).eq("id", id);
    } else if (kind === "invoice") {
      await db.from(table).update({ sent_at: new Date().toISOString() }).eq("id", id);
    }
    await db.from("activities").insert({
      org_id: doc.org_id, kind: "email", created_by: caller.userId,
      customer_id: (await db.from(table).select("customer_id").eq("id", id).single()).data?.customer_id,
      body: `${label} ${doc.number} emailed to ${recipient}`,
    });
    return json({ sent: true, link });
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
