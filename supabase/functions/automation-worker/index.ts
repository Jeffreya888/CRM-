// Automation worker. Run every 10 minutes by cron:
//   POST /functions/v1/automation-worker   Authorization: Bearer <CRON_SECRET>
//
// Steps (each isolated so one failure never stops the others):
//   daily      once a day: overdue invoices, due service reminders, plan/trial
//              expiry, tomorrow's assignments, manager digest, expiry alerts
//   recurring  generate_recurring_jobs() + generate_recurring_expenses()
//   automations job reminders, job complete, invoice reminder sequence + late
//              fees, review requests, quote follow-ups, recurring heads-ups,
//              auto-sent invoices (all queued into `messages` with dedupe keys)
//   send       delivers every queued message that is due (quiet hours respected)
//   push       notification_outbox → Expo push (private lock screen respected)
//   cleanup    cleanup_demo_workspaces()
// A worker_runs row { worker: 'automation', ok, details } records each run.
import { adminClient } from "../_shared/clients.ts";
import type { SupabaseClient } from "../_shared/deps.ts";
import { env, json, safeEqual } from "../_shared/http.ts";
import { type PrefKey, pushesFor, sendPushes, tokensFor } from "../_shared/push.ts";
import { duePhrase, renderTemplate } from "../_shared/templates.ts";
import { isEmail } from "../_shared/email.ts";
import { toE164 } from "../_shared/sms.ts";
import { chargeDueCarePlans } from "../_shared/squareBilling.ts";
import {
  addDays, daysBetween, deliverMessage, fmtDate, fmtDateTime, fmtTime, fmtYmd, invoiceEmailText, links, localDate, money,
  type Org, ORG_COLS, outbox, queueMessage, type Row, textingActive, ymdAsDate,
} from "../_shared/automation.ts";

type Details = Record<string, unknown>;

export async function runWorker(opts: { forceDaily?: boolean } = {}) {
  const db = adminClient();
  const details: Details = {};
  let ok = true;
  const step = async (name: string, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try {
      details[name] = await fn();
    } catch (e) {
      ok = false;
      console.error(`step ${name} failed`, e);
      details[name] = { error: (e as Error).message ?? String(e) };
    }
    console.log(`step ${name} took ${Date.now() - t0}ms`);
  };

  await step("daily", () => daily(db, !!opts.forceDaily));
  await step("recurring", async () => {
    const jobs = await db.rpc("generate_recurring_jobs");
    if (jobs.error) throw jobs.error;
    const expenses = await db.rpc("generate_recurring_expenses");
    if (expenses.error) throw expenses.error;
    return { jobs: jobs.data, expenses: expenses.data };
  });
  await step("square_care_plans", () => chargeDueCarePlans(db));
  await step("automations", () => automations(db));
  await step("send", () => sendQueued(db));
  await step("push", () => pushOutbox(db));
  await step("cleanup", async () => {
    const r = await db.rpc("cleanup_demo_workspaces");
    if (r.error) throw r.error;
    await db.rpc("prune_email_quota_log");
    return { demo_workspaces_removed: r.data };
  });

  await db.from("worker_runs").insert({ worker: "automation", ok, details });
  return { ok, ...details };
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (!safeEqual(req.headers.get("Authorization") ?? "", `Bearer ${env("CRON_SECRET")}`)) {
      return new Response("unauthorized", { status: 401 });
    }
    const url = new URL(req.url);
    const summary = await runWorker({ forceDaily: url.searchParams.get("daily") === "force" });
    return json(summary, summary.ok ? 200 : 500);
  });
}

// ===========================================================================
// Helpers
// ===========================================================================
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function assetLabel(a: Row | null): string {
  if (!a) return "your aircraft";
  const model = [a.manufacturer, a.model].filter(Boolean).join(" ");
  return model ? `${a.tail_number} (${model})` : a.tail_number;
}

function locationLine(l: Row | null): string {
  if (!l) return "";
  const label = [l.airport_code, l.fbo_name ?? l.name].filter(Boolean).join(" · ");
  return label ? ` at ${label}` : "";
}

type Automation = { org_id: string; key: string; enabled: boolean; channel: "email" | "sms" | "both"; settings: Row; subject: string | null; body: string };

/** Enabled automations of one kind, with their (non-demo, non-expired) company. */
async function enabledAutomations(db: SupabaseClient, key: string): Promise<Map<string, { a: Automation; org: Org }>> {
  const { data, error } = await db.from("automations").select("*").eq("key", key).eq("enabled", true);
  if (error) throw error;
  const out = new Map<string, { a: Automation; org: Org }>();
  const rows = (data ?? []) as Automation[];
  for (const ids of chunk(rows.map((r) => r.org_id), 200)) {
    const { data: orgs } = await db.from("organizations").select(ORG_COLS).in("id", ids).eq("is_demo", false).neq("plan", "expired");
    for (const o of (orgs ?? []) as unknown as Org[]) {
      const a = rows.find((r) => r.org_id === o.id)!;
      out.set(o.id, { a, org: o });
    }
  }
  return out;
}

