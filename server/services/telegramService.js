const TELEGRAM_API_URL = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_PUBLIC_APP_URL = 'https://hookah-menu-8cqq.onrender.com';

function cleanText(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return cleanText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatPrice(value) {
  const price = Number(value || 0);
  return Number.isFinite(price)
    ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(price)} ₽`
    : 'Не указана';
}

function getPublicAppUrl() {
  return cleanText(
    process.env.PUBLIC_APP_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    DEFAULT_PUBLIC_APP_URL
  ).replace(/\/$/, '');
}

export function isTelegramEnabled() {
  return cleanText(process.env.TELEGRAM_ENABLED).toLowerCase() === 'true';
}

export function formatGuestOrderTelegramMessage(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const composition = items.length > 0
    ? items.map((item) => {
        const tobaccoName = [item.brand, item.name].filter(Boolean).join(' ');
        return `• ${escapeHtml(tobaccoName)} — ${escapeHtml(item.percent)}%`;
      }).join('\n')
    : 'Состав не указан';

  const orderNumber = order?.order_number || order?.id || '—';
  const comment = escapeHtml(order?.comment) || 'Без комментария';

  return [
    `🟡 <b>Новый заказ #${escapeHtml(orderNumber)}</b>`,
    '',
    `<b>Стол:</b> ${escapeHtml(order?.table_number) || '—'}`,
    `<b>Гость:</b> ${escapeHtml(order?.guest_name) || '—'}`,
    `<b>Телефон:</b> ${escapeHtml(order?.guest_phone) || 'Не указан'}`,
    `<b>Email:</b> ${escapeHtml(order?.guest_email) || 'Не указан'}`,
    '',
    `<b>Формат:</b> ${escapeHtml(order?.variant_name || order?.format_name) || '—'}`,
    `<b>Крепость:</b> ${escapeHtml(order?.strength) || 'Не указана'}`,
    `<b>Цена:</b> ${escapeHtml(formatPrice(order?.price_at_creation))}`,
    '',
    '<b>Состав:</b>',
    composition,
    '',
    '<b>Комментарий:</b>',
    comment,
    '',
    `<a href="${escapeHtml(getPublicAppUrl())}">Открыть панель мастера</a>`
  ].join('\n');
}

export async function sendTelegramNotification(order, options = {}) {
  if (!isTelegramEnabled()) {
    return { attempted: false, sent: false, error: '' };
  }

  const token = cleanText(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = cleanText(process.env.TELEGRAM_CHAT_ID);
  if (!token || !chatId) {
    return {
      attempted: true,
      sent: false,
      error: 'Telegram включён, но TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не настроены.'
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);

  try {
    const fetchImplementation = options.fetchImplementation || fetch;
    const response = await fetchImplementation(
      `${TELEGRAM_API_URL}/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: formatGuestOrderTelegramMessage(order),
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }),
        signal: controller.signal
      }
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(cleanText(result.description) || `Telegram вернул ошибку ${response.status}.`);
    }

    return { attempted: true, sent: true, error: '' };
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Telegram не ответил вовремя.'
      : cleanText(error?.message) || 'Не удалось отправить уведомление в Telegram.';
    return { attempted: true, sent: false, error: message.slice(0, 500) };
  } finally {
    clearTimeout(timeout);
  }
}
