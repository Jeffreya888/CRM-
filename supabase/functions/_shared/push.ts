import type { SupabaseClient } from "./deps.ts";

export type Push = { to: string; title: string; body: string; data?: Record<string, unknown> };
export type PrefKey = "job_assignments" | "service_reminders" | "payments" | "quote_accepted";

/** Expo push tokens for users who haven't turned this notification type off. */
export async function tokensFor(db: SupabaseClient, userIds: string[], pref: PrefKey): Promise<{ token: string; user_id: string }[]> {
  if (!userIds.length) return [];
  const { data: profiles } = await db.from("profiles").select("id, notification_prefs").in("id", userIds);
  const allowed = (profiles ?? []).filter((p) => p.notification_prefs?.[pref] !== false).map((p) => p.id);
  if (!allowed.length) return [];
  const { data } = await db.from("push_tokens").select("token, user_id").in("user_id", allowed);
  return data ?? [];
}

export async function sendPushes(messages: Push[]) {
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages.slice(i, i + 100).map((m) => ({ ...m, sound: "default" }))),
    });
    if (!res.ok) console.error("push failed", res.status, await res.text());
  }
}
