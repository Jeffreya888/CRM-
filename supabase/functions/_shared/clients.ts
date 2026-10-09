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
  return data ? { userId: user.id, role: data.role as string } : null;
}
