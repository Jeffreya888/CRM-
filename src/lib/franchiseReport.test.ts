import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avgTicket, closeRate, insights, networkTotals, qcRate, royaltyCsv, type LocationStats } from './franchiseReport';

const loc = (id: string, o: Partial<LocationStats>): LocationStats => ({
  org_id: id, location_name: id, territory: null, is_hq: false, share_details: false, revenue: 0, invoiced: 0, invoices: 0,
  jobs_completed: 0, quotes_sent: 0, quotes_won: 0, new_customers: 0, qc_passed: 0, qc_failed: 0, avg_rating: null, ratings: 0,
  ai_questions: 0, team: 1, ...o,
});

test('franchise rates and totals', () => {
  assert.equal(closeRate({ quotes_sent: 10, quotes_won: 4 }), 40);
  assert.equal(closeRate({ quotes_sent: 0, quotes_won: 0 }), null);
  assert.equal(avgTicket({ invoiced: 1000, invoices: 4 }), 250);
  assert.equal(qcRate({ qc_passed: 9, qc_failed: 1 }), 90);
  const t = networkTotals([loc('a', { revenue: 100, avg_rating: 5, ratings: 2 }), loc('b', { revenue: 50, avg_rating: 4, ratings: 2 })]);
  assert.equal(t.revenue, 150);
  assert.equal(t.avg_rating, 4.5);
});

test('benchmark insights flag the top location and laggards', () => {
  const rows = [
    loc('a', { revenue: 9000, quotes_sent: 10, quotes_won: 6, qc_passed: 10 }),
    loc('b', { revenue: 4000, quotes_sent: 10, quotes_won: 6, qc_passed: 10 }),
    loc('c', { revenue: 3000, quotes_sent: 10, quotes_won: 1, qc_passed: 5, qc_failed: 5 }),
  ];
  const out = insights(rows);
  assert.ok(out.some((i) => i.org_id === 'a' && i.tone === 'success'));
  assert.ok(out.some((i) => i.org_id === 'c' && /Close rate 10%/.test(i.text)));
  assert.ok(out.some((i) => i.org_id === 'c' && /QC pass rate 50%/.test(i.text)));
  assert.deepEqual(insights(rows.slice(0, 2)), [], 'needs 3 locations');
});

test('royalty CSV has a totals row', () => {
  const csv = royaltyCsv('2026-10', [
    { org_id: 'a', location_name: 'Houston', territory: 'IAH', gross_sales: 1000, payments: 2, royalty_pct: 6, royalty: 60, marketing_pct: 2, marketing: 20 },
  ]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[1], '2026-10,Houston,IAH,1000.00,2,6,60.00,2,20.00,80.00');
  assert.equal(lines[2], '2026-10,Total,,1000.00,2,,60.00,,20.00,80.00');
});
