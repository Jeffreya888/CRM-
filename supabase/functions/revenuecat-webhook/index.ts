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
      if (plan) update = { plan, plan_expires_at: expires };
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
