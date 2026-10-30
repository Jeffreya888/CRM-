import type { SupabaseClient } from "./deps.ts";

export type Push = { to: string; title: string; body: string; data?: Record<string, unknown>; private?: boolean };
export type PrefKey = "job_assignments" | "service_reminders" | "payments" | "quote_accepted";
export type PushToken = { token: string; user_id: string; private: boolean };

/** Generic text shown on the lock screen when someone turned on "Private lock screen". */
export const PRIVATE_TITLE = "Tarmo";
export const PRIVATE_BODY = "You have a new update. Open the app to see it.";

// Tokens whose owner wants a private lock screen. Filled by tokensFor() so that
// callers which build pushes themselves (e.g. stripe-webhook) are covered too.
const privateTokens = new Set<string>();

/** Private lock screen is on unless the person turned it off (matches the app's default). */
// deno-lint-ignore no-explicit-any
export const wantsPrivate = (prefs: any) => prefs?.private_lock_screen !== false;

/**
 * Expo push tokens for users who haven't turned this notification type off.
 * Pass `null` as pref for alerts that are always delivered.
 */
export async function tokensFor(db: SupabaseClient, userIds: string[], pref: PrefKey | null): Promise<PushToken[]> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return [];
  const { data: profiles } = await db.from("profiles").select("id, notification_prefs").in("id", ids);
  const priv = new Map<string, boolean>();
  const allowed: string[] = [];
  for (const p of profiles ?? []) {
    if (pref && p.notification_prefs?.[pref] === false) continue;
    allowed.push(p.id);
    priv.set(p.id, wantsPrivate(p.notification_prefs));
  }
  if (!allowed.length) return [];
  const { data } = await db.from("push_tokens").select("token, user_id").in("user_id", allowed);
  return (data ?? []).map((t) => {
    const isPrivate = priv.get(t.user_id) ?? true;
    if (isPrivate) privateTokens.add(t.token); else privateTokens.delete(t.token);
    return { token: t.token, user_id: t.user_id, private: isPrivate };
  });
}

/** Builds pushes for tokens, hiding names/amounts for people with a private lock screen. */
export function pushesFor(tokens: PushToken[], title: string, body: string, data?: Record<string, unknown>): Push[] {
  return tokens.map((t) => ({ to: t.token, title, body, data, private: t.private }));
}

export async function sendPushes(messages: Push[]) {
  const payload = messages.map(({ private: p, ...m }) => {
    const hide = p ?? privateTokens.has(m.to);
    return hide
      ? { ...m, title: PRIVATE_TITLE, body: PRIVATE_BODY, sound: "default" }
      : { ...m, sound: "default" };
  });
  for (let i = 0; i < payload.length; i += 100) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload.slice(i, i + 100)),
      });
      if (!res.ok) console.error("push failed", res.status, await res.text());
    } catch (e) {
      console.error("push failed", e);
    }
  }
}
