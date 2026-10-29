// Square (second payment processor) helpers: environment, OAuth tokens kept
// encrypted in square_connections, and REST calls made as a connected seller.
//
// Env:
//   SQUARE_APPLICATION_ID, SQUARE_APPLICATION_SECRET  (Developer Console → OAuth)
//   SQUARE_ENVIRONMENT          "production" (default) or "sandbox"
//   SQUARE_TOKEN_KEY            32 random bytes, base64 (encrypts tokens, signs OAuth state)
//   SQUARE_WEBHOOK_SIGNATURE_KEY, SQUARE_WEBHOOK_URL (see square-webhook)
import type { SupabaseClient } from "./deps.ts";
import { env } from "./http.ts";

export const SQUARE_VERSION = "2026-09-16";

/** Permissions asked of each detailing company when they connect Square. */
export const SQUARE_SCOPES = [
  "MERCHANT_PROFILE_READ", // locations
  "PAYMENTS_READ",
  "PAYMENTS_WRITE",
  "PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS", // platform fee
  "PAYMENTS_WRITE_IN_PERSON", // Tap to Pay / card readers
  "CUSTOMERS_READ",
  "CUSTOMERS_WRITE", // cards on file for care plans
];

export type SquareMoney = { amount: number; currency: string };
export type SquarePayment = {
  id: string;
  status: string; // APPROVED | PENDING | COMPLETED | CANCELED | FAILED
  amount_money: SquareMoney;
  total_money?: SquareMoney;
  tip_money?: SquareMoney;
  app_fee_money?: SquareMoney;
  refunded_money?: SquareMoney;
  source_type?: string; // CARD | BANK_ACCOUNT | WALLET | ...
  location_id?: string;
  reference_id?: string;
  note?: string;
  receipt_url?: string;
  created_at?: string;
  updated_at?: string;
  card_details?: { card?: { card_brand?: string; last_4?: string } };
};

export const squareEnvironment = (): "production" | "sandbox" =>
  Deno.env.get("SQUARE_ENVIRONMENT") === "sandbox" ? "sandbox" : "production";

const apiBase = () => (squareEnvironment() === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com");

export const squareConfigured = () => !!(Deno.env.get("SQUARE_APPLICATION_ID") && Deno.env.get("SQUARE_APPLICATION_SECRET") && Deno.env.get("SQUARE_TOKEN_KEY"));

export class SquareError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null, readonly category: string | null) {
    super(message);
  }
}

/** Calls the Square API. `auth` is a seller access token or "Client <secret>". */
export async function squareFetch<T = Record<string, unknown>>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; auth?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Square-Version": SQUARE_VERSION, "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.auth) headers.Authorization = opts.auth;
  const res = await fetch(`${apiBase()}/${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { errors?: { code?: string; category?: string; detail?: string }[] }).errors?.[0];
    throw new SquareError(err?.detail ?? `Square request failed (${res.status})`, res.status, err?.code ?? null, err?.category ?? null);
  }
  return data as T;
}

/** A customer-facing sentence for a declined or failed payment. */
export function squareDeclineMessage(e: unknown): string {
  if (!(e instanceof SquareError)) return "The payment could not be completed. Please try again.";
  switch (e.code) {
    case "CARD_DECLINED":
    case "GENERIC_DECLINE":
      return "The card was declined. Please use another card or contact your bank.";
    case "INSUFFICIENT_FUNDS":
      return "The card was declined for insufficient funds.";
    case "CVV_FAILURE":
    case "INVALID_CARD":
    case "INVALID_EXPIRATION":
    case "ADDRESS_VERIFICATION_FAILURE":
      return "The card details did not match. Please check them and try again.";
    case "CARD_EXPIRED":
      return "The card has expired.";
    case "CARD_DECLINED_VERIFICATION_REQUIRED":
      return "Your bank asked for extra verification. Please try again and complete the check.";
    default:
      return e.category === "PAYMENT_METHOD_ERROR" ? "The payment was declined. Please try another card." : "The payment could not be completed. Please try again.";
  }
}

// ---------------------------------------------------------------------------
// Encryption (AES-GCM) and signed OAuth state (HMAC), keyed by SQUARE_TOKEN_KEY
// ---------------------------------------------------------------------------
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

function keyBytes(): Uint8Array<ArrayBuffer> {
  const k = unb64(env("SQUARE_TOKEN_KEY"));
  if (k.length < 32) throw new Error("SQUARE_TOKEN_KEY must be at least 32 bytes (base64)");
  return k.slice(0, 32);
}

async function aesKey() {
  return await crypto.subtle.importKey("raw", keyBytes(), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decryptSecret(enc: string): Promise<string> {
  const [v, iv, ct] = enc.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Unreadable Square token");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(ct));
  return new TextDecoder().decode(pt);
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes(), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`square-state:${data}`)));
}

export type OAuthState = { org: string; user: string; back: string; exp: number };

export async function signState(s: OAuthState): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(s)));
  return `${body}.${b64url(await hmac(body))}`;
}

export async function verifyState(token: string): Promise<OAuthState | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(await hmac(body));
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(unb64url(body))) as OAuthState;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------
export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: env("SQUARE_APPLICATION_ID"),
    scope: SQUARE_SCOPES.join(" "),
    session: "false",
    state,
  });
  return `${apiBase()}/oauth2/authorize?${q}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_at: string; merchant_id: string };

