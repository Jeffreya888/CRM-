// The early access welcome email (HTML + plain text). Prices match src/lib/plans.ts.
import { esc } from "../_shared/email.ts";

export type Welcome = { firstName: string; types: string[]; unsubscribeUrl: string; siteUrl: string; address: string };

const FOUNDING = [
  { plan: "Solo", price: "$49.99", regular: "$69.99" },
  { plan: "Team", price: "$89.99", regular: "$119.99" },
  { plan: "Fleet", price: "$159.99", regular: "$219.99" },
];

/** What Tarmo does for the kind of work they picked (aircraft first, as on the site). */
function highlights(types: string[]): string[] {
  const out: string[] = [];
  if (types.includes("aircraft")) out.push("Type a tail number and Tarmo fills in the aircraft from the FAA registry, then prices every service by its size class.");
  if (types.includes("watercraft")) out.push("Quote boats and yachts by length, with per-foot rates for every size from 20-footers to superyachts.");
  if (types.includes("vehicle")) out.push("Enter a VIN and Tarmo fills in the vehicle and prices it by size, from coupes to heavy-duty trucks.");
  out.push(
    "Snap a few photos and get an AI condition report and a quote built from your price list.",
    "Step-by-step SOPs for every service, and an AI assistant your crew can ask on the job.",
    "Scheduling, invoices, card payments and the true profit of every job, in one app.",
  );
  return out;
}

export function welcomeHtml(w: Welcome): string {
  const hi = w.firstName ? `Hi ${esc(w.firstName)},` : "Hi,";
  const li = highlights(w.types).map((h) => `<li style="margin:0 0 8px">${esc(h)}</li>`).join("");
  const rows = FOUNDING.map((f) =>
    `<tr><td style="padding:6px 0;font-weight:600">${f.plan}</td><td style="padding:6px 0;text-align:right"><strong>${f.price}/mo</strong> <span style="color:#94a3b8;text-decoration:line-through">${f.regular}</span></td></tr>`).join("");
  const p = (t: string) => `<p style="margin:0 0 14px;line-height:1.55">${t}</p>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9">
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#0f172a">
  <div style="background:#ffffff;border-radius:12px;padding:28px 24px;border:1px solid #e2e8f0">
    <img src="${esc(w.siteUrl)}/brand/tarmo-logo-email.png" alt="Tarmo" width="150" style="display:block;width:150px;height:auto;margin:0 0 22px">
    <h2 style="font-size:21px;margin:0 0 14px">You're on the early access list</h2>
    ${p(hi)}
    ${p("Thanks for joining. Tarmo is the detailing OS for jets, yachts &amp; cars, built to aviation standards. You'll be one of the first in when it opens.")}
    <div style="background:#fbf6ee;border:1px solid #ecd9b8;border-radius:10px;padding:16px 18px;margin:6px 0 18px">
      <div style="font-size:12px;font-weight:800;letter-spacing:1.2px;color:#9a6b1f;margin:0 0 8px">YOUR FOUNDING MEMBER OFFER</div>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>
      <p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#475569">Your first 12 months at the founding price when you subscribe within 45 days of launch. Then regular pricing. Cancel anytime.</p>
    </div>
    <div style="font-weight:700;margin:0 0 8px">What Tarmo will do for you</div>
    <ul style="margin:0 0 18px;padding-left:20px;line-height:1.5">${li}</ul>
    <div style="font-weight:700;margin:0 0 8px">What happens next</div>
    ${p("On launch day we'll email you your founding code and a link to start. Every plan starts with a 14-day free trial of every feature.")}
    ${p("<strong>One question:</strong> what's the most frustrating part of running your detailing business today? Just reply to this email. A real person reads every answer, and it shapes what we build.")}
    ${p("Welcome aboard,<br>The Tarmo team")}
  </div>
  <p style="color:#64748b;font-size:12px;line-height:1.6;text-align:center;margin:14px 0 0">
    Tarmo · <a href="${esc(w.siteUrl)}" style="color:#64748b">gettarmo.com</a>${w.address ? `<br>${esc(w.address)}` : ""}<br>
    You're getting this because you joined the Tarmo early access list. <a href="${esc(w.unsubscribeUrl)}" style="color:#64748b">Unsubscribe</a>
  </p>
</div></body></html>`;
}

export function welcomeText(w: Welcome): string {
  return [
    w.firstName ? `Hi ${w.firstName},` : "Hi,",
    "",
    "Thanks for joining. Tarmo is the detailing OS for jets, yachts & cars, built to aviation standards. You'll be one of the first in when it opens.",
    "",
    "YOUR FOUNDING MEMBER OFFER",
    ...FOUNDING.map((f) => `${f.plan}: ${f.price}/mo (regular ${f.regular})`),
    "Your first 12 months at the founding price when you subscribe within 45 days of launch. Then regular pricing. Cancel anytime.",
    "",
    "WHAT TARMO WILL DO FOR YOU",
    ...highlights(w.types).map((h) => `- ${h}`),
    "",
    "WHAT HAPPENS NEXT",
    "On launch day we'll email you your founding code and a link to start. Every plan starts with a 14-day free trial of every feature.",
    "",
    "One question: what's the most frustrating part of running your detailing business today? Just reply to this email. A real person reads every answer.",
    "",
    "Welcome aboard,",
    "The Tarmo team",
    "",
    "--",
    `Tarmo · ${w.siteUrl}`,
    ...(w.address ? [w.address] : []),
    `Unsubscribe: ${w.unsubscribeUrl}`,
  ].join("\n");
}