const CUSTOMER_COLS = "id, name, email, phone, sms_consent, sms_opted_out, email_opted_out, automation_exceptions";

type Recipient = { channel: "email" | "sms"; to: string };

/** Where an automation may reach this customer (consent, opt-outs and per-customer exceptions applied). */
function recipients(a: Automation, org: Org, c: Row | null): Recipient[] {
  if (!c) return [];
  if ((c.automation_exceptions ?? []).includes(a.key)) return [];
  const out: Recipient[] = [];
  if ((a.channel === "email" || a.channel === "both") && isEmail(c.email) && !c.email_opted_out) {
    out.push({ channel: "email", to: c.email.trim() });
  }
  if ((a.channel === "sms" || a.channel === "both") && textingActive(org) && c.sms_consent && !c.sms_opted_out) {
    const to = toE164(c.phone);
    if (to) out.push({ channel: "sms", to });
  }
  return out;
}

/** Queues one automation message per channel. Returns how many were newly queued. */
async function queueAutomation(db: SupabaseClient, a: Automation, org: Org, c: Row | null, values: Record<string, string>, refs: {
  dedupe: string; job_id?: string | null; invoice_id?: string | null; quote_id?: string | null;
}): Promise<number> {
  let n = 0;
  for (const r of recipients(a, org, c)) {
    const id = await queueMessage(db, {
      org_id: org.id, customer_id: c!.id, channel: r.channel, to_address: r.to,
      subject: r.channel === "email" ? renderTemplate(a.subject ?? "", values) || `Message from ${org.name}` : null,
      body: renderTemplate(a.body, values),
      automation_key: a.key, dedupe_key: `${refs.dedupe}:${r.channel}`,
      job_id: refs.job_id ?? null, invoice_id: refs.invoice_id ?? null, quote_id: refs.quote_id ?? null,
    });
    if (id) n++;
  }
  return n;
}

const baseValues = (org: Org, c: Row | null) => ({
  customer: c?.name ?? "there",
  company: org.name,
  portal_link: links.customerPortal(org.public_slug),
});

// ===========================================================================
// Daily maintenance (folded in from daily-jobs)
// ===========================================================================
async function daily(db: SupabaseClient, force: boolean) {
  const now = new Date();
  const hour = Number(Deno.env.get("DAILY_HOUR_UTC") ?? "12");
  const today = now.toISOString().slice(0, 10);
  if (!force) {
    if (now.getUTCHours() < hour) return { skipped: "not yet time today" };
    const { data: last } = await db.from("worker_runs").select("ran_at").eq("worker", "automation_daily")
      .order("ran_at", { ascending: false }).limit(1).maybeSingle();
    if (last && String(last.ran_at).slice(0, 10) >= today) return { skipped: "already ran today" };
  }
  // Claim today's run first so overlapping invocations don't both do it.
  const { data: claim } = await db.from("worker_runs").insert({ worker: "automation_daily", ok: true, details: { started: now.toISOString() } })
    .select("id").single();

  const out: Details = {};
  const sub = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn(); } catch (e) { console.error(`daily ${name} failed`, e); out[name] = { error: (e as Error).message }; }
  };

  let newlyOverdue: Row[] = [];
  let newlyDue: Row[] = [];
  await sub("overdue_invoices", async () => {
    const r = await db.from("invoices").update({ status: "overdue" })
      .in("status", ["sent", "partial"]).lt("due_date", today).select("id, org_id");
    if (r.error) throw r.error;
    newlyOverdue = r.data ?? [];
    return newlyOverdue.length;
  });
  await sub("reminders_due", async () => {
    const r = await db.from("service_reminders").update({ status: "due" })
      .eq("status", "upcoming").lte("due_on", today).select("id, org_id, title, aircraft:aircraft(tail_number)");
    if (r.error) throw r.error;
    newlyDue = r.data ?? [];
    return newlyDue.length;
  });
  await sub("plan_expiry", async () => {
    const a = await db.from("organizations").update({ plan: "expired" })
      .eq("plan", "trial").lt("trial_ends_at", now.toISOString()).eq("is_demo", false).select("id");
    // 3-day grace for store webhook delays.
    const b = await db.from("organizations").update({ plan: "expired" })
      .in("plan", ["solo", "team", "fleet"]).lt("plan_expires_at", new Date(now.getTime() - 3 * 864e5).toISOString()).eq("is_demo", false).select("id");
    return { trials: a.data?.length ?? 0, subscriptions: b.data?.length ?? 0 };
  });
  await sub("tomorrow_assignments", () => tomorrowAssignments(db));
  await sub("digest", () => managerDigest(db, newlyOverdue, newlyDue));
  await sub("expiry_alerts", () => expiryAlerts(db, today));

  if (claim) await db.from("worker_runs").update({ details: out, ok: !Object.values(out).some((v) => (v as Row)?.error) }).eq("id", claim.id);
  return out;
}

