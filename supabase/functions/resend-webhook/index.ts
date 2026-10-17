// Resend delivery events → message log. Configure in Resend → Webhooks with
// events email.delivered, email.opened, email.bounced, email.complained,
// email.delivery_delayed and set RESEND_WEBHOOK_SECRET to the signing secret
// ("whsec_..."). Requests are verified with the Svix signature scheme.
import { adminClient } from "../_shared/clients.ts";
import { env, json } from "../_shared/http.ts";

const TOLERANCE_S = 5 * 60;

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function verifySvix(req: Request, raw: string): Promise<boolean> {
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigs = req.headers.get("svix-signature");
  if (!id || !ts || !sigs) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;
  const secret = env("RESEND_WEBHOOK_SECRET").replace(/^whsec_/, "");
  const key = await crypto.subtle.importKey("raw", b64ToBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  const expected = bytesToB64(mac);
  return sigs.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && !!sig && timingSafeEqual(sig, expected);
  });
}

// Later states never move a message backwards (e.g. "delivered" after "opened").
const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, opened: 3, bounced: 4, failed: 4 };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const raw = await req.text();
  if (!(await verifySvix(req, raw))) return new Response("bad signature", { status: 401 });

  // deno-lint-ignore no-explicit-any
  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const providerId = event?.data?.email_id;
  if (!providerId) return json({ ignored: true });

  const db = adminClient();
  const { data: m } = await db.from("messages").select("id, status").eq("provider_id", providerId).eq("channel", "email").maybeSingle();
  if (!m) return json({ ignored: true });
  const at = event.created_at ?? new Date().toISOString();

  let patch: Record<string, unknown> | null = null;
  switch (event.type) {
    case "email.delivered":
      patch = { status: "delivered", delivered_at: at };
      break;
    case "email.opened":
      patch = { status: "opened", opened_at: at };
      break;
    case "email.bounced": {
      const reason = event.data?.bounce?.message ?? event.data?.bounce?.subType ?? "The address rejected the email";
      patch = { status: "bounced", error: `Bounced: ${reason}`.slice(0, 500) };
      break;
    }
    case "email.complained":
      patch = { status: "bounced", error: "The recipient marked this email as spam" };
      break;
    case "email.delivery_delayed":
      patch = { error: "Delivery delayed; the provider will keep trying" };
      break;
  }
  if (!patch) return json({ ignored: true });
  const next = patch.status as string | undefined;
  if (next && (RANK[next] ?? 0) < (RANK[m.status] ?? 0)) {
    // Keep the higher status but still record the timestamp.
    delete patch.status;
  }
  await db.from("messages").update(patch).eq("id", m.id);

  // A complaint means: stop emailing this customer automatically.
  if (event.type === "email.complained") {
    const { data: msg } = await db.from("messages").select("customer_id").eq("id", m.id).single();
    if (msg?.customer_id) await db.from("customers").update({ email_opted_out: true }).eq("id", msg.customer_id);
  }
  return json({ ok: true });
});
