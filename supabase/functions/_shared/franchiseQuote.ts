// The franchise network quote Tarmo emails to a brand (Platform admin → Enterprise & franchise).
// Prices follow FRANCHISE_CENTS (keep in sync with FRANCHISE_PRICING in src/lib/plans.ts).
import { FRANCHISE_CENTS } from "./franchiseBilling.ts";

export type QuoteInput = {
  brand: string; contactName?: string | null; locations: number;
  currentPerLocation?: number | null; techFee?: number | null; founding?: boolean;
};

const TEAM_MONTHLY = 119.99;
const FRANCHISEE_DISCOUNT = 0.15;
const FOUNDING_PERCENT_OFF = 13.42;
const r2 = (v: number) => Math.round(v * 100) / 100;
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function quoteNumbers(q: QuoteInput) {
  const n = Math.max(1, Math.floor(q.locations));
  const allIn = Math.max(FRANCHISE_CENTS.minimum, n * FRANCHISE_CENTS.all_in) / 100;
  const founding = r2(allIn * (100 - FOUNDING_PERCENT_OFF) / 100);
  const hq = Math.max(FRANCHISE_CENTS.minimum, n * FRANCHISE_CENTS.split) / 100;
  const franchiseePlan = r2(TEAM_MONTHLY * (1 - FRANCHISEE_DISCOUNT));
  const tarmo = allIn; // savings and fee margins use the regular price, so they hold after the founding year
  const current = q.currentPerLocation && q.currentPerLocation > 0 ? r2(n * q.currentPerLocation) : null;
  const fee = q.techFee && q.techFee > 0 ? r2(n * q.techFee) : null;
  return {
    n, allIn, founding, hq, franchiseePlan, splitTotal: r2(hq + n * franchiseePlan), tarmo,
    savings: current == null ? null : { current, monthly: r2(current - tarmo) },
    kept: fee == null ? null : { collected: fee, monthly: r2(fee - tarmo) },
  };
}

export function quoteEmail(q: QuoteInput, siteUrl: string) {
  const x = quoteNumbers(q);
  const brand = q.brand.trim();
  const hello = q.contactName?.trim() ? `Hi ${q.contactName.trim().split(/\s+/)[0]},` : "Hi,";
  const intro = `Here's your Tarmo quote for ${brand}'s ${x.n} location${x.n === 1 ? "" : "s"}. Every location gets the full app (scheduling, quotes and invoices, SOPs and training, QC, payments, and Ask Tarmo, the AI detailing expert), and HQ gets Franchise HQ: every location side by side, standards pushed to every location, territories and a brand booking page, and monthly royalty statements.`;
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#334155">${esc(label)}</td><td style="padding:6px 0;text-align:right;${strong ? "font-weight:700;color:#0f172a" : "color:#334155"}">${esc(value)}</td></tr>`;
  const table = (rows: string) => `<table style="width:100%;border-collapse:collapse;margin:0 0 18px">${rows}</table>`;

  const lines: string[] = [
    hello, "", intro, "",
    `Option 1, all-in (HQ pays for every location): ${usd(x.allIn)}/month ($149 per location).`,
    ...(q.founding ? [`Founding network rate for your first 12 months: ${usd(x.founding)}/month ($129 per location).`] : []),
    `Option 2, split: HQ pays ${usd(x.hq)}/month for Franchise HQ ($47 per location), and each franchisee pays its own plan at 15% off (${usd(x.franchiseePlan)}/month). Network total ${usd(x.splitTotal)}/month.`,
    "HQ pays at least $499/month either way.", "",
  ];
  if (x.savings) {
    lines.push(x.savings.monthly > 0
      ? `Compared with what you pay today (${usd(x.savings.current)}/month), Tarmo saves you ${usd(x.savings.monthly)} a month, ${usd(r2(x.savings.monthly * 12))} a year.`
      : `What you pay today: ${usd(x.savings.current)}/month.`);
  }
  if (x.kept) {
    lines.push(x.kept.monthly > 0
      ? `With a technology fee of ${usd(q.techFee!)} per location, HQ collects ${usd(x.kept.collected)} a month, pays Tarmo ${usd(x.tarmo)} and keeps ${usd(x.kept.monthly)} a month, ${usd(r2(x.kept.monthly * 12))} a year.`
      : `A technology fee of ${usd(q.techFee!)} per location would collect ${usd(x.kept.collected)} a month.`);
  }
  lines.push("", `See how Franchise HQ works: ${siteUrl}/franchises`, "", "Reply to this email with any questions, or to set up a demo.");

  const savingsHtml = x.savings
    ? `<div style="font-weight:700;margin:0 0 4px">Compared with today</div>${table(row("What you pay now", `${usd(x.savings.current)}/month`) +
      row(x.savings.monthly > 0 ? "You save" : "Difference", `${usd(Math.abs(x.savings.monthly))}/month · ${usd(Math.abs(r2(x.savings.monthly * 12)))}/year`, true))}`
    : "";
  const feeHtml = x.kept
    ? `<div style="font-weight:700;margin:0 0 4px">Technology fee</div>${table(row(`Collected from franchisees (${x.n} × ${usd(q.techFee!)})`, `${usd(x.kept.collected)}/month`) +
      row("Paid to Tarmo", `${usd(x.tarmo)}/month`) +
      row(x.kept.monthly > 0 ? "HQ keeps" : "Difference", `${usd(Math.abs(x.kept.monthly))}/month · ${usd(Math.abs(r2(x.kept.monthly * 12)))}/year`, true))}`
    : "";
  const html = `
    <p style="margin:0 0 14px">${esc(hello)}</p>
    <p style="margin:0 0 18px;line-height:1.5">${esc(intro)}</p>
    <div style="font-weight:700;margin:0 0 4px">Option 1 · All-in, HQ pays for every location</div>
    ${table(row(`${x.n} × $149`, `${usd(x.allIn)}/month`, true) + (q.founding ? row("Founding network rate, first 12 months ($129)", `${usd(x.founding)}/month`, true) : ""))}
    <div style="font-weight:700;margin:0 0 4px">Option 2 · Split</div>
    ${table(row(`HQ: Franchise HQ, ${x.n} × $47`, `${usd(x.hq)}/month`) + row("Each franchisee: own plan at 15% off", `${usd(x.franchiseePlan)}/month`) + row("Network total", `${usd(x.splitTotal)}/month`, true))}
    <p style="margin:0 0 18px;color:#64748b;font-size:13px">HQ pays at least $499/month either way. Locations are added and removed automatically as your network changes.</p>
    ${savingsHtml}
    ${feeHtml}
    <p style="margin:0 0 14px;line-height:1.5">Reply to this email with any questions, or to set up a demo.</p>`;

  return { subject: `Tarmo for ${brand}: your franchise network quote`, text: lines.join("\n"), html, numbers: x };
}