async function tomorrowAssignments(db: SupabaseClient) {
  const now = new Date();
  const { data: jobs, error } = await db.from("jobs")
    .select("id, org_id, number, title, scheduled_start, aircraft:aircraft(tail_number), location:locations(name, airport_code, fbo_name), job_assignments(user_id), org:organizations(timezone, is_demo)")
    .eq("status", "scheduled").gte("scheduled_start", now.toISOString())
    .lt("scheduled_start", new Date(now.getTime() + 48 * 3600e3).toISOString());
  if (error) throw error;
  let n = 0;
  for (const j of (jobs ?? []) as Row[]) {
    const org = one(j.org);
    const tz = org?.timezone ?? "UTC";
    if (localDate(new Date(j.scheduled_start), tz) !== addDays(localDate(now, tz), 1)) continue;
    const a = one(j.aircraft), l = one(j.location);
    const where = l ? ` at ${l.airport_code ?? l.fbo_name ?? l.name}` : "";
    for (const as of j.job_assignments ?? []) {
      await outbox(db, {
        org_id: j.org_id, audience: "user", user_id: as.user_id, kind: "job_tomorrow", title: "Tomorrow's job",
        body: `${a?.tail_number ?? j.title ?? j.number}${where} at ${fmtTime(j.scheduled_start, tz)}`, url: `/jobs/${j.id}`,
      });
      n++;
    }
  }
  return n;
}

async function managerDigest(db: SupabaseClient, overdue: Row[], due: Row[]) {
  const counts = new Map<string, { overdue: number; due: number; requests: number; tentative: number }>();
  const bump = (org: string, k: "overdue" | "due" | "requests" | "tentative") => {
    const c = counts.get(org) ?? { overdue: 0, due: 0, requests: 0, tentative: 0 };
    c[k]++;
    counts.set(org, c);
  };
  for (const r of overdue) bump(r.org_id, "overdue");
  for (const r of due) bump(r.org_id, "due");
  const { data: reqs } = await db.from("booking_requests").select("org_id").eq("status", "pending").limit(5000);
  for (const r of reqs ?? []) bump(r.org_id, "requests");
  const { data: tent } = await db.from("jobs").select("org_id").eq("status", "tentative")
    .gte("scheduled_start", new Date().toISOString()).lt("scheduled_start", new Date(Date.now() + 14 * 864e5).toISOString()).limit(5000);
  for (const r of tent ?? []) bump(r.org_id, "tentative");

  const orgIds = [...counts.keys()];
  const demo = new Set<string>();
  for (const ids of chunk(orgIds, 200)) {
    const { data } = await db.from("organizations").select("id").in("id", ids).eq("is_demo", true);
    for (const o of data ?? []) demo.add(o.id);
  }
  let sent = 0;
  for (const [org, c] of counts) {
    if (demo.has(org)) continue;
    const parts = [
      c.due && `${c.due} service reminder${c.due > 1 ? "s" : ""} due`,
      c.overdue && `${c.overdue} invoice${c.overdue > 1 ? "s" : ""} now overdue`,
      c.requests && `${c.requests} customer request${c.requests > 1 ? "s" : ""} waiting`,
      c.tentative && `${c.tentative} tentative visit${c.tentative > 1 ? "s" : ""} to confirm`,
    ].filter(Boolean);
    if (!parts.length) continue;
    const url = c.requests ? "/requests" : c.due ? "/reminders" : c.overdue ? "/invoices" : "/jobs";
    await outbox(db, { org_id: org, audience: "managers", kind: "digest", title: "Today at a glance", body: parts.join(" · "), url });
    sent++;
  }
  return sent;
}

