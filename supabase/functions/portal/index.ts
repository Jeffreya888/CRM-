// Customer portal API (public; no Supabase auth). Contract: docs/build-contract.md
// ("Portal `data` response" and "Extra backend expectations") and src/lib/portal.ts.
//
//   { action: 'request_code', slug, email }      → { ok: true }   (always; never reveals whether the email exists)
//   { action: 'verify', slug, email, code }      → { token, expires_at }   (30-day session)
//   { action: 'data', token }                    → PortalData
//   { action: 'request', token, kind, aircraft_id?, service_id?, job_id?, preferred, notes? } → { ok: true }
//   { action: 'files', token, paths }            → { urls: Record<path, signedUrl> }   (1 hour)
//   { action: 'quote_photos', quote_token }      → { urls: string[] }   (1 hour; non-draft quotes)
// Bad / expired / revoked sessions → HTTP 401 { error: 'Session expired' }.
import { adminClient } from "../_shared/clients.ts";
import type { SupabaseClient } from "../_shared/deps.ts";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { emailLayout, esc, isEmail, sendEmail } from "../_shared/email.ts";
import type { Row } from "../_shared/automation.ts";

const BUCKET = "org-files";
const CODE_TTL_MS = 10 * 60e3;
const SESSION_TTL_MS = 30 * 864e5;
const MAX_ATTEMPTS = 5;
const CODES_PER_WINDOW = 3;
const WINDOW_MS = 15 * 60e3;
const SIGNED_URL_S = 3600;
const UPCOMING = ["tentative", "scheduled", "in_progress", "on_hold"];

const enc = new TextEncoder();
async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const sessionExpired = () => json({ error: "Session expired" }, 401);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const INVALID_CODE = "That code is not valid or has expired. Request a new code and try again.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error("Method not allowed", 405);
  try {
    const body = await req.json().catch(() => ({}));
    const db = adminClient();
    switch (body.action) {
      case "request_code": return await requestCode(db, body);
      case "verify": return await verify(db, body);
      case "data": {
        const s = await session(db, body.token);
        return s ? json(await portalData(db, s)) : sessionExpired();
      }
      case "request": {
        const s = await session(db, body.token);
        return s ? await bookingRequest(db, s, body) : sessionExpired();
      }
      case "files": {
        const s = await session(db, body.token);
        return s ? await files(db, s, body.paths) : sessionExpired();
      }
      case "quote_photos": return await quotePhotos(db, body.quote_token);
      default: return error("Unknown action");
    }
  } catch (e) {
    console.error(e);
    return error("Something went wrong. Please try again.", 500);
  }
});

async function orgBySlug(db: SupabaseClient, slug: unknown) {
  if (typeof slug !== "string" || !/^[a-z0-9-]{3,64}$/i.test(slug)) return null;
  const { data } = await db.from("organizations").select("id, name, email, logo_url, is_demo, timezone").eq("public_slug", slug.toLowerCase()).maybeSingle();
  return data;
}

