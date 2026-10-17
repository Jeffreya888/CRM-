// Reads a receipt photo the app already uploaded to storage (org-files) and
// returns the fields to pre-fill an expense. Nothing is stored: the image is
// only sent to the Claude API for this one request.
//
// POST { org_id, path } → { vendor, amount, date, category }  (null when unsure)
// Caller must be a member who can see money (can_money).
// Imported here (not in _shared/deps.ts) so other functions do not load the SDK.
// deno-lint-ignore no-import-prefix
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { adminClient, userClient } from "../_shared/clients.ts";
import { env, error, json, preflight, readJson } from "../_shared/http.ts";

// Must match expenses_category_check in 20261017000400_finance.sql.
const CATEGORIES = [
  "supplies", "equipment", "equipment_rental", "repairs", "fuel", "vehicle", "travel", "meals", "insurance", "rent", "utilities",
  "advertising", "software", "fees", "contract_labor", "wages", "taxes_licenses", "office", "training", "other",
] as const;

const MEDIA: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
};
const MAX_BYTES = 5 * 1024 * 1024; // Claude API per-image limit

const SCHEMA = {
  type: "object",
  properties: {
    vendor: { type: ["string", "null"], description: "Business name printed on the receipt" },
    amount: { type: ["number", "null"], description: "Grand total actually paid, including tax and tip" },
    date: { type: ["string", "null"], description: "Purchase date as YYYY-MM-DD" },
    category: { type: ["string", "null"], enum: [...CATEGORIES, null] },
  },
  required: ["vendor", "amount", "date", "category"],
  additionalProperties: false,
};

const SYSTEM = `You read photos of purchase receipts for an aircraft, vehicle and boat detailing business and extract bookkeeping fields.
Return the vendor (store or business name), the grand total paid (a number, no currency symbol), the purchase date (YYYY-MM-DD), and the best expense category.
Categories: supplies (cleaning chemicals, towels, detailing products), equipment (tools and machines bought), equipment_rental, repairs, fuel, vehicle (vehicle costs other than fuel), travel (flights, hotels, parking, tolls), meals, insurance, rent, utilities, advertising, software, fees (bank, airport/FBO, ramp and permit fees), contract_labor, wages, taxes_licenses, office, training, other.
Use null for any field you cannot read with confidence. If the image is not a receipt, return null for every field.`;

const nulls = { vendor: null, amount: null, date: null, category: null };

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function clean(raw: Record<string, unknown>) {
  const vendor = typeof raw.vendor === "string" && raw.vendor.trim() ? raw.vendor.trim().slice(0, 120) : null;
  const amount = typeof raw.amount === "number" && Number.isFinite(raw.amount) && raw.amount >= 0 && raw.amount < 10_000_000
    ? Math.round(raw.amount * 100) / 100 : null;
  let date: string | null = null;
  if (typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    const d = new Date(`${raw.date}T00:00:00Z`);
    const year = d.getUTCFullYear();
    const tooFarAhead = d.getTime() > Date.now() + 2 * 864e5;
    if (!isNaN(d.getTime()) && year >= 2000 && !tooFarAhead) date = raw.date;
  }
  const category = typeof raw.category === "string" && (CATEGORIES as readonly string[]).includes(raw.category) ? raw.category : null;
  return { vendor, amount, date, category };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const { org_id, path } = await readJson<{ org_id?: string; path?: string }>(req);
    if (!org_id || !path) return error("org_id and path required");
    if (!path.startsWith(`${org_id}/`) || path.includes("..")) return error("That file does not belong to this company", 403);

    // Permission check as the caller (RLS-aware RPC).
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return error("Please sign in again", 401);
    const { data: allowed, error: permErr } = await sb.rpc("can_money", { p_org: org_id });
    if (permErr || allowed !== true) return error("You don't have permission to add expenses", 403);

    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const { data: blob, error: dlErr } = await adminClient().storage.from("org-files").download(path);
    if (dlErr || !blob) return error("Couldn't find that receipt photo", 404);
    const mediaType = MEDIA[ext] ?? (Object.values(MEDIA) as string[]).find((m) => m === blob.type) as typeof MEDIA[string] | undefined;
    if (!mediaType) return error("Please use a JPG or PNG photo of the receipt");
    if (blob.size > MAX_BYTES) return error("That photo is too large to read. Try a smaller photo (under 5 MB).");
    const data = toBase64(new Uint8Array(await blob.arrayBuffer()));

    const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), maxRetries: 2, timeout: 60_000 });
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // a declined request is retried server-side on Anthropic's recommended model
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: `Extract the receipt fields. Today is ${new Date().toISOString().slice(0, 10)}.` },
        ],
      }],
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return json(nulls);
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json(nulls);
    try {
      return json(clean(JSON.parse(text.text)));
    } catch {
      return json(nulls);
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return error("Receipt reading is busy right now. Please try again in a minute.", 429);
    if (e instanceof Anthropic.APIError) {
      console.error("Claude API error", e.status, e.message);
      return error("Couldn't read the receipt right now. You can type the details instead.", 502);
    }
    console.error(e);
    return error("Couldn't read the receipt right now. You can type the details instead.", 500);
  }
});
