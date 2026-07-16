import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultProfile,
  hasRequiredRole,
  parseBearerToken,
  validateAdminProfileChange
} from './supabaseAuth.js';

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

test('восстановленный профиль всегда получает безопасную роль guest', () => {
  const profile = buildDefaultProfile({
    id: 'user-id',
    email: 'guest@example.com',
    user_metadata: { name: 'Гость', phone: '+70000000000', role: 'admin' }
  });

  assert.equal(profile.role, 'guest');
  assert.equal(profile.is_active, true);
  assert.equal(profile.name, 'Гость');
});

test('администратор не может отключить собственный аккаунт', () => {
  const admin = { id: 'admin-1', role: 'admin', is_active: true };
  assert.equal(
    validateAdminProfileChange(admin.id, admin, [admin], { is_active: false }),
    'Нельзя отключить или понизить собственный аккаунт администратора.'
  );
});

test('в системе нельзя отключить последнего активного администратора', () => {
  const admin = { id: 'admin-1', role: 'admin', is_active: true };
  assert.equal(
    validateAdminProfileChange('admin-2', admin, [admin], { role: 'master' }),
    'В системе должен остаться хотя бы один активный администратор.'
  );
});

test('администратор может назначить гостя мастером', () => {
  const admin = { id: 'admin-1', role: 'admin', is_active: true };
  const guest = { id: 'guest-1', role: 'guest', is_active: true };
  assert.equal(
    validateAdminProfileChange(admin.id, guest, [admin, guest], { role: 'master' }),
    ''
  );
});
