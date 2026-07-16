import { TASTE_CATEGORIES } from '../data/tastePreferences.js';

export function getBrand(item) {
  return item.brand || item.name.trim().split(/\s+/)[0] || 'Другое';
}

export function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesTobaccoSearch(item, searchValue) {
  const normalizedSearch = normalizeSearchValue(searchValue);
  if (!normalizedSearch) return true;

  const haystack = normalizeSearchValue(`${getBrand(item)} ${item.name} ${item.taste}`);
  return normalizedSearch.split(' ').every((word) => haystack.includes(word));
}

export function getGuestStockStatus(item) {
  if (item.quantity <= 0) return { label: 'Скоро появится', type: 'empty' };
  return { label: 'В наличии', type: 'available' };
}

export function getMasterStockStatus(item) {
  if (item.quantity <= 0) return { label: 'Нет в наличии', type: 'empty' };
  if (item.quantity <= 1) return { label: 'Заканчивается', type: 'low' };
  return { label: 'В наличии', type: 'available' };
}

export function getTasteMatches(item) {
  const text = `${item.name} ${item.taste}`.toLowerCase();
  return TASTE_CATEGORIES.filter((category) =>
    category.keywords.some((keyword) => text.includes(keyword))
  );
}

export function estimateStrength(item) {
  const text = `${item.name} ${item.taste}`.toLowerCase();

  // Это только мягкая подсказка. Точную крепость позже нужно читать из отдельной колонки таблицы.
  if (['deus', 'bonche', 'satyr', 'tr125', 'terror', 'kraken', 'black afgano'].some((word) => text.includes(word))) {
    return 'strong';
  }

  if (['darkside', 'ds ', 'musthave', 'mh ', 'blackburn', 'bb ', 'overdose', 'od '].some((word) => text.includes(word))) {
    return 'medium';
  }

  if (['fresh', 'ice', 'холод', 'ягод', 'клубник', 'малин', 'арбуз', 'дын', 'чай', 'tea', 'sebero', 'sl ', 'adalya'].some((word) => text.includes(word))) {
    return 'light';
  }

  return 'medium';
}

export function scoreTobacco(item, selectedCategoryIds, selectedStrength) {
  const categoryIds = getTasteMatches(item).map((category) => category.id);
  const categoryMatches = selectedCategoryIds.filter((id) => categoryIds.includes(id)).length;
  let score = item.inStock ? 40 : 0;

  score += categoryMatches * 22;
  if (selectedCategoryIds.length > 0 && categoryMatches === 0) score -= 15;
  if (selectedStrength !== 'any' && estimateStrength(item) === selectedStrength) score += 12;
  if (item.quantity > 1) score += Math.min(item.quantity, 6);

  return score;
}
