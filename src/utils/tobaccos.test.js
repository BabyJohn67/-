import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBrand,
  getGuestStockStatus,
  getMasterStockStatus,
  matchesTobaccoSearch,
  scoreTobacco
} from './tobaccos.js';

const tobacco = {
  brand: 'Darkside',
  name: 'Northern Red',
  taste: 'Северная красная ягода',
  quantity: 2,
  inStock: true
};

test('поиск табака учитывает бренд, название, перевод и несколько слов', () => {
  assert.equal(matchesTobaccoSearch(tobacco, 'darkside'), true);
  assert.equal(matchesTobaccoSearch(tobacco, 'northern red'), true);
  assert.equal(matchesTobaccoSearch(tobacco, 'СЕВЕРНАЯ ягода'), true);
  assert.equal(matchesTobaccoSearch(tobacco, 'мята'), false);
});

test('бренд берется из отдельного поля или из первого слова названия', () => {
  assert.equal(getBrand(tobacco), 'Darkside');
  assert.equal(getBrand({ name: 'Sebero Arctic', brand: '' }), 'Sebero');
});

test('гость и мастер видят предусмотренные статусы остатков', () => {
  assert.deepEqual(getGuestStockStatus({ quantity: 1 }), { label: 'В наличии', type: 'available' });
  assert.deepEqual(getMasterStockStatus({ quantity: 1 }), { label: 'Заканчивается', type: 'low' });
  assert.deepEqual(getGuestStockStatus({ quantity: 0 }), { label: 'Скоро появится', type: 'empty' });
});

test('рекомендации ставят совпадающий вкус выше постороннего', () => {
  const berryScore = scoreTobacco(tobacco, ['berry'], 'any');
  const mintScore = scoreTobacco({ ...tobacco, taste: 'Мята' }, ['berry'], 'any');
  assert.ok(berryScore > mintScore);
});
