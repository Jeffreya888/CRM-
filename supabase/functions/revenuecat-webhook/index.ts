// RevenueCat → organizations.plan. The app logs into RevenueCat with the
// organization id as the App User ID, so a subscription belongs to the whole
// company rather than one phone.
//
// RevenueCat dashboard → Integrations → Webhooks:
//   URL: https://<project>.functions.supabase.co/revenuecat-webhook
//   Authorization header: "Bearer <REVENUECAT_WEBHOOK_SECRET>"
import { adminClient } from "../_shared/clients.ts";
import { env, safeEqual } from "../_shared/http.ts";

type RCEvent = {
  id?: string;
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  product_id?: string;
  new_product_id?: string;
  expiration_at_ms?: number | null;
  transferred_to?: string[];
  transferred_from?: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RANK = ["fleet", "team", "solo"] as const;

/** Highest tier named by the entitlements or product identifier. */
export function planFrom(e: Pick<RCEvent, "entitlement_ids" | "product_id" | "new_product_id">): string | null {
  const hay = [...(e.entitlement_ids ?? []), e.new_product_id ?? "", e.product_id ?? ""].join(" ").toLowerCase();
  return RANK.find((p) => hay.includes(p)) ?? null;
}

/** "annual" when the product id names a yearly product, else "monthly". */
export function billingPeriodFrom(e: Pick<RCEvent, "product_id" | "new_product_id">): "annual" | "monthly" {
  const id = (e.new_product_id || e.product_id || "").toLowerCase();
  return id.includes("annual") || id.includes("year") ? "annual" : "monthly";
}

/** Text packs: consumables whose product id contains "texts", e.g. flightready_texts_500 → 500. */
export function textPackSize(productId: string | undefined): number | null {
  const id = (productId ?? "").toLowerCase();
  if (!id.includes("texts")) return null;
  const n = /(\d[\d,]*)/.exec(id.replace(/^\D+/, ""))?.[1];
  const v = n ? Number(n.replace(/,/g, "")) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Adds purchased texts once per RevenueCat event id (ids kept in worker_runs). */
async function addTextPack(db: ReturnType<typeof adminClient>, orgId: string, event: RCEvent, texts: number): Promise<boolean> {
  const eventId = event.id ?? `${orgId}:${event.product_id}:${event.expiration_at_ms ?? ""}`;
  const { data: seen } = await db.from("worker_runs").select("id").eq("worker", "revenuecat_texts")
    .eq("details->>event_id", eventId).limit(1);
  if (seen?.length) return true;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: org } = await db.from("organizations").select("sms_extra_credits").eq("id", orgId).maybeSingle();
    if (!org) return true; // unknown org: nothing to credit
    const current = Number(org.sms_extra_credits ?? 0);
    // Compare-and-set so concurrent purchases never overwrite each other.
    const { data: updated, error } = await db.from("organizations")
      .update({ sms_extra_credits: current + texts }).eq("id", orgId).eq("sms_extra_credits", current).select("id");
    if (error) {
      console.error(error);
      return false;
    }
    if (updated?.length) {
      await db.from("worker_runs").insert({
        worker: "revenuecat_texts", ok: true,
        details: { event_id: eventId, org_id: orgId, product_id: event.product_id, texts, balance: current + texts },
      });
      return true;
    }
  }
  return false;
}

function orgIds(e: RCEvent): string[] {
  return [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? []), ...(e.transferred_to ?? [])]
    .filter((x): x is string => !!x && UUID.test(x));
}

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env("REVENUECAT_WEBHOOK_SECRET")}`)) {
    return new Response("unauthorized", { status: 401 });
  }
  const { event } = (await req.json()) as { event: RCEvent };
  const db = adminClient();
  const expires = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
  const ids = [...new Set(orgIds(event))];
  if (ids.length === 0) return new Response("ignored: no org id", { status: 200 });

  // Extra text packs (consumable, NON_RENEWING_PURCHASE): add credits, never touch the plan.
  const pack = textPackSize(event.product_id);
  if (pack !== null) {
    if (event.type === "NON_RENEWING_PURCHASE") {
      // Credit only the purchasing org (the app user id), not every alias.
      const target = UUID.test(event.app_user_id) ? event.app_user_id : ids[0];
      if (!(await addTextPack(db, target, event, pack))) return new Response("db error", { status: 500 });
    }
    return new Response("ok");
  }

  let update: Record<string, unknown> | null = null;
  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "SUBSCRIPTION_EXTENDED":
    case "TEMPORARY_ENTITLEMENT_GRANT":
    case "NON_RENEWING_PURCHASE": {
      const plan = planFrom(event);
      if (plan) update = { plan, plan_expires_at: expires, billing_period: billingPeriodFrom(event) };
      break;
    }
    case "CANCELLATION":
    case "BILLING_ISSUE":
      // Access continues until expiration; just keep the expiry current.
      if (expires) update = { plan_expires_at: expires };
      break;
    case "EXPIRATION":
      update = { plan: "expired", plan_expires_at: expires ?? new Date().toISOString() };
      break;
    case "TRANSFER":
      // Subscription moved to another app user id; revoke from the old org(s).
      for (const from of event.transferred_from ?? []) {
        if (UUID.test(from)) await db.from("organizations").update({ plan: "expired" }).eq("id", from);
      }
      break;
  }

  if (update) {
    const target = event.type === "TRANSFER" ? event.transferred_to ?? [] : ids;
    const { error } = await db.from("organizations").update(update).in("id", target.filter((x) => UUID.test(x)));
    if (error) {
      console.error(error);
      return new Response("db error", { status: 500 });
    }
  }
  return new Response("ok");
});