/** Certifications / facility COIs, warranties and maintenance — once per item per week. */
async function expiryAlerts(db: SupabaseClient, today: string) {
  const soon = addDays(today, 30);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const alerts: { org_id: string; kind: string; title: string; body: string; url: string; user_id?: string | null }[] = [];

  const { data: certs } = await db.from("certifications").select("id, org_id, user_id, name, kind, expires_on")
    .not("expires_on", "is", null).lte("expires_on", soon).gte("expires_on", addDays(today, -7));
  for (const c of certs ?? []) {
    const expired = c.expires_on < today;
    const company = !c.user_id;
    alerts.push({
      org_id: c.org_id, kind: `expiry:cert:${c.id}`, user_id: c.user_id,
      title: `${company && c.kind === "coi" ? "Insurance certificate" : company ? "Company document" : "Certification"} ${expired ? "expired" : "expiring"}: ${c.name}`,
      body: `${expired ? "Expired" : "Expires"} ${fmtYmd(c.expires_on)}. Upload the renewed document.`,
      url: company ? "/facilities" : "/team",
    });
  }

  const { data: warranties } = await db.from("equipment").select("id, org_id, name, warranty_expires_on, status")
    .not("warranty_expires_on", "is", null).gte("warranty_expires_on", today).lte("warranty_expires_on", soon).neq("status", "retired");
  for (const e of warranties ?? []) {
    alerts.push({
      org_id: e.org_id, kind: `expiry:warranty:${e.id}`, title: `Warranty ending: ${e.name}`,
      body: `The warranty ends ${fmtYmd(e.warranty_expires_on)}. Get any warranty work done before then.`, url: `/equipment/${e.id}`,
    });
  }

  // equipment_maintenance_due filters by membership, so compute it here from the base tables.
  const { data: maint } = await db.from("equipment_maintenance")
    .select("id, org_id, equipment_id, name, every_days, every_hours, last_done_on, last_done_hours, created_at, equipment:equipment(name, usage_hours, purchased_on, status)")
    .limit(5000);
  for (const m of (maint ?? []) as Row[]) {
    const e = one(m.equipment);
    if (!e || e.status === "retired") continue;
    const nextOn = m.every_days ? addDays(m.last_done_on ?? e.purchased_on ?? String(m.created_at).slice(0, 10), m.every_days) : null;
    const nextHours = m.every_hours ? Number(m.last_done_hours ?? 0) + Number(m.every_hours) : null;
    const dueByDate = nextOn != null && nextOn <= addDays(today, 7);
    const dueByHours = nextHours != null && Number(e.usage_hours ?? 0) >= nextHours;
    if (!dueByDate && !dueByHours) continue;
    alerts.push({
      org_id: m.org_id, kind: `expiry:maintenance:${m.id}`, title: `Maintenance due: ${e.name}`,
      body: dueByHours ? `${m.name} is due at ${nextHours} hours (now ${e.usage_hours}).` : `${m.name} is due ${nextOn! < today ? "since" : "by"} ${fmtYmd(nextOn!)}.`,
      url: `/equipment/${m.equipment_id}`,
    });
  }

  if (!alerts.length) return 0;
  // Demo companies don't get alerts; and each item alerts at most once a week.
  const orgIds = [...new Set(alerts.map((a) => a.org_id))];
  const demo = new Set<string>();
  for (const ids of chunk(orgIds, 200)) {
    const { data } = await db.from("organizations").select("id").in("id", ids).eq("is_demo", true);
    for (const o of data ?? []) demo.add(o.id);
  }
  const recent = new Set<string>();
  for (const kinds of chunk(alerts.map((a) => a.kind), 150)) {
    const { data } = await db.from("notification_outbox").select("org_id, kind").in("kind", kinds).gte("created_at", weekAgo);
    for (const r of data ?? []) recent.add(`${r.org_id}|${r.kind}`);
  }
  let n = 0;
  for (const a of alerts) {
    if (demo.has(a.org_id) || recent.has(`${a.org_id}|${a.kind}`)) continue;
    await outbox(db, { org_id: a.org_id, audience: "owners", kind: a.kind, title: a.title, body: a.body, url: a.url });
    // The person holding a certification hears about it too.
    if (a.user_id) await outbox(db, { org_id: a.org_id, audience: "user", user_id: a.user_id, kind: `${a.kind}:self`, title: a.title, body: a.body, url: "/account" });
    n++;
  }
  return n;
}

// ===========================================================================
// Customer automations
// ===========================================================================
async function automations(db: SupabaseClient) {
  const out: Details = {};
  const sub = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn(); } catch (e) { console.error(`automation ${name} failed`, e); out[name] = { error: (e as Error).message }; }
  };
  await sub("job_reminder", () => jobReminders(db));
  await sub("job_complete", () => jobComplete(db));
  await sub("late_fees", () => lateFees(db));
  await sub("invoice_reminders", () => invoiceReminders(db));
  await sub("review_request", () => reviewRequests(db));
  await sub("quote_follow_up", () => quoteFollowUps(db));
  await sub("recurring_heads_up", () => recurringHeadsUp(db));
  await sub("auto_sent_invoices", () => autoSentInvoices(db));
  // care_plan_charge receipts are sent by stripe-webhook when the charge succeeds.
  return out;
}

