/** Finance helpers: tax-friendly expense categories, date presets, file sharing and exports. */
import {
  addDays, differenceInCalendarDays, endOfMonth, endOfQuarter, endOfYear, format, parseISO, startOfMonth, startOfQuarter, startOfYear, subDays, subMonths, subYears,
} from 'date-fns';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Option } from '../components/ui';
import { toCsv, type Cell } from './csv';
import { money } from './format';

// ---------------------------------------------------------------------------
// Expense categories (expenses_category_check) with IRS Schedule C lines.
// ---------------------------------------------------------------------------
export const EXPENSE_CATEGORIES: { value: string; label: string; line: string }[] = [
  { value: 'supplies', label: 'Supplies & chemicals', line: 'Sch. C line 22 · Supplies' },
  { value: 'equipment', label: 'Equipment & tools', line: 'Sch. C line 13 · Depreciation / Section 179' },
  { value: 'equipment_rental', label: 'Equipment rental (lifts, generators)', line: 'Sch. C line 20a · Rent – vehicles, machinery' },
  { value: 'repairs', label: 'Repairs & maintenance', line: 'Sch. C line 21 · Repairs and maintenance' },
  { value: 'fuel', label: 'Fuel', line: 'Sch. C line 9 · Car and truck expenses' },
  { value: 'vehicle', label: 'Vehicle & mileage', line: 'Sch. C line 9 · Car and truck expenses' },
  { value: 'travel', label: 'Travel (flights, hotels)', line: 'Sch. C line 24a · Travel' },
  { value: 'meals', label: 'Meals (on the road)', line: 'Sch. C line 24b · Meals (50%)' },
  { value: 'insurance', label: 'Insurance', line: 'Sch. C line 15 · Insurance' },
  { value: 'rent', label: 'Rent (hangar, shop, storage)', line: 'Sch. C line 20b · Rent – other business property' },
  { value: 'utilities', label: 'Utilities & phone', line: 'Sch. C line 25 · Utilities' },
  { value: 'advertising', label: 'Advertising & marketing', line: 'Sch. C line 8 · Advertising' },
  { value: 'software', label: 'Software & subscriptions', line: 'Sch. C line 27a · Other expenses' },
  { value: 'fees', label: 'Bank, card & platform fees', line: 'Sch. C line 10 · Commissions and fees' },
  { value: 'contract_labor', label: 'Contract labor (1099)', line: 'Sch. C line 11 · Contract labor' },
  { value: 'wages', label: 'Wages (W-2 payroll)', line: 'Sch. C line 26 · Wages' },
  { value: 'taxes_licenses', label: 'Taxes, licenses & permits', line: 'Sch. C line 23 · Taxes and licenses' },
  { value: 'office', label: 'Office expense', line: 'Sch. C line 18 · Office expense' },
  { value: 'training', label: 'Training & certifications', line: 'Sch. C line 27a · Other expenses' },
  { value: 'other', label: 'Other', line: 'Sch. C line 27a · Other expenses' },
];
export const categoryInfo = (v: string | null | undefined) => EXPENSE_CATEGORIES.find((c) => c.value === v) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]!;
export const categoryLabel = (v: string | null | undefined) => categoryInfo(v).label;
export const categoryOptions: Option[] = EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label, hint: c.line }));

export const RECUR_EVERY: Option<'week' | 'month' | 'quarter' | 'year'>[] = [
  { value: 'week', label: 'Every week' }, { value: 'month', label: 'Every month' }, { value: 'quarter', label: 'Every quarter' }, { value: 'year', label: 'Every year' },
];
export const PAYMENT_METHODS: Option[] = ['card', 'debit', 'cash', 'check', 'ach', 'other'].map((v) => ({ value: v, label: v === 'ach' ? 'Bank transfer (ACH)' : v[0]!.toUpperCase() + v.slice(1) }));

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------
export type Preset = 'this_month' | 'last_month' | 'this_quarter' | 'ytd' | 'last_year' | 'custom';
export const PRESETS: Option<Preset>[] = [
  { value: 'this_month', label: 'This month' }, { value: 'last_month', label: 'Last month' }, { value: 'this_quarter', label: 'This quarter' },
  { value: 'ytd', label: 'Year to date' }, { value: 'last_year', label: 'Last year' }, { value: 'custom', label: 'Custom' },
];
export const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
export const fromYmd = (s: string) => parseISO(s + 'T00:00:00');

