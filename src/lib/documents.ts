import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { PORTAL_URL } from './config';
import { date, dateTime, money } from './format';
import type { LineItem, Organization } from './types';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0f172a; margin: 32px; font-size: 12px; }
  h1 { font-size: 26px; margin: 0; color: #0B3D91; letter-spacing: 1px; }
  .row { display: flex; justify-content: space-between; gap: 24px; }
  .muted { color: #64748b; }
  .box { margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { text-align: left; background: #0B3D91; color: #fff; padding: 8px; font-size: 11px; text-transform: uppercase; }
  td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 260px; margin-top: 12px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #0B3D91; margin-top: 4px; padding-top: 8px !important; }
  .pill { display: inline-block; padding: 3px 10px; border-radius: 999px; background: #E8EEF9; color: #0B3D91; font-weight: bold; text-transform: uppercase; font-size: 10px; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; }
  .photos figure { margin: 0; width: 31%; }
  .photos img { width: 100%; height: 140px; object-fit: cover; border-radius: 6px; }
  .photos figcaption { font-size: 10px; color: #64748b; }
  .footer { margin-top: 40px; color: #64748b; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
`;

function header(org: Organization, title: string, meta: [string, string][]) {
  return `
  <div class="row">
    <div>
      ${org.logo_url ? `<img src="${esc(org.logo_url)}" style="max-height:56px;margin-bottom:8px" />` : ''}
      <div style="font-size:16px;font-weight:bold">${esc(org.name)}</div>
      <div class="muted">${esc(org.address)}</div>
      <div class="muted">${esc([org.phone, org.email, org.website].filter(Boolean).join(' · '))}</div>
    </div>
    <div style="text-align:right">
      <h1>${esc(title)}</h1>
      ${meta.map(([k, v]) => `<div><span class="muted">${esc(k)}:</span> <b>${esc(v)}</b></div>`).join('')}
    </div>
  </div>`;
}

function itemsTable(items: LineItem[], currency: string) {
  return `<table>
    <tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
    ${items.map((i) => `<tr>
      <td>${esc(i.description)}${i.taxable ? '' : ' <span class="muted">(non-taxable)</span>'}</td>
      <td class="num">${Number(i.quantity)}</td>
      <td class="num">${money(i.unit_price, currency)}</td>
      <td class="num">${money(Number(i.quantity) * Number(i.unit_price), currency)}</td></tr>`).join('')}
  </table>`;
}

interface Party { name: string; company?: string | null; email?: string | null; billing_address?: string | null }
interface DocOption { id: string; name: string; description?: string | null; subtotal: number; tax: number; total: number }
interface DocPayment { amount: number; method?: string | null; reference?: string | null; received_at: string }
interface DocInput {
  org: Organization;
  kind: 'quote' | 'invoice';
  doc: {
    number: string; status: string; issue_date: string; valid_until?: string; due_date?: string;
    subtotal: number; discount: number; tax: number; tax_rate: number; total: number; amount_paid?: number; balance?: number;
    notes?: string | null; terms?: string | null; public_token: string;
    // Optional extras (quotes): approval deadline, packages, deposit, acceptance.
    valid_until_at?: string | null; selected_option_id?: string | null;
    deposit_type?: string | null; deposit_amount?: number | null; deposit_paid_at?: string | null;
    accepted_name?: string | null; accepted_at?: string | null; signature_svg?: string | null;
    // Optional extras (invoices).
    late_fee_applied_at?: string | null; covered_by_plan?: boolean | null;
  };
  items: LineItem[];
  customer: Party;
  aircraft?: { tail_number: string; manufacturer?: string | null; model?: string | null; asset_type?: string | null } | null;
  /** Good / Better / Best packages; items carry option_id. */
  options?: DocOption[];
  /** "Enjoyed our work? Leave us a Google review" link (invoices). */
  reviewUrl?: string | null;
  /** Payments to list on an invoice (deposits included). */
  payments?: DocPayment[];
  /** Shown instead of the online pay link when the company takes payment directly. */
  directPayment?: boolean;
}

/**
 * Rebuilds a customer-drawn signature SVG from its path data only, so text
 * submitted through a public page can never inject markup into a PDF or page.
 */
export function safeSignatureSvg(svg: string | null | undefined): string | null {
  if (!svg) return null;
  const paths = [...svg.matchAll(/\bd="([MLml0-9., -]{1,20000})"/g)].map((m) => m[1]!);
  if (!paths.length) return null;
  const w = Number(/width="(\d{1,4})"/.exec(svg)?.[1]) || 320;
  const h = Number(/height="(\d{1,4})"/.exec(svg)?.[1]) || 160;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${paths
    .map((d) => `<path d="${d}" stroke="#0F172A" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('')}</svg>`;
}

const assetHeading = (t?: string | null) => (t === 'vehicle' ? 'VEHICLE' : t === 'watercraft' ? 'VESSEL' : 'AIRCRAFT');

function totalsBlock(cur: string, t: { subtotal: number; discount: number; tax: number; tax_rate: number; total: number }) {
  return `<div class="totals">
      <div><span>Subtotal</span><span>${money(t.subtotal, cur)}</span></div>
      ${Number(t.discount) ? `<div><span>Discount</span><span>−${money(t.discount, cur)}</span></div>` : ''}
      ${Number(t.tax) ? `<div><span>Tax (${(Number(t.tax_rate) * 100).toFixed(2)}%)</span><span>${money(t.tax, cur)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${money(t.total, cur)}</span></div>
    </div>`;
}

export function documentHtml({ org, kind, doc, items, customer, aircraft, options, reviewUrl, payments, directPayment }: DocInput): string {
  const cur = org.currency;
  const isInv = kind === 'invoice';
  const link = PORTAL_URL ? `${PORTAL_URL}/portal/${kind}/${doc.public_token}` : '';
  const pkgs = !isInv && options && options.length ? options : null;
  const deadline = doc.valid_until_at ? dateTime(doc.valid_until_at) : date(doc.valid_until);
  const lateFee = (d: string) => /late fee/i.test(d);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    .pkg { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 16px; page-break-inside: avoid; }
    .pkg.chosen { border: 2px solid #0B3D91; }
    .review { margin-top: 24px; padding: 12px; border-radius: 8px; background: #F1F6FD; }
    .late td { color: #B42318; }
  </style></head><body>
    ${header(org, isInv ? 'INVOICE' : 'QUOTE', [
      [isInv ? 'Invoice #' : 'Quote #', doc.number],
      ['Date', date(doc.issue_date)],
      isInv ? ['Due', date(doc.due_date)] : ['Approve by', deadline],
    ])}
    <div class="row box">
      <div><div class="muted">${isInv ? 'BILL TO' : 'PREPARED FOR'}</div>
        <b>${esc(customer.name)}</b><br/>${esc(customer.company)}<br/>${esc(customer.billing_address)}<br/>${esc(customer.email)}</div>
      ${aircraft ? `<div style="text-align:right"><div class="muted">${assetHeading(aircraft.asset_type)}</div><b>${esc(aircraft.tail_number)}</b><br/>${esc([aircraft.manufacturer, aircraft.model].filter(Boolean).join(' '))}</div>` : ''}
    </div>
    ${isInv && doc.covered_by_plan ? '<div class="box"><span class="pill">Covered by care plan</span></div>' : ''}
    ${pkgs ? `<div class="box"><b>Choose one of ${pkgs.length} packages</b></div>` + pkgs.map((o) => `
      <div class="pkg ${doc.selected_option_id === o.id ? 'chosen' : ''}">
        <div class="row"><div><b style="font-size:14px">${esc(o.name)}</b>${doc.selected_option_id === o.id ? ' <span class="pill">Chosen</span>' : ''}
          ${o.description ? `<div class="muted">${esc(o.description)}</div>` : ''}</div>
          <div style="font-size:16px;font-weight:bold">${money(o.total, cur)}</div></div>
        ${itemsTable(items.filter((i) => i.option_id === o.id), cur)}
        ${totalsBlock(cur, { subtotal: o.subtotal, discount: Math.min(Number(doc.discount) || 0, Number(o.subtotal) || 0), tax: o.tax, tax_rate: doc.tax_rate, total: o.total })}
      </div>`).join('') : `
    ${itemsTable(items, cur).replace(/<tr>(\s*<td>[^<]*late fee)/gi, '<tr class="late">$1')}
    <div class="totals">
      <div><span>Subtotal</span><span>${money(doc.subtotal, cur)}</span></div>
      ${Number(doc.discount) ? `<div><span>Discount</span><span>−${money(doc.discount, cur)}</span></div>` : ''}
      ${Number(doc.tax) ? `<div><span>Tax (${(Number(doc.tax_rate) * 100).toFixed(2)}%)</span><span>${money(doc.tax, cur)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${money(doc.total, cur)}</span></div>
      ${isInv && Number(doc.amount_paid) ? `<div><span>Paid</span><span>−${money(doc.amount_paid, cur)}</span></div>
        <div class="grand"><span>Balance due</span><span>${money(doc.balance, cur)}</span></div>` : ''}
    </div>`}
    ${isInv && items.some((i) => lateFee(i.description)) ? `<div class="muted" style="margin-top:8px">Includes a late fee for payment after the due date${doc.late_fee_applied_at ? ` (added ${esc(date(doc.late_fee_applied_at))})` : ''}.</div>` : ''}
    ${isInv && payments && payments.length ? `<div class="box"><b>Payments received</b><table>${payments.map((p) => `<tr><td>${esc(date(p.received_at))}</td><td>${esc(/^deposit/i.test(p.reference ?? '') ? 'Deposit' : (p.method ?? '').toUpperCase())}${p.reference ? ` · ${esc(p.reference)}` : ''}</td><td class="num">${money(p.amount, cur)}</td></tr>`).join('')}</table></div>` : ''}
    ${!isInv && Number(doc.deposit_amount) > 0 ? `<div class="box"><b>Deposit:</b> ${money(doc.deposit_amount, cur)} due on acceptance${doc.deposit_paid_at ? ` · <b>paid ${esc(date(doc.deposit_paid_at))}</b>` : ''}</div>` : ''}
    ${doc.notes ? `<div class="box"><b>Notes</b><div>${esc(doc.notes).replace(/\n/g, '<br/>')}</div></div>` : ''}
    ${doc.terms ? `<div class="box"><b>Terms</b><div class="muted">${esc(doc.terms).replace(/\n/g, '<br/>')}</div></div>` : ''}
    ${!isInv && doc.accepted_name ? `<div class="box"><b>Accepted</b><div>${safeSignatureSvg(doc.signature_svg) ?? ''}</div><div>${esc(doc.accepted_name)} · ${esc(dateTime(doc.accepted_at))}</div></div>` : ''}
    ${isInv && reviewUrl ? `<div class="review"><b>Enjoyed our work?</b> Leave us a Google review: <a href="${esc(reviewUrl)}">${esc(reviewUrl)}</a></div>` : ''}
    ${isInv && directPayment && Number(doc.balance) > 0 ? `<div class="footer">Please pay ${esc(org.name)} directly${org.phone || org.email ? ` (${esc([org.phone, org.email].filter(Boolean).join(' · '))})` : ''}.${link ? ` View online: <a href="${esc(link)}">${esc(link)}</a>` : ''}</div>`
      : link ? `<div class="footer">${isInv ? 'Pay online' : 'Review and accept online'}: <a href="${esc(link)}">${esc(link)}</a></div>` : ''}
  </body></html>`;
}

interface JobReportInput {
  org: Organization;
  job: { number: string; title: string | null; status: string; actual_start: string | null; actual_end: string | null; notes: string | null; signed_by: string | null; signed_at: string | null; signature_svg: string | null };
  customer: Party;
  aircraft?: { tail_number: string; manufacturer?: string | null; model?: string | null } | null;
  location?: { name: string; airport_code: string | null } | null;
  checklist: { label: string; done: boolean }[];
  photos: { url: string; kind: string; caption: string | null }[];
}

/** Completion report with checklist, before/after photos and customer sign-off. */
export function jobReportHtml(r: JobReportInput): string {
  const groups = ['before', 'after', 'damage', 'other'] as const;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>
    ${header(r.org, 'SERVICE REPORT', [['Work order', r.job.number], ['Status', r.job.status.replace('_', ' ')]])}
    <div class="row box">
      <div><div class="muted">CUSTOMER</div><b>${esc(r.customer.name)}</b></div>
      ${r.aircraft ? `<div><div class="muted">AIRCRAFT</div><b>${esc(r.aircraft.tail_number)}</b> ${esc([r.aircraft.manufacturer, r.aircraft.model].filter(Boolean).join(' '))}</div>` : ''}
      ${r.location ? `<div><div class="muted">LOCATION</div><b>${esc(r.location.airport_code ?? '')}</b> ${esc(r.location.name)}</div>` : ''}
    </div>
    <div class="box"><div class="muted">WORK PERFORMED</div><b>${esc(r.job.title)}</b><br/>
      Started ${esc(dateTime(r.job.actual_start))} · Completed ${esc(dateTime(r.job.actual_end))}</div>
    ${r.checklist.length ? `<div class="box"><b>Checklist</b><table>${r.checklist.map((c) => `<tr><td>${c.done ? '✅' : '⬜️'} ${esc(c.label)}</td></tr>`).join('')}</table></div>` : ''}
    ${groups.map((g) => {
      const ps = r.photos.filter((p) => p.kind === g);
      return ps.length ? `<div class="box"><b style="text-transform:capitalize">${g} photos</b><div class="photos">${ps.map((p) => `<figure><img src="${esc(p.url)}"/><figcaption>${esc(p.caption)}</figcaption></figure>`).join('')}</div></div>` : '';
    }).join('')}
    ${r.job.notes ? `<div class="box"><b>Notes</b><div>${esc(r.job.notes)}</div></div>` : ''}
    ${r.job.signed_by ? `<div class="box"><b>Customer sign-off</b><div>${r.job.signature_svg ?? ''}</div><div>${esc(r.job.signed_by)} · ${esc(dateTime(r.job.signed_at))}</div></div>` : ''}
  </body></html>`;
}

/** Renders HTML to a PDF and opens the share sheet (email, AirDrop, Files…). */
export async function sharePdf(html: string, filename: string) {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: filename });
  } else {
    await Print.printAsync({ uri });
  }
}

export function portalLink(kind: 'quote' | 'invoice', token: string): string | null {
  return PORTAL_URL ? `${PORTAL_URL}/portal/${kind}/${token}` : null;
}