const JOB_SELECT = `id, org_id, number, title, status, scheduled_start, actual_end, recurring_schedule_id,
  customer:customers(${CUSTOMER_COLS}), aircraft:aircraft(tail_number, manufacturer, model),
  location:locations(name, airport_code, fbo_name), job_items(description, sort_order)`;

function jobValues(org: Org, j: Row, when: string | null) {
  const c = one(j.customer), a = one(j.aircraft), l = one(j.location);
  const items = [...(j.job_items ?? [])].sort((x: Row, y: Row) => x.sort_order - y.sort_order);
  return {
    ...baseValues(org, c),
    asset: assetLabel(a), tail: a?.tail_number ?? "",
    service: j.title ?? items[0]?.description ?? "your service",
    date: when ? fmtDate(when, org.timezone) : "", time: when ? fmtTime(when, org.timezone) : "",
    location_line: locationLine(l),
  };
}

async function jobReminders(db: SupabaseClient) {
  const autos = await enabledAutomations(db, "job_reminder");
  if (!autos.size) return 0;
  const maxHours = Math.max(...[...autos.values()].map((x) => Number(x.a.settings?.hours_before ?? 24) || 24));
  const now = Date.now();
  let n = 0;
  for (const ids of chunk([...autos.keys()], 100)) {
    const { data, error } = await db.from("jobs").select(JOB_SELECT).in("org_id", ids).eq("status", "scheduled")
      .gt("scheduled_start", new Date(now).toISOString()).lte("scheduled_start", new Date(now + maxHours * 3600e3).toISOString());
    if (error) throw error;
    for (const j of (data ?? []) as Row[]) {
      const { a, org } = autos.get(j.org_id)!;
      const hours = Number(a.settings?.hours_before ?? 24) || 24;
      if (Date.parse(j.scheduled_start) - now > hours * 3600e3) continue;
      n += await queueAutomation(db, a, org, one(j.customer), jobValues(org, j, j.scheduled_start), {
        dedupe: `job_reminder:${j.id}:${j.scheduled_start}`, job_id: j.id,
      });
    }
  }
  return n;
}

async function jobComplete(db: SupabaseClient) {
  const autos = await enabledAutomations(db, "job_complete");
  if (!autos.size) return 0;
  let n = 0;
  for (const ids of chunk([...autos.keys()], 100)) {
    const { data, error } = await db.from("jobs").select(JOB_SELECT).in("org_id", ids).in("status", ["completed", "invoiced"])
      .gte("actual_end", new Date(Date.now() - 24 * 3600e3).toISOString()).lte("actual_end", new Date().toISOString());
    if (error) throw error;
    for (const j of (data ?? []) as Row[]) {
      const { a, org } = autos.get(j.org_id)!;
      n += await queueAutomation(db, a, org, one(j.customer), jobValues(org, j, j.actual_end), { dedupe: `job_complete:${j.id}`, job_id: j.id });
    }
  }
  return n;
}

type LateFee = { enabled?: boolean; type?: "flat" | "percent"; value?: number; after_days?: number };
const lateFeeOf = (a: Automation): LateFee => (a.settings?.late_fee ?? {}) as LateFee;
const lateFeeOn = (f: LateFee) => !!f.enabled && Number(f.value) > 0;

const INVOICE_SELECT = `id, org_id, number, status, total, balance, due_date, public_token, sent_at, late_fee_applied_at, covered_by_plan,
  customer:customers(${CUSTOMER_COLS}), aircraft:aircraft(tail_number, manufacturer, model)`;

async function openInvoices(db: SupabaseClient, orgIds: string[]) {
  const rows: Row[] = [];
  for (const ids of chunk(orgIds, 100)) {
    const { data, error } = await db.from("invoices").select(INVOICE_SELECT).in("org_id", ids)
      .in("status", ["sent", "partial", "overdue"]).gt("balance", 0).eq("covered_by_plan", false)
      .gte("due_date", new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10));
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
}