export function presetRange(p: Preset, now = new Date()): { from: string; to: string } {
  switch (p) {
    case 'last_month': { const m = subMonths(now, 1); return { from: ymd(startOfMonth(m)), to: ymd(endOfMonth(m)) }; }
    case 'this_quarter': return { from: ymd(startOfQuarter(now)), to: ymd(endOfQuarter(now)) };
    case 'ytd': return { from: ymd(startOfYear(now)), to: ymd(now) };
    case 'last_year': { const y = subYears(now, 1); return { from: ymd(startOfYear(y)), to: ymd(endOfYear(y)) }; }
    default: return { from: ymd(startOfMonth(now)), to: ymd(endOfMonth(now)) };
  }
}

/** The equal-length period right before [from, to]. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const days = differenceInCalendarDays(fromYmd(to), fromYmd(from)) + 1;
  const end = subDays(fromYmd(from), 1);
  return { from: ymd(subDays(end, days - 1)), to: ymd(end) };
}
export const rangeLabel = (from: string, to: string) => `${format(fromYmd(from), 'MMM d, yyyy')} – ${format(fromYmd(to), 'MMM d, yyyy')}`;
export { addDays };

// ---------------------------------------------------------------------------
// Files: share/download text & PDFs, base64 for email attachments
// ---------------------------------------------------------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function utf8(s: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else { out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  return new Uint8Array(out);
}
export function textToBase64(s: string): string {
  const b = utf8(s);
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < b.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < b.length ? B64[n & 63]! : '=');
  }
  return out;
}

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, '_');

/** Saves text (CSV…) and opens the share sheet; downloads the file on web. */
export async function shareTextFile(filename: string, content: string, mime = 'text/csv') {
  const name = safeName(filename);
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name, UTI: mime === 'text/csv' ? 'public.comma-separated-values-text' : undefined });
  } else {
    throw new Error('Sharing is not available on this device.');
  }
}

/** Renders HTML to a PDF and shares it (prints / saves as PDF on web). */
export async function sharePdfFile(html: string, filename: string) {
  if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: filename });
  else await Print.printAsync({ uri });
}

export interface Attachment { filename: string; content_base64: string; type: string }

/** A PDF attachment (native). On web, PDFs can't be generated in the browser, so the report goes as HTML. */
export async function pdfAttachment(html: string, filename: string): Promise<Attachment> {
  if (Platform.OS !== 'web') {
    const r = await Print.printToFileAsync({ html, base64: true });
    if (r.base64) return { filename: safeName(filename), content_base64: r.base64, type: 'application/pdf' };
  }
  return { filename: safeName(filename.replace(/\.pdf$/i, '.html')), content_base64: textToBase64(html), type: 'text/html' };
}
export const csvAttachment = (filename: string, csv: string): Attachment => ({ filename: safeName(filename), content_base64: textToBase64(csv), type: 'text/csv' });

export const escHtml = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export const PDF_STYLE = `<style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;padding:28px;color:#0f172a;font-size:12px}
h1{color:#0B3D91;font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;color:#0B3D91}
table{width:100%;border-collapse:collapse}td,th{padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:left}
th{background:#f1f5f9;font-weight:600}.r{text-align:right;font-variant-numeric:tabular-nums}.b{font-weight:700}.muted{color:#64748b}</style>`;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export interface ExpenseRow {
  id: string; spent_on: string; category: string; vendor: string | null; description: string | null; amount: number;
  kind?: 'expense' | 'mileage'; miles?: number | null; mileage_rate?: number | null; payment_method?: string | null; notes?: string | null;
  receipt_path?: string | null; job?: { number: string } | null; branch?: { name: string } | null;
}

/** Accountant export: totals by category (with Schedule C line) and every expense. */
export function expensesCsv(rows: ExpenseRow[]): string {
  const totals = new Map<string, { amount: number; n: number }>();
  for (const r of rows) {
    const t = totals.get(r.category) ?? { amount: 0, n: 0 };
    t.amount += Number(r.amount); t.n += 1; totals.set(r.category, t);
  }
  const summary: Cell[][] = [...totals.entries()].sort((a, b) => b[1].amount - a[1].amount)
    .map(([c, t]) => ['SUMMARY', '', categoryLabel(c), categoryInfo(c).line, '', `${t.n} entries`, t.amount.toFixed(2), '', '', '', '', '', '']);
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  summary.push(['SUMMARY', '', 'Total', '', '', `${rows.length} entries`, total.toFixed(2), '', '', '', '', '', '']);
  const detail: Cell[][] = [...rows].sort((a, b) => a.spent_on.localeCompare(b.spent_on)).map((r) => [
    'EXPENSE', r.spent_on, categoryLabel(r.category), categoryInfo(r.category).line, r.vendor ?? '', r.description ?? '', Number(r.amount).toFixed(2),
    r.kind === 'mileage' ? r.miles ?? '' : '', r.kind === 'mileage' ? r.mileage_rate ?? '' : '', r.payment_method ?? '', r.job?.number ?? '', r.branch?.name ?? '', r.receipt_path ? 'Yes' : 'No',
  ]);
  return toCsv(['Type', 'Date', 'Category', 'Tax line', 'Vendor', 'Description', 'Amount', 'Miles', 'Rate per mile', 'Paid with', 'Job', 'Location', 'Receipt on file'], [...summary, ...detail]);
}

