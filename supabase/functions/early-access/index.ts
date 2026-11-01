// Early access list (public website, no sign-in).
//
// POST { name, email, company?, business_types[], crew_size? } → { existing }
//   Joins the list (join_early_access) and sends the welcome email once per address.
// POST { unsubscribe: token } or POST ?unsubscribe=token (one-click from the
//   List-Unsubscribe header) → { ok } and no more early access emails.
// Env: RESEND_API_KEY, EMAIL_FROM, SUPPORT_EMAIL (Reply-To), PORTAL_URL,
//   MAILING_ADDRESS (postal address shown in the footer; required by CAN-SPAM).
import { adminClient } from "../_shared/clients.ts";
import { sendEmail } from "../_shared/email.ts";
import { env, error, json, portalUrl, preflight } from "../_shared/http.ts";
import { welcomeHtml, welcomeText } from "./welcome.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return error("Method not allowed", 405);
  const db = adminClient();
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* one-click unsubscribe posts a form body */ }

  const token = String(url.searchParams.get("unsubscribe") ?? body.unsubscribe ?? "");
  if (token) {
    if (!UUID.test(token)) return error("Invalid link");
    const { error: e } = await db.from("early_access").update({ unsubscribed_at: new Date().toISOString() })
      .eq("unsubscribe_token", token).is("unsubscribed_at", null);
    if (e) return error("Could not unsubscribe. Please try again.", 500);
    return json({ ok: true });
  }

  const types = Array.isArray(body.business_types) ? body.business_types.map(String) : [];
  const { data: existing, error: joinError } = await db.rpc("join_early_access", {
    p_name: String(body.name ?? ""), p_email: String(body.email ?? ""), p_company: String(body.company ?? ""),
    p_business_types: types, p_crew_size: body.crew_size == null ? null : String(body.crew_size),
  });
  if (joinError) return error(joinError.message.replace(/^.*?: /, ""));

  // Claim the welcome before sending so a double submit can't send twice.
  const email = String(body.email).trim().toLowerCase();
  const { data: row } = await db.from("early_access").update({ welcomed_at: new Date().toISOString() })
    .eq("email", email).is("welcomed_at", null).is("unsubscribed_at", null)
    .select("name, business_types, unsubscribe_token").maybeSingle();
  if (row) {
    const unsubscribeUrl = `${portalUrl()}/unsubscribe?t=${row.unsubscribe_token}`;
    const oneClick = `${env("SUPABASE_URL")}/functions/v1/early-access?unsubscribe=${row.unsubscribe_token}`;
    const w = { firstName: String(row.name).split(/\s+/)[0] ?? "", types: row.business_types as string[], unsubscribeUrl, siteUrl: portalUrl(), address: Deno.env.get("MAILING_ADDRESS") ?? "" };
    try {
      await sendEmail({
        to: email,
        subject: "You're on the Tarmo early access list",
        html: welcomeHtml(w),
        text: welcomeText(w),
        replyTo: Deno.env.get("SUPPORT_EMAIL"),
        headers: { "List-Unsubscribe": `<${oneClick}>, <${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
    } catch (e) {
      // Leave the sign-up in place; let a later sign-up with this address try again.
      console.error("early access welcome failed", e);
      await db.from("early_access").update({ welcomed_at: null }).eq("email", email);
    }
  }
  return json({ existing: existing === true });
});