/** Adds the late fee line once, when the invoice is far enough overdue. */
async function lateFees(db: SupabaseClient) {
  const autos = await enabledAutomations(db, "invoice_reminders");
  const withFee = [...autos.values()].filter((x) => lateFeeOn(lateFeeOf(x.a)));
  if (!withFee.length) return 0;
  const invoices = await openInvoices(db, withFee.map((x) => x.org.id));
  let n = 0;
  for (const inv of invoices) {
    if (inv.late_fee_applied_at) continue;
    const { a, org } = autos.get(inv.org_id)!;
    const fee = lateFeeOf(a);
    const overdue = daysBetween(inv.due_date, localDate(new Date(), org.timezone));
    if (overdue < Math.max(1, Number(fee.after_days ?? 30))) continue;
    const pct = fee.type === "percent";
    const amount = Math.round((pct ? Number(inv.balance) * Number(fee.value) / 100 : Number(fee.value)) * 100) / 100;
    if (!(amount > 0)) continue;
    // Stamp first (only one run can win), then add the line.
    const { data: claimed } = await db.from("invoices").update({ late_fee_applied_at: new Date().toISOString() })
      .eq("id", inv.id).is("late_fee_applied_at", null).select("id").maybeSingle();
    if (!claimed) continue;
    const { error } = await db.from("invoice_items").insert({
      org_id: inv.org_id, invoice_id: inv.id, description: pct ? `Late fee (${Number(fee.value)}%)` : "Late fee",
      quantity: 1, unit_price: amount, taxable: false, sort_order: 9999,
    });
    if (error) {
      await db.from("invoices").update({ late_fee_applied_at: null }).eq("id", inv.id);
      throw error;
    }
    await outbox(db, {
      org_id: inv.org_id, audience: "managers", kind: "late_fee", title: `Late fee added to ${inv.number}`,
      body: `${money(amount, org.currency)} added (${overdue} days overdue).`, url: `/invoices/${inv.id}`,
    });
    n++;
  }
  return n;
}

async function invoiceReminders(db: SupabaseClient) {
  const autos = await enabledAutomations(db, "invoice_reminders");
  if (!autos.size) return 0;
  const invoices = await openInvoices(db, [...autos.keys()]);
  let n = 0;
  for (const inv of invoices) {
    const { a, org } = autos.get(inv.org_id)!;
    const seq: number[] = (Array.isArray(a.settings?.sequence_days) ? a.settings.sequence_days : [-3, 0, 7, 14, 30])
      .map(Number).filter((d: number) => Number.isFinite(d)).sort((x: number, y: number) => x - y);
    const today = localDate(new Date(), org.timezone);
    const diff = daysBetween(inv.due_date, today); // days past due (negative = before)
    // The latest step that has come due, if it came due in the last 3 days (no backlog blasts).
    const step = seq.filter((d) => d <= diff && diff - d <= 2).pop();
    if (step === undefined) continue;
    // Don't remind the day the invoice was sent.
    if (inv.sent_at && Date.now() - Date.parse(inv.sent_at) < 20 * 3600e3) continue;

    const fee = lateFeeOf(a);
    let lateFeeLine = "";
    if (lateFeeOn(fee) && !inv.late_fee_applied_at && diff < Number(fee.after_days ?? 30)) {
      const feeText = fee.type === "percent" ? `${Number(fee.value)}%` : money(fee.value, org.currency);
      lateFeeLine = ` A ${feeText} late fee applies after ${fmtYmd(addDays(inv.due_date, Number(fee.after_days ?? 30)))}.`;
    }
    const c = one(inv.customer), asset = one(inv.aircraft);
    const values = {
      ...baseValues(org, c),
      asset: assetLabel(asset), tail: asset?.tail_number ?? "",
      invoice_number: inv.number, amount: money(inv.total, org.currency), total: money(inv.total, org.currency),
      balance: money(inv.balance, org.currency), due_phrase: duePhrase(inv.due_date, ymdAsDate(today)),
      date: fmtYmd(inv.due_date), late_fee_line: lateFeeLine, pay_link: links.invoice(inv.public_token),
    };
    n += await queueAutomation(db, a, org, c, values, { dedupe: `invoice_reminder:${inv.id}:${step}`, invoice_id: inv.id });
  }
  return n;
}

