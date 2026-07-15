import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRequiredRole, parseBearerToken } from './supabaseAuth.js';

test('Bearer token извлекается без учёта регистра схемы', () => {
  assert.equal(parseBearerToken('bearer test-token'), 'test-token');
  assert.equal(parseBearerToken('Basic test-token'), '');
});

test('master и admin проходят мастерскую проверку', () => {
  assert.equal(hasRequiredRole({ role: 'master', is_active: true }, ['master', 'admin']), true);
  assert.equal(hasRequiredRole({ role: 'admin', is_active: true }, ['master', 'admin']), true);
  assert.equal(hasRequiredRole({ role: 'guest', is_active: true }, ['master', 'admin']), false);
});

test('отключённый пользователь не проходит проверку роли', () => {
  assert.equal(hasRequiredRole({ role: 'admin', is_active: false }, ['admin']), false);
});
