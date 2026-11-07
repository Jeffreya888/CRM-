// Franchise HQ report math (pure, unit-tested): network totals, benchmarks and the royalty CSV.
import { toCsv } from './csv';

export interface LocationStats {
  org_id: string; location_name: string; territory: string | null; is_hq: boolean; share_details: boolean;
  revenue: number; invoiced: number; invoices: number; jobs_completed: number; quotes_sent: number; quotes_won: number;
  new_customers: number; qc_passed: number; qc_failed: number; avg_rating: number | null; ratings: number; ai_questions: number; team: number;
}

export interface RoyaltyRow {
  org_id: string; location_name: string; territory: string | null; gross_sales: number; payments: number;
  royalty_pct: number; royalty: number; marketing_pct: number; marketing: number;
}

/** Close rate in percent (null when nothing was sent). */
export const closeRate = (s: Pick<LocationStats, 'quotes_sent' | 'quotes_won'>) =>
  s.quotes_sent > 0 ? Math.round((s.quotes_won / s.quotes_sent) * 100) : null;
/** Average invoice in dollars (null with no invoices). */
export const avgTicket = (s: Pick<LocationStats, 'invoiced' | 'invoices'>) =>
  s.invoices > 0 ? Math.round((s.invoiced / s.invoices) * 100) / 100 : null;
/** QC pass rate in percent (null with no checks). */
export const qcRate = (s: Pick<LocationStats, 'qc_passed' | 'qc_failed'>) =>
  s.qc_passed + s.qc_failed > 0 ? Math.round((s.qc_passed / (s.qc_passed + s.qc_failed)) * 100) : null;

/** Sums every location into one network row. */
export function networkTotals(rows: LocationStats[]): LocationStats {
  const sum = (k: keyof LocationStats) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const ratings = sum('ratings');
  const ratingSum = rows.reduce((n, r) => n + (r.avg_rating != null ? Number(r.avg_rating) * r.ratings : 0), 0);
  return {
    org_id: 'network', location_name: 'Network total', territory: null, is_hq: false, share_details: false,
    revenue: sum('revenue'), invoiced: sum('invoiced'), invoices: sum('invoices'), jobs_completed: sum('jobs_completed'),
    quotes_sent: sum('quotes_sent'), quotes_won: sum('quotes_won'), new_customers: sum('new_customers'),
    qc_passed: sum('qc_passed'), qc_failed: sum('qc_failed'), avg_rating: ratings ? Math.round((ratingSum / ratings) * 100) / 100 : null,
    ratings, ai_questions: sum('ai_questions'), team: sum('team'),
  };
}

export type Insight = { org_id: string; location_name: string; text: string; tone: 'success' | 'warning' };

/**
 * Plain-language benchmark notes: the top location by revenue, and locations well below the
 * network on close rate or QC pass rate (needs at least 3 locations to compare).
 */
export function insights(rows: LocationStats[]): Insight[] {
  const locs = rows.filter((r) => !r.is_hq);
  if (locs.length < 3) return [];
  const out: Insight[] = [];
  const top = [...locs].sort((a, b) => b.revenue - a.revenue)[0];
  if (top.revenue > 0) out.push({ org_id: top.org_id, location_name: top.location_name, text: 'Highest revenue in the network', tone: 'success' });
  const net = networkTotals(locs);
  const netClose = closeRate(net);
  const netQc = qcRate(net);
  for (const r of locs) {
    const c = closeRate(r);
    if (netClose != null && c != null && r.quotes_sent >= 5 && c <= netClose - 15) {
      out.push({ org_id: r.org_id, location_name: r.location_name, text: `Close rate ${c}% vs ${netClose}% network`, tone: 'warning' });
    }
    const q = qcRate(r);
    if (netQc != null && q != null && r.qc_passed + r.qc_failed >= 5 && q <= netQc - 10) {
      out.push({ org_id: r.org_id, location_name: r.location_name, text: `QC pass rate ${q}% vs ${netQc}% network`, tone: 'warning' });
    }
  }
  return out;
}

/** Royalty report CSV for one month, with a totals row. */
export function royaltyCsv(month: string, rows: RoyaltyRow[]): string {
  const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  const total = (k: 'gross_sales' | 'royalty' | 'marketing') => rows.reduce((n, r) => n + Number(r[k]), 0);
  return toCsv(
    ['Month', 'Location', 'Territory', 'Gross sales', 'Payments', 'Royalty %', 'Royalty', 'Marketing fund %', 'Marketing fund', 'Total due'],
    [
      ...rows.map((r) => [month, r.location_name, r.territory ?? '', money(r.gross_sales), r.payments, r.royalty_pct, money(r.royalty),
        r.marketing_pct, money(r.marketing), money(Number(r.royalty) + Number(r.marketing))]),
      [month, 'Total', '', money(total('gross_sales')), rows.reduce((n, r) => n + r.payments, 0), '', money(total('royalty')), '',
        money(total('marketing')), money(total('royalty') + total('marketing'))],
    ],
  );
}