async function reviewRequests(db: SupabaseClient) {
  const autos = await enabledAutomations(db, "review_request");
  if (!autos.size) return 0;
  let n = 0;
  for (const ids of chunk([...autos.keys()], 100)) {
    const { data, error } = await db.from("invoices")
      .select(`id, org_id, number, total, org_snapshot, customer:customers(${CUSTOMER_COLS}), aircraft:aircraft(tail_number, manufacturer, model), payments(received_at)`)
      .in("org_id", ids).eq("status", "paid").gte("updated_at", new Date(Date.now() - 14 * 864e5).toISOString());
    if (error) throw error;
    for (const inv of (data ?? []) as Row[]) {
      const { a, org } = autos.get(inv.org_id)!;
      const reviewUrl = org.google_review_url ?? inv.org_snapshot?.google_review_url;
      if (!reviewUrl) continue;
      const paidAt = Math.max(0, ...(inv.payments ?? []).map((p: Row) => Date.parse(p.received_at)));
      if (!paidAt) continue;
      const sendAt = paidAt + (Number(a.settings?.days_after_payment ?? 1) || 0) * 864e5;
      if (Date.now() < sendAt || Date.now() - sendAt > 3 * 864e5) continue;
      const c = one(inv.customer);
      if (!c) continue;
      // Every customer is asked (no rating gating), but not more than once every 90 days.
      const { count } = await db.from("messages").select("id", { count: "exact", head: true })
        .eq("customer_id", c.id).eq("automation_key", "review_request").gte("created_at", new Date(Date.now() - 90 * 864e5).toISOString());
      if (count) continue;
      const asset = one(inv.aircraft);
      n += await queueAutomation(db, a, org, c, {
        ...baseValues(org, c), asset: assetLabel(asset), tail: asset?.tail_number ?? "",
        invoice_number: inv.number, amount: money(inv.total, org.currency), review_link: reviewUrl,
      }, { dedupe: `review_request:${inv.id}`, invoice_id: inv.id });
    }
  }
  return n;
}

async function quoteFollowUps(db: SupabaseClient) {
  const autos = await enabledAutomations(db, "quote_follow_up");
  if (!autos.size) return 0;
  const now = Date.now();
  let n = 0;
  for (const ids of chunk([...autos.keys()], 100)) {
    const { data, error } = await db.from("quotes")
      .select(`id, org_id, number, status, total, public_token, sent_at, valid_until, valid_until_at, follow_ups_sent, last_follow_up_at,
        customer:customers(${CUSTOMER_COLS}), aircraft:aircraft(tail_number, manufacturer, model)`)
      .in("org_id", ids).in("status", ["sent", "viewed"]).is("superseded_by", null).lt("follow_ups_sent", 2).not("sent_at", "is", null);
    if (error) throw error;
    for (const q of (data ?? []) as Row[]) {
      const { a, org } = autos.get(q.org_id)!;
      const deadline = q.valid_until_at ? Date.parse(q.valid_until_at) : Date.parse(`${q.valid_until}T23:59:00Z`);
      if (!(deadline > now)) continue;
      const afterDays = Number(a.settings?.after_days ?? 3);
      const beforeHours = Number(a.settings?.before_deadline_hours ?? 24);
      const recent = q.last_follow_up_at && now - Date.parse(q.last_follow_up_at) < 12 * 3600e3;
      let kind: "deadline" | "after" | null = null;
      if (beforeHours > 0 && deadline - beforeHours * 3600e3 <= now && !recent) kind = "deadline";
      else if (afterDays > 0 && q.follow_ups_sent === 0 && Date.parse(q.sent_at) + afterDays * 864e5 <= now) kind = "after";
      if (!kind) continue;
      const c = one(q.customer), asset = one(q.aircraft);
      const queued = await queueAutomation(db, a, org, c, {
        ...baseValues(org, c), asset: assetLabel(asset), tail: asset?.tail_number ?? "",
        quote_number: q.number, total: money(q.total, org.currency), amount: money(q.total, org.currency),
        deadline: fmtDateTime(new Date(deadline), org.timezone), quote_link: links.quote(q.public_token),
      }, { dedupe: `quote_follow_up:${q.id}:${kind}`, quote_id: q.id });
      if (queued) {
        await db.from("quotes").update({ follow_ups_sent: q.follow_ups_sent + 1, last_follow_up_at: new Date().toISOString() }).eq("id", q.id);
        n += queued;
      }
    }
  }
  return n;
}

async function recurringHeadsUp(db: SupabaseClient) {
  const autos = await enabledAutomations(db, "recurring_heads_up");
  if (!autos.size) return 0;
  const now = Date.now();
  let n = 0;
  for (const ids of chunk([...autos.keys()], 100)) {
    const { data, error } = await db.from("jobs").select(`${JOB_SELECT}, schedule:recurring_schedules(heads_up_days)`)
      .in("org_id", ids).not("recurring_schedule_id", "is", null).in("status", ["tentative", "scheduled"])
      .gt("scheduled_start", new Date(now).toISOString()).lte("scheduled_start", new Date(now + 31 * 864e5).toISOString());
    if (error) throw error;
    for (const j of (data ?? []) as Row[]) {
      const days = one(j.schedule)?.heads_up_days;
      if (days == null) continue; // heads-up turned off for this schedule
      if (Date.parse(j.scheduled_start) - Number(days) * 864e5 > now) continue;
      const { a, org } = autos.get(j.org_id)!;
      n += await queueAutomation(db, a, org, one(j.customer), jobValues(org, j, j.scheduled_start), {
        dedupe: `recurring_heads_up:${j.id}:${j.scheduled_start}`, job_id: j.id,
      });
    }
  }
  return n;
}

