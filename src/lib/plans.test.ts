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