export interface InventoryRow { name: string; category: string | null; unit: string | null; quantity: number; par_level: number | null; unit_cost: number | null; vendor: string | null }
export function inventoryCsv(rows: InventoryRow[]): string {
  return toCsv(['Item', 'Category', 'Unit', 'On hand', 'Par level', 'Unit cost', 'Stock value', 'Vendor'],
    rows.map((r) => [r.name, r.category ?? '', r.unit ?? '', r.quantity, r.par_level ?? '', r.unit_cost != null ? Number(r.unit_cost).toFixed(2) : '',
      r.unit_cost != null ? (Number(r.unit_cost) * Number(r.quantity)).toFixed(2) : '', r.vendor ?? '']));
}

export interface ProfitLoss {
  basis: 'cash' | 'accrual'; from: string; to: string;
  revenue: number; sales_tax_collected: number; platform_fees: number; paid_invoices: number;
  expenses: number; supplies: number; labor: number; labor_minutes: number; labor_unknown_minutes: number;
  net: number; tax_set_aside_pct: number; tax_set_aside: number;
  expenses_by_category: { category: string; amount: number; n: number }[];
  by_service: { name: string; revenue: number; invoices: number }[];
  by_customer: { name: string; revenue: number; gross_profit: number }[];
  by_branch: { name: string; revenue: number; expenses: number }[];
}

export type PLLineKey = 'revenue' | 'platform_fees' | 'expenses' | 'supplies' | 'labor' | 'net';
export const PL_LINES: { key: PLLineKey; label: string; sign: 1 | -1 }[] = [
  { key: 'revenue', label: 'Revenue (excluding sales tax)', sign: 1 },
  { key: 'platform_fees', label: 'Payment processing fees', sign: -1 },
  { key: 'expenses', label: 'Recorded business expenses', sign: -1 },
  { key: 'supplies', label: 'Job supply costs', sign: -1 },
  { key: 'labor', label: 'Labor costs', sign: -1 },
  { key: 'net', label: 'Net operating result', sign: 1 },
];

export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

export function plCsv(pl: ProfitLoss, prev: ProfitLoss | null, branchName: string | null): string {
  const rows: Cell[][] = [];
  const line = (label: string, cur: number, p?: number) => rows.push(prev && p != null
    ? [label, cur.toFixed(2), p.toFixed(2), (cur - p).toFixed(2), pctChange(cur, p) ?? '']
    : [label, cur.toFixed(2)]);
  for (const l of PL_LINES) line(l.label, Number(pl[l.key]) * (l.key === 'net' || l.key === 'revenue' ? 1 : -1), prev ? Number(prev[l.key]) * (l.key === 'net' || l.key === 'revenue' ? 1 : -1) : undefined);
  rows.push([]);
  line('Sales tax collected (owed to the state, not revenue)', Number(pl.sales_tax_collected), prev ? Number(prev.sales_tax_collected) : undefined);
  rows.push([pl.basis === 'cash' ? 'Paid invoices' : 'Invoices issued', pl.paid_invoices]);
  rows.push(['Labor hours', (Number(pl.labor_minutes) / 60).toFixed(2)]);
  if (Number(pl.labor_unknown_minutes) > 0) rows.push(['Labor hours with no pay rate (cost unknown)', (Number(pl.labor_unknown_minutes) / 60).toFixed(2)]);
  rows.push([`Tax set-aside (${pl.tax_set_aside_pct}% of net)`, Number(pl.tax_set_aside).toFixed(2)]);
  rows.push([]);
  rows.push(['Expenses by category', 'Amount', 'Entries', 'Tax line']);
  for (const c of pl.expenses_by_category) rows.push([categoryLabel(c.category), Number(c.amount).toFixed(2), c.n, categoryInfo(c.category).line]);
  rows.push([]);
  rows.push(['Revenue by service', 'Amount', 'Invoices']);
  for (const s of pl.by_service) rows.push([s.name, Number(s.revenue).toFixed(2), s.invoices]);
  rows.push([]);
  rows.push(['Revenue by customer', 'Amount', 'Gross profit']);
  for (const s of pl.by_customer) rows.push([s.name, Number(s.revenue).toFixed(2), Number(s.gross_profit).toFixed(2)]);
  const head = [`Profit & loss (${pl.basis} basis) ${pl.from} to ${pl.to}${branchName ? ` · ${branchName}` : ''}`, 'This period'];
  return toCsv(prev ? [...head, `Previous (${prev.from} to ${prev.to})`, 'Change $', 'Change %'] : head, rows);
}

