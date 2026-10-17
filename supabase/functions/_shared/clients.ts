import { createClient, Stripe, type SupabaseClient } from "./deps.ts";
import { env } from "./http.ts";

/** Service-role client: bypasses RLS. Only use after authorizing the caller. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/** Client acting as the calling user, so RLS applies. */
export function userClient(req: Request): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
}

export function stripe(): Stripe {
  return new Stripe(env("STRIPE_SECRET_KEY"), {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/** Platform fee (basis points) per plan: the processing-fee revenue stream. */
export function platformFeeBps(plan: string): number {
  const fallback: Record<string, number> = { solo: 150, trial: 150, team: 100, fleet: 50 };
  const fromEnv = Deno.env.get(`PLATFORM_FEE_BPS_${plan.toUpperCase()}`);
  return fromEnv ? Number(fromEnv) : (fallback[plan] ?? 150);
}

/** Returns the caller's user id and role in the org, or null. */
export async function callerRole(req: Request, orgId: string) {
  const sb = userClient(req);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  // Companies that require two-step sign-in: an aal1 session is not a member (same rule as RLS).
  const { data: aalOk } = await sb.rpc("session_aal_ok", { p_org: orgId });
  if (aalOk !== true) return null;
  return { userId: user.id, role: data.role as string };
}

/** True when the caller may see prices and money in the org (RLS-aware). */
export async function callerCanMoney(req: Request, orgId: string): Promise<boolean> {
  const { data } = await userClient(req).rpc("can_money", { p_org: orgId });
  return data === true;
}

export const MANAGER_ROLES = ["owner", "admin", "manager"];

/** The org's plan right now (trial/solo/team/fleet/expired), as the database computes it. */
export async function effectivePlan(db: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await db.rpc("effective_plan", { p_org: orgId });
  return typeof data === "string" ? data : "solo";
}

/** Platform fee in basis points for the org's current plan. */
export async function orgFeeBps(db: SupabaseClient, orgId: string): Promise<number> {
  return platformFeeBps(await effectivePlan(db, orgId));
}

/** Queues a push for the org's managers (sent by the automation worker). */
export async function notifyManagers(
  db: SupabaseClient,
  orgId: string,
  kind: string,
  title: string,
  body: string | null,
  url: string | null,
  audience: "managers" | "owners" = "managers",
) {
  const { error } = await db.from("notification_outbox").insert({ org_id: orgId, audience, kind, title, body, url });
  if (error) console.error("notification_outbox insert failed", error);
}

/** Formats an amount in the org's currency, e.g. "$1,250.00". */
export function money(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
