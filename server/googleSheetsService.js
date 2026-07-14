import { google } from 'googleapis';
import {
  GRAMS_PER_UNIT,
  buildInventoryDeductionPlan,
  calculateGramsByUnits,
  calculateUnitsByGrams,
  isInventoryRequestProcessed,
  roundInventoryValue
} from './inventoryMath.js';

const DEFAULT_SHEET_ID = '1Fu330axX0aYehTS7mv9EopnzM_4THrxv2d-aR0NQL4o';
const DEFAULT_SHEET_NAME = 'Табаки';
const DEFAULT_ACTIVE_MIXES_SHEET_NAME = 'Активные миксы';
const DEFAULT_MIX_HISTORY_SHEET_NAME = 'История заказов';
const DEFAULT_INVENTORY_MOVEMENT_SHEET_NAME = 'Движение склада';
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
const MIX_HISTORY_HEADERS = [
  'hookahId',
  'mixId',
  'itemsJson',
  'comment',
  'createdAt',
  'closedAt',
  'status',
  'Кальян',
  'Статус',
  'Состав микса',
  'Комментарий мастера',
  'Создан',
  'Снят'
];
const INVENTORY_MOVEMENT_HEADERS = [
  'Дата',
  'Тип операции',
  'ID заказа',
  'Номер кальяна',
  'Табак',
  'Процент',
  'Списано грамм',
  'Списано единиц',
  'Остаток грамм',
  'Остаток единиц',
  'Комментарий'
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

function getMixHistorySheetName() {
  return process.env.GOOGLE_MIX_HISTORY_SHEET_NAME || DEFAULT_MIX_HISTORY_SHEET_NAME;
}

function getInventoryMovementSheetName() {
  return process.env.GOOGLE_INVENTORY_MOVEMENT_SHEET_NAME || DEFAULT_INVENTORY_MOVEMENT_SHEET_NAME;
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
  await archiveSupersededActiveMixRows(sheets, sheetName);
  await archiveInactiveActiveMixRows(sheets, sheetName);
  await removeMalformedActiveMixRows(sheets, sheetName);
  await syncReadableActiveMixRows(sheets, sheetName);
}

async function ensureMixHistorySheet() {
  const sheetName = getMixHistorySheetName();
  await ensureSheetExists(sheetName, MIX_HISTORY_HEADERS);

  const sheets = getSheetsClient();
  const sheetId = await getSheetTabId(sheetName);
  const values = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A1:M1`
  });
  const headers = (values.data.values?.[0] || []).map(normalizeHeader);
  const isCurrentSchema = MIX_HISTORY_HEADERS.every((header, index) => headers[index] === normalizeHeader(header));

  if (!isCurrentSchema) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${sheetName}!A1:M1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [MIX_HISTORY_HEADERS]
      }
    });
  }

  await formatMixHistorySheet(sheets, sheetId);
  await repairMixHistoryRows(sheets, sheetName);
}

async function ensureInventoryMovementSheet() {
  const sheetName = getInventoryMovementSheetName();
  await ensureSheetExists(sheetName, INVENTORY_MOVEMENT_HEADERS);

  const sheets = getSheetsClient();
  const sheetId = await getSheetTabId(sheetName);
  const values = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A1:K1`
  });
  const headers = (values.data.values?.[0] || []).map(normalizeHeader);
  const isCurrentSchema = INVENTORY_MOVEMENT_HEADERS.every(
    (header, index) => headers[index] === normalizeHeader(header)
  );

  if (!isCurrentSchema) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${sheetName}!A1:K1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [INVENTORY_MOVEMENT_HEADERS]
      }
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1 }
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
              endColumnIndex: INVENTORY_MOVEMENT_HEADERS.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.05, green: 0.05, blue: 0.05 },
                horizontalAlignment: 'CENTER',
                textFormat: {
                  foregroundColor: { red: 0.95, green: 0.76, blue: 0.35 },
                  bold: true
                }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
          }
        }
      ]
    }
  });
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
    ['sl ', 'StarLine'],
    ['mh ', 'Musthave'],
    ['musthave', 'Musthave'],
    ['naш ', 'NAШ'],
    ['nаш ', 'NAШ'],
    ['sb25 ', 'Sebero'],
    ['sb ', 'Sebero'],
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

function normalizeBrandKey(value) {
  const key = String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '');

  const aliases = {
    разное: 'другое',
    trofimoffs: 'trofimoff'
  };

  return aliases[key] || key;
}

function isTruthyActive(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return true;
  return !['false', '0', 'no', 'нет', 'inactive', 'архив'].includes(normalized);
}

