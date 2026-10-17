// Customer texting. Provider-swappable: everything else talks to SmsProvider.
// Default provider: Telnyx (platform-run account, one number per company).
// Env: TELNYX_API_KEY, TELNYX_MESSAGING_PROFILE_ID, optional SMS_PROVIDER.
import { env } from "./http.ts";

export interface SmsProvider {
  readonly name: string;
  /** Sends one text. Returns the provider's message id; throws on failure. */
  send(from: string, to: string, body: string): Promise<string>;
}

export const STOP_FOOTER = "Reply STOP to opt out";

export class TelnyxProvider implements SmsProvider {
  readonly name = "telnyx";
  async send(from: string, to: string, body: string): Promise<string> {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("TELNYX_API_KEY")}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        from,
        to,
        text: body,
        messaging_profile_id: Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") || undefined,
      }),
    });
    const raw = await res.text();
    // deno-lint-ignore no-explicit-any
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* not json */ }
    if (!res.ok) {
      const detail = parsed?.errors?.map((e: { detail?: string; title?: string }) => e.detail ?? e.title).join("; ") || raw;
      throw new Error(`Text failed: ${detail}`.slice(0, 500));
    }
    return String(parsed?.data?.id ?? "");
  }
}

export function smsProvider(): SmsProvider {
  switch ((Deno.env.get("SMS_PROVIDER") ?? "telnyx").toLowerCase()) {
    default:
      return new TelnyxProvider();
  }
}

/** Normalizes a phone number to E.164 (US/Canada default). Returns null when it can't. */
export function toE164(raw: string | null | undefined, defaultCountry = "1"): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (s.startsWith("00") && digits.length > 10) return `+${digits.slice(2)}`;
  if (defaultCountry === "1") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return null;
  }
  return digits.length >= 8 && digits.length <= 15 ? `+${defaultCountry}${digits}` : null;
}

/** Last 10 digits, for matching numbers stored in mixed formats. */
export const phoneKey = (raw: string | null | undefined) => String(raw ?? "").replace(/\D/g, "").slice(-10);

export function withStopFooter(body: string): string {
  return /reply stop/i.test(body) ? body : `${body.trim()}\n\n${STOP_FOOTER}`;
}
