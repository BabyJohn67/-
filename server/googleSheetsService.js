import { google } from 'googleapis';

const DEFAULT_SHEET_ID = '1Fu330axX0aYehTS7mv9EopnzM_4THrxv2d-aR0NQL4o';
const DEFAULT_SHEET_NAME = 'Табаки';
const DEFAULT_ACTIVE_MIXES_SHEET_NAME = 'Активные миксы';
const GRAMS_PER_UNIT = 8.5;
const ACTIVE_MIX_HEADERS = [
  'hookahId',
  'mixId',
  'itemsJson',
  'comment',
  'createdAt',
  'updatedAt',
  'isActive',
  'Кальян',
  'Статус',
  'Состав микса',
  'Комментарий мастера',
  'Создан',
  'Обновлен'
];

function getSheetId() {
  return process.env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID;
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_NAME || DEFAULT_SHEET_NAME;
}

function getSheetGid() {
  return Number(process.env.GOOGLE_SHEET_GID || 569579743);
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

async function ensureActiveMixesSheet() {
  const sheetName = getActiveMixesSheetName();
  await ensureSheetExists(sheetName, ACTIVE_MIX_HEADERS);

  const sheets = getSheetsClient();
  const sheetId = await getSheetTabId(sheetName);
  const values = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A1:M1`
  });
  const headers = (values.data.values?.[0] || []).map(normalizeHeader);
  const isCurrentSchema = ACTIVE_MIX_HEADERS.every((header, index) => headers[index] === normalizeHeader(header));

  if (!isCurrentSchema) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${sheetName}!A1:M1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [ACTIVE_MIX_HEADERS]
      }
    });
  }

  await formatActiveMixesSheet(sheets, sheetId);
  await repairShiftedActiveMixRows(sheets, sheetName);
  await syncReadableActiveMixRows(sheets, sheetName);
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

function isTruthyActive(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return true;
  return !['false', '0', 'no', 'нет', 'inactive', 'архив'].includes(normalized);
}

function parseJsonCell(value) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return null;
  }
}

function isShiftedActiveMixRow(row) {
  return !String(row[0] || '').trim() && String(row[1] || '').trim() && Array.isArray(parseJsonCell(row[3]));
}

async function getSheetTabId(sheetName) {
  const sheets = getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: getSheetId()
  });
  const targetSheet = spreadsheet.data.sheets?.find((sheet) => sheet.properties?.title === sheetName);

  if (!targetSheet?.properties?.sheetId && targetSheet?.properties?.sheetId !== 0) {
    throw new Error(`Вкладка "${sheetName}" не найдена в Google Таблице.`);
  }

  return targetSheet.properties.sheetId;
}

function formatHookahLabel(hookahId) {
  const normalized = String(hookahId || '').trim();
  return /^\d+$/.test(normalized) ? `Кальян №${normalized}` : normalized;
}

function formatDateCell(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value || '');
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Moscow'
  }).format(date);
}

function formatTobaccosReadable(tobaccos) {
  if (!Array.isArray(tobaccos) || tobaccos.length === 0) {
    return '';
  }

  return tobaccos
    .map((item) => {
      const title = [item.brand, item.name].filter(Boolean).join(' ').trim() || 'Табак';
      const percent = Number.isFinite(Number(item.percent)) ? `${Number(item.percent)}%` : '';
      const taste = String(item.taste || '').trim();
      return [`${title}${percent ? ` — ${percent}` : ''}`, taste].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

function buildReadableActiveMixCells(mix, isActive, updatedAt = mix.updatedAt) {
  const active = Boolean(isActive);

  return [
    formatHookahLabel(mix.hookahId),
    active ? 'Активен' : 'Снят',
    formatTobaccosReadable(mix.tobaccos),
    String(mix.comment || ''),
    formatDateCell(mix.createdAt),
    formatDateCell(updatedAt || mix.updatedAt || mix.createdAt)
  ];
}

function cellsAreEqual(left, right) {
  return left.length === right.length && left.every((value, index) => String(value || '') === String(right[index] || ''));
}

async function repairShiftedActiveMixRows(sheets, sheetName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:N`
  });
  const updates = (result.data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1)
    .filter(({ row }) => isShiftedActiveMixRow(row))
    .map(({ row, rowNumber }) => {
      const repaired = row.slice(1, 14);
      while (repaired.length < ACTIVE_MIX_HEADERS.length) repaired.push('');
      return {
        range: `${sheetName}!A${rowNumber}:N${rowNumber}`,
        values: [[...repaired.slice(0, ACTIVE_MIX_HEADERS.length), '']]
      };
    });

  if (updates.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      valueInputOption: 'RAW',
      data: updates
    }
  });
}