function isActiveMarker(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', 'false', '1', '0', 'yes', 'no', 'да', 'нет', 'active', 'inactive', 'активен', 'снят'].includes(normalized);
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

function isReadablePartShiftedRight(row) {
  return Boolean(
    String(row[0] || '').trim() &&
    Array.isArray(parseJsonCell(row[2])) &&
    !String(row[6] || '').trim() &&
    isActiveMarker(row[7])
  );
}

function repairReadablePartShiftedRight(row) {
  return [
    row[0] || '',
    row[1] || '',
    row[2] || '',
    row[3] || '',
    row[4] || '',
    row[5] || '',
    row[7] || '',
    row[8] || '',
    row[9] || '',
    row[10] || '',
    row[11] || '',
    row[12] || '',
    row[13] || ''
  ];
}

function parseHookahIdFromReadableLabel(value) {
  const match = String(value || '').match(/кальян\s*№?\s*(\d+)/i);
  return match ? match[1] : '';
}

function getReadableActiveMixHookahId(row) {
  return parseHookahIdFromReadableLabel(row[7]) || parseHookahIdFromReadableLabel(row[8]);
}

function looksLikeReadableActiveMixRow(row) {
  const status = String(row[8] || row[9] || '').trim().toLowerCase();
  return Boolean(getReadableActiveMixHookahId(row) && ['активен', 'микс назначен'].includes(status));
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

function formatMixFormatReadable(format) {
  if (!format) return '';

  const title = [format.title, format.variantTitle].filter(Boolean).join(' - ');
  return [title, format.priceLabel].filter(Boolean).join('\n');
}

function buildReadableActiveMixCells(mix, isActive, updatedAt = mix.updatedAt) {
  const active = Boolean(isActive);
  const commentLines = [
    formatMixFormatReadable(mix.format),
    String(mix.comment || '')
  ].filter(Boolean);

  return [
    formatHookahLabel(mix.hookahId),
    active ? 'Активен' : 'Снят',
    formatTobaccosReadable(mix.tobaccos),
    commentLines.join('\n\n'),
    formatDateCell(mix.createdAt),
    formatDateCell(updatedAt || mix.updatedAt || mix.createdAt)
  ];
}

function buildReadableMixHistoryCells(record) {
  const commentLines = [
    formatMixFormatReadable(record.format),
    String(record.comment || '')
  ].filter(Boolean);

  return [
    formatHookahLabel(record.hookahId),
    record.status || 'Снят',
    formatTobaccosReadable(record.tobaccos),
    commentLines.join('\n\n'),
    formatDateCell(record.createdAt),
    formatDateCell(record.closedAt || record.updatedAt || record.createdAt)
  ];
}

function buildMixHistoryStorageRow(record) {
  return [
    record.hookahId,
    record.id,
    JSON.stringify({
      tobaccos: record.tobaccos || [],
      format: record.format || null
    }),
    record.comment || '',
    record.createdAt,
    record.closedAt,
    record.status,
    ...buildReadableMixHistoryCells(record)
  ];
}

function normalizeMixItems(value) {
  if (Array.isArray(value)) {
    return {
      tobaccos: value,
      format: null
    };
  }

  if (value && typeof value === 'object') {
    return {
      tobaccos: Array.isArray(value.tobaccos) ? value.tobaccos : [],
      format: value.format && typeof value.format === 'object' ? value.format : null
    };
  }

  return {
    tobaccos: [],
    format: null
  };
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
    .map(({ row, rowNumber }) => {
      if (isReadablePartShiftedRight(row)) {
        return {
          range: `${sheetName}!A${rowNumber}:N${rowNumber}`,
          values: [[...repairReadablePartShiftedRight(row), '']]
        };
      }

      if (!isShiftedActiveMixRow(row)) return null;

      const repaired = row.slice(1, 14);
      while (repaired.length < ACTIVE_MIX_HEADERS.length) repaired.push('');
      return {
        range: `${sheetName}!A${rowNumber}:N${rowNumber}`,
        values: [[...repaired.slice(0, ACTIVE_MIX_HEADERS.length), '']]
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

function normalizePossiblyShiftedMixHistoryRow(row, rowNumber) {
  const direct = normalizeMixHistoryFromRow(row, rowNumber);
  if (direct) return direct;

  const shifted = normalizeMixHistoryFromRow(row.slice(1), rowNumber);
  if (shifted) return shifted;

  return null;
}

async function repairMixHistoryRows(sheets, sheetName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:N`
  });
  const updates = (result.data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1)
    .map(({ row, rowNumber }) => {
      const normalized = normalizePossiblyShiftedMixHistoryRow(row, rowNumber);
      if (!normalized) return null;

      const expected = buildMixHistoryStorageRow(normalized);
      const current = row.slice(0, MIX_HISTORY_HEADERS.length);
      if (cellsAreEqual(current, expected)) return null;

      return {
        range: `${sheetName}!A${rowNumber}:N${rowNumber}`,
        values: [[...expected, '']]
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

function isSameMixHistoryRecord(left, right) {
  return (
    String(left.hookahId || '') === String(right.hookahId || '') &&
    String(left.id || '') === String(right.id || '') &&
    String(left.closedAt || '') === String(right.closedAt || '')
  );
}

async function getExistingMixHistoryRecords(sheets, sheetName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:N`
  });

  return (result.data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1)
    .map(({ row, rowNumber }) => normalizePossiblyShiftedMixHistoryRow(row, rowNumber))
    .filter(Boolean);
}

async function archiveSupersededActiveMixRows(sheets, sheetName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:N`
  });
  const activeRowsByHookah = (result.data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1)
    .map(({ row, rowNumber }) => normalizeActiveMixFromRow(row, rowNumber))
    .filter((item) => item?.isActive)
    .reduce((groups, item) => {
      const hookahId = String(item.mix.hookahId);
      groups[hookahId] = [...(groups[hookahId] || []), item];
      return groups;
    }, {});

  const closedAt = new Date().toISOString();
  const rowsToArchive = Object.values(activeRowsByHookah)
    .flatMap((rows) => rows
      .sort((left, right) => left.rowNumber - right.rowNumber)
      .slice(0, -1)
      .map(({ rowNumber, mix }) => ({
        rowNumber,
        mix: {
          ...mix,
          updatedAt: closedAt
        }
      })));

  if (rowsToArchive.length === 0) return;

  await appendMixHistoryRecords(rowsToArchive.map(({ mix }) => ({
    ...mix,
    closedAt,
    status: 'Заменен'
  })));
  await deleteActiveMixRows(sheets, sheetName, rowsToArchive.map((item) => item.rowNumber));
}

async function archiveInactiveActiveMixRows(sheets, sheetName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:N`
  });
  const inactiveRows = (result.data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1)
    .map(({ row, rowNumber }) => normalizeActiveMixFromRow(row, rowNumber))
    .filter((item) => item && !item.isActive);

  if (inactiveRows.length === 0) return;

  await appendMixHistoryRecords(inactiveRows.map(({ mix }) => ({
    ...mix,
    closedAt: mix.updatedAt || mix.createdAt || new Date().toISOString(),
    status: 'Снят'
  })));
  await deleteActiveMixRows(sheets, sheetName, inactiveRows.map((item) => item.rowNumber));
}

async function removeMalformedActiveMixRows(sheets, sheetName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:N`
  });
  const rows = (result.data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1);
  const normalizedRows = rows
    .map(({ row, rowNumber }) => normalizeActiveMixFromRow(row, rowNumber))
    .filter((item) => item?.isActive);
  const activeHookahIds = new Set(normalizedRows.map((item) => String(item.mix.hookahId)));
  const malformedDuplicateRows = rows
    .filter(({ row, rowNumber }) => {
      if (normalizeActiveMixFromRow(row, rowNumber)) return false;
      const readableHookahId = getReadableActiveMixHookahId(row);
      return readableHookahId && activeHookahIds.has(readableHookahId) && looksLikeReadableActiveMixRow(row);
    })
    .map((item) => item.rowNumber);

  if (malformedDuplicateRows.length === 0) return;

  await deleteActiveMixRows(sheets, sheetName, malformedDuplicateRows);
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

async function formatMixHistorySheet(sheets, sheetId) {
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
              endColumnIndex: MIX_HISTORY_HEADERS.length
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
              endColumnIndex: MIX_HISTORY_HEADERS.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 0.98, blue: 0.92 },
                horizontalAlignment: 'LEFT',
                wrapStrategy: 'WRAP',
                verticalAlignment: 'TOP',
                textFormat: {
                  foregroundColor: { red: 0.08, green: 0.07, blue: 0.05 },
                  fontSize: 10
                }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,wrapStrategy,verticalAlignment,textFormat)'
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
                endColumnIndex: MIX_HISTORY_HEADERS.length
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

  if (isReadablePartShiftedRight(row)) {
    return normalizeActiveMixFromRow(repairReadablePartShiftedRight(row), rowNumber);
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
        format: legacyMix.format || null,
        comment: String(legacyMix.comment || ''),
        createdAt: legacyMix.createdAt || row[2] || '',
        updatedAt: legacyMix.updatedAt || row[5] || legacyMix.createdAt || row[2] || ''
      }
    };
  }

  const items = normalizeMixItems(parseJsonCell(row[2]));
  return {
    rowNumber,
    isActive: isTruthyActive(row[6]),
    mix: {
      id: String(row[1] || `mix-${hookahId}-${rowNumber}`),
      hookahId,
      tobaccos: items.tobaccos,
      format: items.format,
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

async function deactivateActiveMixRows(sheets, rows, hookahId, updatedAt, status = 'Заменен') {
  const activeMatches = rows.filter(
    (item) => item.isActive && String(item.mix.hookahId) === String(hookahId)
  );

  await appendMixHistoryRecords(activeMatches.map(({ mix }) => ({
    ...mix,
    updatedAt,
    closedAt: updatedAt,
    status
  })));
  await deleteActiveMixRows(sheets, getActiveMixesSheetName(), activeMatches.map((item) => item.rowNumber));

  return activeMatches.length;
}

async function deleteActiveMixRows(sheets, sheetName, rowNumbers) {
  if (rowNumbers.length === 0) return;

  const sheetId = await getSheetTabId(sheetName);
  const requests = [...rowNumbers]
    .sort((left, right) => right - left)
    .map((rowNumber) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rowNumber - 1,
          endIndex: rowNumber
        }
      }
    }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests
    }
  });
}

async function appendMixHistoryRecords(records) {
  const normalizedRecords = records
    .filter(Boolean)
    .map((record) => ({
      ...record,
      hookahId: String(record.hookahId || ''),
      id: String(record.id || record.mixId || `mix-${record.hookahId}-${Date.now()}`),
      tobaccos: Array.isArray(record.tobaccos) ? record.tobaccos : [],
      format: record.format || null,
      comment: String(record.comment || ''),
      createdAt: String(record.createdAt || ''),
      closedAt: String(record.closedAt || record.updatedAt || new Date().toISOString()),
      status: String(record.status || 'Снят')
    }))
    .filter((record) => record.hookahId);

  if (normalizedRecords.length === 0) return;

  await ensureMixHistorySheet();

  const sheets = getSheetsClient();
  const sheetName = getMixHistorySheetName();
  const existingRecords = await getExistingMixHistoryRecords(sheets, sheetName);
  const values = normalizedRecords
    .filter((record) => !existingRecords.some((existing) => isSameMixHistoryRecord(existing, record)))
    .map(buildMixHistoryStorageRow);

  if (values.length === 0) return;

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:M`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values
    }
  });
}

