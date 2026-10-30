// VIN → year, make, model and body style from NHTSA's free vPIC database
// (no key). Signed-in members only. The app turns the reply into a size class
// and a catalog match (src/lib/vin.ts).
//
// POST { vin } → { Results: [ { Make, Model, ModelYear, Trim, BodyClass, VehicleType, GVWR, Series } ] }
// VPIC_URL can point at a stand-in server in automated tests.
import { userClient } from "../_shared/clients.ts";
import { error, json, preflight, readJson } from "../_shared/http.ts";

const VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";
const KEEP = ["Make", "Model", "ModelYear", "Trim", "BodyClass", "VehicleType", "GVWR", "Series", "ErrorCode", "ErrorText"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const { data: { user } } = await userClient(req).auth.getUser();
  if (!user) return error("Sign in first", 401);
  const { vin } = await readJson<{ vin?: string }>(req);
  const v = (typeof vin === "string" ? vin : "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return error("A VIN has 17 letters and numbers (no I, O or Q)");
  try {
    const res = await fetch(`${Deno.env.get("VPIC_URL") ?? VPIC}/${v}?format=json`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return error("VIN lookup is unavailable right now. Enter the details by hand.", 502);
    const body = await res.json() as { Results?: Record<string, string>[] };
    const r = body.Results?.[0] ?? {};
    return json({ Results: [Object.fromEntries(KEEP.map((k) => [k, r[k] ?? ""]))] });
  } catch (e) {
    console.error("vin lookup failed", e);
    return error("VIN lookup is unavailable right now. Enter the details by hand.", 502);
  }
});
