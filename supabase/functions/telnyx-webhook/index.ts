// Telnyx messaging webhook (set it on the platform's Telnyx messaging profile).
// Verified with Telnyx's ed25519 signature (TELNYX_PUBLIC_KEY, base64 from the
// Telnyx portal → Keys & Credentials → Public Key).
//   message.sent / message.finalized → delivery status in the message log
//   message.received                 → inbound text: STOP / START / HELP keywords,
//                                      otherwise logged as a reply + managers notified
import { adminClient } from "../_shared/clients.ts";
import type { SupabaseClient } from "../_shared/deps.ts";
import { env, json } from "../_shared/http.ts";
import { outbox, type Row } from "../_shared/automation.ts";
import { phoneKey, smsProvider, toE164 } from "../_shared/sms.ts";

const TOLERANCE_S = 5 * 60;
const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"];
const START_WORDS = ["START", "UNSTOP", "YES", "SUBSCRIBE"];
const HELP_WORDS = ["HELP", "INFO"];

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verify(req: Request, raw: string): Promise<boolean> {
  const sig = req.headers.get("telnyx-signature-ed25519");
  const ts = req.headers.get("telnyx-timestamp");
  if (!sig || !ts) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;
  try {
    const key = await crypto.subtle.importKey("raw", b64ToBytes(env("TELNYX_PUBLIC_KEY")), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, b64ToBytes(sig), new TextEncoder().encode(`${ts}|${raw}`));
  } catch (e) {
    console.error("signature check failed", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const raw = await req.text();
  if (!(await verify(req, raw))) return new Response("bad signature", { status: 401 });
  // deno-lint-ignore no-explicit-any
  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const type: string = event?.data?.event_type ?? "";
  const p = event?.data?.payload ?? {};
  const db = adminClient();
  try {
    if (type === "message.received") return json(await inbound(db, p));
    if (type === "message.sent" || type === "message.finalized") return json(await status(db, p));
    return json({ ignored: type });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 }); // Telnyx retries
  }
});

async function status(db: SupabaseClient, p: Row) {
  if (!p.id) return { ignored: true };
  const { data: m } = await db.from("messages").select("id, status").eq("provider_id", p.id).eq("channel", "sms").eq("direction", "out").maybeSingle();
  if (!m) return { ignored: true };
  const st: string = p.to?.[0]?.status ?? "";
  if (st === "delivered") {
    await db.from("messages").update({ status: "delivered", delivered_at: p.completed_at ?? new Date().toISOString(), error: null }).eq("id", m.id);
  } else if (st === "delivery_failed" || st === "sending_failed") {
    const detail = (p.errors ?? []).map((e: Row) => e.detail ?? e.title).filter(Boolean).join("; ") || "The carrier could not deliver this text";
    await db.from("messages").update({ status: "failed", error: String(detail).slice(0, 500) }).eq("id", m.id);
  } else if (st === "delivery_unconfirmed" && m.status === "sent") {
    await db.from("messages").update({ error: "Carrier did not confirm delivery" }).eq("id", m.id);
  }
  return { ok: true };
}

async function inbound(db: SupabaseClient, p: Row) {
  const from = toE164(p.from?.phone_number);
  const to = toE164(p.to?.[0]?.phone_number ?? p.to);
  const text = String(p.text ?? "").trim();
  if (!from || !to) return { ignored: true };

  // Telnyx retries deliveries; one row per inbound message id.
  if (p.id) {
    const { data: dup } = await db.from("messages").select("id").eq("provider_id", p.id).eq("direction", "in").maybeSingle();
    if (dup) return { duplicate: true };
  }

  const { data: org } = await db.from("organizations").select("id, name, phone, email, is_demo").eq("sms_number", to).maybeSingle();
  if (!org) return { ignored: "unknown number" };

  // Customers' phones are stored in whatever format staff typed; match on the last 10 digits.
  const key = phoneKey(from);
  const { data: candidates } = await db.from("customers").select("id, name, phone, sms_opted_out")
    .eq("org_id", org.id).ilike("phone", `%${key.slice(-4)}%`).limit(50);
  const customer = (candidates ?? []).find((c) => phoneKey(c.phone) === key) ?? null;

  await db.from("messages").insert({
    org_id: org.id, customer_id: customer?.id ?? null, channel: "sms", direction: "in", status: "received",
    from_address: from, to_address: to, body: text || "(empty message)", provider_id: p.id ?? null,
    sent_at: p.received_at ?? new Date().toISOString(), created_by: null,
  });

  const word = text.toUpperCase().replace(/[^A-Z]/g, "");
  const reply = async (body: string) => {
    if (org.is_demo) return;
    try {
      const id = await smsProvider().send(to, from, body);
      await db.from("messages").insert({
        org_id: org.id, customer_id: customer?.id ?? null, channel: "sms", direction: "out", status: "sent",
        from_address: to, to_address: from, body, provider_id: id || null, sent_at: new Date().toISOString(), created_by: null,
      });
    } catch (e) {
      console.error("keyword reply failed", e);
    }
  };

  if (STOP_WORDS.includes(word)) {
    if (customer) await db.from("customers").update({ sms_opted_out: true }).eq("id", customer.id);
    await reply(`${org.name}: you are unsubscribed and will not receive more texts. Reply START to resubscribe.`);
    if (customer) {
      await outbox(db, { org_id: org.id, audience: "managers", kind: "sms_opt_out", title: `${customer.name} opted out of texts`, body: "They replied STOP.", url: `/messages/${customer.id}` });
    }
    return { keyword: "stop" };
  }
  if (START_WORDS.includes(word)) {
    if (customer) {
      await db.from("customers").update({ sms_opted_out: false, sms_consent: true, sms_consent_at: new Date().toISOString() }).eq("id", customer.id);
    }
    await reply(`${org.name}: you are subscribed to appointment and service texts again. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`);
    return { keyword: "start" };
  }
  if (HELP_WORDS.includes(word)) {
    const contact = [org.phone, org.email].filter(Boolean).join(" or ");
    await reply(`${org.name}: appointment and service updates.${contact ? ` Questions? Contact ${contact}.` : ""} Msg & data rates may apply. Reply STOP to opt out.`);
    return { keyword: "help" };
  }

  await outbox(db, {
    org_id: org.id, audience: "managers", kind: "inbound_sms",
    title: `Text from ${customer?.name ?? from}`, body: text.slice(0, 140) || "(empty message)",
    url: customer ? `/messages/${customer.id}` : "/messages",
  });
  return { ok: true };
}
