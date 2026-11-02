import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annualFeeBps, feePercent, trialFeeFor } from './plans';

test('yearly paid plans have no platform fee', () => {
  assert.equal(annualFeeBps('team', 'annual', 75), 0);
  assert.equal(annualFeeBps('team', 'monthly', 75), 75);
  assert.equal(annualFeeBps('trial', 'annual', 400), 400, 'trials keep the trial fee');
  assert.equal(feePercent(75), '0.75%');
  assert.equal(feePercent(100), '1%');
});

test('trial fee is 4% with a $120 cap per payment', () => {
  assert.equal(trialFeeFor(1000), 40);
  assert.equal(trialFeeFor(3000), 120);
  assert.equal(trialFeeFor(5000), 120);
  assert.equal(trialFeeFor(123.45), 4.94);
});