export function plHtml(orgName: string, pl: ProfitLoss, prev: ProfitLoss | null, branchName: string | null, currency = 'USD'): string {
  const m = (n: number) => escHtml(money(n, currency));
  const sign = (k: PLLineKey) => (k === 'net' || k === 'revenue' ? 1 : -1);
  const lines = PL_LINES.map((l) => {
    const cur = Number(pl[l.key]) * sign(l.key);
    const p = prev ? Number(prev[l.key]) * sign(l.key) : 0;
    const pc = prev ? pctChange(cur, p) : null;
    const cls = l.key === 'net' ? ' class="b"' : '';
    return `<tr${cls}><td>${l.label}</td><td class="r">${m(cur)}</td>${prev ? `<td class="r">${m(p)}</td><td class="r">${m(cur - p)}</td><td class="r">${pc == null ? '—' : pc + '%'}</td>` : ''}</tr>`;
  }).join('');
  const sub = (title: string, head: string[], body: string[][]) => body.length
    ? `<h2>${title}</h2><table><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${h}</th>`).join('')}</tr>${body.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="r"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</table>` : '';
  return `<html><head><meta charset="utf-8">${PDF_STYLE}</head><body>
    <h1>${escHtml(orgName)} · Profit &amp; loss</h1>
    <div class="muted">${escHtml(rangeLabel(pl.from, pl.to))} · ${pl.basis === 'cash' ? 'Cash basis (money received)' : 'Accrual basis (invoices issued)'}${branchName ? ' · ' + escHtml(branchName) : ''}</div>
    <h2>Summary</h2>
    <table><tr><th></th><th class="r">This period</th>${prev ? `<th class="r">Previous</th><th class="r">Change</th><th class="r">%</th>` : ''}</tr>${lines}</table>
    <p class="muted">Sales tax collected (owed to the state, not revenue): <b>${m(pl.sales_tax_collected)}</b> ·
      ${pl.basis === 'cash' ? 'Paid invoices' : 'Invoices issued'}: ${pl.paid_invoices} · Labor: ${(Number(pl.labor_minutes) / 60).toFixed(1)} h
      ${Number(pl.labor_unknown_minutes) > 0 ? ` (${(Number(pl.labor_unknown_minutes) / 60).toFixed(1)} h without a pay rate — cost unknown)` : ''}<br/>
      Suggested tax set-aside (${pl.tax_set_aside_pct}% of net): <b>${m(pl.tax_set_aside)}</b></p>
    ${sub('Expenses by category', ['Category', 'Tax line', 'Amount'], pl.expenses_by_category.map((c) => [escHtml(categoryLabel(c.category)), escHtml(categoryInfo(c.category).line), m(c.amount)]))}
    ${sub('Revenue by service', ['Service', 'Invoices', 'Revenue'], pl.by_service.map((s) => [escHtml(s.name), String(s.invoices), m(s.revenue)]))}
    ${sub('Revenue by customer', ['Customer', 'Revenue', 'Gross profit'], pl.by_customer.map((s) => [escHtml(s.name), m(s.revenue), m(s.gross_profit)]))}
    ${pl.by_branch.length > 1 ? sub('By company location', ['Location', 'Revenue', 'Expenses'], pl.by_branch.map((s) => [escHtml(s.name), m(s.revenue), m(s.expenses)])) : ''}
    <p class="muted">Job supply costs and labor are counted automatically from the supply room and timesheets. Generated by Flight Ready ${escHtml(format(new Date(), 'MMM d, yyyy'))}.</p>
  </body></html>`;
}
