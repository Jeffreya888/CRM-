// Calendar subscription feed (public URL, no sign-in): GET ?token=<private link token> → text/calendar.
// Google Calendar, Apple Calendar and Outlook poll it (roughly hourly for Apple/Outlook, every few
// hours for Google). An unknown or reset token returns an empty calendar, never an error page.
import { adminClient } from "../_shared/clients.ts";
import { reportError } from "../_shared/errors.ts";
import { buildCalendar, type IcsEvent } from "../_shared/ics.ts";

type Row = {
  job_id: string; number: string; title: string; status: string; starts_at: string; ends_at: string;
  place: string | null; asset: string | null; customer: string | null; company: string; timezone: string | null; updated_at: string | null;
};

const STATUS: Record<string, string> = { scheduled: "Scheduled", in_progress: "In progress", on_hold: "On hold", completed: "Completed", invoiced: "Completed" };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").replace(/\.ics$/i, "");
  const headers = { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Disposition": 'inline; filename="tarmo.ics"' };
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response(buildCalendar("Tarmo jobs", []), { headers });
  try {
    const { data, error } = await adminClient().rpc("calendar_feed_events", { p_token: token });
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const company = rows[0]?.company ?? "Tarmo";
    const events: IcsEvent[] = rows.map((r) => ({
      uid: `${r.job_id}@gettarmo.com`,
      start: new Date(r.starts_at),
      end: new Date(r.ends_at),
      summary: [r.asset, r.title].filter(Boolean).join(" · ") + (r.customer ? ` (${r.customer})` : ""),
      location: r.place,
      description: [`Job ${r.number} · ${STATUS[r.status] ?? r.status}`, r.customer ? `Customer: ${r.customer}` : null, r.asset ? `Asset: ${r.asset}` : null,
        "Open the job in Tarmo for details and SOPs."].filter(Boolean).join("\n"),
      updated: r.updated_at ? new Date(r.updated_at) : null,
    }));
    return new Response(buildCalendar(`${company} · Tarmo jobs`, events), { headers });
  } catch (e) {
    reportError("calendar-feed", e);
    return new Response(buildCalendar("Tarmo jobs", []), { headers });
  }
});
