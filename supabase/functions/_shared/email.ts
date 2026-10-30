// Transactional email through Resend (https://resend.com).
//
// Env: RESEND_API_KEY, EMAIL_FROM ("Tarmo <notify@your-domain.com>" or a
// bare address). Emails sent for a company go out as
// "Company via Tarmo <address>" with Reply-To set to the company email,
// so customer replies reach the company, not the platform.
import type { SupabaseClient } from "./deps.ts";
import { env } from "./http.ts";

export type EmailAttachment = { filename: string; content: string /* base64 */; content_type?: string };

export type EmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | null;
  cc?: string | string[] | null;
  attachments?: EmailAttachment[];
  /** Company name shown as "<name> via Tarmo". Omit for platform emails. */
  fromName?: string | null;
  /** Counts against the company's daily email limit (anti-abuse). Omit for platform emails. */
  quota?: { db: SupabaseClient; orgId: string };
};

/**
 * Reserves room in a company's rolling 24-hour email allowance (set per plan in
 * public.claim_email_quota). Throws DAILY_EMAIL_LIMIT when it is used up.
 */
export async function claimEmailQuota(db: SupabaseClient, orgId: string, recipients: number) {
  const { data, error } = await db.rpc("claim_email_quota", { p_org: orgId, p_count: Math.max(1, recipients) });
  if (error) throw new Error(`Email limit check failed: ${error.message}`);
  if (data !== true) {
    throw new Error("DAILY_EMAIL_LIMIT: this company reached its daily email limit. Emails resume within 24 hours; contact support if you need more.");
  }
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const isEmail = (s: unknown): s is string => typeof s === "string" && /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(s.trim());

/** The bare address from EMAIL_FROM ("Name <a@b.c>" or "a@b.c"). */
function fromAddress(): string {
  const raw = env("EMAIL_FROM").trim();
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

/** "Skyline Detailing via Tarmo <notify@…>" (quotes/brackets stripped from the name). */
export function fromHeader(companyName?: string | null): string {
  if (!companyName) return env("EMAIL_FROM");
  const clean = companyName.replace(/["<>\r\n]/g, "").trim().slice(0, 60);
  if (!clean) return env("EMAIL_FROM");
  return `"${clean} via Tarmo" <${fromAddress()}>`;
}

/** Sends one email. Returns the Resend message id; throws with the provider's message on failure. */
export async function sendEmail(input: EmailInput): Promise<string> {
  const to = (Array.isArray(input.to) ? input.to : [input.to]).map((t) => t.trim()).filter(Boolean);
  if (!to.length || !to.every(isEmail)) throw new Error("Invalid email address");
  const cc = input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]).filter(isEmail) : [];
  if (input.quota) await claimEmailQuota(input.quota.db, input.quota.orgId, to.length + cc.length);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromHeader(input.fromName),
      to,
      cc: cc.length ? cc : undefined,
      reply_to: input.replyTo && isEmail(input.replyTo) ? input.replyTo : undefined,
      subject: input.subject.replace(/[\r\n]+/g, " ").slice(0, 250),
      html: input.html,
      text: input.text,
      attachments: input.attachments?.length ? input.attachments : undefined,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = body;
    try { msg = JSON.parse(body).message ?? body; } catch { /* plain text */ }
    throw new Error(`Email failed: ${msg}`.slice(0, 500));
  }
  try { return String(JSON.parse(body).id ?? ""); } catch { return ""; }
}

/** Plain text → safe HTML paragraphs with clickable links. */
export function textToHtml(text: string): string {
  const linkify = (s: string) =>
    s.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, (u) => `<a href="${u}" style="color:#0B3D91">${u}</a>`);
  return String(text ?? "")
    .replace(/\\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.5">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export type Brand = { name?: string | null; logo_url?: string | null; email?: string | null; phone?: string | null };

/**
 * Simple branded layout: logo / company name header, body, optional button
 * and a small footer. Inline styles only (email clients ignore <style>).
 */
export function emailLayout(opts: {
  brand?: Brand | null;
  heading?: string | null;
  bodyHtml: string;
  button?: { label: string; url: string } | null;
  footerHtml?: string | null;
}): string {
  const b = opts.brand ?? {};
  const name = b.name || "Tarmo";
  const logo = b.logo_url && /^https:\/\//.test(b.logo_url)
    ? `<img src="${esc(b.logo_url)}" alt="${esc(name)}" style="max-height:56px;max-width:200px;display:block;margin:0 0 8px">`
    : "";
  const button = opts.button
    ? `<p style="margin:22px 0"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#0B3D91;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">${esc(opts.button.label)}</a></p>`
    : "";
  const contact = [b.phone, b.email].filter(Boolean).map(esc).join(" · ");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9">
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#0f172a">
  <div style="background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
    ${logo}<div style="font-size:18px;font-weight:700;margin:0 0 16px">${esc(name)}</div>
    ${opts.heading ? `<h2 style="font-size:20px;margin:0 0 14px">${esc(opts.heading)}</h2>` : ""}
    ${opts.bodyHtml}
    ${button}
    ${opts.footerHtml ?? ""}
  </div>
  <p style="color:#64748b;font-size:12px;text-align:center;margin:14px 0 0">${contact ? `${esc(name)} · ${contact}<br>` : ""}Sent with Tarmo</p>
</div></body></html>`;
}
