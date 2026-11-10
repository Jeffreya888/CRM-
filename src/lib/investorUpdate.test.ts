import assert from 'node:assert/strict';
import { test } from 'node:test';
import { investorHtml, monthSummary, recentMonths } from './investorUpdate';

const day = (d: string, mrr: number, paid: number, extra: Partial<{ new_companies: number; churned: number }> = {}) =>
  ({ day: d, companies: paid + 5, paid_companies: paid, trials: 5, new_companies: 0, churned: 0, mrr, mrr_net: mrr * 0.9, ...extra });

test('month summary compares the last day before the month with its last day', () => {
  const rows = [
    day('2026-09-29', 900, 9), day('2026-09-30', 1000, 10),
    day('2026-10-01', 1000, 10, { new_companies: 3 }), day('2026-10-15', 1100, 11, { churned: 1 }), day('2026-10-31', 1250, 12, { new_companies: 2 }),
    day('2026-11-01', 1300, 13),
  ];
  const s = monthSummary(rows, '2026-10', '2026-11-10');
  assert.equal(s.mrrStart, 1000);
  assert.equal(s.mrrEnd, 1250);
  assert.equal(s.mrrGrowthPct, 25);
  assert.equal(s.paidStart, 10);
  assert.equal(s.paidEnd, 12);
  assert.equal(s.newCompanies, 5);
  assert.equal(s.churned, 1);
  assert.equal(s.partial, false);
  assert.equal(s.label, 'October 2026');
});

test('current month is marked partial and an empty month gives blanks', () => {
  const s = monthSummary([], '2026-11', '2026-11-10');
  assert.equal(s.partial, true);
  assert.equal(s.mrrEnd, null);
  assert.equal(s.mrrGrowthPct, null);
  assert.equal(s.newCompanies, 0);
});

test('recent months go back across the year', () => {
  assert.deepEqual(recentMonths(3, new Date('2026-01-20T00:00:00Z')), ['2026-01', '2025-12', '2025-11']);
});

test('html escapes notes and skips empty sections', () => {
  const s = monthSummary([day('2026-10-31', 500, 5)], '2026-10', '2026-11-10');
  const html = investorHtml({ summary: s, highlights: 'Signed <Acme>', usage: [{ label: 'Quotes', companies: 0 }] });
  assert.match(html, /Signed &lt;Acme&gt;/);
  assert.doesNotMatch(html, /Most used features/);
  assert.match(html, /\$500/);
});
