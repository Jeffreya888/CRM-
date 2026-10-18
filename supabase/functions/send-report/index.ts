// Emails reports (P&L PDF + CSVs) to the company's accountant.
// POST { org_id, to?, subject, body, attachments: [{ filename, content_base64, type }] } → { sent: true }
// Requires the "see reports" permission (owners/admins always have it).
import { adminClient, userClient } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { emailLayout, isEmail, sendEmail, textToHtml } from "../_shared/email.ts";
import { loadOrg, queueMessage } from "../_shared/automation.ts";

const MAX_BYTES = 10 * 1024 * 1024;
const REPORT_TYPES: Record<string, string> = { pdf: "application/pdf", csv: "text/csv", html: "text/html" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { org_id, to, subject, body, attachments } = await req.json().catch(() => ({}));
    if (typeof org_id !== "string" || !org_id) return error("org_id required");
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return error("Sign in first", 401);
    const { data: allowed, error: pe } = await sb.rpc("has_perm", { p_org: org_id, p_perm: "see_reports" });
    if (pe || !allowed) return error("You don't have permission to send reports", 403);

    const db = adminClient();
    const org = await loadOrg(db, org_id);
    if (!org) return error("Company not found", 404);
    if (org.is_demo) return error("DEMO: emails are not sent from the demo workspace");
    const recipient = String(to ?? org.accountant_email ?? "").trim();
    if (!isEmail(recipient)) return error("Enter your accountant's email address");
    if (typeof subject !== "string" || !subject.trim()) return error("subject required");

    const files = Array.isArray(attachments) ? attachments : [];
    if (files.length > 20) return error("Too many attachments");
    let total = 0;
    const out = [];
    for (const f of files) {
      if (!f || typeof f.filename !== "string" || typeof f.content_base64 !== "string") return error("Each attachment needs a filename and content");
      const clean = f.content_base64.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
      total += Math.floor(clean.length * 3 / 4);
      if (total > MAX_BYTES) return error("Attachments are larger than 10 MB in total. Pick a shorter period.");
      // Reports only: PDF, CSV (and the HTML fallback when a PDF can't be made). No executables or other files.
      const filename = f.filename.replace(/[\r\n/\\]/g, " ").slice(0, 120);
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const content_type = REPORT_TYPES[ext];
      if (!content_type) return error("Attachments must be PDF or CSV files");
      out.push({ filename, content: clean, content_type });
    }

    const text = String(body ?? "").slice(0, 20000);
    const html = emailLayout({ brand: org, bodyHtml: textToHtml(text) });
    const { data: me } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const replyTo = user.email && isEmail(user.email) ? user.email : org.email;
    const id = await sendEmail({ to: recipient, subject: subject.trim(), html, text, replyTo, cc: replyTo !== recipient ? replyTo : null, fromName: org.name, attachments: out, quota: { db, orgId: org_id } });
    await queueMessage(db, {
      org_id, channel: "email", to_address: recipient, subject: subject.trim(),
      // The message log is visible to managers who may not see reports: log only what was sent, not the figures.
      body: `Report emailed to the accountant${me?.full_name ? ` by ${me.full_name}` : ""}.\n\nAttachments: ${out.map((f) => f.filename).join(", ") || "none"}`,
      status: "sent", provider_id: id || null, sent_at: new Date().toISOString(), created_by: user.id,
    }).catch((err) => console.error("log failed", err));
    return json({ sent: true });
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
