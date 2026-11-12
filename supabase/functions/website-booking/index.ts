// A company's public booking page (its own website links to or embeds gettarmo.com/book/<slug>). No sign-in.
//
// POST { action: 'info', slug }
//   → { name, logo_url, phone, website, message, business_types[], services: [{ id, name, description, asset_type }] }
// POST { action: 'submit', slug, name, email, phone?, company?, asset_type?, asset_id?, asset_desc?, service_id?,
//        location?, preferred?[], notes?, website? }
//   → { company, service }
//   Creates the customer, the aircraft / boat / vehicle, a lead and a booking request in the company's Tarmo
//   (booking_page_submit; managers are notified by the booking request), emails the company, and sends the
//   customer a confirmation. `website` is a hidden honeypot field: bots that fill it in get a normal-looking
//   answer and nothing is saved.
import { adminClient } from "../_shared/clients.ts";
import { error, json, portalUrl, preflight } from "../_shared/http.ts";
import { emailLayout, isEmail, sendEmail, textToHtml } from "../_shared/email.ts";
import { reportError } from "../_shared/errors.ts";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ipHash(req: Request): Promise<string | null> {
  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`website-booking:${ip}`));
  return Array.from(new Uint8Array(digest)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return error("Method not allowed", 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return error("Invalid request"); }
  const slug = str(body.slug, 40).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return error("This booking page is not available", 404);
  const db = adminClient();

  if (body.action === "info") {
    const { data, error: e } = await db.rpc("booking_page_info", { p_slug: slug });
    if (e) return error("Could not load this page. Please try again.", 500);
    if (!data) return error("This booking page is not available", 404);
    return json(data);
  }

  if (body.action === "submit") {
    if (str(body.website, 200)) return json({ company: null, service: null });
    const preferred = Array.isArray(body.preferred)
      ? body.preferred.filter((d) => typeof d === "string" && !Number.isNaN(Date.parse(d))).slice(0, 3)
      : [];
    const serviceId = typeof body.service_id === "string" && UUID.test(body.service_id) ? body.service_id : null;
    const name = str(body.name, 120);
    const email = str(body.email, 200).toLowerCase();
    const { data, error: e } = await db.rpc("booking_page_submit", {
      p_slug: slug, p_name: name, p_email: email, p_phone: str(body.phone, 40), p_company: str(body.company, 120),
      p_asset_type: str(body.asset_type, 20), p_asset_id: str(body.asset_id, 60), p_asset_desc: str(body.asset_desc, 200),
      p_service: serviceId, p_location: str(body.location, 200), p_preferred: preferred, p_notes: str(body.notes, 1000),
      p_ip_hash: await ipHash(req),
    });
    if (e) return error(e.message.replace(/^.*?: /, ""));
    const r = data as { company: string; company_email: string | null; company_phone: string | null; service: string | null };

    // Emails are best-effort: the booking is already saved in Tarmo.
    if (Deno.env.get("RESEND_API_KEY")) {
      const brand = { name: r.company, email: r.company_email, phone: r.company_phone };
      const summary = [
        r.service ? `Service: ${r.service}` : null,
        str(body.asset_id, 60) || str(body.asset_desc, 200) ? `Asset: ${[str(body.asset_id, 60), str(body.asset_desc, 200)].filter(Boolean).join(" · ")}` : null,
        str(body.location, 200) ? `Where: ${str(body.location, 200)}` : null,
        preferred.length ? `Preferred: ${preferred.map((d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })).join(", ")}` : null,
      ].filter(Boolean).join("\n");
      try {
        if (isEmail(email)) {
          const text = `Hi ${name.split(" ")[0] || "there"},\n\nThanks for your request. ${r.company} has it and will contact you to confirm the details and a time.\n\n${summary}${r.company_phone ? `\n\nQuestions? Call ${r.company_phone}.` : ""}`;
          await sendEmail({
            to: email, fromName: r.company, replyTo: r.company_email, subject: `We received your request · ${r.company}`, text,
            html: emailLayout({ brand, heading: "Request received", bodyHtml: textToHtml(text) }),
          });
        }
        if (r.company_email && isEmail(r.company_email)) {
          const text = `New booking from your website.\n\n${name} <${email}>${str(body.phone, 40) ? ` · ${str(body.phone, 40)}` : ""}\n${summary}${str(body.notes, 1000) ? `\n\n${str(body.notes, 1000)}` : ""}\n\nIt's in Tarmo under Requests and Leads.`;
          await sendEmail({
            to: r.company_email, replyTo: email, subject: `New website booking: ${name}`, text,
            html: emailLayout({ brand, heading: "New website booking", bodyHtml: textToHtml(text), button: { label: "Open Requests", url: `${portalUrl()}/requests` } }),
          });
        }
      } catch (err) {
        await reportError("website-booking:email", err);
      }
    }
    return json({ company: r.company, service: r.service });
  }

  return error("Unknown action");
});
