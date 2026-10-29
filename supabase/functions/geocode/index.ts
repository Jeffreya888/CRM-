// Address → map coordinates for travel fees and route order (US addresses),
// using the free U.S. Census Bureau geocoder (no key). Signed-in members only.
//
// POST { address } → { found: true, lat, lng, matched } | { found: false }
// GEOCODER_URL can point at a stand-in server in automated tests.
import { userClient } from "../_shared/clients.ts";
import { error, json, preflight, readJson } from "../_shared/http.ts";

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

type CensusReply = { result?: { addressMatches?: { matchedAddress?: string; coordinates?: { x?: number; y?: number } }[] } };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const { data: { user } } = await userClient(req).auth.getUser();
  if (!user) return error("Sign in first", 401);
  const { address } = await readJson<{ address?: string }>(req);
  const a = typeof address === "string" ? address.trim() : "";
  if (a.length < 5 || a.length > 300) return error("Enter a full street address");
  try {
    const q = new URLSearchParams({ address: a, benchmark: "Public_AR_Current", format: "json" });
    const res = await fetch(`${Deno.env.get("GEOCODER_URL") ?? CENSUS}?${q}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return error("Address lookup is unavailable right now. Enter the miles instead.", 502);
    const body = await res.json() as CensusReply;
    const m = body.result?.addressMatches?.[0];
    const lat = m?.coordinates?.y, lng = m?.coordinates?.x;
    if (typeof lat !== "number" || typeof lng !== "number") return json({ found: false });
    return json({ found: true, lat, lng, matched: m?.matchedAddress ?? a });
  } catch (e) {
    console.error("geocode failed", e);
    return error("Address lookup is unavailable right now. Enter the miles instead.", 502);
  }
});