async function requestCode(db: SupabaseClient, body: Row) {
  const ok = json({ ok: true });
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isEmail(email) || email.length > 254) return ok;
  const org = await orgBySlug(db, body.slug);
  if (!org) return ok;

  // Rate limit: 3 codes per email per 15 minutes.
  const { count } = await db.from("portal_sessions").select("id", { count: "exact", head: true })
    .eq("org_id", org.id).eq("email", email).gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString());
  if ((count ?? 0) >= CODES_PER_WINDOW) return ok;

  const { data: customer } = await db.from("customers").select("id, name")
    .eq("org_id", org.id).eq("status", "active").eq("portal_enabled", true).ilike("email", escapeLike(email))
    .order("created_at").limit(1).maybeSingle();
  if (!customer) return ok;

  const id = crypto.randomUUID();
  const code = randomCode();
  const { error: e } = await db.from("portal_sessions").insert({
    id, org_id: org.id, customer_id: customer.id, email,
    code_hash: await sha256(`${id}:${code}`), code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(), attempts: 0,
  });
  if (e) { console.error(e); return ok; }
  if (org.is_demo) return ok; // demo companies never send real email

  const html = emailLayout({
    brand: org,
    heading: "Your sign-in code",
    bodyHtml: `<p style="line-height:1.5">Hi ${esc(customer.name)},</p>
      <p style="line-height:1.5">Use this code to open your ${esc(org.name)} customer portal:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p>
      <p style="color:#64748b;font-size:13px;line-height:1.5">The code expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
  });
  await sendEmail({
    to: email, subject: `${code} is your ${org.name} portal code`, html, replyTo: org.email, fromName: org.name,
    text: `Your ${org.name} customer portal code is ${code}. It expires in 10 minutes.`,
  }).catch((err) => console.error("code email failed", err));
  return ok;
}

async function verify(db: SupabaseClient, body: Row) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").replace(/\D/g, "");
  const org = await orgBySlug(db, body.slug);
  if (!org || !isEmail(email) || code.length !== 6) return error(INVALID_CODE);
  const { data: row } = await db.from("portal_sessions").select("id, customer_id, code_hash, attempts")
    .eq("org_id", org.id).eq("email", email).is("token_hash", null).not("code_hash", "is", null).is("revoked_at", null)
    .gt("code_expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || row.attempts >= MAX_ATTEMPTS) return error(INVALID_CODE);
  const { data: counted } = await db.from("portal_sessions").update({ attempts: row.attempts + 1 })
    .eq("id", row.id).eq("attempts", row.attempts).select("id").maybeSingle();
  if (!counted) return error(INVALID_CODE);
  if ((await sha256(`${row.id}:${code}`)) !== row.code_hash) {
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return error(left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : INVALID_CODE);
  }
  const { data: c } = await db.from("customers").select("portal_enabled").eq("id", row.customer_id).maybeSingle();
  if (!c?.portal_enabled) return error(INVALID_CODE);

  const token = randomToken();
  const expires_at = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { error: e } = await db.from("portal_sessions").update({
    token_hash: await sha256(token), expires_at, code_hash: null, code_expires_at: null, last_used_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (e) throw e;
  return json({ token, expires_at });
}

type Session = { id: string; org_id: string; customer_id: string };

async function session(db: SupabaseClient, token: unknown): Promise<Session | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  const { data: s } = await db.from("portal_sessions").select("id, org_id, customer_id, expires_at, revoked_at, last_used_at")
    .eq("token_hash", await sha256(token)).maybeSingle();
  if (!s || s.revoked_at || !s.expires_at || Date.parse(s.expires_at) < Date.now()) return null;
  const { data: c } = await db.from("customers").select("id, portal_enabled, org_id").eq("id", s.customer_id).maybeSingle();
  if (!c?.portal_enabled || c.org_id !== s.org_id) return null;
  if (!s.last_used_at || Date.now() - Date.parse(s.last_used_at) > 5 * 60e3) {
    await db.from("portal_sessions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
  }
  return { id: s.id, org_id: s.org_id, customer_id: s.customer_id };
}

async function portalData(db: SupabaseClient, s: Session) {
  const [orgR, custR, assetsR] = await Promise.all([
    db.from("organizations").select("name, logo_url, phone, email, timezone, google_review_url, stripe_charges_enabled, payment_mode, is_demo, business_types").eq("id", s.org_id).single(),
    db.from("customers").select("id, name, email, phone, company").eq("id", s.customer_id).single(),
    db.from("aircraft").select("id, tail_number, asset_type, manufacturer, model, category").eq("customer_id", s.customer_id).eq("org_id", s.org_id).eq("active", true).order("tail_number"),
  ]);
  const o = orgR.data!;
  const types: string[] = o.business_types ?? ["aircraft"];
  const [svcR, upR, pastR, quoteR, invR, reqR] = await Promise.all([
    db.from("services").select("id, name, asset_type").eq("org_id", s.org_id).eq("active", true).in("asset_type", types).order("sort_order").order("name"),
    db.from("jobs").select("id, number, title, status, scheduled_start, scheduled_end, aircraft_id, aircraft:aircraft(tail_number), location:locations(name)")
      .eq("org_id", s.org_id).eq("customer_id", s.customer_id).in("status", UPCOMING)
      .order("scheduled_start", { ascending: true, nullsFirst: false }).limit(50),
    db.from("jobs").select("id, number, title, actual_end, rating, aircraft:aircraft(tail_number), job_photos(storage_path, kind, caption, created_at)")
      .eq("org_id", s.org_id).eq("customer_id", s.customer_id).in("status", ["completed", "invoiced"])
      .order("actual_end", { ascending: false, nullsFirst: false }).limit(30),
    db.from("quotes").select("number, status, total, valid_until_at, public_token")
      .eq("org_id", s.org_id).eq("customer_id", s.customer_id).neq("status", "draft").order("created_at", { ascending: false }).limit(50),
    db.from("invoices").select("number, status, total, balance, due_date, public_token")
      .eq("org_id", s.org_id).eq("customer_id", s.customer_id).not("status", "in", "(draft,void)").order("created_at", { ascending: false }).limit(50),
    db.from("booking_requests").select("id, kind, status, created_at, preferred")
      .eq("org_id", s.org_id).eq("customer_id", s.customer_id).order("created_at", { ascending: false }).limit(20),
  ]);
  for (const r of [svcR, upR, pastR, quoteR, invR, reqR]) if (r.error) throw r.error;

  return {
    org: {
      name: o.name, logo_url: o.logo_url ?? null, phone: o.phone ?? null, email: o.email ?? null, timezone: o.timezone,
      google_review_url: o.google_review_url ?? null,
      accepts_cards: !!(o.stripe_charges_enabled && o.payment_mode === "stripe" && !o.is_demo),
    },
    customer: custR.data,
    assets: (assetsR.data ?? []).map((a) => ({
      id: a.id, tail_number: a.tail_number, asset_type: a.asset_type, manufacturer: a.manufacturer ?? null, model: a.model ?? null, category: a.category,
    })),
    services: svcR.data ?? [],
    upcoming_jobs: (upR.data ?? []).map((j: Row) => ({
      id: j.id, number: j.number, title: j.title ?? null, status: j.status, scheduled_start: j.scheduled_start ?? null,
      scheduled_end: j.scheduled_end ?? null, aircraft_id: j.aircraft_id ?? null, tail_number: one(j.aircraft)?.tail_number ?? null,
      location_name: one(j.location)?.name ?? null,
    })),
    past_jobs: (pastR.data ?? []).map((j: Row) => ({
      id: j.id, number: j.number, title: j.title ?? null, actual_end: j.actual_end ?? null,
      tail_number: one(j.aircraft)?.tail_number ?? null, rating: j.rating ?? null,
      photos: [...(j.job_photos ?? [])]
        .sort((a: Row, b: Row) => String(a.created_at).localeCompare(String(b.created_at)))
        .map((p: Row) => ({ path: p.storage_path, kind: p.kind, caption: p.caption ?? null })),
    })),
    quotes: (quoteR.data ?? []).map((q) => ({ number: q.number, status: q.status, total: Number(q.total), valid_until_at: q.valid_until_at ?? null, token: q.public_token })),
    invoices: (invR.data ?? []).map((i) => ({
      number: i.number, status: i.status, total: Number(i.total), balance: Number(i.balance), due_date: i.due_date, token: i.public_token,
    })),
    requests: (reqR.data ?? []).map((r) => ({
      id: r.id, kind: r.kind, status: r.status, created_at: r.created_at,
      preferred: Array.isArray(r.preferred) ? r.preferred.map(String) : [],
    })),
  };
}

async function bookingRequest(db: SupabaseClient, s: Session, body: Row) {
  const kind = body.kind;
  if (kind !== "booking" && kind !== "reschedule") return error("Choose a booking or a reschedule request");
  const preferred = Array.isArray(body.preferred) ? body.preferred : [];
  if (preferred.length < 1 || preferred.length > 3) return error("Pick 1 to 3 preferred times");
  const times: string[] = [];
  for (const p of preferred) {
    const t = Date.parse(String(p));
    if (!Number.isFinite(t)) return error("One of the preferred times is not a valid date");
    if (t < Date.now() - 3600e3) return error("Preferred times must be in the future");
    if (t > Date.now() + 400 * 864e5) return error("Pick a time within the next year");
    times.push(new Date(t).toISOString());
  }
  const notes = body.notes == null ? null : String(body.notes).trim().slice(0, 1000) || null;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const aircraftId = str(body.aircraft_id), serviceId = str(body.service_id), jobId = str(body.job_id);

  if (aircraftId) {
    const { data } = await db.from("aircraft").select("id").eq("id", aircraftId).eq("org_id", s.org_id).eq("customer_id", s.customer_id).maybeSingle();
    if (!data) return error("That aircraft isn't on your account");
  }
  if (serviceId) {
    const { data } = await db.from("services").select("id").eq("id", serviceId).eq("org_id", s.org_id).eq("active", true).maybeSingle();
    if (!data) return error("That service isn't available");
  }
  let jobAircraft: string | null = null;
  if (kind === "reschedule" && !jobId) return error("Choose the visit you want to move");
  if (jobId) {
    const { data } = await db.from("jobs").select("id, aircraft_id, status").eq("id", jobId).eq("org_id", s.org_id).eq("customer_id", s.customer_id).maybeSingle();
    if (!data) return error("That visit isn't on your account");
    if (kind === "reschedule" && !["tentative", "scheduled"].includes(data.status)) return error("This visit can no longer be rescheduled online. Please contact us.");
    jobAircraft = data.aircraft_id;
    const { data: dup } = await db.from("booking_requests").select("id").eq("job_id", jobId).eq("status", "pending").eq("kind", kind).limit(1).maybeSingle();
    if (dup) return error("You already asked to move this visit. We'll be in touch soon.");
  }
  const { count } = await db.from("booking_requests").select("id", { count: "exact", head: true })
    .eq("customer_id", s.customer_id).eq("status", "pending");
  if ((count ?? 0) >= 10) return error("You have several requests waiting. We'll reply to those first.");

  const { error: e } = await db.from("booking_requests").insert({
    org_id: s.org_id, customer_id: s.customer_id, aircraft_id: aircraftId ?? jobAircraft, service_id: serviceId,
    job_id: jobId, kind, preferred: times, notes,
  });
  if (e) throw e;
  return json({ ok: true });
}

async function files(db: SupabaseClient, s: Session, paths: unknown) {
  if (!Array.isArray(paths)) return error("paths required");
  const inOrg = (p: string) => p.startsWith(`${s.org_id}/`) && !p.includes("..");
  const wanted = [...new Set(paths.filter((p): p is string => typeof p === "string" && p.length > 0 && p.length < 500 && inOrg(p)))].slice(0, 100);
  if (!wanted.length) return json({ urls: {} });

  const allowed = new Set<string>();
  const { data: jobs } = await db.from("jobs").select("id").eq("org_id", s.org_id).eq("customer_id", s.customer_id).limit(2000);
  const jobIds = (jobs ?? []).map((j) => j.id);
  for (let i = 0; i < jobIds.length; i += 200) {
    const { data } = await db.from("job_photos").select("storage_path").in("job_id", jobIds.slice(i, i + 200)).in("storage_path", wanted);
    for (const p of data ?? []) allowed.add(p.storage_path);
  }
  const { data: assets } = await db.from("aircraft").select("photo_path").eq("org_id", s.org_id).eq("customer_id", s.customer_id).in("photo_path", wanted);
  for (const a of assets ?? []) if (a.photo_path) allowed.add(a.photo_path);

  const list = wanted.filter((p) => allowed.has(p));
  const urls: Record<string, string> = {};
  if (list.length) {
    const { data, error: e } = await db.storage.from(BUCKET).createSignedUrls(list, SIGNED_URL_S);
    if (e) throw e;
    for (const r of data ?? []) if (r.path && r.signedUrl) urls[r.path] = r.signedUrl;
  }
  return json({ urls });
}

async function quotePhotos(db: SupabaseClient, token: unknown) {
  if (typeof token !== "string" || token.length < 10 || token.length > 200) return error("Quote not found", 404);
  const { data: q } = await db.from("quotes").select("id, org_id, status").eq("public_token", token).maybeSingle();
  if (!q || q.status === "draft") return error("Quote not found", 404);
  const { data: photos } = await db.from("quote_photos").select("storage_path").eq("quote_id", q.id).eq("org_id", q.org_id).order("created_at");
  const paths = (photos ?? []).map((p) => p.storage_path as string)
    .filter((p) => !!p && p.startsWith(`${q.org_id}/`) && !p.includes(".."));
  if (!paths.length) return json({ urls: [] });
  const { data, error: e } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_S);
  if (e) throw e;
  return json({ urls: (data ?? []).map((r) => r.signedUrl).filter(Boolean) });
}
