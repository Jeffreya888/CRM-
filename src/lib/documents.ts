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
interface DocInput {
  org: Organization;
  kind: 'quote' | 'invoice';
  doc: {
    number: string; status: string; issue_date: string; valid_until?: string; due_date?: string;
    subtotal: number; discount: number; tax: number; tax_rate: number; total: number; amount_paid?: number; balance?: number;
    notes?: string | null; terms?: string | null; public_token: string;
  };
  items: LineItem[];
  customer: Party;
  aircraft?: { tail_number: string; manufacturer?: string | null; model?: string | null } | null;
}

export function documentHtml({ org, kind, doc, items, customer, aircraft }: DocInput): string {
  const cur = org.currency;
  const isInv = kind === 'invoice';
  const link = PORTAL_URL ? `${PORTAL_URL}/portal/${kind}/${doc.public_token}` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>
    ${header(org, isInv ? 'INVOICE' : 'QUOTE', [
      [isInv ? 'Invoice #' : 'Quote #', doc.number],
      ['Date', date(doc.issue_date)],
      isInv ? ['Due', date(doc.due_date)] : ['Valid until', date(doc.valid_until)],
    ])}
    <div class="row box">
      <div><div class="muted">${isInv ? 'BILL TO' : 'PREPARED FOR'}</div>
        <b>${esc(customer.name)}</b><br/>${esc(customer.company)}<br/>${esc(customer.billing_address)}<br/>${esc(customer.email)}</div>
      ${aircraft ? `<div style="text-align:right"><div class="muted">AIRCRAFT</div><b>${esc(aircraft.tail_number)}</b><br/>${esc([aircraft.manufacturer, aircraft.model].filter(Boolean).join(' '))}</div>` : ''}
    </div>
    ${itemsTable(items, cur)}
    <div class="totals">
      <div><span>Subtotal</span><span>${money(doc.subtotal, cur)}</span></div>
      ${Number(doc.discount) ? `<div><span>Discount</span><span>−${money(doc.discount, cur)}</span></div>` : ''}
      ${Number(doc.tax) ? `<div><span>Tax (${(Number(doc.tax_rate) * 100).toFixed(2)}%)</span><span>${money(doc.tax, cur)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${money(doc.total, cur)}</span></div>
      ${isInv && Number(doc.amount_paid) ? `<div><span>Paid</span><span>−${money(doc.amount_paid, cur)}</span></div>
        <div class="grand"><span>Balance due</span><span>${money(doc.balance, cur)}</span></div>` : ''}
    </div>
    ${doc.notes ? `<div class="box"><b>Notes</b><div>${esc(doc.notes).replace(/\n/g, '<br/>')}</div></div>` : ''}
    ${doc.terms ? `<div class="box"><b>Terms</b><div class="muted">${esc(doc.terms).replace(/\n/g, '<br/>')}</div></div>` : ''}
    ${link ? `<div class="footer">${isInv ? 'Pay online' : 'Review and accept online'}: <a href="${esc(link)}">${esc(link)}</a></div>` : ''}
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
