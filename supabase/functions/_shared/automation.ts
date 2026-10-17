// Helpers shared by send-message, automation-worker, send-document and the
// webhooks: org lookups, time-zone formatting, quiet hours, queueing messages
// with dedupe keys and delivering a queued `messages` row by email or text.
import type { SupabaseClient } from "./deps.ts";
import { env } from "./http.ts";
import { emailLayout, esc, isEmail, sendEmail, textToHtml, type EmailAttachment } from "./email.ts";
import { smsProvider, toE164, withStopFooter } from "./sms.ts";

// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;

export const ORG_COLS =
  "id, name, email, phone, logo_url, timezone, currency, is_demo, plan, sms_enabled, sms_status, sms_number, " +
  "quiet_hours_start, quiet_hours_end, public_slug, google_review_url, auto_send_invoices, accountant_email";

export type Org = {
  id: string; name: string; email: string | null; phone: string | null; logo_url: string | null;
  timezone: string; currency: string; is_demo: boolean; plan: string;
  sms_enabled: boolean; sms_status: string; sms_number: string | null;
  quiet_hours_start: number; quiet_hours_end: number; public_slug: string;
  google_review_url: string | null; auto_send_invoices: boolean; accountant_email: string | null;
};

export const DEMO_BLOCKED = "Demo workspace: messages are not sent";

export async function loadOrg(db: SupabaseClient, orgId: string): Promise<Org | null> {
  const { data } = await db.from("organizations").select(ORG_COLS).eq("id", orgId).maybeSingle();
  return (data as unknown as Org) ?? null;
}

export const textingActive = (o: Pick<Org, "sms_enabled" | "sms_status" | "sms_number">) =>
  !!(o.sms_enabled && o.sms_status === "active" && o.sms_number);

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
export const portalBase = () => env("PORTAL_URL").replace(/\/+$/, "");
export const links = {
  customerPortal: (slug: string) => `${portalBase()}/portal/c/${slug}`,
  invoice: (token: string) => `${portalBase()}/portal/invoice/${token}`,
  quote: (token: string) => `${portalBase()}/portal/quote/${token}`,
  invite: (token: string) => `${portalBase()}/invite/${token}`,
};

// ---------------------------------------------------------------------------
// Time zones & formatting
// ---------------------------------------------------------------------------
function safeTz(tz: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz ?? "UTC" });
    return tz ?? "UTC";
  } catch {
    return "America/New_York";
  }
}

export function localParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz(tz), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

/** "YYYY-MM-DD" in the given time zone. */
export function localDate(d: Date, tz: string): string {
  const p = localParts(d, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (both "YYYY-MM-DD"). */
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** A Date whose UTC calendar day equals the local day (for duePhrase on a UTC server). */
export const ymdAsDate = (ymd: string) => new Date(`${ymd}T00:00:00`);

const fmt = (iso: string | Date, tz: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: safeTz(tz), ...o }).format(typeof iso === "string" ? new Date(iso) : iso);

/** "Tue, Nov 4" */
export const fmtDate = (iso: string | Date, tz: string) => fmt(iso, tz, { weekday: "short", month: "short", day: "numeric" });
/** "9:00 AM" */
export const fmtTime = (iso: string | Date, tz: string) => fmt(iso, tz, { hour: "numeric", minute: "2-digit" });
/** "Nov 12, 5:00 PM" */
export const fmtDateTime = (iso: string | Date, tz: string) => fmt(iso, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** "Dec 1" for a calendar date. */
export const fmtYmd = (ymd: string) => fmt(`${ymd}T12:00:00Z`, "UTC", { month: "short", day: "numeric" });

export function money(n: number | string | null | undefined, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(Number(n ?? 0));
  } catch {
    return `$${Number(n ?? 0).toFixed(2)}`;
  }
}

function tzOffsetMs(at: Date, tz: string): number {
  const p = localParts(at, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute);
  return asUtc - Math.floor(at.getTime() / 60000) * 60000;
}

/** The UTC instant of a local wall-clock time in tz. */
export function zonedTime(ymd: string, hour: number, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, 0);
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz); // second pass settles DST edges
  return new Date(t);
}