function normalizeMixHistoryFromRow(row, rowNumber) {
  const hookahId = String(row[0] || '').trim();
  if (!hookahId) return null;

  const items = normalizeMixItems(parseJsonCell(row[2]));
  return {
    rowNumber,
    hookahId,
    id: String(row[1] || `history-${hookahId}-${rowNumber}`),
    tobaccos: items.tobaccos,
    format: items.format,
    comment: String(row[3] || ''),
    createdAt: String(row[4] || ''),
    closedAt: String(row[5] || row[4] || ''),
    status: String(row[6] || 'Снят')
  };
}

const TOBACCO_HEADER_VARIANTS = {
  number: ['№', 'номер', 'no'],
  name: ['наименование', 'название', 'табак', 'name'],
  quantity: ['кол/во', 'количество', 'остаток', 'шт', 'quantity'],
  grams: ['граммы', 'грамм', 'вес', 'grams'],
  taste: ['перевод', 'вкус', 'flavor', 'taste']
};

function parseInventoryNumber(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
}

function findExactHeaderColumn(headers, variants) {
  return headers.findIndex((header) => variants.includes(header));
}

function normalizeTobaccoLabel(value) {
  return normalizeHeader(value).replace(/[:：]+$/g, '').trim();
}

function isTobaccoDataRow(row, index, schema) {
  if (index <= schema.headerRowIndex) return false;

  const name = String(row[schema.nameIndex] || '').trim();
  if (!name) return false;

  const normalizedName = normalizeTobaccoLabel(name);
  if (TOBACCO_HEADER_VARIANTS.name.includes(normalizedName)) return false;

  const quantity = schema.quantityIndex >= 0
    ? parseInventoryNumber(row[schema.quantityIndex])
    : null;
  const grams = schema.gramsIndex >= 0
    ? parseInventoryNumber(row[schema.gramsIndex])
    : null;

  return quantity !== null || grams !== null;
}

