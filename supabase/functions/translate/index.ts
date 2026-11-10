// Translates SOP steps and checklist text for people who use Tarmo in Spanish.
// POST { org_id, language: 'es', texts: string[] } → { translations: string[] } (same order).
// Each text is translated once and saved (public.translations), so later requests are free and instant.
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { adminClient, callerRole } from "../_shared/clients.ts";
import { reportError } from "../_shared/errors.ts";
import { env, error, json, preflight, readJson } from "../_shared/http.ts";

const MAX_TEXTS = 120;
const MAX_CHARS = 30_000;
const SCHEMA = {
  type: "object",
  properties: { translations: { type: "array", items: { type: "string" } } },
  required: ["translations"],
  additionalProperties: false,
};
const SYSTEM = `You translate work instructions for aircraft, marine and auto detailing crews from English into clear,
natural Latin American Spanish, the way an experienced crew lead would say it on the job.
- Keep product names, brand names, model names, tail numbers, part numbers, measurements and units exactly as written.
- Keep common trade terms detailers use in English when that's how crews say them (for example "brightwork" may stay
  as "brightwork (partes metálicas pulidas)" the first time), otherwise use the usual Spanish term.
- Keep safety warnings just as strong. Keep numbering, bullets and line breaks.
- Return one translation per input, in the same order, with nothing added or left out.`;

async function sha(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const body = await readJson<{ org_id?: string; language?: string; texts?: unknown }>(req);
    if (typeof body.org_id !== "string") return error("org_id required");
    if (body.language !== "es") return error("Only Spanish is supported");
    const texts = Array.isArray(body.texts) ? body.texts.map((t) => (typeof t === "string" ? t : "")) : [];
    if (!texts.length) return json({ translations: [] });
    if (texts.length > MAX_TEXTS || texts.reduce((n, t) => n + t.length, 0) > MAX_CHARS) return error("Too much text at once");
    const caller = await callerRole(req, body.org_id);
    if (!caller) return error("You're not a member of this company", 403);

    const db = adminClient();
    const hashes = await Promise.all(texts.map((t) => sha(t.trim())));
    const { data: cached } = await db.from("translations").select("source_hash, translated").eq("language", "es").in("source_hash", [...new Set(hashes)]);
    const found = new Map((cached ?? []).map((r) => [r.source_hash as string, r.translated as string]));
    const missing = [...new Set(texts.map((t, i) => (t.trim() && !found.has(hashes[i]) ? i : -1)).filter((i) => i >= 0).map((i) => texts[i].trim()))];

    if (missing.length) {
      const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), maxRetries: 2, timeout: 90_000 });
      const response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        system: [{ type: "text", text: SYSTEM }],
        messages: [{ role: "user", content: `Translate each item of this JSON array into Spanish:\n${JSON.stringify(missing)}` }],
      });
      const text = response.content.find((b) => b.type === "text");
      let out: string[] = [];
      if (response.stop_reason === "end_turn" && text && text.type === "text") {
        try { out = (JSON.parse(text.text) as { translations: string[] }).translations ?? []; } catch { out = []; }
      }
      if (out.length === missing.length) {
        const rows = await Promise.all(missing.map(async (src, i) => ({ source_hash: await sha(src), language: "es", source: src, translated: String(out[i]).slice(0, 8000) })));
        await db.from("translations").upsert(rows, { onConflict: "source_hash,language", ignoreDuplicates: true });
        for (const r of rows) found.set(r.source_hash, r.translated);
      } else {
        console.warn("translation count mismatch or stop", response.stop_reason, out.length, missing.length);
      }
    }
    // Anything that couldn't be translated comes back in English rather than failing the screen.
    return json({ translations: texts.map((t, i) => (t.trim() ? found.get(hashes[i]) ?? t : t)) });
  } catch (e) {
    reportError("translate", e);
    if (e instanceof Anthropic.RateLimitError) return error("Translation is busy right now. Please try again in a minute.", 429);
    return error("Could not translate right now.", 500);
  }
});
