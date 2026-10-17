// Sends a queued `messages` row now (email or text). The caller must be an
// owner, admin or manager of the message's company (or the crew member who
// queued an "On our way" message). Anything left queued
// (quiet hours, failures to reach this function) is sent by automation-worker.
//
// POST { message_id } → { status: 'sent' | 'scheduled' | 'blocked' | 'failed' | ..., error?, send_after? }
import { adminClient, callerRole } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { deliverMessage } from "../_shared/automation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { message_id } = await req.json().catch(() => ({}));
    if (typeof message_id !== "string" || !message_id) return error("message_id required");
    const db = adminClient();
    const { data: m } = await db.from("messages").select("id, org_id, direction, automation_key, created_by").eq("id", message_id).maybeSingle();
    if (!m) return error("Message not found", 404);
    const caller = await callerRole(req, m.org_id);
    // Crew may send the "On our way" message they queued from a job.
    const crewOnTheWay = !!caller && caller.role !== "viewer" && m.automation_key === "on_our_way" && m.created_by === caller.userId;
    if (!caller || (!["owner", "admin", "manager"].includes(caller.role) && !crewOnTheWay)) return error("Message not found", 404);
    if (m.direction !== "out") return error("Only outgoing messages can be sent");

    const r = await deliverMessage(db, message_id);
    // Failed / blocked come back as errors so the app shows the reason; the row keeps it too.
    if (r.status === "failed" || r.status === "blocked" || r.status === "missing") {
      return json({ status: r.status, error: r.error ?? "Could not send this message" }, 422);
    }
    return json(r);
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
