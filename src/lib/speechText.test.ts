import assert from 'node:assert/strict';
import { test } from 'node:test';
import { speechText } from './speechText';

test('reads markdown answers as plain sentences', () => {
  assert.equal(speechText('**Stop.** Mask the pitot tubes.'), 'Stop. Mask the pitot tubes.');
  assert.equal(speechText('Do this:\n1. Rinse\n2. Dry'), 'Do this: Step 1. Rinse Step 2. Dry');
  assert.equal(speechText('- one\n- two'), 'one two');
  assert.equal(speechText('See [the SOP](https://x.y) first.'), 'See the SOP first.');
  assert.equal(speechText('First part.\n\nSecond part'), 'First part. Second part');
});
