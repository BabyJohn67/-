import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendTobacco,
  clearActiveMixFromGoogleApi,
  deleteTobaccoFromGoogleApi,
  hasGoogleCredentials,
  readAllActiveMixesFromGoogleApi,
  readActiveMixFromGoogleApi,
  readMixHistoryFromGoogleApi,
  readTobaccosFromGoogleApi,
  rowsToTobaccos as rowsToTobaccosFromSheet,
  saveActiveMixWithInventoryToGoogleApi,
  updateTobaccoQuantity
} from './googleSheetsService.js';
import { assertInventoryStorageAvailable } from './inventoryMath.js';
import {
  isSupabaseAuthConfigured,
  isSupabaseAuthEnabled,
  listProfiles,
  requireAdmin,
  requireAuth,
  requireMaster,
  updateOwnProfile,
  updateProfileAsAdmin
} from './auth/supabaseAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    let value = valueParts.join('=').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const app = express();

const PORT = Number(process.env.PORT || 4173);
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1Fu330axX0aYehTS7mv9EopnzM_4THrxv2d-aR0NQL4o';
const SHEET_GID = process.env.GOOGLE_SHEET_GID || '569579743';
const MASTER_PIN = process.env.MASTER_PIN || '2580';
const DATA_DIR = path.join(__dirname, 'data');
const ACTIVE_MIXES_PATH = path.join(DATA_DIR, 'activeMixes.json');
const MIX_HISTORY_PATH = path.join(DATA_DIR, 'mixHistory.json');

app.use(express.json());