export async function obtainToken(grant: { code: string } | { refresh_token: string }): Promise<TokenResponse> {
  return await squareFetch<TokenResponse>("oauth2/token", {
    body: {
      client_id: env("SQUARE_APPLICATION_ID"),
      client_secret: env("SQUARE_APPLICATION_SECRET"),
      ...("code" in grant ? { grant_type: "authorization_code", code: grant.code } : { grant_type: "refresh_token", refresh_token: grant.refresh_token }),
    },
  });
}

export async function revokeSeller(merchantId: string) {
  await squareFetch("oauth2/revoke", {
    auth: `Client ${env("SQUARE_APPLICATION_SECRET")}`,
    body: { client_id: env("SQUARE_APPLICATION_ID"), merchant_id: merchantId },
  });
}

export async function saveConnection(db: SupabaseClient, orgId: string, tok: TokenResponse, refreshToken: string) {
  const { error } = await db.from("square_connections").upsert({
    org_id: orgId,
    merchant_id: tok.merchant_id,
    access_token_enc: await encryptSecret(tok.access_token),
    refresh_token_enc: await encryptSecret(refreshToken),
    expires_at: tok.expires_at,
    scopes: SQUARE_SCOPES,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export type Seller = { orgId: string; token: string; merchantId: string; locationId: string | null };

/** The company's Square access token, refreshed when it expires within a week. */
export async function sellerFor(db: SupabaseClient, orgId: string): Promise<Seller | null> {
  const { data: c } = await db.from("square_connections").select("merchant_id, access_token_enc, refresh_token_enc, expires_at").eq("org_id", orgId).maybeSingle();
  if (!c) return null;
  const { data: org } = await db.from("organizations").select("square_location_id").eq("id", orgId).maybeSingle();
  let token = await decryptSecret(c.access_token_enc);
  if (new Date(c.expires_at).getTime() - Date.now() < 7 * 86400_000) {
    const refresh = await decryptSecret(c.refresh_token_enc);
    const tok = await obtainToken({ refresh_token: refresh });
    await saveConnection(db, orgId, tok, tok.refresh_token ?? refresh);
    token = tok.access_token;
  }
  return { orgId, token, merchantId: c.merchant_id, locationId: org?.square_location_id ?? null };
}

/** Same, looked up from a webhook's merchant id. */
export async function sellerForMerchant(db: SupabaseClient, merchantId: string): Promise<Seller | null> {
  const { data } = await db.from("square_connections").select("org_id").eq("merchant_id", merchantId).maybeSingle();
  return data ? await sellerFor(db, data.org_id) : null;
}

type SquareLocation = { id: string; name?: string; status?: string; currency?: string; capabilities?: string[] };

/** The seller's active locations that can take card payments. */
export async function cardLocations(token: string): Promise<SquareLocation[]> {
  const { locations = [] } = await squareFetch<{ locations?: SquareLocation[] }>("v2/locations", { token });
  return locations.filter((l) => l.status === "ACTIVE" && (l.capabilities ?? []).includes("CREDIT_CARD_PROCESSING"));
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
/** reference_id on every Square payment we create: which record it pays. */
export const squareRef = {
  invoice: (id: string) => `i:${id}`,
  deposit: (quoteId: string) => `d:${quoteId}`,
  carePlan: (scheduleId: string) => `c:${scheduleId}`,
  parse(ref: string | undefined | null): { kind: "invoice" | "deposit" | "care_plan"; id: string } | null {
    const m = /^([idc]):([0-9a-f-]{36})$/.exec(ref ?? "");
    if (!m) return null;
    return { kind: m[1] === "i" ? "invoice" : m[1] === "d" ? "deposit" : "care_plan", id: m[2] };
  },
};

export async function createPayment(seller: Seller, p: {
  sourceId: string;
  idempotencyKey: string;
  amountCents: number;
  feeCents: number;
  currency: string;
  referenceId: string;
  note: string;
  customerId?: string;
  buyerEmail?: string | null;
}): Promise<SquarePayment> {
  if (!seller.locationId) throw new Error("Choose a Square location in Settings → Payments first");
  const { payment } = await squareFetch<{ payment: SquarePayment }>("v2/payments", {
    token: seller.token,
    body: {
      source_id: p.sourceId,
      idempotency_key: p.idempotencyKey.slice(0, 45),
      amount_money: { amount: p.amountCents, currency: p.currency },
      ...(p.feeCents > 0 ? { app_fee_money: { amount: p.feeCents, currency: p.currency } } : {}),
      autocomplete: true,
      location_id: seller.locationId,
      reference_id: p.referenceId,
      note: p.note.slice(0, 500),
      ...(p.customerId ? { customer_id: p.customerId } : {}),
      ...(p.buyerEmail ? { buyer_email_address: p.buyerEmail } : {}),
    },
  });
  return payment;
}

export async function getPayment(seller: Seller, id: string): Promise<SquarePayment> {
  const { payment } = await squareFetch<{ payment: SquarePayment }>(`v2/payments/${encodeURIComponent(id)}`, { token: seller.token });
  return payment;
}

/** Finds or creates the customer's profile in the seller's Square account. */
export async function ensureSquareCustomer(db: SupabaseClient, seller: Seller, customer: { id: string; name: string | null; email: string | null; phone: string | null; square_customer_id: string | null }): Promise<string> {
  if (customer.square_customer_id) {
    try {
      await squareFetch(`v2/customers/${encodeURIComponent(customer.square_customer_id)}`, { token: seller.token });
      return customer.square_customer_id;
    } catch (e) {
      if (!(e instanceof SquareError) || e.status !== 404) throw e; // removed in Square, or another seller's
    }
  }
  const [given, ...rest] = (customer.name ?? "").trim().split(/\s+/);
  const { customer: c } = await squareFetch<{ customer: { id: string } }>("v2/customers", {
    token: seller.token,
    body: {
      idempotency_key: crypto.randomUUID(),
      given_name: given || undefined,
      family_name: rest.join(" ") || undefined,
      email_address: customer.email ?? undefined,
      reference_id: customer.id,
    },
  });
  await db.from("customers").update({ square_customer_id: c.id }).eq("id", customer.id);
  return c.id;
}

/** Saves a card (Web Payments token, STORE intent) on the customer's Square profile. */
export async function saveCard(seller: Seller, p: { sourceId: string; squareCustomerId: string; referenceId: string; idempotencyKey: string; cardholderName?: string | null }) {
  const { card } = await squareFetch<{ card: { id: string; card_brand?: string; last_4?: string } }>("v2/cards", {
    token: seller.token,
    body: {
      idempotency_key: p.idempotencyKey.slice(0, 45),
      source_id: p.sourceId,
      card: { customer_id: p.squareCustomerId, reference_id: p.referenceId, ...(p.cardholderName ? { cardholder_name: p.cardholderName } : {}) },
    },
  });
  return card;
}

export async function disableCard(seller: Seller, cardId: string) {
  try {
    await squareFetch(`v2/cards/${encodeURIComponent(cardId)}/disable`, { token: seller.token, method: "POST" });
  } catch (e) {
    console.warn("could not disable Square card", cardId, (e as Error).message);
  }
}
