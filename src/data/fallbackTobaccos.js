import { GRAMS_PER_UNIT } from '../config.js';

const items = [
  { name: 'Darkside Core Lemongrass', quantity: 3, taste: 'Лемонграсс, цитрус, свежесть' },
  { name: 'Musthave Pinkman', quantity: 2, taste: 'Грейпфрут, клубника, малина' },
  { name: 'BlackBurn Haribon', quantity: 0, taste: 'Мармеладные мишки' },
  { name: 'Sebero Arctic Mix', quantity: 5, taste: 'Ягоды, холодок' },
  { name: 'Element Water Melon', quantity: 1, taste: 'Сочный арбуз' },
  { name: 'Daily Hookah Cola', quantity: 0, taste: 'Кола с лимоном' }
];

export const fallbackTobaccos = items.map((item, index) => ({
  ...item,
  id: `fallback-${index}`,
  grams: Math.round(item.quantity * GRAMS_PER_UNIT * 10) / 10,
  inStock: item.quantity > 0
}));
