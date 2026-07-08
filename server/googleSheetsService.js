import { google } from 'googleapis';

const DEFAULT_SHEET_ID = '1Fu330axX0aYehTS7mv9EopnzM_4THrxv2d-aR0NQL4o';
const DEFAULT_SHEET_NAME = 'Табаки';
const DEFAULT_ACTIVE_MIXES_SHEET_NAME = 'Активные миксы';
const GRAMS_PER_UNIT = 8.5;

function getSheetId() {
  return process.env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID;
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_NAME || DEFAULT_SHEET_NAME;
}

function getActiveMixesSheetName() {
  return process.env.GOOGLE_ACTIVE_MIXES_SHEET_NAME || DEFAULT_ACTIVE_MIXES_SHEET_NAME;
}

function getPrivateKey() {
  return process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
}

export function hasGoogleCredentials() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && getPrivateKey());
}

function getSheetsClient() {
  if (!hasGoogleCredentials()) {
    throw new Error('Google Sheets API не настроен: добавьте GOOGLE_SERVICE_ACCOUNT_EMAIL и GOOGLE_PRIVATE_KEY в .env');
  }

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: getPrivateKey(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return google.sheets({ version: 'v4', auth });
}

async function ensureSheetExists(sheetName, headers) {
  const sheets = getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: getSheetId()
  });
  const exists = spreadsheet.data.sheets?.some((sheet) => sheet.properties?.title === sheetName);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }
        ]
      }
    });
  }

  const values = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A1:Z1`
  });

  if (!values.data.values?.[0]?.some(Boolean)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${sheetName}!A1:${columnToLetter(headers.length - 1)}1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers]
      }
    });
  }
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function findColumn(headers, variants, fallbackIndex) {
  const index = headers.findIndex((header) =>
    variants.some((variant) => header.includes(variant))
  );
  return index >= 0 ? index : fallbackIndex;
}

function parseQuantity(value) {
  const normalized = String(value || '').replace(',', '.').match(/\d+(\.\d+)?/);
  return normalized ? Number(normalized[0]) : 0;
}

function columnToLetter(index) {
  let column = index + 1;
  let letter = '';

  while (column > 0) {
    const remainder = (column - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    column = Math.floor((column - 1) / 26);
  }

  return letter;
}

function detectBrand(name) {
  const normalized = String(name || '').trim().toLowerCase();
  const brandMap = [
    ['северный', 'СЕВЕРНЫЙ'],
    ['darkside', 'Darkside'],
    ['ds ', 'Darkside'],
    ['bb25 ', 'BlackBurn'],
    ['bb ', 'BlackBurn'],
    ['blackburn', 'BlackBurn'],
    ['od25 ', 'Overdose'],
    ['od ', 'Overdose'],
    ['sl ', 'Sebero'],
    ['mh ', 'Musthave'],
    ['musthave', 'Musthave'],
    ['naш ', 'NAШ'],
    ['nаш ', 'NAШ'],
    ['sb25 ', 'Smoke Box'],
    ['sb ', 'Smoke Box'],
    ['satyr', 'SATYR'],
    ['deus', 'DEUS'],
    ['bonche', 'Bonche'],
    ['jent', 'JENT'],
    ['tr125', 'Trofimoff'],
    ['spectrum', 'Spectrum'],
    ['adalya', 'Adalya'],
    ['oven', 'Oven'],
    ['kraken', 'Kraken'],
    ['frigate', 'Frigate'],
    ['dogma', 'Dogma']
  ];

  const match = brandMap.find(([prefix]) => normalized.startsWith(prefix));
  if (match) return match[1];

  return String(name || 'Другое').trim().split(/\s+/)[0] || 'Другое';
}

function buildTobacco(row, rowIndex, nameIndex, quantityIndex, tasteIndex, layout) {
  const quantity = parseQuantity(row[quantityIndex]);
  const name = String(row[nameIndex] || '').trim();
  const taste = String(row[tasteIndex] || '').trim();
  const rowNumber = rowIndex + 1;

  return {
    id: `${rowNumber}-${name || 'tobacco'}`,
    rowNumber,
    nameColumn: columnToLetter(nameIndex),
    quantityColumn: columnToLetter(quantityIndex),
    tasteColumn: columnToLetter(tasteIndex),
    layout,
    name: name || 'Без названия',
    brand: detectBrand(name),
    quantity,
    grams: Math.round(quantity * GRAMS_PER_UNIT * 10) / 10,
    taste: taste || 'Вкус не указан',
    inStock: quantity > 0
  };
}

export function rowsToTobaccos(rows) {
  if (rows.length === 0) return [];

  const blockRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const number = String(row[1] || '').trim();
      const name = String(row[2] || '').trim();
      const quantity = String(row[3] || '').trim();
      return /^\d+$/.test(number) && name && quantity !== '';
    })
    .map(({ row, index }) => buildTobacco(row, index, 2, 3, 4, 'block'));

  if (blockRows.length > 0) {
    return blockRows;
  }

  const headers = rows[0].map(normalizeHeader);
  const nameIndex = findColumn(headers, ['наименование', 'название', 'табак', 'name'], 0);
  const quantityIndex = findColumn(headers, ['количество', 'кол/во', 'остаток', 'шт', 'quantity'], 1);
  const tasteIndex = findColumn(headers, ['перевод', 'вкус', 'flavor', 'taste'], 2);

  return rows
    .slice(1)
    .map((row, index) => buildTobacco(row, index + 1, nameIndex, quantityIndex, tasteIndex, 'headers'))
    .filter((item) => item.name !== 'Без названия' || item.taste !== 'Вкус не указан');
}

async function getSheetRows() {
  const sheets = getSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${getSheetName()}!A:Z`
  });

  return result.data.values || [];
}

