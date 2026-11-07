// Brand booking page for a franchise network (public website, no sign-in).
//
// POST { action: 'info', slug }   → { name, locations: [{ name, airports[] }] }
// POST { action: 'submit', slug, name, email, phone?, company?, airport?, zip?, asset?, service?, preferred?[], notes?, website? }
//   → { location, matched_by }
//   Routes the request to the location that owns the airport (else zip code, else HQ) and
//   creates a booking request there (franchise_submit_lead). `website` is a hidden
//   honeypot field: bots that fill it in get a normal-looking answer and nothing is saved.
import { adminClient } from "../_shared/clients.ts";
import { error, json, preflight } from "../_shared/http.ts";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return error("Method not allowed", 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return error("Invalid request"); }
  const slug = str(body.slug, 40).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return error("This booking page is not available", 404);
  const db = adminClient();

  if (body.action === "info") {
    const { data, error: e } = await db.rpc("franchise_public_info", { p_slug: slug });
    if (e) return error("Could not load this page. Please try again.", 500);
    if (!data) return error("This booking page is not available", 404);
    return json(data);
  }

  if (body.action === "submit") {
    if (str(body.website, 200)) return json({ location: null, matched_by: "hq" });
    const preferred = Array.isArray(body.preferred)
      ? body.preferred.filter((d) => typeof d === "string" && !Number.isNaN(Date.parse(d))).slice(0, 3)
      : [];
    const { data, error: e } = await db.rpc("franchise_submit_lead", {
      p_slug: slug, p_name: str(body.name, 120), p_email: str(body.email, 200), p_phone: str(body.phone, 40),
      p_company: str(body.company, 120), p_airport: str(body.airport, 10), p_zip: str(body.zip, 10),
      p_asset: str(body.asset, 200), p_service: str(body.service, 200), p_preferred: preferred, p_notes: str(body.notes, 1000),
    });
    if (e) return error(e.message.replace(/^.*?: /, ""));
    return json(data);
  }

  return error("Unknown action");
});
