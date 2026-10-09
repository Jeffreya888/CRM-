// Run: npm test   (uses Node's built-in test runner with type stripping)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, priceService } from './pricing.ts';
import { effectivePlan, hasFeature, trialDaysLeft } from './plans.ts';

const svc = { base_price: 150, price_per_foot: 9, hourly_rate: 95, category_prices: { light_jet: 650 }, est_hours: 3 };

test('per-foot pricing uses length with a minimum', () => {
  assert.equal(priceService({ ...svc, pricing_method: 'per_foot' }, { category: 'light_jet', length_ft: 51.2 }), 460.8);
  assert.equal(priceService({ ...svc, pricing_method: 'per_foot' }, { category: 'piston_single', length_ft: 10 }), 150);
});

test('per-foot falls back to typical category length', () => {
  assert.equal(priceService({ ...svc, pricing_method: 'per_foot' }, { category: 'large_jet', length_ft: null }), 864);
});

test('category, flat and hourly pricing', () => {
  assert.equal(priceService({ ...svc, pricing_method: 'per_category' }, { category: 'light_jet', length_ft: null }), 650);
  assert.equal(priceService({ ...svc, pricing_method: 'per_category' }, { category: 'turboprop', length_ft: null }), 150);
  assert.equal(priceService({ ...svc, pricing_method: 'flat' }), 150);
  assert.equal(priceService({ ...svc, pricing_method: 'hourly' }), 285);
});

test('totals match the database (tax only on taxable lines, proportional discount)', () => {
  const items = [
    { quantity: 1, unit_price: 610.8, taxable: true },
    { quantity: 1, unit_price: 455, taxable: false },
  ];
  assert.deepEqual(computeTotals(items, 0, 0.07), { subtotal: 1065.8, discount: 0, taxable: 610.8, tax: 42.76, total: 1108.56 });
  const d = computeTotals(items, 100, 0.07);
  assert.equal(d.tax, 38.74);
  assert.equal(d.total, 1004.54);
  assert.equal(computeTotals(items, 5000, 0.07).total, 0, 'discount capped at subtotal');
});

test('plan logic', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  assert.equal(effectivePlan({ plan: 'trial', trial_ends_at: '2026-10-20T00:00:00Z', plan_expires_at: null }, now), 'trial');
  assert.equal(effectivePlan({ plan: 'trial', trial_ends_at: '2026-10-01T00:00:00Z', plan_expires_at: null }, now), 'expired');
  assert.equal(effectivePlan({ plan: 'team', trial_ends_at: '', plan_expires_at: '2026-11-01T00:00:00Z' }, now), 'team');
  assert.equal(effectivePlan({ plan: 'team', trial_ends_at: '', plan_expires_at: '2026-10-01T00:00:00Z' }, now), 'expired');
  assert.equal(hasFeature('solo', 'inventory'), false);
  assert.equal(hasFeature('team', 'inventory'), true);
  assert.equal(hasFeature('trial', 'reports'), true);
  assert.equal(hasFeature('expired', 'reminders'), false);
  assert.equal(trialDaysLeft({ plan: 'trial', trial_ends_at: '2026-10-23T12:00:00Z' }, now), 14);
});
