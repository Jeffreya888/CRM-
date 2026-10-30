// "New sign-in to your Tarmo account" email for the signed-in user.
// The app calls this when register_device() reports a new device.
// POST { device } → { sent }
import { userClient } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { emailLayout, esc, isEmail, sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { device } = await req.json().catch(() => ({}));
    const { data: { user } } = await userClient(req).auth.getUser();
    if (!user) return error("Sign in first", 401);
    // Demo / anonymous accounts have no real inbox.
    if (user.is_anonymous || user.user_metadata?.demo || !isEmail(user.email)) return json({ sent: false });

    const label = String(device ?? "Unknown device").replace(/[\r\n]+/g, " ").slice(0, 100) || "Unknown device";
    const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date()) + " UTC";
    const html = emailLayout({
      heading: "New sign-in to your Tarmo account",
      bodyHtml: `<p style="line-height:1.5">Your account <b>${esc(user.email)}</b> was just used to sign in on a new device.</p>
        <p style="line-height:1.5"><b>Device:</b> ${esc(label)}<br><b>Time:</b> ${esc(when)}</p>
        <p style="line-height:1.5">If this was you, there's nothing to do.</p>
        <p style="line-height:1.5">If it wasn't, open Tarmo → <b>Account &amp; security</b>, change your password and tap <b>Sign out other devices</b>. Turning on two-step sign-in adds extra protection.</p>`,
    });
    const text = `Your account ${user.email} was just used to sign in on a new device.\n\nDevice: ${label}\nTime: ${when}\n\nIf this was you, there's nothing to do. If it wasn't, open Tarmo → Account & security, change your password and tap "Sign out other devices".`;
    await sendEmail({ to: user.email!, subject: "New sign-in to your Tarmo account", html, text });
    return json({ sent: true });
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