export async function readTobaccosFromGoogleApi() {
  const rows = await getSheetRows();
  const tobaccos = rowsToTobaccos(rows);

  if (tobaccos.length === 0) {
    throw new Error('Google Sheet did not contain recognizable tobacco rows');
  }

  return tobaccos;
}

export async function updateTobaccoQuantity({ id, quantity }) {
  const sheets = getSheetsClient();
  const tobaccos = rowsToTobaccos(await getSheetRows());
  const tobacco = tobaccos.find((item) => item.id === id);

  if (!tobacco) {
    throw new Error('Позиция не найдена в Google Таблице. Обновите список и попробуйте снова.');
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${getSheetName()}!${tobacco.quantityColumn}${tobacco.rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[quantity]]
    }
  });

  return {
    ...tobacco,
    quantity,
    grams: Math.round(quantity * GRAMS_PER_UNIT * 10) / 10,
    inStock: quantity > 0
  };
}

export async function appendTobacco({ name, quantity, taste }) {
  const sheets = getSheetsClient();
  const rows = await getSheetRows();
  const existing = rowsToTobaccos(rows);
  const layout = existing[0]?.layout || 'headers';
  const nextNumber = existing.length + 1;
  const values = layout === 'block'
    ? [[nextNumber, name, quantity, taste]]
    : [[name, quantity, taste]];
  const range = layout === 'block' ? `${getSheetName()}!B:E` : `${getSheetName()}!A:C`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values
    }
  });

  const refreshed = rowsToTobaccos(await getSheetRows());
  return refreshed.find((item) => item.name === name && item.taste === taste) || {
    id: `${Date.now()}-${name}`,
    name,
    brand: detectBrand(name),
    quantity,
    grams: Math.round(quantity * GRAMS_PER_UNIT * 10) / 10,
    taste,
    inStock: quantity > 0
  };
}

export async function readActiveMixFromGoogleApi(hookahId) {
  await ensureSheetExists(getActiveMixesSheetName(), ['hookahId', 'mixJson', 'createdAt']);

  const sheets = getSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${getActiveMixesSheetName()}!A:C`
  });
  const rows = result.data.values || [];
  const match = rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1)
    .reverse()
    .find(({ row }) => String(row[0] || '').trim() === String(hookahId));

  if (!match) return null;

  try {
    return JSON.parse(match.row[1]);
  } catch {
    return null;
  }
}

export async function saveActiveMixToGoogleApi(mix) {
  await ensureSheetExists(getActiveMixesSheetName(), ['hookahId', 'mixJson', 'createdAt']);

  const sheets = getSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${getActiveMixesSheetName()}!A:C`
  });
  const rows = result.data.values || [];
  const existing = rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1)
    .find(({ row }) => String(row[0] || '').trim() === String(mix.hookahId));
  const values = [[mix.hookahId, JSON.stringify(mix), mix.createdAt]];

  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${getActiveMixesSheetName()}!A${existing.rowNumber}:C${existing.rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: {
        values
      }
    });
    return mix;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${getActiveMixesSheetName()}!A:C`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values
    }
  });

  return mix;
}