function isRepeatedTobaccoHeaderRow(row, schema) {
  const nameLabel = normalizeTobaccoLabel(row[schema.nameIndex]);
  const quantityLabel = schema.quantityIndex >= 0
    ? normalizeTobaccoLabel(row[schema.quantityIndex])
    : '';

  return (
    TOBACCO_HEADER_VARIANTS.name.includes(nameLabel) &&
    TOBACCO_HEADER_VARIANTS.quantity.includes(quantityLabel)
  );
}

function resolveTobaccoSchema(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const headers = (rows[rowIndex] || []).map(normalizeTobaccoLabel);
    const nameIndex = findExactHeaderColumn(headers, TOBACCO_HEADER_VARIANTS.name);
    const quantityIndex = findExactHeaderColumn(headers, TOBACCO_HEADER_VARIANTS.quantity);
    const gramsIndex = findExactHeaderColumn(headers, TOBACCO_HEADER_VARIANTS.grams);

    if (nameIndex >= 0 && (quantityIndex >= 0 || gramsIndex >= 0)) {
      return {
        layout: 'headers',
        headerRowIndex: rowIndex,
        numberIndex: findExactHeaderColumn(headers, TOBACCO_HEADER_VARIANTS.number),
        nameIndex,
        quantityIndex,
        gramsIndex,
        tasteIndex: findColumn(
          headers,
          TOBACCO_HEADER_VARIANTS.taste,
          gramsIndex >= 0 ? gramsIndex + 1 : quantityIndex + 1
        )
      };
    }
  }

  const firstBlockRowIndex = rows.findIndex((row) =>
    /^\d+$/.test(String(row[1] || '').trim()) && String(row[2] || '').trim()
  );

  if (firstBlockRowIndex >= 0) {
    const headerRowIndex = Math.max(0, firstBlockRowIndex - 1);
    const legacyHeaders = (rows[headerRowIndex] || []).map(normalizeTobaccoLabel);
    const gramsIndex = findExactHeaderColumn(legacyHeaders, TOBACCO_HEADER_VARIANTS.grams);

    return {
      layout: 'block',
      headerRowIndex,
      numberIndex: 1,
      nameIndex: 2,
      quantityIndex: 3,
      gramsIndex,
      tasteIndex: gramsIndex === 4 ? 5 : 4
    };
  }

  const headers = (rows[0] || []).map(normalizeTobaccoLabel);
  return {
    layout: 'headers',
    headerRowIndex: 0,
    numberIndex: findExactHeaderColumn(headers, TOBACCO_HEADER_VARIANTS.number),
    nameIndex: findColumn(headers, TOBACCO_HEADER_VARIANTS.name, 0),
    quantityIndex: findColumn(headers, TOBACCO_HEADER_VARIANTS.quantity, 1),
    gramsIndex: findExactHeaderColumn(headers, TOBACCO_HEADER_VARIANTS.grams),
    tasteIndex: findColumn(headers, TOBACCO_HEADER_VARIANTS.taste, 2)
  };
}

export function findTobaccoBrandSlot(rows, name) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const schema = resolveTobaccoSchema(rows);
  const targetBrandKey = normalizeBrandKey(detectBrand(name));
  const sectionRows = rows
    .map((row, index) => ({
      index,
      brandKey: normalizeBrandKey(row?.[0])
    }))
    .filter(({ brandKey }) => brandKey);
  const knownBrandKeys = new Set([
    'darkside', 'blackburn', 'overdose', 'starline', 'musthave', 'naш',
    'sebero', 'satyr', 'deus', 'bonche', 'jent', 'trofimoff', 'северный', 'другое'
  ]);
  const sections = sectionRows.filter(({ brandKey }) => knownBrandKeys.has(brandKey));
  const targetSectionIndex = sections.findIndex(({ brandKey }) => brandKey === targetBrandKey);
  const miscSectionIndex = sections.findIndex(({ brandKey }) => brandKey === 'другое');
  const sectionIndex = targetSectionIndex >= 0 ? targetSectionIndex : miscSectionIndex;

  if (sectionIndex < 0) return null;

  const sectionStart = sections[sectionIndex].index;
  const sectionEnd = sections[sectionIndex + 1]?.index ?? rows.length;
  const headerRowIndex = rows.findIndex((row, index) => (
    index > sectionStart && index < sectionEnd && isRepeatedTobaccoHeaderRow(row, schema)
  ));

  if (headerRowIndex < 0) return null;

  const candidates = [];
  let highestNumber = 0;

  for (let index = headerRowIndex + 1; index < sectionEnd; index += 1) {
    const row = rows[index] || [];
    const number = schema.numberIndex >= 0 ? Number(row[schema.numberIndex]) : NaN;
    if (Number.isFinite(number)) highestNumber = Math.max(highestNumber, number);

    const hasName = String(row[schema.nameIndex] || '').trim();
    if (!hasName) {
      candidates.push({ index, existingNumber: Number.isFinite(number) ? number : null });
    }
  }

  const candidate = candidates.find(({ existingNumber }) => existingNumber !== null) || candidates[0];
  if (!candidate) return null;

  return {
    rowIndex: candidate.index,
    rowNumber: candidate.index + 1,
    number: candidate.existingNumber ?? highestNumber + 1,
    schema,
    brand: detectBrand(name)
  };
}

