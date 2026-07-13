import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsToTobaccos } from './googleSheetsService.js';

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