async function syncReadableActiveMixRows(sheets, sheetName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:N`
  });
  const updates = (result.data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1)
    .map(({ row, rowNumber }) => {
      const normalized = normalizeActiveMixFromRow(row, rowNumber);
      if (!normalized) return null;

      const expected = buildReadableActiveMixCells(
        normalized.mix,
        normalized.isActive,
        normalized.mix.updatedAt || row[5]
      );
      const current = row.slice(7, 13);

      if (cellsAreEqual(current, expected)) return null;

      return {
        range: `${sheetName}!H${rowNumber}:M${rowNumber}`,
        values: [expected]
      };
    })
    .filter(Boolean);

  if (updates.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      valueInputOption: 'RAW',
      data: updates
    }
  });
}

async function formatActiveMixesSheet(sheets, sheetId) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: {
                frozenRowCount: 1
              }
            },
            fields: 'gridProperties.frozenRowCount'
          }
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: ACTIVE_MIX_HEADERS.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.05, green: 0.05, blue: 0.05 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                textFormat: {
                  foregroundColor: { red: 0.95, green: 0.76, blue: 0.35 },
                  bold: true
                }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
          }
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 7,
              endColumnIndex: ACTIVE_MIX_HEADERS.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 0.98, blue: 0.92 },
                horizontalAlignment: 'LEFT',
                wrapStrategy: 'WRAP',
                verticalAlignment: 'TOP',
                textFormat: {
                  foregroundColor: { red: 0.08, green: 0.07, blue: 0.05 },
                  bold: false,
                  fontSize: 10
                }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,wrapStrategy,verticalAlignment,textFormat)'
          }
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 7,
              endColumnIndex: 9
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                textFormat: {
                  foregroundColor: { red: 0.08, green: 0.07, blue: 0.05 },
                  bold: true,
                  fontSize: 10
                }
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
          }
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 11,
              endColumnIndex: ACTIVE_MIX_HEADERS.length
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment)'
          }
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: 7
            },
            properties: {
              hiddenByUser: true
            },
            fields: 'hiddenByUser'
          }
        },
        ...[
          [7, 120],
          [8, 110],
          [9, 420],
          [10, 260],
          [11, 150],
          [12, 150]
        ].map(([index, pixelSize]) => ({
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: index,
              endIndex: index + 1
            },
            properties: {
              pixelSize
            },
            fields: 'pixelSize'
          }
        })),
        {
          setBasicFilter: {
            filter: {
              range: {
                sheetId,
                startRowIndex: 0,
                startColumnIndex: 0,
                endColumnIndex: ACTIVE_MIX_HEADERS.length
              }
            }
          }
        }
      ]
    }
  });
}

function normalizeActiveMixFromRow(row, rowNumber) {
  if (isShiftedActiveMixRow(row)) {
    const shifted = row.slice(1, 14);
    return normalizeActiveMixFromRow(shifted, rowNumber);
  }

  const hookahId = String(row[0] || '').trim();
  if (!hookahId) return null;

  const legacyMix = parseJsonCell(row[1]);
  if (legacyMix && typeof legacyMix === 'object' && !Array.isArray(legacyMix)) {
    return {
      rowNumber,
      isActive: isTruthyActive(row[6]),
      mix: {
        ...legacyMix,
        hookahId: String(legacyMix.hookahId || hookahId),
        tobaccos: Array.isArray(legacyMix.tobaccos) ? legacyMix.tobaccos : [],
        comment: String(legacyMix.comment || ''),
        createdAt: legacyMix.createdAt || row[2] || '',
        updatedAt: legacyMix.updatedAt || row[5] || legacyMix.createdAt || row[2] || ''
      }
    };
  }

  const items = parseJsonCell(row[2]);
  return {
    rowNumber,
    isActive: isTruthyActive(row[6]),
    mix: {
      id: String(row[1] || `mix-${hookahId}-${rowNumber}`),
      hookahId,
      tobaccos: Array.isArray(items) ? items : [],
      comment: String(row[3] || ''),
      createdAt: String(row[4] || ''),
      updatedAt: String(row[5] || row[4] || '')
    }
  };
}

async function getActiveMixRows() {
  await ensureActiveMixesSheet();

  const sheets = getSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${getActiveMixesSheetName()}!A:N`
  });

  return (result.data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1)
    .map(({ row, rowNumber }) => normalizeActiveMixFromRow(row, rowNumber))
    .filter(Boolean);
}