function buildTobacco(row, rowIndex, schema, sheetName = '') {
  const rawQuantity = parseInventoryNumber(row[schema.quantityIndex]);
  const rawGrams = schema.gramsIndex >= 0
    ? parseInventoryNumber(row[schema.gramsIndex])
    : null;
  const grams = rawGrams === null
    ? calculateGramsByUnits(rawQuantity || 0)
    : roundInventoryValue(rawGrams, 2);
  const quantity = calculateUnitsByGrams(grams);
  const name = String(row[schema.nameIndex] || '').trim();
  const taste = schema.tasteIndex >= 0 ? String(row[schema.tasteIndex] || '').trim() : '';
  const rowNumber = rowIndex + 1;

  return {
    id: `${rowNumber}-${name || 'tobacco'}`,
    rowNumber,
    sheetName,
    nameColumn: columnToLetter(schema.nameIndex),
    quantityColumn: schema.quantityIndex >= 0 ? columnToLetter(schema.quantityIndex) : '',
    gramsColumn: schema.gramsIndex >= 0 ? columnToLetter(schema.gramsIndex) : '',
    tasteColumn: schema.tasteIndex >= 0 ? columnToLetter(schema.tasteIndex) : '',
    layout: schema.layout,
    name: name || 'Без названия',
    brand: detectBrand(name),
    quantity,
    grams,
    taste: taste || 'Вкус не указан',
    inStock: grams > 0
  };
}

export function rowsToTobaccos(rows, sheetName = '') {
  if (rows.length === 0) return [];

  const schema = resolveTobaccoSchema(rows);
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => isTobaccoDataRow(row, index, schema))
    .map(({ row, index }) => buildTobacco(row, index, schema, sheetName))
    .filter((item) => item.name !== 'Без названия');
}

async function getSheetContext() {
  const sheets = getSheetsClient();
  let targetSheetName = getSheetName();

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: getSheetId(),
      range: `${targetSheetName}!A:Z`
    });

    return {
      sheetName: targetSheetName,
      rows: result.data.values || []
    };
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

  return {
    sheetName: targetSheetName,
    rows: result.data.values || []
  };
}

async function ensureTobaccoInventorySchema() {
  let context = await getSheetContext();
  let schema = resolveTobaccoSchema(context.rows);

  if (schema.quantityIndex < 0) {
    const sheets = getSheetsClient();
    const sheetId = await getSheetTabId(context.sheetName);
    const insertIndex = schema.gramsIndex >= 0 ? schema.gramsIndex : schema.nameIndex + 1;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: insertIndex,
                endIndex: insertIndex + 1
              },
              inheritFromBefore: insertIndex > 0
            }
          }
        ]
      }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${context.sheetName}!${columnToLetter(insertIndex)}${schema.headerRowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Кол/во']] }
    });

    context = await getSheetContext();
    schema = resolveTobaccoSchema(context.rows);
  }

  if (schema.gramsIndex < 0) {
    const sheets = getSheetsClient();
    const sheetId = await getSheetTabId(context.sheetName);
    const insertIndex = schema.tasteIndex > schema.quantityIndex
      ? schema.tasteIndex
      : Math.max(schema.nameIndex, schema.quantityIndex, schema.tasteIndex) + 1;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: insertIndex,
                endIndex: insertIndex + 1
              },
              inheritFromBefore: true
            }
          }
        ]
      }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${context.sheetName}!${columnToLetter(insertIndex)}${schema.headerRowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Граммы']] }
    });

    context = await getSheetContext();
    schema = resolveTobaccoSchema(context.rows);
  }

  if (schema.gramsIndex < 0) {
    throw new Error('Не удалось создать колонку «Граммы» во вкладке с табаками.');
  }
  if (schema.quantityIndex < 0) {
    throw new Error('Не удалось создать колонку «Кол/во» во вкладке с табаками.');
  }

  return { ...context, schema };
}