/** Invoices marked sent by "auto-send on completion" get emailed to the customer once. */
async function autoSentInvoices(db: SupabaseClient) {
  const { data: orgs } = await db.from("organizations").select(ORG_COLS).eq("auto_send_invoices", true).eq("is_demo", false).neq("plan", "expired");
  const byId = new Map(((orgs ?? []) as unknown as Org[]).map((o) => [o.id, o]));
  if (!byId.size) return 0;
  let n = 0;
  for (const ids of chunk([...byId.keys()], 100)) {
    const { data, error } = await db.from("invoices")
      .select(`id, org_id, number, total, balance, due_date, public_token, org_snapshot, customer:customers(${CUSTOMER_COLS}), aircraft:aircraft(tail_number, manufacturer, model)`)
      .in("org_id", ids).in("status", ["sent", "partial", "overdue"]).not("job_id", "is", null).eq("covered_by_plan", false)
      .gte("sent_at", new Date(Date.now() - 2 * 864e5).toISOString());
    if (error) throw error;
    for (const inv of (data ?? []) as Row[]) {
      const org = byId.get(inv.org_id)!;
      const c = one(inv.customer);
      if (!c || !isEmail(c.email)) continue;
      const review = org.google_review_url ?? inv.org_snapshot?.google_review_url;
      const body = invoiceEmailText(org, c, inv, review);
      const id = await queueMessage(db, {
        org_id: org.id, customer_id: c.id, channel: "email", to_address: c.email.trim(),
        subject: `Invoice ${inv.number} from ${inv.org_snapshot?.name ?? org.name}`, body,
        invoice_id: inv.id, dedupe_key: `invoice_sent:${inv.id}`,
      });
      if (id) n++;
    }
  }
  return n;
}

// ===========================================================================
// Sending & pushing
// ===========================================================================
async function sendQueued(db: SupabaseClient) {
  const { data, error } = await db.from("messages").select("id").eq("status", "queued").eq("direction", "out")
    .lte("send_after", new Date().toISOString()).order("send_after").limit(300);
  if (error) throw error;
  const tally: Record<string, number> = {};
  const ids = (data ?? []).map((r) => r.id as string);
  for (const group of chunk(ids, 5)) {
    const results = await Promise.all(group.map((id) => deliverMessage(db, id)));
    for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
  }
  return tally;
}

const PREF_FOR: Record<string, PrefKey> = {
  job_tomorrow: "job_assignments", job_assigned: "job_assignments",
  digest: "service_reminders", reminders_due: "service_reminders",
  payment: "payments", payment_received: "payments", late_fee: "payments", care_plan_charge: "payments", care_plan_failed: "payments",
  quote_accepted: "quote_accepted", quote_viewed: "quote_accepted", quote_declined: "quote_accepted",
};

async function pushOutbox(db: SupabaseClient) {
  const { data: rows, error } = await db.from("notification_outbox").select("*").is("sent_at", null).order("id").limit(1000);
  if (error) throw error;
  if (!rows?.length) return 0;
  const orgIds = [...new Set(rows.map((r) => r.org_id as string))];
  const members: { org_id: string; user_id: string; role: string }[] = [];
  for (const ids of chunk(orgIds, 200)) {
    const { data } = await db.from("memberships").select("org_id, user_id, role").in("org_id", ids).eq("active", true);
    members.push(...(data ?? []));
  }
  const pushes = [];
  const cache = new Map<string, Awaited<ReturnType<typeof tokensFor>>>();
  for (const r of rows) {
    const inOrg = members.filter((m) => m.org_id === r.org_id);
    const users = r.audience === "user"
      ? (r.user_id && inOrg.some((m) => m.user_id === r.user_id) ? [r.user_id] : [])
      : inOrg.filter((m) => (r.audience === "owners" ? ["owner", "admin"] : ["owner", "admin", "manager"]).includes(m.role)).map((m) => m.user_id);
    const pref = PREF_FOR[r.kind] ?? null;
    const ck = `${pref}|${[...users].sort().join(",")}`;
    if (!cache.has(ck)) cache.set(ck, await tokensFor(db, users, pref));
    const tokens = cache.get(ck)!;
    pushes.push(...pushesFor(tokens, r.title, r.body ?? "", { url: r.url ?? "/", kind: r.kind }));
  }
  await sendPushes(pushes);
  for (const ids of chunk(rows.map((r) => r.id), 500)) {
    await db.from("notification_outbox").update({ sent_at: new Date().toISOString() }).in("id", ids);
  }
  return { notifications: rows.length, pushes: pushes.length };
}
