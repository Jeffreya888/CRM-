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