/** Null when texting is allowed now; otherwise the next allowed time (start of quiet-hours window). */
export function nextAllowedTime(now: Date, tz: string, start: number, end: number): Date | null {
  const s = Math.max(0, Math.min(23, start ?? 8));
  const e = Math.max(1, Math.min(24, end ?? 20));
  const hour = localParts(now, tz).hour;
  if (s < e ? hour >= s && hour < e : hour >= s || hour < e) return null;
  const today = localDate(now, tz);
  const day = hour >= s ? addDays(today, 1) : today;
  return zonedTime(day, s, tz);
}

// ---------------------------------------------------------------------------
// Notifications (outbox → pushed by the worker)
// ---------------------------------------------------------------------------
export async function outbox(db: SupabaseClient, row: {
  org_id: string; audience: "owners" | "managers" | "user"; user_id?: string | null;
  kind: string; title: string; body?: string | null; url?: string | null;
}) {
  const { error } = await db.from("notification_outbox").insert({ ...row, user_id: row.user_id ?? null });
  if (error) console.error("outbox insert failed", error.message);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export type QueueRow = {
  org_id: string; channel: "email" | "sms"; to_address: string | null; subject?: string | null; body: string;
  customer_id?: string | null; automation_key?: string | null; invoice_id?: string | null; quote_id?: string | null;
  job_id?: string | null; dedupe_key?: string | null; send_after?: string; status?: "queued" | "sent" | "failed" | "blocked";
  created_by?: string | null; error?: string | null; provider_id?: string | null; sent_at?: string | null; from_address?: string | null;
};

/** Inserts a message. Returns its id, or null when the dedupe key was already used. */
export async function queueMessage(db: SupabaseClient, row: QueueRow): Promise<string | null> {
  const { data, error } = await db.from("messages").insert({ status: "queued", direction: "out", ...row }).select("id").single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  return data.id as string;
}

/** Transactional sends (the invoice / quote itself) go out even to people who unsubscribed from reminders. */
const isTransactional = (m: Row) => /^(invoice_sent|quote_sent):/.test(m.dedupe_key ?? "");

function buttonFor(body: string): { label: string; url: string } | null {
  let base = "";
  try { base = portalBase(); } catch { return null; }
  const re = new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^\\s<]+`);
  const url = body.match(re)?.[0]?.replace(/[.,;:!?)]+$/, "");
  if (!url) return null;
  if (url.includes("/portal/invoice/")) return { label: "View & pay", url };
  if (url.includes("/portal/quote/")) return { label: "Review quote", url };
  if (url.includes("/portal/c/")) return { label: "Open your customer portal", url };
  if (url.includes("/invite/")) return { label: "Accept invitation", url };
  return null;
}

export type DeliverOptions = { html?: string; attachments?: EmailAttachment[]; cc?: string | null };
export type DeliverResult = { status: string; error?: string | null; send_after?: string };

/**
 * Sends one queued message now. Claims the row with a short lease (send_after
 * pushed 10 minutes ahead) so the worker and the app never send it twice.
 * Enforces demo blocking, consent, opt-outs, texting allowance and quiet hours.
 */
export async function deliverMessage(db: SupabaseClient, id: string, opts: DeliverOptions = {}): Promise<DeliverResult> {
  const now = new Date();
  const { data: m } = await db.from("messages")
    .update({ send_after: new Date(now.getTime() + 10 * 60e3).toISOString() })
    .eq("id", id).eq("status", "queued").eq("direction", "out")
    .lte("send_after", new Date(now.getTime() + 60e3).toISOString())
    .select("*").maybeSingle();
  if (!m) {
    const { data: cur } = await db.from("messages").select("status, send_after, error").eq("id", id).maybeSingle();
    if (!cur) return { status: "missing", error: "Message not found" };
    if (cur.status === "queued") return { status: "scheduled", send_after: cur.send_after };
    return { status: cur.status, error: cur.error };
  }

  const finish = async (patch: Row): Promise<DeliverResult> => {
    const { error } = await db.from("messages").update(patch).eq("id", id);
    if (error) console.error("message update failed", id, error.message);
    return { status: patch.status ?? "queued", error: patch.error ?? null, send_after: patch.send_after };
  };
  const stop = (status: "failed" | "blocked", error: string) => finish({ status, error, send_after: now.toISOString() });

  try {
    const org = await loadOrg(db, m.org_id);
    if (!org) return stop("failed", "Company not found");
    if (org.is_demo) return stop("blocked", DEMO_BLOCKED);
    const { data: customer } = m.customer_id
      ? await db.from("customers").select("id, name, email, phone, sms_consent, sms_opted_out, email_opted_out").eq("id", m.customer_id).maybeSingle()
      : { data: null };

    if (m.channel === "email") {
      const to = String(m.to_address ?? customer?.email ?? "").trim();
      if (!isEmail(to)) return stop("failed", "No valid email address");
      if (customer?.email_opted_out && !isTransactional(m) && to.toLowerCase() === String(customer.email ?? "").toLowerCase()) {
        return stop("blocked", "This customer unsubscribed from emails");
      }
      const html = opts.html ?? emailLayout({ brand: org, bodyHtml: textToHtml(m.body), button: buttonFor(m.body) });
      const providerId = await sendEmail({
        to, subject: m.subject || `Message from ${org.name}`, html, text: String(m.body).replace(/\\n/g, "\n"),
        replyTo: org.email, fromName: org.name, attachments: opts.attachments, cc: opts.cc,
      });
      return finish({
        status: "sent", provider_id: providerId || null, sent_at: new Date().toISOString(), to_address: to,
        from_address: env("EMAIL_FROM"), error: null, send_after: now.toISOString(),
      });
    }

    // Text message
    if (!textingActive(org)) return stop("blocked", "Customer texting is not turned on for this company");
    if (!customer) return stop("blocked", "Texts can only be sent to customers who agreed to receive them");
    if (customer.sms_opted_out) return stop("blocked", "This customer replied STOP and opted out of texts");
    if (!customer.sms_consent) return stop("blocked", "This customer has not agreed to receive texts");
    const to = toE164(m.to_address ?? customer.phone);
    if (!to) return stop("failed", "No valid mobile number");
    const from = toE164(org.sms_number);
    if (!from) return stop("failed", "The company texting number is not valid");

    const { data: allowance } = await db.rpc("sms_allowance", { p_org: org.id });
    if (allowance && Number(allowance.used) >= Number(allowance.included) + Number(allowance.extra)) {
      return stop("failed", "Monthly texting allowance used up. Add a text pack to keep texting this month.");
    }

    const next = nextAllowedTime(now, org.timezone, org.quiet_hours_start, org.quiet_hours_end);
    if (next) {
      await db.from("messages").update({ send_after: next.toISOString() }).eq("id", id);
      return { status: "scheduled", send_after: next.toISOString() };
    }

    const { count } = await db.from("messages").select("id", { count: "exact", head: true })
      .eq("customer_id", customer.id).eq("channel", "sms").eq("direction", "out")
      .in("status", ["sent", "delivered"]).neq("id", id);
    const text = String(m.body).replace(/\\n/g, "\n");
    const body = count ? text : withStopFooter(text);
    const providerId = await smsProvider().send(from, to, body);
    return finish({
      status: "sent", provider_id: providerId || null, sent_at: new Date().toISOString(), to_address: to,
      from_address: from, body, error: null, send_after: now.toISOString(),
    });
  } catch (e) {
    return stop("failed", (e as Error).message.slice(0, 500));
  }
}

/** Escaped helper re-export for HTML emails built by functions. */
export { esc };
