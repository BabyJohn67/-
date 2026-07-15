import { randomUUID } from 'node:crypto';
import { getSupabaseAdminClient, getSupabaseUserClient } from './auth/supabaseAuth.js';

export const GUEST_ORDER_STATUSES = [
  'new',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'cancelled'
];

export const ACTIVE_GUEST_ORDER_STATUSES = ['new', 'accepted', 'preparing', 'ready'];

const STATUS_TIMESTAMPS = {
  accepted: 'accepted_at',
  preparing: 'preparing_at',
  ready: 'ready_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at'
};

const ALLOWED_TRANSITIONS = {
  new: new Set(['accepted', 'cancelled']),
  accepted: new Set(['preparing', 'cancelled']),
  preparing: new Set(['ready', 'cancelled']),
  ready: new Set(['completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set()
};

function cleanText(value, maximumLength) {
  return String(value || '').trim().slice(0, maximumLength);
}

export function parsePrice(value) {
  const normalized = String(value || '').replace(/[^\d.,]/g, '').replace(',', '.');
  const price = Number(normalized);
  return Number.isFinite(price) && price >= 0 ? price : 0;
}

export function normalizeGuestOrderInput(value = {}) {
  const items = Array.isArray(value.items)
    ? value.items.slice(0, 12).map((item) => ({
        id: cleanText(item.id, 180),
        brand: cleanText(item.brand, 100),
        name: cleanText(item.name, 180),
        taste: cleanText(item.taste, 300),
        percent: Number(item.percent || 0)
      }))
    : [];

  return {
    table_number: cleanText(value.tableNumber, 20),
    guest_name: cleanText(value.guestName, 100),
    guest_phone: cleanText(value.guestPhone, 40),
    guest_email: cleanText(value.guestEmail, 254).toLowerCase(),
    format_id: cleanText(value.formatId, 80),
    format_name: cleanText(value.formatName, 120),
    variant_id: cleanText(value.variantId, 80),
    variant_name: cleanText(value.variantName, 120),
    price_at_creation: parsePrice(value.priceAtCreation),
    strength: cleanText(value.strength, 30),
    comment: cleanText(value.comment, 1000),
    items,
    request_id: cleanText(value.requestId, 120) || randomUUID()
  };
}

export function validateGuestOrder(order) {
  if (!/^[\p{L}\p{N}\s-]{1,20}$/u.test(order.table_number)) {
    return 'Укажите корректный номер стола.';
  }
  if (order.guest_name.length < 2) return 'Укажите имя гостя.';
  if (!/^\S+@\S+\.\S+$/.test(order.guest_email)) return 'Укажите корректный email.';
  if (!order.format_id || !order.variant_id) return 'Выберите формат кальяна.';
  if (order.items.length === 0) return 'Добавьте хотя бы один табак.';
  if (order.items.some((item) => !item.id || !item.name || !Number.isFinite(item.percent) || item.percent <= 0)) {
    return 'Проверьте состав заказа.';
  }
  const total = order.items.reduce((sum, item) => sum + item.percent, 0);
  if (Math.abs(total - 100) > 0.01) return 'Сумма процентов должна быть ровно 100%.';
  return '';
}

export function canTransitionGuestOrder(currentStatus, nextStatus) {
  return Boolean(ALLOWED_TRANSITIONS[currentStatus]?.has(nextStatus));
}

export async function createGuestOrder(userId, values, token) {
  const order = normalizeGuestOrderInput(values);
  const validationError = validateGuestOrder(order);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }

  const client = getSupabaseUserClient(token);
  const { data: duplicate, error: duplicateError } = await client
    .from('guest_orders')
    .select('*')
    .eq('request_id', order.request_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (duplicateError) throw duplicateError;
  if (duplicate) return { order: duplicate, duplicate: true };

  const { data, error } = await client
    .from('guest_orders')
    .insert({ ...order, user_id: userId, status: 'new' })
    .select('*')
    .single();

  if (error) throw error;
  return { order: data, duplicate: false };
}

export async function saveGuestOrderTelegramResult(order, result) {
  if (!result?.attempted) return order;

  const attempts = Number(order?.notification_attempts || 0) + 1;
  const { data, error } = await getSupabaseAdminClient()
    .from('guest_orders')
    .update({
      telegram_sent: Boolean(result.sent),
      telegram_error: result.sent ? '' : String(result.error || '').slice(0, 500),
      notification_attempts: attempts
    })
    .eq('id', order.id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function listOwnGuestOrders(userId, token) {
  const { data, error } = await getSupabaseUserClient(token)
    .from('guest_orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function listGuestOrders(statuses = ACTIVE_GUEST_ORDER_STATUSES, token) {
  let query = getSupabaseUserClient(token)
    .from('guest_orders')
    .select('*')
    .order('created_at', { ascending: true });

  if (statuses.length > 0) query = query.in('status', statuses);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateGuestOrderStatus(orderId, nextStatus, masterId, values = {}, token) {
  if (!GUEST_ORDER_STATUSES.includes(nextStatus)) {
    const error = new Error('Неизвестный статус заказа.');
    error.statusCode = 400;
    throw error;
  }

  const client = getSupabaseUserClient(token);
  const { data: current, error: loadError } = await client
    .from('guest_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (loadError) throw loadError;
  if (!current) {
    const error = new Error('Заказ не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (current.status !== nextStatus && !canTransitionGuestOrder(current.status, nextStatus)) {
    const error = new Error('Этот переход статуса недоступен. Обновите список заказов.');
    error.statusCode = 409;
    throw error;
  }

  const changes = { status: nextStatus };
  const timestampField = STATUS_TIMESTAMPS[nextStatus];
  if (timestampField && !current[timestampField]) changes[timestampField] = new Date().toISOString();
  if (['accepted', 'preparing', 'ready', 'completed'].includes(nextStatus)) {
    changes.assigned_master_id = current.assigned_master_id || masterId;
  }
  if (nextStatus === 'cancelled') {
    changes.cancel_reason = cleanText(values.cancelReason, 500) || 'Отменено мастером';
  }
  if (values.hookahNumber !== undefined) {
    const hookahNumber = Number(values.hookahNumber);
    if (!Number.isInteger(hookahNumber) || hookahNumber < 1 || hookahNumber > 10) {
      const error = new Error('Укажите корректный номер кальяна.');
      error.statusCode = 400;
      throw error;
    }
    changes.hookah_number = hookahNumber;
  }

  const { data, error } = await client
    .from('guest_orders')
    .update(changes)
    .eq('id', orderId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