function readActiveMixes() {
  if (!fs.existsSync(ACTIVE_MIXES_PATH)) return {};

  try {
    return JSON.parse(fs.readFileSync(ACTIVE_MIXES_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeActiveMixes(mixes) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ACTIVE_MIXES_PATH, `${JSON.stringify(mixes, null, 2)}\n`);
}

function readMixHistory() {
  if (!fs.existsSync(MIX_HISTORY_PATH)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(MIX_HISTORY_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMixHistory(history) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MIX_HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`);
}

function appendMixHistory(mix, status, closedAt = new Date().toISOString()) {
  if (!mix) return;

  const history = readMixHistory();
  history.push({
    ...mix,
    closedAt,
    status
  });
  writeMixHistory(history);
}

function filterMixHistoryByPeriod(history, period) {
  if (period === 'all') return history;

  const now = Date.now();
  const periodHours = {
    '24h': 24,
    '3d': 24 * 3,
    week: 24 * 7,
    month: 24 * 30
  };
  const hours = periodHours[period] || periodHours['24h'];
  const border = now - hours * 60 * 60 * 1000;

  return history.filter((item) => {
    const timestamp = new Date(item.closedAt || item.updatedAt || item.createdAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= border;
  });
}

function getActiveMixStorageInfo() {
  const isGoogleSheets = hasGoogleCredentials();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isGoogleSheets) {
    return {
      mode: 'google-sheets',
      label: 'Google Таблица',
      isPersistent: true,
      warning: ''
    };
  }

  return {
    mode: 'local-json',
    label: 'Локальный JSON',
    isPersistent: false,
    warning: isProduction
      ? 'Активные миксы сейчас сохраняются во временный файл Render. После перезапуска или redeploy они могут пропасть. Добавьте GOOGLE_SERVICE_ACCOUNT_EMAIL и GOOGLE_PRIVATE_KEY.'
      : 'Активные миксы сохраняются локально в server/data/activeMixes.json. Это удобно для разработки, но не подходит как основное хранилище на Render.'
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function requireMasterPin(request, response, next) {
  // Временная защита для записи. Позже здесь лучше подключить нормальную авторизацию мастера.
  if (request.get('x-master-pin') !== MASTER_PIN) {
    response.status(401).json({ message: 'Нужен PIN мастера для сохранения изменений.' });
    return;
  }

  next();
}

function runMiddlewareChain(middlewares, request, response, next) {
  let index = 0;

  function run(error) {
    if (error) {
      next(error);
      return;
    }

    const middleware = middlewares[index];
    index += 1;
    if (!middleware) {
      next();
      return;
    }

    middleware(request, response, run);
  }

  run();
}

function requireMasterAccess(request, response, next) {
  if (!isSupabaseAuthEnabled()) {
    requireMasterPin(request, response, next);
    return;
  }

  runMiddlewareChain(requireMaster, request, response, next);
}

function requireMasterReadAccess(request, response, next) {
  if (!isSupabaseAuthEnabled()) {
    next();
    return;
  }

  runMiddlewareChain(requireMaster, request, response, next);
}

function normalizeMixFormat(value) {
  if (!value || typeof value !== 'object') return null;

  const format = {
    id: String(value.id || '').trim(),
    title: String(value.title || '').trim(),
    variantId: String(value.variantId || value.id || '').trim(),
    variantTitle: String(value.variantTitle || value.title || '').trim(),
    priceLabel: String(value.priceLabel || '').trim()
  };

  return format.id && format.title && format.variantId && format.variantTitle ? format : null;
}

app.get('/api/config', (_request, response) => {
  const supabaseEnabled = isSupabaseAuthEnabled();
  const config = {
    publicSiteUrl: process.env.PUBLIC_SITE_URL || '',
    activeMixStorage: getActiveMixStorageInfo(),
    auth: {
      mode: supabaseEnabled ? 'supabase' : 'legacy-pin',
      enabled: supabaseEnabled,
      configured: isSupabaseAuthConfigured()
    }
  };

  if (!supabaseEnabled) {
    config.masterPin = MASTER_PIN;
  }

  response.json(config);
});

app.get('/api/auth/me', requireAuth, (request, response) => {
  response.json({ user: request.auth.user, profile: request.auth.profile });
});

app.patch('/api/auth/profile', requireAuth, async (request, response) => {
  const name = String(request.body.name || '').trim();
  const phone = String(request.body.phone || '').trim();

  if (name.length < 2 || name.length > 100) {
    response.status(400).json({ message: 'Имя должно содержать от 2 до 100 символов.' });
    return;
  }

  if (phone.length > 40) {
    response.status(400).json({ message: 'Номер телефона слишком длинный.' });
    return;
  }

  try {
    const profile = await updateOwnProfile(request.auth.user.id, { name, phone });
    response.json({ profile });
  } catch {
    response.status(500).json({ message: 'Не удалось обновить профиль.' });
  }
});

app.get('/api/admin/profiles', ...requireAdmin, async (_request, response) => {
  try {
    response.json({ profiles: await listProfiles() });
  } catch {
    response.status(500).json({ message: 'Не удалось загрузить пользователей.' });
  }
});

app.patch('/api/admin/profiles/:profileId', ...requireAdmin, async (request, response) => {
  const role = String(request.body.role || '').trim();
  const isActive = request.body.is_active;
  const changes = {};

  if (role) {
    if (!['guest', 'master', 'admin'].includes(role)) {
      response.status(400).json({ message: 'Неизвестная роль пользователя.' });
      return;
    }
    changes.role = role;
  }

  if (typeof isActive === 'boolean') {
    changes.is_active = isActive;
  }

  if (Object.keys(changes).length === 0) {
    response.status(400).json({ message: 'Нет изменений для сохранения.' });
    return;
  }

  try {
    const profile = await updateProfileAsAdmin(request.params.profileId, changes);
    response.json({ profile });
  } catch {
    response.status(500).json({ message: 'Не удалось обновить пользователя.' });
  }
});

app.get('/api/hookahs/active-mixes', requireMasterReadAccess, (_request, response) => {
  if (hasGoogleCredentials()) {
    readAllActiveMixesFromGoogleApi()
      .then((mixes) => {
        response.json({
          mixes,
          storage: getActiveMixStorageInfo()
        });
      })
      .catch((error) => {
        response.status(500).json({
          message: 'Не удалось загрузить активные миксы',
          details: error.message,
          storage: getActiveMixStorageInfo()
        });
      });
    return;
  }

  response.json({
    mixes: readActiveMixes(),
    storage: getActiveMixStorageInfo()
  });
});

app.get('/api/hookahs/history', requireMasterReadAccess, (request, response) => {
  const period = String(request.query.period || '24h');

  if (hasGoogleCredentials()) {
    readMixHistoryFromGoogleApi()
      .then((history) => {
        response.json({
          period,
          history: filterMixHistoryByPeriod(history, period),
          storage: getActiveMixStorageInfo()
        });
      })
      .catch((error) => {
        response.status(500).json({
          message: 'Не удалось загрузить историю кальянов',
          details: error.message,
          storage: getActiveMixStorageInfo()
        });
      });
    return;
  }

  response.json({
    period,
    history: filterMixHistoryByPeriod(readMixHistory(), period).sort((left, right) => {
      const leftDate = new Date(left.closedAt || left.updatedAt || left.createdAt).getTime() || 0;
      const rightDate = new Date(right.closedAt || right.updatedAt || right.createdAt).getTime() || 0;
      return rightDate - leftDate;
    }),
    storage: getActiveMixStorageInfo()
  });
});

app.get('/api/hookahs/:hookahId/mix', (request, response) => {
  const hookahId = String(request.params.hookahId || '').trim();

  if (hasGoogleCredentials()) {
    readActiveMixFromGoogleApi(hookahId)
      .then((mix) => {
        response.json({ hookahId, mix, storage: getActiveMixStorageInfo() });
      })
      .catch((error) => {
        response.status(500).json({
          message: 'Не удалось загрузить активный микс',
          details: error.message,
          storage: getActiveMixStorageInfo()
        });
      });
    return;
  }

  const mixes = readActiveMixes();
  response.json({ hookahId, mix: mixes[hookahId] || null, storage: getActiveMixStorageInfo() });
});

app.put('/api/hookahs/:hookahId/mix', requireMasterAccess, async (request, response) => {
  const hookahId = String(request.params.hookahId || '').trim();
  const tobaccos = Array.isArray(request.body.tobaccos) ? request.body.tobaccos : [];
  const comment = String(request.body.comment || '').trim();
  const format = normalizeMixFormat(request.body.format);
  const requestId = String(request.body.requestId || '').trim();
  const expectedActiveMixId = String(request.body.expectedActiveMixId || '').trim();

  if (!/^\d+$/.test(hookahId)) {
    response.status(400).json({ message: 'Укажите номер кальяна.' });
    return;
  }

  if (Number(hookahId) < 1 || Number(hookahId) > 10) {
    response.status(404).json({ message: 'Такой кальян не найден.' });
    return;
  }

  if (!requestId) {
    response.status(400).json({ message: 'Не удалось определить заказ. Повторите сохранение.' });
    return;
  }

  const normalizedTobaccos = tobaccos.map((item) => ({
      id: String(item.id || ''),
      brand: String(item.brand || '').trim(),
      name: String(item.name || '').trim(),
      taste: String(item.taste || '').trim(),
      percent: Number(item.percent || 0)
    }));

  if (normalizedTobaccos.length === 0) {
    response.status(400).json({ message: 'Добавьте хотя бы один табак в микс.' });
    return;
  }

  if (normalizedTobaccos.some((item) => !item.id || !item.name || !Number.isFinite(item.percent) || item.percent <= 0)) {
    response.status(400).json({ message: 'Проверьте выбранные табаки и проценты.' });
    return;
  }

  const totalPercent = normalizedTobaccos.reduce((sum, item) => sum + item.percent, 0);

  if (Math.abs(totalPercent - 100) > 0.01) {
    response.status(400).json({ message: 'Сумма процентов в миксе должна быть ровно 100%.' });
    return;
  }

  try {
    assertInventoryStorageAvailable(hasGoogleCredentials());
  } catch (error) {
    response.status(503).json({
      message: error.message,
      code: error.code,
      storage: getActiveMixStorageInfo()
    });
    return;
  }

  const mix = {
    id: requestId,
    hookahId,
    tobaccos: normalizedTobaccos,
    format,
    comment,
    createdAt: new Date().toISOString()
  };

  try {
    const result = await saveActiveMixWithInventoryToGoogleApi({
      mix,
      requestId,
      expectedActiveMixId
    });
    response.json({
      mix: result.mix,
      inventory: result.inventory,
      duplicate: result.duplicate,
      storage: getActiveMixStorageInfo()
    });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (statusCode >= 500) {
      console.error('[inventory] Не удалось создать заказ:', error.message);
    }
    response.status(statusCode).json({
      message: statusCode >= 500 ? 'Не удалось обновить склад. Заказ не создан.' : error.message,
      code: error.code || 'INVENTORY_OPERATION_FAILED',
      details: statusCode < 500 ? error.details : undefined,
      storage: getActiveMixStorageInfo()
    });
  }
});

app.delete('/api/hookahs/:hookahId/mix', requireMasterAccess, (request, response) => {
  const hookahId = String(request.params.hookahId || '').trim();

  if (!hookahId) {
    response.status(400).json({ message: 'Укажите номер кальяна.' });
    return;
  }

  if (hasGoogleCredentials()) {
    clearActiveMixFromGoogleApi(hookahId)
      .then(() => {
        response.json({ hookahId, mix: null, storage: getActiveMixStorageInfo() });
      })
      .catch((error) => {
        response.status(500).json({
          message: 'Не удалось снять активный микс',
          details: error.message,
          storage: getActiveMixStorageInfo()
        });
      });
    return;
  }

  const mixes = readActiveMixes();
  if (mixes[hookahId]) {
    appendMixHistory(mixes[hookahId], 'Снят');
  }
  delete mixes[hookahId];
  writeActiveMixes(mixes);

  response.json({ hookahId, mix: null, storage: getActiveMixStorageInfo() });
});

app.get('/api/tobaccos', async (_request, response) => {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  let googleApiError = null;

  try {
    if (hasGoogleCredentials()) {
      try {
        const tobaccos = await readTobaccosFromGoogleApi();
        response.json({
          source: 'google-sheets-api',
          tobaccos
        });
        return;
      } catch (error) {
        googleApiError = error;
      }
    }

    const sheetResponse = await fetch(csvUrl);

    if (!sheetResponse.ok) {
      throw new Error(`Google Sheets answered with ${sheetResponse.status}`);
    }

    const csv = await sheetResponse.text();
    const rows = parseCsv(csv);
    const tobaccos = rowsToTobaccosFromSheet(rows);

    if (tobaccos.length === 0) {
      throw new Error('Google Sheet did not contain recognizable tobacco rows');
    }

    response.json({
      source: 'google-sheet',
      tobaccos
    });
  } catch (error) {
    response.status(502).json({
      source: 'fallback-needed',
      message: 'Не удалось загрузить список табаков',
      details: googleApiError ? `${googleApiError.message}; CSV fallback: ${error.message}` : error.message
    });
  }
});

app.patch('/api/tobaccos/:id', requireMasterAccess, async (request, response) => {
  try {
    const quantity = Number(request.body.quantity);
    const hasGrams = request.body.grams !== undefined;
    const grams = Number(request.body.grams);

    if ((hasGrams && (!Number.isFinite(grams) || grams < 0)) || (!hasGrams && (!Number.isFinite(quantity) || quantity < 0))) {
      response.status(400).json({ message: 'Остаток должен быть числом от 0 и выше.' });
      return;
    }

    const tobacco = await updateTobaccoQuantity({
      id: request.params.id,
      quantity,
      grams: hasGrams ? grams : undefined
    });

    response.json({ tobacco });
  } catch (error) {
    response.status(500).json({
      message: 'Не удалось сохранить количество в Google Таблицу',
      details: error.message
    });
  }
});

app.delete('/api/tobaccos/:id', requireMasterAccess, async (request, response) => {
  try {
    const tobacco = await deleteTobaccoFromGoogleApi(request.params.id);
    response.json({ tobacco, deleted: true });
  } catch (error) {
    response.status(Number(error.statusCode) || 500).json({
      message: error.statusCode === 404
        ? error.message
        : 'Не удалось удалить табак из Google Таблицы',
      details: error.statusCode === 404 ? undefined : error.message
    });
  }
});

app.post('/api/tobaccos', requireMasterAccess, async (request, response) => {
  try {
    const name = String(request.body.name || '').trim();
    const taste = String(request.body.taste || '').trim();
    const quantity = Number(request.body.quantity || 0);
    const hasGrams = request.body.grams !== undefined;
    const grams = Number(request.body.grams);

    if (!name || !taste) {
      response.status(400).json({ message: 'Заполните наименование и перевод / вкус.' });
      return;
    }

    if ((hasGrams && (!Number.isFinite(grams) || grams < 0)) || (!hasGrams && (!Number.isFinite(quantity) || quantity < 0))) {
      response.status(400).json({ message: 'Остаток должен быть числом от 0 и выше.' });
      return;
    }

    const tobacco = await appendTobacco({
      name,
      taste,
      quantity,
      grams: hasGrams ? grams : undefined
    });

    response.status(201).json({ tobacco });
  } catch (error) {
    response.status(500).json({
      message: 'Не удалось добавить позицию в Google Таблицу',
      details: error.message
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'dist');
  app.use(express.static(clientDist));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(clientDist, 'index.html'));
  });
}

const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

const server = app.listen(PORT, HOST, () => {
  console.log(`Hookah QR server is running on http://${HOST}:${PORT}`);
});

globalThis.hookahQrServer = server;
globalThis.hookahQrKeepAlive = setInterval(() => {}, 60_000);
