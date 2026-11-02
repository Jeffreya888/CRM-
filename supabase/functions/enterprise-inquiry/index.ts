// Enterprise enquiries from the public website (no sign-in).
//
// POST { name, email, company, phone?, locations, business_types[], message? } → { ok }
// Saved as a support message (topic "Enterprise", shown in Platform admin → Support)
// and emailed to SUPPORT_EMAIL with Reply-To set to the person, so a reply goes
// straight to them.
import { adminClient } from "../_shared/clients.ts";
import { esc, isEmail, sendEmail } from "../_shared/email.ts";
import { error, json, preflight } from "../_shared/http.ts";

const LOCATIONS = ["2–5", "6–20", "21–100", "100+"];
const TYPES: Record<string, string> = { aircraft: "Aircraft", watercraft: "Boats & yachts", vehicle: "Cars & trucks" };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return error("Method not allowed", 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return error("Invalid request"); }

  const str = (k: string, max: number) => String(b[k] ?? "").trim().slice(0, max);
  const name = str("name", 200), email = str("email", 254), company = str("company", 200), phone = str("phone", 40);
  const locations = String(b.locations ?? "");
  const types = (Array.isArray(b.business_types) ? b.business_types.map(String) : []).filter((t) => t in TYPES);
  const note = str("message", 3000);
  if (name.length < 2 || !isEmail(email) || company.length < 2) return error("Please enter your name, work email and company.");
  if (!LOCATIONS.includes(locations)) return error("Please choose how many locations you have.");

  const lines = [
    `Company: ${company}`,
    `Locations: ${locations}`,
    `Details: ${types.map((t) => TYPES[t]).join(", ") || "Not given"}`,
    phone ? `Phone: ${phone}` : null,
    note ? `\n${note}` : null,
  ].filter(Boolean).join("\n");

  const db = adminClient();
  const { error: e } = await db.rpc("submit_support_message", {
    p_name: name, p_email: email, p_company: company, p_topic: "Enterprise", p_message: `Enterprise enquiry\n${lines}`,
  });
  if (e) return error(e.message.replace(/^.*?: /, ""));

  const to = Deno.env.get("SUPPORT_EMAIL");
  if (to && isEmail(to)) {
    try {
      await sendEmail({
        to,
        replyTo: email,
        subject: `Enterprise enquiry: ${company} (${locations} locations)`,
        text: `${name} <${email}> asked about Tarmo Enterprise.\n\n${lines}\n\nReply to this email to answer them directly.`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;line-height:1.5">
          <h2 style="font-size:20px;margin:0 0 12px">Enterprise enquiry</h2>
          <p style="margin:0 0 12px"><b>${esc(name)}</b> &lt;${esc(email)}&gt; asked about Tarmo Enterprise.</p>
          <p style="margin:0 0 12px;white-space:pre-line">${esc(lines)}</p>
          <p style="margin:0;color:#64748b">Reply to this email to answer them directly. It's also in Platform admin → Support.</p></div>`,
      });
    } catch (err) {
      console.error("enterprise notify failed", err); // still saved in Platform admin → Support
    }
  }
  return json({ ok: true });
});
