import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatGuestOrderTelegramMessage,
  sendTelegramNotification
} from './telegramService.js';

const originalTelegramEnv = {
  enabled: process.env.TELEGRAM_ENABLED,
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID
};

test.afterEach(() => {
  process.env.TELEGRAM_ENABLED = originalTelegramEnv.enabled;
  process.env.TELEGRAM_BOT_TOKEN = originalTelegramEnv.token;
  process.env.TELEGRAM_CHAT_ID = originalTelegramEnv.chatId;
});

test('Telegram message contains order details and escapes HTML', () => {
  const message = formatGuestOrderTelegramMessage({
    order_number: 152,
    table_number: '5',
    guest_name: 'Игорь <test>',
    guest_phone: '+7 900 000-00-00',
    guest_email: 'guest@example.com',
    variant_name: 'На гранате',
    price_at_creation: 4200,
    strength: 'Средняя',
    comment: 'Без холодка',
    items: [{ brand: 'Darkside', name: 'Cola', percent: 100 }]
  });

  assert.match(message, /Новый заказ #152/);
  assert.match(message, /Игорь &lt;test&gt;/);
  assert.match(message, /4[^\d]200 ₽/);
  assert.match(message, /Darkside Cola — 100%/);
});

test('Telegram explains that tobaccos will be selected with the master', () => {
  const message = formatGuestOrderTelegramMessage({ items: [] });
  assert.match(message, /<b>Табаки:<\/b>\nне выбраны, подобрать с мастером/);
});

test('Telegram is skipped when notifications are disabled', async () => {
  process.env.TELEGRAM_ENABLED = 'false';
  const result = await sendTelegramNotification({});
  assert.deepEqual(result, { attempted: false, sent: false, error: '' });
});

test('Telegram failure does not throw and returns a safe result', async () => {
  process.env.TELEGRAM_ENABLED = 'true';
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '123';

  const result = await sendTelegramNotification({}, {
    fetchImplementation: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, description: 'Bad Request' })
    })
  });

  assert.equal(result.attempted, true);
  assert.equal(result.sent, false);
  assert.equal(result.error, 'Bad Request');
});
