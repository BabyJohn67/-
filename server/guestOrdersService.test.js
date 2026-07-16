import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionGuestOrder,
  normalizeGuestOrderInput,
  parsePrice,
  validateGuestOrder
} from './guestOrdersService.js';

test('parsePrice reads formatted Russian prices', () => {
  assert.equal(parsePrice('4 200 ₽'), 4200);
  assert.equal(parsePrice('10 000 ₽'), 10000);
});

test('guest order input is normalized and validated', () => {
  const order = normalizeGuestOrderInput({
    tableNumber: ' 5 ',
    guestName: ' Игорь ',
    guestEmail: 'TEST@EXAMPLE.COM',
    formatId: 'fruit',
    formatName: 'На фрукте',
    variantId: 'fruit-mix',
    variantName: 'На грейпфруте',
    priceAtCreation: '4 000 ₽',
    strength: 'Средний',
    items: [
      { id: 'a', name: 'Арбуз', percent: 50 },
      { id: 'b', name: 'Дыня', percent: 50 }
    ]
  });

  assert.equal(order.table_number, '5');
  assert.equal(order.guest_email, 'test@example.com');
  assert.equal(order.price_at_creation, 4000);
  assert.equal(validateGuestOrder(order), '');
});

test('guest order requires exactly 100 percent', () => {
  const order = normalizeGuestOrderInput({
    tableNumber: '2',
    guestName: 'Гость',
    guestEmail: 'guest@example.com',
    formatId: 'classic',
    variantId: 'classic-bowl',
    items: [{ id: 'a', name: 'Арбуз', percent: 90 }]
  });

  assert.equal(validateGuestOrder(order), 'Сумма процентов должна быть ровно 100%.');
});

test('guest order safely limits an oversized comment', () => {
  const order = normalizeGuestOrderInput({ comment: `  ${'я'.repeat(1200)}  ` });
  assert.equal(order.comment.length, 1000);
  assert.equal(order.comment, 'я'.repeat(1000));
});

test('guest order statuses follow the working flow', () => {
  assert.equal(canTransitionGuestOrder('new', 'accepted'), true);
  assert.equal(canTransitionGuestOrder('accepted', 'preparing'), true);
  assert.equal(canTransitionGuestOrder('preparing', 'ready'), true);
  assert.equal(canTransitionGuestOrder('ready', 'completed'), true);
  assert.equal(canTransitionGuestOrder('completed', 'new'), false);
});
