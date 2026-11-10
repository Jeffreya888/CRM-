import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOfflineError } from './offlineErrors';

test('lost signal is retried later; real errors are not', () => {
  assert.equal(isOfflineError(new TypeError('Network request failed')), true);       // iPhone / Android
  assert.equal(isOfflineError(new TypeError('Failed to fetch')), true);              // Chrome
  assert.equal(isOfflineError({ message: 'TypeError: Load failed' }), true);         // Safari
  assert.equal(isOfflineError(new Error('The Internet connection appears to be offline.')), true);
  assert.equal(isOfflineError({ message: 'PERIOD_CLOSED: this pay period is closed.' }), false);
  assert.equal(isOfflineError({ message: 'new row violates row-level security policy' }), false);
  assert.equal(isOfflineError(null), false);
});
