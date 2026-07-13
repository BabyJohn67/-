import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertInventoryStorageAvailable,
  buildInventoryDeductionPlan,
  calculateGramsByPercent,
  calculateUnitsByGrams,
  isInventoryRequestProcessed
} from './inventoryMath.js';

function inventoryWith(gramsById) {
  return Object.entries(gramsById).map(([id, grams]) => ({
    id,
    name: `Табак ${id}`,
    grams
  }));
}

test('100% расходует 17 г и 2 единицы', () => {
  const plan = buildInventoryDeductionPlan(inventoryWith({ a: 17 }), [{ id: 'a', percent: 100 }]);
  assert.equal(plan.deductions[0].gramsUsed, 17);
  assert.equal(plan.deductions[0].unitsUsed, 2);
  assert.equal(plan.deductions[0].remainingGrams, 0);
});

test('50% + 50% расходует по 8.5 г', () => {
  const plan = buildInventoryDeductionPlan(inventoryWith({ a: 20, b: 20 }), [
    { id: 'a', percent: 50 },
    { id: 'b', percent: 50 }
  ]);
  assert.deepEqual(plan.deductions.map((item) => item.gramsUsed), [8.5, 8.5]);
  assert.deepEqual(plan.deductions.map((item) => item.unitsUsed), [1, 1]);
});

test('40% + 30% + 30% рассчитывается точно', () => {
  const plan = buildInventoryDeductionPlan(inventoryWith({ a: 20, b: 20, c: 20 }), [
    { id: 'a', percent: 40 },
    { id: 'b', percent: 30 },
    { id: 'c', percent: 30 }
  ]);
  assert.deepEqual(plan.deductions.map((item) => item.gramsUsed), [6.8, 5.1, 5.1]);
});

test('25% x 4 расходует по 4.25 г', () => {
  const plan = buildInventoryDeductionPlan(inventoryWith({ a: 10, b: 10, c: 10, d: 10 }), [
    { id: 'a', percent: 25 },
    { id: 'b', percent: 25 },
    { id: 'c', percent: 25 },
    { id: 'd', percent: 25 }
  ]);
  assert.deepEqual(plan.deductions.map((item) => item.gramsUsed), [4.25, 4.25, 4.25, 4.25]);
});

for (const total of [90, 110]) {
  test(`сумма ${total}% блокируется`, () => {
    assert.throws(
      () => buildInventoryDeductionPlan(inventoryWith({ a: 30 }), [{ id: 'a', percent: total }]),
      (error) => error.code === 'INVALID_PERCENT_TOTAL'
    );
  });
}

test('при недостатке одной позиции исходный склад не меняется', () => {
  const inventory = inventoryWith({ a: 20, b: 3.4 });
  const snapshot = structuredClone(inventory);
  assert.throws(
    () => buildInventoryDeductionPlan(inventory, [{ id: 'a', percent: 50 }, { id: 'b', percent: 50 }]),
    (error) => error.code === 'INSUFFICIENT_STOCK'
  );
  assert.deepEqual(inventory, snapshot);
});

test('повторный requestId определяется по журналу', () => {
  const rows = [['Дата', 'Тип', 'ID заказа'], ['2026-07-13', 'Списание', 'order-123']];
  assert.equal(isInventoryRequestProcessed(rows, 'order-123'), true);
  assert.equal(isInventoryRequestProcessed(rows, 'order-456'), false);
});

test('остаток, равный расходу, становится нулём', () => {
  const plan = buildInventoryDeductionPlan(inventoryWith({ a: 8.5, b: 8.5 }), [
    { id: 'a', percent: 50 },
    { id: 'b', percent: 50 }
  ]);
  assert.deepEqual(plan.deductions.map((item) => item.remainingGrams), [0, 0]);
});

test('недостаток 0.01 г блокирует заказ', () => {
  assert.throws(
    () => buildInventoryDeductionPlan(inventoryWith({ a: 8.49, b: 20 }), [
      { id: 'a', percent: 50 },
      { id: 'b', percent: 50 }
    ]),
    (error) => error.code === 'INSUFFICIENT_STOCK'
  );
});

test('33% от 17 г округляется до 5.61 г и 0.66 единицы', () => {
  assert.equal(calculateGramsByPercent(33), 5.61);
  assert.equal(calculateUnitsByGrams(5.61), 0.66);
});

test('десятичные проценты после округления всё равно дают ровно 17 г', () => {
  const plan = buildInventoryDeductionPlan(inventoryWith({ a: 20, b: 20, c: 20 }), [
    { id: 'a', percent: 33.33 },
    { id: 'b', percent: 33.33 },
    { id: 'c', percent: 33.34 }
  ]);
  assert.equal(plan.deductions.reduce((sum, item) => sum + item.gramsUsed, 0), 17);
});

test('без Google Sheets заказ не считается созданным', () => {
  assert.throws(
    () => assertInventoryStorageAvailable(false),
    (error) => error.code === 'INVENTORY_STORAGE_UNAVAILABLE' && error.message === 'Не удалось обновить склад. Заказ не создан.'
  );
});

test('после обновления страницы сохранённый requestId по-прежнему блокирует повторное списание', () => {
  const persistedRows = [['Дата', 'Тип', 'ID заказа'], ['2026-07-13', 'Списание', 'order-after-refresh']];
  const rowsLoadedAfterRefresh = structuredClone(persistedRows);
  assert.equal(isInventoryRequestProcessed(rowsLoadedAfterRefresh, 'order-after-refresh'), true);
});
