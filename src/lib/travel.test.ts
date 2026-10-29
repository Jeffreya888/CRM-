import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drivingMiles, routeUrl, travelFee, type TravelSettings } from './travel';

const base: TravelSettings = {
  travel_fee_mode: 'per_mile', travel_free_miles: 10, travel_rate_per_mile: 1.5, travel_min_fee: 15,
  travel_zones: [], service_radius_miles: 60,
};

test('per mile: free miles, rate and minimum', () => {
  assert.equal(travelFee(base, 8).fee, 0);
  assert.equal(travelFee(base, 14).fee, 15, 'minimum applies');
  assert.equal(travelFee(base, 30).fee, 30);
  assert.equal(travelFee(base, 30).label, 'Travel fee (30 mi)');
  assert.equal(travelFee(base, 75).outsideArea, true);
});

test('zones pick the first zone that covers the distance', () => {
  const z: TravelSettings = { ...base, travel_fee_mode: 'zones', travel_zones: [{ up_to_miles: 30, fee: 35 }, { up_to_miles: 15, fee: 0 }] };
  assert.equal(travelFee(z, 12).fee, 0);
  assert.equal(travelFee(z, 22).fee, 35);
  const far = travelFee(z, 45);
  assert.equal(far.fee, 0);
  assert.equal(far.noZone, true);
  assert.equal(far.outsideArea, true);
});

test('off charges nothing', () => {
  assert.equal(travelFee({ ...base, travel_fee_mode: 'off' }, 100).fee, 0);
});

test('driving miles estimate', () => {
  // Austin → Dallas is ~182 mi straight, ~195 mi by road.
  const m = drivingMiles({ lat: 30.2672, lng: -97.7431 }, { lat: 32.7767, lng: -96.797 });
  assert.ok(m > 200 && m < 240, String(m));
  assert.equal(drivingMiles({ lat: 30, lng: -97 }, { lat: 30, lng: -97 }), 0);
});

test('route link keeps the stop order', () => {
  const u = routeUrl(['A St', 'B St', 'C St'], 'Shop');
  assert.ok(u);
  const q = new URL(u!).searchParams;
  assert.equal(q.get('origin'), 'Shop');
  assert.equal(q.get('destination'), 'C St');
  assert.equal(q.get('waypoints'), 'A St|B St');
  assert.equal(routeUrl([]), null);
});
