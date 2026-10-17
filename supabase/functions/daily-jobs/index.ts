// Deprecated alias: daily maintenance now lives in automation-worker (it runs
// the daily part once a day). Kept so an existing cron pointing here keeps
// working. POST with header  Authorization: Bearer <CRON_SECRET>
import { env, json, safeEqual } from "../_shared/http.ts";
import { runWorker } from "../automation-worker/index.ts";

Deno.serve(async (req) => {
  if (!safeEqual(req.headers.get("Authorization") ?? "", `Bearer ${env("CRON_SECRET")}`)) {
    return new Response("unauthorized", { status: 401 });
  }
  const summary = await runWorker();
  return json(summary, summary.ok ? 200 : 500);
});
