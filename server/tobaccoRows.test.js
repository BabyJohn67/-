import test from 'node:test';
import assert from 'node:assert/strict';
import { findTobaccoBrandSlot, rowsToTobaccos } from './googleSheetsService.js';

test('повторные заголовки и пустые разделители не становятся табаками', () => {
  const rows = [
    ['', '№', 'Наименование:', 'Кол/во:', 'Граммы', 'Перевод:'],
    ['', '1', 'DS Barvy orange', '2', '17', 'Апельсин'],
    ['', '2', 'Наименование:', 'Кол/во:', 'Граммы:', 'Перевод:'],
    ['', '3', '', '', '', ''],
    ['', '4', 'Название', 'Количество', 'Граммы', 'Вкус'],
    ['', '5', 'MustHave Lemon', '0', '0', 'Лимон']
  ];

  const tobaccos = rowsToTobaccos(rows, 'Наличие табаков');

  assert.deepEqual(tobaccos.map((item) => item.name), [
    'DS Barvy orange',
    'MustHave Lemon'
  ]);
});

test('позиция с нулевым числовым остатком остаётся в списке', () => {
  const rows = [
    ['Наименование', 'Кол/во', 'Граммы', 'Перевод'],
    ['Darkside Cola', '0', '0', 'Кола']
  ];

  const [tobacco] = rowsToTobaccos(rows, 'Табаки');

  assert.equal(tobacco.name, 'Darkside Cola');
  assert.equal(tobacco.grams, 0);
  assert.equal(tobacco.inStock, false);
});

test('перевод берётся из основной таблицы, а не из правого вспомогательного блока', () => {
  const rows = [
    ['', '№', 'Наименование:', 'Кол/во:', 'Граммы', 'Перевод: (По порядку)', '', '№', 'Наименование:', 'Кол/во:', 'Перевод:'],
    ['', '1', 'СЕВЕРНЫЙPro Красный', '22.3529', '190', 'Малина, земляника, арбуз', '', '1', 'СЕВЕРНЫЙPro Желтый', '6', 'Манго, ананас, дыня, ваниль']
  ];

  const [tobacco] = rowsToTobaccos(rows, 'Наличие табаков');

  assert.equal(tobacco.tasteColumn, 'F');
  assert.equal(tobacco.taste, 'Малина, земляника, арбуз');
  assert.equal(tobacco.grams, 190);
});

test('префикс SL относится к бренду StarLine, а не Sebero', () => {
  const rows = [
    ['Наименование', 'Кол/во', 'Граммы', 'Перевод'],
    ['SL Клубника', '2', '17', 'Клубника']
  ];

  const [tobacco] = rowsToTobaccos(rows, 'Табаки');

  assert.equal(tobacco.brand, 'StarLine');
});

test('префиксы SB и SB25 относятся к бренду Sebero', () => {
  const rows = [
    ['Наименование', 'Кол/во', 'Граммы', 'Перевод'],
    ['SB Vanilla', '2', '17', 'Ваниль'],
    ['SB25 Peanut Latte', '2', '17', 'Арахисовое латте']
  ];

  const tobaccos = rowsToTobaccos(rows, 'Табаки');

  assert.deepEqual(tobaccos.map((tobacco) => tobacco.brand), ['Sebero', 'Sebero']);
});

test('новый табак добавляется в свободную строку своего бренда', () => {
  const rows = [
    ['Наличие табаков'],
    ['Darkside'],
    ['', '№', 'Наименование:', 'Кол/во:', 'Граммы', 'Перевод:'],
    ['', '1', 'DS Lemon', '2', '17', 'Лимон'],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['SATYR'],
    ['', '№', 'Наименование:', 'Кол/во:', 'Граммы', 'Перевод:'],
    ['', '1', 'SATYR Энергетик', '2', '17', 'Энергетик'],
    ['', '2', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Разное'],
    ['', '№', 'Наименование:', 'Кол/во:', 'Граммы', 'Перевод:'],
    ['', '1', 'ADALYA Apple', '2', '17', 'Яблоко'],
    ['', '2', '', '', '', '']
  ];

  const satyrSlot = findTobaccoBrandSlot(rows, 'SATYR Коктейльная вишня');
  assert.equal(satyrSlot.rowIndex, 9);
  assert.equal(satyrSlot.rowNumber, 10);
  assert.equal(satyrSlot.number, 2);
  assert.equal(satyrSlot.brand, 'SATYR');
  assert.equal(findTobaccoBrandSlot(rows, 'DS Darkmint').rowNumber, 5);
  assert.equal(findTobaccoBrandSlot(rows, 'UNKNOWN Flavor').rowNumber, 15);
});
