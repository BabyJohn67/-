import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeBrowserSupabaseKey } from './vite.config.js';

test('frontend принимает публичный ключ и отклоняет серверный', () => {
  assert.equal(isSafeBrowserSupabaseKey('sb_publishable_test'), true);
  assert.equal(isSafeBrowserSupabaseKey('sb_secret_test'), false);
});