async function deactivateActiveMixRows(sheets, rows, hookahId, updatedAt) {
  const activeMatches = rows.filter(
    (item) => item.isActive && String(item.mix.hookahId) === String(hookahId)
  );

  await Promise.all(
    activeMatches.map(({ rowNumber, mix }) =>
      sheets.spreadsheets.values.update({
        spreadsheetId: getSheetId(),
        range: `${getActiveMixesSheetName()}!F${rowNumber}:M${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[updatedAt, 'FALSE', ...buildReadableActiveMixCells(mix, false, updatedAt)]]
        }
      })
    )
  );

  return activeMatches.length;
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
  let targetSheetName = getSheetName();

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: getSheetId(),
      range: `${targetSheetName}!A:Z`
    });

    return result.data.values || [];
  } catch (error) {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: getSheetId()
    });
    const tabs = spreadsheet.data.sheets || [];
    const gidMatch = tabs.find((sheet) => Number(sheet.properties?.sheetId) === getSheetGid());
    const firstGrid = tabs.find((sheet) => sheet.properties?.sheetType === 'GRID');

    targetSheetName = gidMatch?.properties?.title || firstGrid?.properties?.title || targetSheetName;
  }

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${targetSheetName}!A:Z`
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
  const rows = await getActiveMixRows();
  const match = rows
    .reverse()
    .find((item) => item.isActive && String(item.mix.hookahId) === String(hookahId));

  return match?.mix || null;
}

export async function readAllActiveMixesFromGoogleApi() {
  const rows = await getActiveMixRows();

  return rows.reduce((mixes, item) => {
    if (item.isActive) {
      mixes[item.mix.hookahId] = item.mix;
    }
    return mixes;
  }, {});
}

export async function saveActiveMixToGoogleApi(mix) {
  const updatedAt = new Date().toISOString();
  const sheets = getSheetsClient();
  const sheetId = await getSheetTabId(getActiveMixesSheetName());
  const rows = await getActiveMixRows();

  await deactivateActiveMixRows(sheets, rows, mix.hookahId, updatedAt);

  const values = [
    mix.hookahId,
    mix.id,
    JSON.stringify(mix.tobaccos || []),
    mix.comment || '',
    mix.createdAt,
    updatedAt,
    'TRUE',
    ...buildReadableActiveMixCells(mix, true, updatedAt)
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: [
        {
          appendCells: {
            sheetId,
            rows: [
              {
                values: values.map((value) => ({
                  userEnteredValue: {
                    stringValue: String(value || '')
                  }
                }))
              }
            ],
            fields: 'userEnteredValue'
          }
        }
      ]
    }
  });

  return {
    ...mix,
    updatedAt
  };
}

export async function clearActiveMixFromGoogleApi(hookahId) {
  const updatedAt = new Date().toISOString();
  const sheets = getSheetsClient();
  const rows = await getActiveMixRows();
  const cleared = await deactivateActiveMixRows(sheets, rows, hookahId, updatedAt);

  return {
    hookahId: String(hookahId),
    cleared
  };
}
