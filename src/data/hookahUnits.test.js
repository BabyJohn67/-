import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownHookahId } from './hookahUnits.js';

test('существуют только физические кальяны с 1 по 10', () => {
  assert.equal(isKnownHookahId('1'), true);
  assert.equal(isKnownHookahId('10'), true);
  assert.equal(isKnownHookahId('11'), false);
  assert.equal(isKnownHookahId('bad'), false);
});
