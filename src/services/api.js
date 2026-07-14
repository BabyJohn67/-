import { FALLBACK_MASTER_PIN } from '../config.js';

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
      activeMixStorage: data.activeMixStorage || null
    };
  } catch {
    return {
      masterPin: FALLBACK_MASTER_PIN,
      publicSiteUrl: '',
      activeMixStorage: null
    };
  }
}

export async function saveTobaccoQuantity(id, quantity, masterPin, grams) {
  const response = await fetch(`/api/tobaccos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-master-pin': masterPin
    },
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
    headers: {
      'x-master-pin': masterPin
    }
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
    headers: {
      'Content-Type': 'application/json',
      'x-master-pin': masterPin
    },
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
  const response = await fetch('/api/hookahs/active-mixes');
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось загрузить активные кальяны');
  }

  return data;
}

export async function loadMixHistory(period = '24h') {
  const response = await fetch(`/api/hookahs/history?period=${encodeURIComponent(period)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось загрузить историю кальянов');
  }

  return data;
}

export async function saveActiveMix(hookahId, mix, masterPin) {
  const response = await fetch(`/api/hookahs/${encodeURIComponent(hookahId)}/mix`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-master-pin': masterPin
    },
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
    headers: {
      'x-master-pin': masterPin
    }
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Не удалось снять микс');
  }

  return data;
}
