import {
  getSupabaseAccessToken,
  isSupabaseConfigured
} from '../auth/supabaseClient.js';

async function buildProtectedHeaders(includeJson = false) {
  const headers = {};
  if (includeJson) headers['Content-Type'] = 'application/json';

  if (isSupabaseConfigured) {
    const token = await getSupabaseAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function readResponse(response, fallbackMessage) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || fallbackMessage);
  return data;
}

export async function loadTobaccos() {
  const response = await fetch('/api/tobaccos');
  return readResponse(response, 'Не удалось загрузить список табаков');
}

export async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Config is unavailable');
    const data = await response.json();
    return {
      publicSiteUrl: data.publicSiteUrl || '',
      activeMixStorage: data.activeMixStorage || null,
      auth: data.auth || { mode: 'supabase', enabled: true, configured: false }
    };
  } catch {
    return {
      publicSiteUrl: '',
      activeMixStorage: null,
      auth: { mode: 'supabase', enabled: true, configured: false }
    };
  }
}

export async function saveTobaccoQuantity(id, quantity, grams) {
  const response = await fetch(`/api/tobaccos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: await buildProtectedHeaders(true),
    body: JSON.stringify({ quantity, grams })
  });
  const data = await readResponse(response, 'Не удалось сохранить количество');
  return data.tobacco;
}

export async function deleteTobacco(id) {
  const response = await fetch(`/api/tobaccos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await buildProtectedHeaders()
  });
  const data = await readResponse(response, 'Не удалось удалить табак');
  return data.tobacco;
}

export async function addTobacco(tobacco) {
  const response = await fetch('/api/tobaccos', {
    method: 'POST',
    headers: await buildProtectedHeaders(true),
    body: JSON.stringify(tobacco)
  });
  const data = await readResponse(response, 'Не удалось добавить позицию');
  return data.tobacco;
}

export async function loadActiveMix(hookahId) {
  const response = await fetch(`/api/hookahs/${encodeURIComponent(hookahId)}/mix`);
  return readResponse(response, 'Не удалось загрузить микс');
}

export async function loadActiveMixes() {
  const response = await fetch('/api/hookahs/active-mixes', {
    headers: await buildProtectedHeaders()
  });
  return readResponse(response, 'Не удалось загрузить активные кальяны');
}

export async function loadMixHistory(period = '24h') {
  const response = await fetch(`/api/hookahs/history?period=${encodeURIComponent(period)}`, {
    headers: await buildProtectedHeaders()
  });
  return readResponse(response, 'Не удалось загрузить историю кальянов');
}

export async function saveActiveMix(hookahId, mix) {
  const response = await fetch(`/api/hookahs/${encodeURIComponent(hookahId)}/mix`, {
    method: 'PUT',
    headers: await buildProtectedHeaders(true),
    body: JSON.stringify(mix)
  });
  const data = await readResponse(response, 'Не удалось сохранить микс');
  return data.mix;
}

export async function clearActiveMix(hookahId) {
  const response = await fetch(`/api/hookahs/${encodeURIComponent(hookahId)}/mix`, {
    method: 'DELETE',
    headers: await buildProtectedHeaders()
  });
  return readResponse(response, 'Не удалось снять микс');
}

export async function createGuestOrder(order) {
  const response = await fetch('/api/guest-orders', {
    method: 'POST',
    headers: await buildProtectedHeaders(true),
    body: JSON.stringify(order)
  });
  return readResponse(response, 'Не удалось отправить заказ');
}

export async function loadMyGuestOrders() {
  const response = await fetch('/api/guest-orders/mine', {
    headers: await buildProtectedHeaders()
  });
  const data = await readResponse(response, 'Не удалось загрузить ваши заказы');
  return data.orders || [];
}

export async function loadGuestOrders(statuses = []) {
  const query = statuses.length > 0
    ? `?statuses=${encodeURIComponent(statuses.join(','))}`
    : '';
  const response = await fetch(`/api/guest-orders${query}`, {
    headers: await buildProtectedHeaders()
  });
  const data = await readResponse(response, 'Не удалось загрузить заявки гостей');
  return data.orders || [];
}

export async function updateGuestOrderStatus(orderId, status, values = {}) {
  const response = await fetch(`/api/guest-orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: await buildProtectedHeaders(true),
    body: JSON.stringify({ status, ...values })
  });
  const data = await readResponse(response, 'Не удалось обновить заказ');
  return data.order;
}

export async function loadStaffProfiles() {
  const response = await fetch('/api/admin/profiles', {
    headers: await buildProtectedHeaders()
  });
  const data = await readResponse(response, 'Не удалось загрузить сотрудников');
  return data.profiles || [];
}

export async function updateStaffProfile(profileId, changes) {
  const response = await fetch(`/api/admin/profiles/${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    headers: await buildProtectedHeaders(true),
    body: JSON.stringify(changes)
  });
  const data = await readResponse(response, 'Не удалось обновить сотрудника');
  return data.profile;
}
