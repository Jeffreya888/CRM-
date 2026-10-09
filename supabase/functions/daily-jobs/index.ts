// Daily maintenance + notifications. Schedule once a day (see README):
//   - marks past-due invoices "overdue"
//   - flips service reminders to "due" when their date arrives
//   - expires lapsed subscriptions / trials
//   - pushes tomorrow's assignments to technicians and a digest to managers
//
// POST with header  Authorization: Bearer <CRON_SECRET>
import { adminClient } from "../_shared/clients.ts";
import { env, json, safeEqual } from "../_shared/http.ts";

type Push = { to: string; title: string; body: string; data?: Record<string, unknown> };

async function sendPushes(messages: Push[]) {
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages.slice(i, i + 100).map((m) => ({ ...m, sound: "default" }))),
    });
    if (!res.ok) console.error("push failed", res.status, await res.text());
  }
}

Deno.serve(async (req) => {
  if (!safeEqual(req.headers.get("Authorization") ?? "", `Bearer ${env("CRON_SECRET")}`)) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = adminClient();
  const today = new Date().toISOString().slice(0, 10);

  const overdue = await db.from("invoices").update({ status: "overdue" })
    .in("status", ["sent", "partial"]).lt("due_date", today).select("id");
  const due = await db.from("service_reminders").update({ status: "due" })
    .eq("status", "upcoming").lte("due_on", today).select("id, org_id, title, aircraft:aircraft(tail_number)");
  await db.from("organizations").update({ plan: "expired" })
    .eq("plan", "trial").lt("trial_ends_at", new Date().toISOString());
  await db.from("organizations").update({ plan: "expired" })
    .in("plan", ["solo", "team", "fleet"]).lt("plan_expires_at", new Date(Date.now() - 3 * 864e5).toISOString()); // 3-day grace for webhook delays

  const messages: Push[] = [];

  // Tomorrow's assignments → each assigned technician.
  const start = new Date(); start.setUTCHours(24, 0, 0, 0);
  const end = new Date(start.getTime() + 864e5);
  const { data: jobs } = await db.from("jobs")
    .select("id, number, scheduled_start, aircraft:aircraft(tail_number), location:locations(airport_code, fbo_name), job_assignments(user_id)")
    .gte("scheduled_start", start.toISOString()).lt("scheduled_start", end.toISOString())
    .in("status", ["scheduled"]);
  const userIds = new Set<string>();
  // deno-lint-ignore no-explicit-any
  for (const j of (jobs ?? []) as any[]) for (const a of j.job_assignments) userIds.add(a.user_id);

  // Managers of orgs with newly-due reminders.
  // deno-lint-ignore no-explicit-any
  const dueRows = (due.data ?? []) as any[];
  const dueOrgs = [...new Set(dueRows.map((r) => r.org_id))];
  const { data: managers } = dueOrgs.length
    ? await db.from("memberships").select("user_id, org_id").in("org_id", dueOrgs).in("role", ["owner", "admin", "manager"]).eq("active", true)
    : { data: [] as { user_id: string; org_id: string }[] };
  for (const m of managers ?? []) userIds.add(m.user_id);

  const { data: tokens } = userIds.size
    ? await db.from("push_tokens").select("token, user_id").in("user_id", [...userIds])
    : { data: [] as { token: string; user_id: string }[] };
  const tokensFor = (uid: string) => (tokens ?? []).filter((t) => t.user_id === uid).map((t) => t.token);

  // deno-lint-ignore no-explicit-any
  for (const j of (jobs ?? []) as any[]) {
    const where = j.location?.airport_code ?? j.location?.fbo_name ?? "";
    const time = new Date(j.scheduled_start).toISOString().slice(11, 16);
    for (const a of j.job_assignments) {
      for (const to of tokensFor(a.user_id)) {
        messages.push({ to, title: "Tomorrow's job", body: `${j.aircraft?.tail_number ?? j.number} ${where} at ${time} UTC`, data: { url: `/jobs/${j.id}` } });
      }
    }
  }
  for (const m of managers ?? []) {
    const mine = dueRows.filter((r) => r.org_id === m.org_id);
    if (!mine.length) continue;
    for (const to of tokensFor(m.user_id)) {
      messages.push({
        to,
        title: `${mine.length} service reminder${mine.length > 1 ? "s" : ""} due`,
        body: mine.slice(0, 3).map((r) => `${r.aircraft?.tail_number}: ${r.title}`).join(", "),
        data: { url: "/reminders" },
      });
    }
  }
  await sendPushes(messages);

  return json({ overdue: overdue.data?.length ?? 0, reminders_due: dueRows.length, pushes: messages.length });
});
