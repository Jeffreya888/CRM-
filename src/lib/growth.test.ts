import assert from 'node:assert/strict';
import { test } from 'node:test';
import { byWeek, funnelSteps, growthPct, weekStart, type DayStat } from './growth';

const day = (d: string, o: Partial<DayStat>): DayStat => ({ day: d, companies: 0, paid_companies: 0, trials: 0, new_companies: 0, churned: 0, mrr: 0, mrr_net: 0, ...o });

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-11-09'), '2026-11-09'); // Monday
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
});

test('weekly buckets: sums and latest values', () => {
  const rows = [day('2026-11-10', { new_companies: 2, mrr: 100 }), day('2026-11-09', { new_companies: 1, mrr: 90 }), day('2026-11-16', { new_companies: 4, mrr: 150 })];
  assert.deepEqual(byWeek(rows, (r) => r.new_companies, 'sum').map((b) => b.value), [3, 4]);
  assert.deepEqual(byWeek(rows, (r) => r.mrr, 'last').map((b) => b.value), [100, 150]);
});

test('growth and funnel', () => {
  assert.equal(growthPct([200, 250]), 25);
  assert.equal(growthPct([0, 250]), null);
  const s = funnelSteps({ signed_up: 10, added_customer: 8, sent_quote: 5, completed_job: 4, got_paid: 2, subscribed: 3 });
  assert.deepEqual(s.map((x) => x.pct), [100, 80, 50, 40, 20, 30]);
  assert.equal(s[2].lost, 3);
  assert.equal(funnelSteps({ signed_up: 0, added_customer: 0, sent_quote: 0, completed_job: 0, got_paid: 0, subscribed: 0 })[1].pct, 0);
});
