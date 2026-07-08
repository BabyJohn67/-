import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendTobacco,
  hasGoogleCredentials,
  readActiveMixFromGoogleApi,
  readTobaccosFromGoogleApi,
  rowsToTobaccos as rowsToTobaccosFromSheet,
  saveActiveMixToGoogleApi,
  updateTobaccoQuantity
} from './googleSheetsService.js';

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

app.get('/api/config', (_request, response) => {
  response.json({
    masterPin: MASTER_PIN,
    publicSiteUrl: process.env.PUBLIC_SITE_URL || ''
  });
});

app.get('/api/hookahs/:hookahId/mix', (request, response) => {
  const hookahId = String(request.params.hookahId || '').trim();

  if (hasGoogleCredentials()) {
    readActiveMixFromGoogleApi(hookahId)
      .then((mix) => {
        response.json({ hookahId, mix });
      })
      .catch((error) => {
        response.status(500).json({
          message: 'Не удалось загрузить активный микс',
          details: error.message
        });
      });
    return;
  }

  const mixes = readActiveMixes();
  response.json({ hookahId, mix: mixes[hookahId] || null });
});

app.put('/api/hookahs/:hookahId/mix', requireMasterPin, (request, response) => {
  const hookahId = String(request.params.hookahId || '').trim();
  const tobaccos = Array.isArray(request.body.tobaccos) ? request.body.tobaccos : [];
  const comment = String(request.body.comment || '').trim();

  if (!hookahId) {
    response.status(400).json({ message: 'Укажите номер кальяна.' });
    return;
  }

  const normalizedTobaccos = tobaccos
    .map((item) => ({
      id: String(item.id || ''),
      brand: String(item.brand || '').trim(),
      name: String(item.name || '').trim(),
      taste: String(item.taste || '').trim(),
      percent: Number(item.percent || 0)
    }))
    .filter((item) => item.name && Number.isFinite(item.percent) && item.percent > 0);

  if (normalizedTobaccos.length === 0) {
    response.status(400).json({ message: 'Добавьте хотя бы один табак в микс.' });
    return;
  }

  const totalPercent = normalizedTobaccos.reduce((sum, item) => sum + item.percent, 0);

  if (Math.abs(totalPercent - 100) > 0.001) {
    response.status(400).json({ message: 'Сумма процентов в миксе должна быть ровно 100%.' });
    return;
  }

  const mix = {
    id: `mix-${hookahId}-${Date.now()}`,
    hookahId,
    tobaccos: normalizedTobaccos,
    comment,
    createdAt: new Date().toISOString()
  };

  if (hasGoogleCredentials()) {
    saveActiveMixToGoogleApi(mix)
      .then((savedMix) => {
        response.json({ mix: savedMix });
      })
      .catch((error) => {
        response.status(500).json({
          message: 'Не удалось сохранить активный микс',
          details: error.message
        });
      });
    return;
  }

  const mixes = readActiveMixes();
  mixes[hookahId] = mix;
  writeActiveMixes(mixes);

  response.json({ mix });
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

app.patch('/api/tobaccos/:id', requireMasterPin, async (request, response) => {
  try {
    const quantity = Number(request.body.quantity);

    if (!Number.isFinite(quantity) || quantity < 0) {
      response.status(400).json({ message: 'Количество должно быть числом от 0 и выше.' });
      return;
    }

    const tobacco = await updateTobaccoQuantity({
      id: request.params.id,
      quantity
    });

    response.json({ tobacco });
  } catch (error) {
    response.status(500).json({
      message: 'Не удалось сохранить количество в Google Таблицу',
      details: error.message
    });
  }
});

app.post('/api/tobaccos', requireMasterPin, async (request, response) => {
  try {
    const name = String(request.body.name || '').trim();
    const taste = String(request.body.taste || '').trim();
    const quantity = Number(request.body.quantity || 0);

    if (!name || !taste) {
      response.status(400).json({ message: 'Заполните наименование и перевод / вкус.' });
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      response.status(400).json({ message: 'Количество должно быть числом от 0 и выше.' });
      return;
    }

    const tobacco = await appendTobacco({
      name,
      taste,
      quantity
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
