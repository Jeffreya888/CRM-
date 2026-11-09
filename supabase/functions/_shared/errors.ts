// Server error reporting: logs to the console and records the error in public.app_errors
// (grouped, shown in Platform admin → Errors, emailed to admins when new). Never throws and never
// delays the response: the write is handed to EdgeRuntime.waitUntil when available.
import { adminClient } from "./clients.ts";

export function reportError(source: string, e: unknown, orgId?: string | null): Promise<void> {
  console.error(e);
  const err = e instanceof Error ? e : new Error(typeof e === "string" ? e : JSON.stringify(e));
  const task = (async () => {
    try {
      await adminClient().rpc("log_server_error", {
        p_source: source,
        p_message: (err.message || "Unknown error").slice(0, 1000),
        p_stack: (err.stack ?? "").slice(0, 4000),
        p_org: orgId ?? null,
      });
    } catch {
      // Reporting must never break the function.
    }
  })();
  try {
    (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(task);
  } catch { /* not running in the edge runtime */ }
  return task;
}