async function readAndMigrateTobaccoInventory() {
  const sheets = getSheetsClient();
  const context = await ensureTobaccoInventorySchema();
  const rows = context.rows.map((row) => [...row]);
  const updates = [];

  for (let rowIndex = context.schema.headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowNumber = rowIndex + 1;

    if (isRepeatedTobaccoHeaderRow(row, context.schema)) {
      if (normalizeTobaccoLabel(row[context.schema.gramsIndex]) !== 'граммы') {
        rows[rowIndex][context.schema.gramsIndex] = 'Граммы';
        updates.push({
          range: `${context.sheetName}!${columnToLetter(context.schema.gramsIndex)}${rowNumber}`,
          values: [['Граммы']]
        });
      }
      continue;
    }

    if (!isTobaccoDataRow(row, rowIndex, context.schema)) continue;

    const name = String(row[context.schema.nameIndex] || '').trim();
    const quantityValue = parseInventoryNumber(row[context.schema.quantityIndex]);
    const gramsValue = parseInventoryNumber(row[context.schema.gramsIndex]);

    if (gramsValue === null && quantityValue !== null) {
      const calculatedGrams = calculateGramsByUnits(quantityValue);
      rows[rowIndex][context.schema.gramsIndex] = calculatedGrams;
      updates.push({
        range: `${context.sheetName}!${columnToLetter(context.schema.gramsIndex)}${rowNumber}`,
        values: [[calculatedGrams]]
      });
      continue;
    }

    if (gramsValue !== null) {
      const calculatedQuantity = calculateUnitsByGrams(gramsValue);
      if (quantityValue === null || Math.abs(quantityValue - calculatedQuantity) > 0.0001) {
        if (quantityValue !== null) {
          console.warn(
            `[inventory] Несовпадение остатков для «${name}»: Кол/во=${quantityValue}, Граммы=${gramsValue}. Граммы приняты за источник.`
          );
        }
        rows[rowIndex][context.schema.quantityIndex] = calculatedQuantity;
        updates.push({
          range: `${context.sheetName}!${columnToLetter(context.schema.quantityIndex)}${rowNumber}`,
          values: [[calculatedQuantity]]
        });
      }
    }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: {
        valueInputOption: 'RAW',
        data: updates
      }
    });
  }

  return {
    ...context,
    rows,
    tobaccos: rowsToTobaccos(rows, context.sheetName)
  };
}

export async function readTobaccosFromGoogleApi() {
  const { tobaccos } = await readAndMigrateTobaccoInventory();

  if (tobaccos.length === 0) {
    throw new Error('Google Sheet did not contain recognizable tobacco rows');
  }

  return tobaccos;
}

export async function updateTobaccoQuantity({ id, quantity, grams: requestedGrams }) {
  const sheets = getSheetsClient();
  const inventory = await readAndMigrateTobaccoInventory();
  const tobaccos = inventory.tobaccos;
  const tobacco = tobaccos.find((item) => item.id === id);

  if (!tobacco) {
    throw new Error('Позиция не найдена в Google Таблице. Обновите список и попробуйте снова.');
  }

  const grams = requestedGrams === undefined
    ? calculateGramsByUnits(quantity)
    : roundInventoryValue(requestedGrams, 2);
  const normalizedQuantity = calculateUnitsByGrams(grams);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        {
          range: `${tobacco.sheetName}!${tobacco.quantityColumn}${tobacco.rowNumber}`,
          values: [[normalizedQuantity]]
        },
        {
          range: `${tobacco.sheetName}!${tobacco.gramsColumn}${tobacco.rowNumber}`,
          values: [[grams]]
        }
      ]
    }
  });

  return {
    ...tobacco,
    quantity: normalizedQuantity,
    grams,
    inStock: grams > 0
  };
}

export async function deleteTobaccoFromGoogleApi(id) {
  const sheets = getSheetsClient();
  const inventory = await readAndMigrateTobaccoInventory();
  const tobacco = inventory.tobaccos.find((item) => item.id === id);

  if (!tobacco) {
    const error = new Error('Позиция не найдена в Google Таблице. Обновите список и попробуйте снова.');
    error.statusCode = 404;
    throw error;
  }

  const primaryColumnIndexes = [
    inventory.schema.numberIndex,
    inventory.schema.nameIndex,
    inventory.schema.quantityIndex,
    inventory.schema.gramsIndex,
    inventory.schema.tasteIndex
  ].filter((index) => Number.isInteger(index) && index >= 0);
  const startColumn = columnToLetter(Math.min(...primaryColumnIndexes));
  const endColumn = columnToLetter(Math.max(...primaryColumnIndexes));

  // Очищаем только основной блок табака. Удаление всей строки сдвинет правую
  // вспомогательную таблицу и нарушит секции брендов.
  await sheets.spreadsheets.values.clear({
    spreadsheetId: getSheetId(),
    range: `${tobacco.sheetName}!${startColumn}${tobacco.rowNumber}:${endColumn}${tobacco.rowNumber}`,
    requestBody: {}
  });

  return tobacco;
}

