import test from 'node:test';
import assert from 'node:assert/strict';
import { distributeUnlockedMixPercentages } from './mixPercentages.js';

test('зафиксированные 10% оставляют двум табакам по 45%', () => {
  const result = distributeUnlockedMixPercentages([
    { tobaccoId: 'cold', percent: 10, locked: true },
    { tobaccoId: 'watermelon', percent: 0, locked: false },
    { tobaccoId: 'melon', percent: 0, locked: false }
  ]);

  assert.deepEqual(result.map((item) => item.percent), [10, 45, 45]);
});

test('распределение без фиксации сохраняет шаг 5%', () => {
  const result = distributeUnlockedMixPercentages([
    { tobaccoId: 'one', percent: 0 },
    { tobaccoId: 'two', percent: 0 },
    { tobaccoId: 'three', percent: 0 }
  ]);

  assert.deepEqual(result.map((item) => item.percent), [35, 35, 30]);
});

test('если все значения зафиксированы, распределение их не меняет', () => {
  const items = [
    { tobaccoId: 'one', percent: 40, locked: true },
    { tobaccoId: 'two', percent: 60, locked: true }
  ];

  assert.deepEqual(distributeUnlockedMixPercentages(items), items);
});
