// One-page monthly investor update, built from the founder dashboard's daily snapshots.
import type { DayStat, Funnel } from './growth';
import { funnelSteps } from './growth';

export interface MonthSummary {
  month: string; // YYYY-MM
  label: string; // "October 2026"
  partial: boolean; // the month isn't over yet
  mrrStart: number | null; mrrEnd: number | null; mrrGrowthPct: number | null;
  netMrrEnd: number | null;
  paidStart: number | null; paidEnd: number | null;
  companiesEnd: number | null; trialsEnd: number | null;
  newCompanies: number; churned: number;
}

export const monthLabel = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The last `n` months, newest first, as YYYY-MM (the current month included). */
export function recentMonths(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Start = the last snapshot before the month (or its first day); end = its last snapshot. */
export function monthSummary(rows: DayStat[], month: string, today = new Date().toISOString().slice(0, 10)): MonthSummary {
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const inMonth = sorted.filter((r) => r.day.startsWith(month));
  const before = sorted.filter((r) => r.day < `${month}-01`);
  const start = before[before.length - 1] ?? inMonth[0] ?? null;
  const end = inMonth[inMonth.length - 1] ?? null;
  const n = (v: number | string | undefined | null) => (v == null ? null : Number(v));
  const mrrStart = n(start?.mrr), mrrEnd = n(end?.mrr);
  return {
    month, label: monthLabel(month), partial: today.slice(0, 7) <= month,
    mrrStart, mrrEnd, mrrGrowthPct: mrrStart && mrrEnd != null ? Math.round(((mrrEnd - mrrStart) / mrrStart) * 1000) / 10 : null,
    netMrrEnd: n(end?.mrr_net), paidStart: n(start?.paid_companies), paidEnd: n(end?.paid_companies),
    companiesEnd: n(end?.companies), trialsEnd: n(end?.trials),
    newCompanies: inMonth.reduce((s, r) => s + Number(r.new_companies || 0), 0),
    churned: inMonth.reduce((s, r) => s + Number(r.churned || 0), 0),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const usd = (v: number | null) => (v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`);
const num = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US'));
const signed = (v: number | null, suffix = '') => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('en-US')}${suffix}`);

export interface InvestorInput {
  summary: MonthSummary;
  arr?: number | null; trialConversionPct?: number | null; grossMarginPct?: number | null;
  paymentVolume30d?: number | null; companiesTakingPayments30d?: number | null;
  funnel?: Funnel | null; funnelDays?: number;
  usage?: { label: string; companies: number }[]; usageCompanies?: number;
  highlights?: string; asks?: string;
}

export function investorHtml(i: InvestorInput): string {
  const s = i.summary;
  const tile = (label: string, value: string, sub?: string) =>
    `<td class="tile"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</td>`;
  const para = (t?: string) => (t?.trim() ? t.trim().split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join('') : '');
  const funnel = i.funnel ? funnelSteps(i.funnel) : [];
  const usage = (i.usage ?? []).filter((u) => u.companies > 0).sort((a, b) => b.companies - a.companies).slice(0, 10);
  return `<html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,Helvetica,Arial,sans-serif;padding:32px;color:#0f172a;font-size:12px;line-height:1.45}
h1{color:#0B3D91;font-size:22px;margin:0}h2{font-size:14px;color:#0B3D91;margin:22px 0 8px}
.muted{color:#64748b}table{width:100%;border-collapse:collapse}
.tiles td{border:1px solid #e2e8f0;padding:10px;vertical-align:top;width:25%}.v{font-size:18px;font-weight:700}.l{color:#475569}.s{color:#64748b;font-size:11px}
.rows td{padding:5px 6px;border-bottom:1px solid #e2e8f0}.r{text-align:right;font-variant-numeric:tabular-nums}
.bar{background:#dbe5f5;height:8px;border-radius:4px}.bar>div{background:#0B3D91;height:8px;border-radius:4px}
</style></head><body>
<h1>Tarmo investor update · ${esc(s.label)}</h1>
<div class="muted">${s.partial ? 'Month to date. ' : ''}Figures come from Tarmo's own records; revenue is monthly recurring subscription revenue (yearly plans counted per month).</div>
${i.highlights?.trim() ? `<h2>Highlights</h2>${para(i.highlights)}` : ''}
<h2>Revenue and customers</h2>
<table class="tiles"><tr>
${tile('Monthly recurring revenue', usd(s.mrrEnd), s.mrrGrowthPct == null ? `from ${usd(s.mrrStart)}` : `${signed(s.mrrGrowthPct, '%')} from ${usd(s.mrrStart)}`)}
${tile('Annual run rate', usd(i.arr ?? (s.mrrEnd == null ? null : s.mrrEnd * 12)))}
${tile('Paying companies', num(s.paidEnd), `${signed(s.paidEnd != null && s.paidStart != null ? s.paidEnd - s.paidStart : null)} this month`)}
${tile('Average revenue per company', usd(s.mrrEnd != null && s.paidEnd ? s.mrrEnd / s.paidEnd : null), 'per month')}
</tr><tr>
${tile('New sign-ups', num(s.newCompanies))}
${tile('Cancelled', num(s.churned))}
${tile('Companies on trial', num(s.trialsEnd))}
${tile('Trial to paid', i.trialConversionPct == null ? '—' : `${i.trialConversionPct.toFixed(1)}%`, 'as of today, companies older than 30 days')}
</tr></table>
${i.paymentVolume30d != null || i.grossMarginPct != null ? `<h2>Payments and margin (last 30 days)</h2><table class="rows">
${i.paymentVolume30d != null ? `<tr><td>Customer payments through Tarmo</td><td class="r">${usd(i.paymentVolume30d)}</td></tr>` : ''}
${i.companiesTakingPayments30d != null ? `<tr><td>Companies taking payments</td><td class="r">${num(i.companiesTakingPayments30d)}</td></tr>` : ''}
${i.grossMarginPct != null ? `<tr><td>Gross margin (estimate)</td><td class="r">${i.grossMarginPct.toFixed(1)}%</td></tr>` : ''}
</table>` : ''}
${funnel.length ? `<h2>Activation funnel (sign-ups in the last ${i.funnelDays ?? 90} days)</h2><table class="rows">
${funnel.map((f) => `<tr><td>${esc(f.label)}</td><td class="r">${num(f.count)}</td><td class="r muted">${f.pct}%</td></tr>`).join('')}
</table>` : ''}
${usage.length ? `<h2>Most used features (share of ${num(i.usageCompanies ?? null)} active companies)</h2><table class="rows">
${usage.map((u) => {
    const pct = i.usageCompanies ? Math.round((u.companies / i.usageCompanies) * 100) : 0;
    return `<tr><td style="width:40%">${esc(u.label)}</td><td><div class="bar"><div style="width:${pct}%"></div></div></td><td class="r" style="width:60px">${pct}%</td></tr>`;
  }).join('')}
</table>` : ''}
${i.asks?.trim() ? `<h2>Where you can help</h2>${para(i.asks)}` : ''}
</body></html>`;
}