export async function appendTobacco({ name, quantity, grams: requestedGrams, taste }) {
  const sheets = getSheetsClient();
  const inventory = await readAndMigrateTobaccoInventory();
  const grams = requestedGrams === undefined
    ? calculateGramsByUnits(quantity)
    : roundInventoryValue(requestedGrams, 2);
  const normalizedQuantity = calculateUnitsByGrams(grams);
  const highestColumnIndex = Math.max(
    inventory.schema.numberIndex,
    inventory.schema.nameIndex,
    inventory.schema.quantityIndex,
    inventory.schema.gramsIndex,
    inventory.schema.tasteIndex
  );
  const row = Array.from({ length: highestColumnIndex + 1 }, () => '');
  row[inventory.schema.nameIndex] = name;
  row[inventory.schema.quantityIndex] = normalizedQuantity;
  row[inventory.schema.gramsIndex] = grams;
  if (inventory.schema.tasteIndex >= 0) row[inventory.schema.tasteIndex] = taste;
  if (inventory.schema.numberIndex >= 0) {
    const numbers = inventory.rows
      .slice(inventory.schema.headerRowIndex + 1)
      .map((current) => Number(current[inventory.schema.numberIndex]))
      .filter(Number.isFinite);
    row[inventory.schema.numberIndex] = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
  }

  const brandSlot = findTobaccoBrandSlot(inventory.rows, name);

  if (brandSlot) {
    if (inventory.schema.numberIndex >= 0) row[inventory.schema.numberIndex] = brandSlot.number;
    const primaryColumnIndexes = [
      inventory.schema.numberIndex,
      inventory.schema.nameIndex,
      inventory.schema.quantityIndex,
      inventory.schema.gramsIndex,
      inventory.schema.tasteIndex
    ].filter((index) => Number.isInteger(index) && index >= 0);
    const startColumnIndex = Math.min(...primaryColumnIndexes);
    const endColumnIndex = Math.max(...primaryColumnIndexes);

    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${inventory.sheetName}!${columnToLetter(startColumnIndex)}${brandSlot.rowNumber}:${columnToLetter(endColumnIndex)}${brandSlot.rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [row.slice(startColumnIndex, endColumnIndex + 1)]
      }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(),
      range: `${inventory.sheetName}!A:${columnToLetter(highestColumnIndex)}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row]
      }
    });
  }

  const refreshed = await readTobaccosFromGoogleApi();
  return refreshed.find((item) => brandSlot && item.rowNumber === brandSlot.rowNumber)
    || [...refreshed].reverse().find((item) => item.name === name && item.taste === taste) || {
    id: `${Date.now()}-${name}`,
    name,
    brand: detectBrand(name),
    quantity: normalizedQuantity,
    grams,
    taste,
    inStock: grams > 0
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

export async function readMixHistoryFromGoogleApi() {
  await getActiveMixRows();
  await ensureMixHistorySheet();

  const sheets = getSheetsClient();
  const historyResult = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${getMixHistorySheetName()}!A:M`
  });
  const historyRows = (historyResult.data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .slice(1)
    .map(({ row, rowNumber }) => normalizeMixHistoryFromRow(row, rowNumber))
    .filter(Boolean);

  return historyRows.sort((left, right) => {
    const leftDate = new Date(left.closedAt || left.createdAt).getTime() || 0;
    const rightDate = new Date(right.closedAt || right.createdAt).getTime() || 0;
    return rightDate - leftDate;
  });
}

