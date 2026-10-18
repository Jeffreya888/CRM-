// AI photo condition report for staff (docs/competitive-edge.md §2).
//
// POST { org_id, paths: string[] (1–6, already uploaded to org-files under <org_id>/…),
//        aircraft_id?, customer_id?, job_id?, quote_id? }
//   → the saved condition_assessments row (status 'done', or 'failed' with `error`).
// Any active member except viewers. Daily cap: 40 per company (demo companies: 5).
import { adminClient, callerRole } from "../_shared/clients.ts";
import { error, json, preflight, readJson } from "../_shared/http.ts";
import { MAX_PHOTOS, runAssessment } from "../_shared/assess.ts";

const DAILY_CAP = 40;
const DEMO_DAILY_CAP = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = {
  org_id?: string; paths?: unknown; aircraft_id?: string | null; customer_id?: string | null; job_id?: string | null; quote_id?: string | null;
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return error("Method not allowed", 405);
  try {
    const body = await readJson<Body>(req);
    const orgId = body.org_id;
    if (typeof orgId !== "string" || !UUID.test(orgId)) return error("org_id required");
    if (!Array.isArray(body.paths) || body.paths.length < 1) return error("Add at least one photo");
    if (body.paths.length > MAX_PHOTOS) return error(`Use up to ${MAX_PHOTOS} photos`);
    const paths = [...new Set(body.paths)];
    for (const p of paths) {
      if (typeof p !== "string" || p.length > 500 || !p.startsWith(`${orgId}/`) || p.includes("..")) {
        return error("One of the photos does not belong to this company", 403);
      }
    }

    // Permission check as the caller (RLS-aware: membership + two-step sign-in rule).
    const caller = await callerRole(req, orgId);
    if (!caller) return error("You don't have access to this company", 403);
    if (caller.role === "viewer") return error("View-only members can't check photos", 403);

    const db = adminClient();
    const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
    const aircraftId = id(body.aircraft_id), customerId = id(body.customer_id), jobId = id(body.job_id), quoteId = id(body.quote_id);
    const belongs = async (table: string, rowId: string | null) => {
      if (!rowId) return true;
      const { data } = await db.from(table).select("id").eq("id", rowId).eq("org_id", orgId).maybeSingle();
      return !!data;
    };
    const checks = await Promise.all([belongs("aircraft", aircraftId), belongs("customers", customerId), belongs("jobs", jobId), belongs("quotes", quoteId)]);
    if (checks.includes(false)) return error("That record isn't in this company", 404);

    // Daily cap per company.
    const { data: org } = await db.from("organizations").select("is_demo").eq("id", orgId).maybeSingle();
    const cap = org?.is_demo ? DEMO_DAILY_CAP : DAILY_CAP;
    const { count } = await db.from("condition_assessments").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("source", "staff").gte("created_at", new Date(Date.now() - 864e5).toISOString());
    if ((count ?? 0) >= cap) {
      return error(org?.is_demo
        ? `The demo allows ${DEMO_DAILY_CAP} photo checks a day. Start your own company to use more.`
        : `Your company has used today's ${DAILY_CAP} photo checks. Please try again tomorrow.`, 429);
    }

    const row = await runAssessment(db, {
      orgId, paths: paths as string[], aircraftId, customerId, jobId, quoteId, source: "staff", createdBy: caller.userId,
    });
    return json(row);
  } catch (e) {
    console.error(e);
    return error("Couldn't check the photos right now. Please try again.", 500);
  }
});
