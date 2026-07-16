import { FALLBACK_MASTER_PIN } from '../config.js';
import {
  getSupabaseAccessToken,
  isSupabaseAuthEnabled,
  isSupabaseConfigured
} from '../auth/supabaseClient.js';

async function buildProtectedHeaders(masterPin, includeJson = false) {
  const headers = {};
  if (includeJson) headers['Content-Type'] = 'application/json';

  if (isSupabaseAuthEnabled && isSupabaseConfigured) {
    const token = await getSupabaseAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (masterPin) {
    headers['x-master-pin'] = masterPin;
  }

  return headers;
}

export async function loadTobaccos() {
  const response = await fetch('/api/tobaccos');
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось загрузить список табаков');
  }

  return data;
}

export async function loadMasterPin() {
  const config = await loadConfig();
  return config.masterPin;
}

export async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Config is unavailable');
    const data = await response.json();
    return {
      masterPin: data.masterPin || FALLBACK_MASTER_PIN,
      publicSiteUrl: data.publicSiteUrl || '',
      activeMixStorage: data.activeMixStorage || null,
      auth: data.auth || { mode: 'legacy-pin', enabled: false, configured: false }
    };
  } catch {
    return {
      masterPin: FALLBACK_MASTER_PIN,
      publicSiteUrl: '',
      activeMixStorage: null,
      auth: { mode: 'legacy-pin', enabled: false, configured: false }
    };
  }
}

export async function saveTobaccoQuantity(id, quantity, masterPin, grams) {
  const response = await fetch(`/api/tobaccos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: await buildProtectedHeaders(masterPin, true),
    body: JSON.stringify({ quantity, grams })
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось сохранить количество');
  }

  return data.tobacco;
}

export async function deleteTobacco(id, masterPin) {
  const response = await fetch(`/api/tobaccos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await buildProtectedHeaders(masterPin)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось удалить табак');
  }

  return data.tobacco;
}

export async function addTobacco(tobacco, masterPin) {
  const response = await fetch('/api/tobaccos', {
    method: 'POST',
    headers: await buildProtectedHeaders(masterPin, true),
    body: JSON.stringify(tobacco)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось добавить позицию');
  }

  return data.tobacco;
}

export async function loadActiveMix(hookahId) {
  const response = await fetch(`/api/hookahs/${encodeURIComponent(hookahId)}/mix`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось загрузить микс');
  }

  return data;
}

export async function loadActiveMixes() {
  const response = await fetch('/api/hookahs/active-mixes', {
    headers: await buildProtectedHeaders('')
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось загрузить активные кальяны');
  }

  return data;
}

export async function loadMixHistory(period = '24h') {
  const response = await fetch(`/api/hookahs/history?period=${encodeURIComponent(period)}`, {
    headers: await buildProtectedHeaders('')
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось загрузить историю кальянов');
  }

  return data;
}

export async function saveActiveMix(hookahId, mix, masterPin) {
  const response = await fetch(`/api/hookahs/${encodeURIComponent(hookahId)}/mix`, {
    method: 'PUT',
    headers: await buildProtectedHeaders(masterPin, true),
    body: JSON.stringify(mix)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось сохранить микс');
  }

  return data.mix;
}

export async function clearActiveMix(hookahId, masterPin) {
  const response = await fetch(`/api/hookahs/${encodeURIComponent(hookahId)}/mix`, {
    method: 'DELETE',
    headers: await buildProtectedHeaders(masterPin)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось снять микс');
  }

  return data;
}

export async function createGuestOrder(order) {
  const response = await fetch('/api/guest-orders', {
    method: 'POST',
    headers: await buildProtectedHeaders('', true),
    body: JSON.stringify(order)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось отправить заказ');
  }

  return data;
}

export async function loadMyGuestOrders() {
  const response = await fetch('/api/guest-orders/mine', {
    headers: await buildProtectedHeaders('')
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось загрузить ваши заказы');
  }

  return data.orders || [];
}

export async function loadGuestOrders(statuses = []) {
  const query = statuses.length > 0
    ? `?statuses=${encodeURIComponent(statuses.join(','))}`
    : '';
  const response = await fetch(`/api/guest-orders${query}`, {
    headers: await buildProtectedHeaders('')
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось загрузить заявки гостей');
  }

  return data.orders || [];
}

export async function updateGuestOrderStatus(orderId, status, values = {}) {
  const response = await fetch(`/api/guest-orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: await buildProtectedHeaders('', true),
    body: JSON.stringify({ status, ...values })
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось обновить заказ');
  }

  return data.order;
}

export async function loadStaffProfiles() {
  const response = await fetch('/api/admin/profiles', {
    headers: await buildProtectedHeaders('')
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось загрузить сотрудников');
  }

  return data.profiles || [];
}

export async function updateStaffProfile(profileId, changes) {
  const response = await fetch(`/api/admin/profiles/${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    headers: await buildProtectedHeaders('', true),
    body: JSON.stringify(changes)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось обновить сотрудника');
  }

  return data.profile;
}
