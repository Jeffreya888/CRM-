// Emails a team invitation: link + code, role, company and expiry.
// POST { invitation_id } → { sent: true }   (owners and admins of the company)
import { adminClient, callerRole } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { emailLayout, esc, isEmail, sendEmail } from "../_shared/email.ts";
import { fmtDateTime, links } from "../_shared/automation.ts";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", manager: "Manager", technician: "Technician", viewer: "Viewer",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { invitation_id } = await req.json().catch(() => ({}));
    if (typeof invitation_id !== "string" || !invitation_id) return error("invitation_id required");
    const db = adminClient();
    const { data: inv } = await db.from("invitations")
      .select("id, org_id, email, role, code, token, expires_at, accepted_at, revoked_at, invited_by, org:organizations(name, email, logo_url, timezone, is_demo)")
      .eq("id", invitation_id).maybeSingle();
    if (!inv) return error("Invitation not found", 404);
    const caller = await callerRole(req, inv.org_id);
    if (!caller || !["owner", "admin"].includes(caller.role)) return error("Invitation not found", 404);
    // deno-lint-ignore no-explicit-any
    const org = (Array.isArray(inv.org) ? inv.org[0] : inv.org) as any;
    if (org?.is_demo) return error("DEMO: invitations are disabled in the demo workspace");
    if (inv.accepted_at) return error("This invitation was already accepted");
    if (inv.revoked_at) return error("This invitation was revoked. Send a new one.");
    if (Date.parse(inv.expires_at) < Date.now()) return error("This invitation expired. Send a new one.");
    if (!isEmail(inv.email)) return error("The invitation email address is not valid");

    const { data: inviter } = await db.from("profiles").select("full_name").eq("id", caller.userId).maybeSingle();
    const who = inviter?.full_name || "Your team";
    const link = links.invite(inv.token);
    const role = ROLE_LABEL[inv.role] ?? inv.role;
    const expires = fmtDateTime(inv.expires_at, org?.timezone ?? "UTC");

    const html = emailLayout({
      brand: { name: org?.name, logo_url: org?.logo_url },
      heading: `Join ${org?.name ?? "your team"} on Tarmo`,
      bodyHtml: `<p style="line-height:1.5">${esc(who)} invited you to join <b>${esc(org?.name)}</b> as <b>${esc(role)}</b>.</p>
        <p style="line-height:1.5">Tap the button on your phone to accept, or open Tarmo, choose <b>Join your company</b> and enter this code:</p>
        <p style="font-size:26px;font-weight:700;letter-spacing:4px;margin:8px 0 4px">${esc(inv.code)}</p>`,
      button: { label: "Accept invitation", url: link },
      footerHtml: `<p style="color:#64748b;font-size:13px;line-height:1.5">This invitation expires ${esc(expires)}. If you weren't expecting it, you can ignore this email.</p>`,
    });
    const text = `${who} invited you to join ${org?.name} on Tarmo as ${role}.\n\nAccept: ${link}\nOr open Tarmo → Join your company and enter code ${inv.code}.\n\nThis invitation expires ${expires}.`;
    await sendEmail({ to: inv.email, subject: `You're invited to join ${org?.name} on Tarmo`, html, text, replyTo: org?.email, fromName: org?.name, quota: { db, orgId: inv.org_id } });
    await db.from("invitations").update({ sent_at: new Date().toISOString() }).eq("id", inv.id);
    return json({ sent: true });
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
