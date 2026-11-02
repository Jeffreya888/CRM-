// One-tap reorder: emails each vendor the low-stock items they supply.
// POST { org_id, item_ids? } → { emailed, skipped_without_email }   (owners, admins, managers)
// Without item_ids: every active item at or below its par level.
import { adminClient, callerRole } from "../_shared/clients.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { emailVendorOrders, REORDER_COLS, type ReorderItem } from "../_shared/reorder.ts";
import { loadOrg } from "../_shared/automation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { org_id, item_ids } = await req.json().catch(() => ({}));
    if (typeof org_id !== "string" || !org_id) return error("org_id required");
    if (item_ids != null && (!Array.isArray(item_ids) || item_ids.some((i) => typeof i !== "string") || item_ids.length > 500)) {
      return error("item_ids must be a list of item ids");
    }
    const caller = await callerRole(req, org_id);
    if (!caller || !["owner", "admin", "manager"].includes(caller.role)) return error("Not allowed", 403);
    const db = adminClient();
    const org = await loadOrg(db, org_id);
    if (!org) return error("Company not found", 404);
    if (org.is_demo) return error("DEMO: emails are not sent from the demo workspace");

    let q = db.from("inventory_items").select(REORDER_COLS).eq("org_id", org_id).eq("active", true);
    if (item_ids?.length) q = q.in("id", item_ids);
    const { data: items, error: e } = await q;
    if (e) throw e;
    const list = ((items ?? []) as ReorderItem[]).filter((i) => item_ids?.length || (Number(i.par_level) > 0 && Number(i.quantity) <= Number(i.par_level)));

    const { data: me } = await db.from("profiles").select("full_name").eq("id", caller.userId).maybeSingle();
    const { emailed, skipped, failures } = await emailVendorOrders(db, org, list, { sender: me?.full_name, createdBy: caller.userId });
    if (!emailed && failures.length) return error(failures.join("; "), 502);
    return json({ emailed, skipped_without_email: skipped, failed: failures.length });
  } catch (e) {
    console.error(e);
    return error((e as Error).message, 500);
  }
});