export async function saveActiveMixToGoogleApi(mix) {
  const updatedAt = new Date().toISOString();
  const sheets = getSheetsClient();
  const sheetName = getActiveMixesSheetName();
  const rows = await getActiveMixRows();

  await deactivateActiveMixRows(sheets, rows, mix.hookahId, updatedAt);

  const values = [
    mix.hookahId,
    mix.id,
    JSON.stringify({
      tobaccos: mix.tobaccos || [],
      format: mix.format || null
    }),
    mix.comment || '',
    mix.createdAt,
    updatedAt,
    'TRUE',
    ...buildReadableActiveMixCells(mix, true, updatedAt)
  ];

  const existingRows = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:M`
  });
  const nextRowNumber = Math.max(2, (existingRows.data.values || []).length + 1);

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A${nextRowNumber}:M${nextRowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [values]
    }
  });

  return {
    ...mix,
    updatedAt
  };
}

export class InventoryOperationError extends Error {
  constructor(message, statusCode = 500, code = 'INVENTORY_OPERATION_FAILED', details = {}) {
    super(message);
    this.name = 'InventoryOperationError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

let inventoryTransactionQueue = Promise.resolve();

function runInventoryTransaction(operation) {
  const transaction = inventoryTransactionQueue.then(operation, operation);
  inventoryTransactionQueue = transaction.catch(() => {});
  return transaction;
}

function getInventoryErrorStatus(error) {
  if (error?.code === 'TOBACCO_NOT_FOUND') return 404;
  if (error?.code === 'INSUFFICIENT_STOCK') return 409;
  if (
    error?.code === 'EMPTY_COMPONENTS' ||
    error?.code === 'INVALID_COMPONENT' ||
    error?.code === 'INVALID_PERCENT_TOTAL' ||
    error?.code === 'DUPLICATE_TOBACCO'
  ) {
    return 400;
  }
  return 500;
}

function getNextValuesRow(values) {
  return Math.max(2, (values || []).length + 1);
}

function buildActiveMixStorageRow(mix, updatedAt) {
  return [
    mix.hookahId,
    mix.id,
    JSON.stringify({
      tobaccos: mix.tobaccos || [],
      format: mix.format || null
    }),
    mix.comment || '',
    mix.createdAt,
    updatedAt,
    'TRUE',
    ...buildReadableActiveMixCells(mix, true, updatedAt)
  ];
}

export async function saveActiveMixWithInventoryToGoogleApi({
  mix,
  requestId,
  expectedActiveMixId = ''
}) {
  return runInventoryTransaction(async () => {
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) {
      throw new InventoryOperationError('Не указан идентификатор заказа.', 400, 'REQUEST_ID_REQUIRED');
    }

    const sheets = getSheetsClient();
    const inventory = await readAndMigrateTobaccoInventory();
    await ensureActiveMixesSheet();
    await ensureMixHistorySheet();
    await ensureInventoryMovementSheet();

    const activeSheetName = getActiveMixesSheetName();
    const historySheetName = getMixHistorySheetName();
    const movementSheetName = getInventoryMovementSheetName();
    const [activeResult, historyResult, movementResult] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: `${activeSheetName}!A:M`
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: `${historySheetName}!A:M`
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: `${movementSheetName}!A:K`
      })
    ]);

    const activeValues = activeResult.data.values || [];
    const movementValues = movementResult.data.values || [];
    const normalizedActiveRows = activeValues
      .map((row, index) => normalizeActiveMixFromRow(row, index + 1))
      .filter(Boolean);

    if (isInventoryRequestProcessed(movementValues.slice(1), normalizedRequestId)) {
      const existingRequest = normalizedActiveRows.find((item) => item.mix.id === normalizedRequestId);
      if (existingRequest && String(existingRequest.mix.hookahId) === String(mix.hookahId)) {
        return {
          mix: existingRequest.mix,
          duplicate: true,
          inventory: null
        };
      }

      throw new InventoryOperationError(
        'Этот заказ уже был обработан. Обновите список активных кальянов.',
        409,
        'REQUEST_ALREADY_PROCESSED'
      );
    }

    const activeForHookah = normalizedActiveRows
      .filter((item) => item.isActive && String(item.mix.hookahId) === String(mix.hookahId))
      .sort((left, right) => right.rowNumber - left.rowNumber)[0] || null;
    const normalizedExpectedMixId = String(expectedActiveMixId || '').trim();
    const currentMixId = String(activeForHookah?.mix?.id || '');

    if (currentMixId !== normalizedExpectedMixId) {
      throw new InventoryOperationError(
        currentMixId
          ? 'Активный микс этого кальяна уже изменился. Обновите данные перед заменой.'
          : 'Активный микс уже снят. Обновите данные перед сохранением.',
        409,
        'ACTIVE_MIX_CONFLICT',
        { currentMixId }
      );
    }

    let deductionPlan;
    try {
      deductionPlan = buildInventoryDeductionPlan(inventory.tobaccos, mix.tobaccos);
    } catch (error) {
      throw new InventoryOperationError(
        error.message || 'Не удалось рассчитать списание табака.',
        getInventoryErrorStatus(error),
        error.code || 'INVENTORY_CALCULATION_FAILED',
        error.details || {}
      );
    }

    const updatedAt = new Date().toISOString();
    const enrichedTobaccos = mix.tobaccos.map((component) => {
      const deduction = deductionPlan.deductions.find(
        (item) => String(item.tobacco.id) === String(component.id)
      );
      return {
        ...component,
        gramsUsed: deduction?.gramsUsed || 0,
        unitsUsed: deduction?.unitsUsed || 0
      };
    });
    const savedMix = {
      ...mix,
      id: normalizedRequestId,
      tobaccos: enrichedTobaccos,
      updatedAt
    };
    const updates = [];

    for (const deduction of deductionPlan.deductions) {
      updates.push(
        {
          range: `${deduction.tobacco.sheetName}!${deduction.tobacco.gramsColumn}${deduction.tobacco.rowNumber}`,
          values: [[deduction.remainingGrams]]
        },
        {
          range: `${deduction.tobacco.sheetName}!${deduction.tobacco.quantityColumn}${deduction.tobacco.rowNumber}`,
          values: [[deduction.remainingUnits]]
        }
      );
    }

    if (activeForHookah) {
      const replacedMix = {
        ...activeForHookah.mix,
        updatedAt,
        closedAt: updatedAt,
        status: 'Заменен'
      };
      updates.push({
        range: `${historySheetName}!A${getNextValuesRow(historyResult.data.values)}:M${getNextValuesRow(historyResult.data.values)}`,
        values: [buildMixHistoryStorageRow(replacedMix)]
      });
    }

    const activeRowNumber = activeForHookah?.rowNumber || getNextValuesRow(activeValues);
    updates.push({
      range: `${activeSheetName}!A${activeRowNumber}:M${activeRowNumber}`,
      values: [buildActiveMixStorageRow(savedMix, updatedAt)]
    });

    let movementRowNumber = getNextValuesRow(movementValues);
    for (const deduction of deductionPlan.deductions) {
      const tobaccoTitle = [deduction.tobacco.brand, deduction.tobacco.name]
        .filter(Boolean)
        .join(' ')
        .trim();
      updates.push({
        range: `${movementSheetName}!A${movementRowNumber}:K${movementRowNumber}`,
        values: [[
          updatedAt,
          'Списание',
          normalizedRequestId,
          String(savedMix.hookahId),
          tobaccoTitle,
          deduction.component.percent,
          deduction.gramsUsed,
          deduction.unitsUsed,
          deduction.remainingGrams,
          deduction.remainingUnits,
          savedMix.comment || ''
        ]]
      });
      movementRowNumber += 1;
    }

    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: getSheetId(),
        requestBody: {
          valueInputOption: 'RAW',
          data: updates
        }
      });
    } catch (error) {
      throw new InventoryOperationError(
        'Не удалось обновить склад. Заказ не создан.',
        500,
        'GOOGLE_SHEETS_WRITE_FAILED',
        { cause: error.message }
      );
    }

    return {
      mix: savedMix,
      duplicate: false,
      inventory: {
        totalGrams: deductionPlan.totalGrams,
        totalUnits: deductionPlan.totalUnits,
        deductions: deductionPlan.deductions.map((deduction) => ({
          tobaccoId: deduction.tobacco.id,
          gramsUsed: deduction.gramsUsed,
          unitsUsed: deduction.unitsUsed,
          remainingGrams: deduction.remainingGrams,
          remainingUnits: deduction.remainingUnits
        }))
      }
    };
  });
}

export async function clearActiveMixFromGoogleApi(hookahId) {
  const updatedAt = new Date().toISOString();
  const sheets = getSheetsClient();
  const rows = await getActiveMixRows();
  const cleared = await deactivateActiveMixRows(sheets, rows, hookahId, updatedAt, 'Снят');

  return {
    hookahId: String(hookahId),
    cleared
  };
}
