import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annualFeeBps, feePercent } from './plans';

test('yearly paid plans have no platform fee', () => {
  assert.equal(annualFeeBps('team', 'annual', 75), 0);
  assert.equal(annualFeeBps('team', 'monthly', 75), 75);
  assert.equal(annualFeeBps('trial', 'annual', 100), 100, 'trials keep the trial fee');
  assert.equal(feePercent(75), '0.75%');
  assert.equal(feePercent(100), '1%');
});


test('extra location pricing', async () => {
  const { extraLocationsPrice } = await import('./plans');
  assert.equal(extraLocationsPrice(0), 0);
  assert.equal(extraLocationsPrice(7), 273);           // 12 locations: 7 × $39
  assert.equal(extraLocationsPrice(15), 585);          // 20 locations
  assert.equal(extraLocationsPrice(16), 614);          // 21st location at $29
  assert.equal(extraLocationsPrice(25), 875);          // 30 locations: 15 × 39 + 10 × 29
  assert.equal(extraLocationsPrice(7, 'annual'), 2730);
  assert.equal(extraLocationsPrice(-3), 0);
});

test('franchise network quote', async () => {
  const { franchiseQuote } = await import('./plans');
  const q = franchiseQuote(46);
  assert.equal(q.allIn, 46 * 149);
  assert.ok(Math.abs(q.foundingAllIn - 46 * 129) < 1);     // $129 per location (coupon on $149)
  assert.equal(q.split.hq, 46 * 47);
  assert.equal(q.split.franchiseePlan, 101.99);          // Team $119.99 less 15%
  assert.equal(q.split.total, Math.round((46 * 47 + 46 * 101.99) * 100) / 100);     // $148.99 per location
  assert.equal(franchiseQuote(3).allIn, 499);              // HQ minimum
  assert.equal(franchiseQuote(3).split.hq, 499);
  assert.equal(franchiseQuote(0).allIn, 0);
});

test('franchise quote: savings and technology fee', async () => {
  const { franchiseQuote } = await import('./plans');
  const q = franchiseQuote(46, { currentPerLocation: 199, techFee: 199 });
  assert.deepEqual(q.savings, { currentMonthly: 9154, monthly: 2300, yearly: 27600 });
  assert.deepEqual(q.techFee, { collectedMonthly: 9154, keptMonthly: 2300, keptYearly: 27600 });
  assert.equal(franchiseQuote(46).savings, null);
  const f = franchiseQuote(46, { techFee: 199, founding: true });
  assert.equal(f.techFee?.keptMonthly, 46 * 50);                           // regular $149, even with a founding rate
});
