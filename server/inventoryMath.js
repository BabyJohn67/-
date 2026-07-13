export const GRAMS_PER_UNIT = 8.5;
export const STANDARD_MIX_GRAMS = 17;
export const PERCENT_TOLERANCE = 0.01;

export class InventoryCalculationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'InventoryCalculationError';
    this.code = code;
    this.details = details;
  }
}

export function roundInventoryValue(value, digits = 2) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;

  const multiplier = 10 ** digits;
  return Math.round((numericValue + Number.EPSILON) * multiplier) / multiplier;
}

export function calculateGramsByPercent(percent) {
  return roundInventoryValue((Number(percent) / 100) * STANDARD_MIX_GRAMS, 2);
}

export function calculateUnitsByGrams(grams) {
  return roundInventoryValue(Number(grams) / GRAMS_PER_UNIT, 4);
}

export function calculateGramsByUnits(units) {
  return roundInventoryValue(Number(units) * GRAMS_PER_UNIT, 2);
}

export function calculatePercentTotal(components) {
  return roundInventoryValue(
    components.reduce((sum, component) => sum + Number(component.percent || 0), 0),
    4
  );
}

export function isPercentTotalValid(totalPercent) {
  return Math.abs(Number(totalPercent) - 100) <= PERCENT_TOLERANCE;
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildInventoryDeductionPlan(inventory, components) {
  if (!Array.isArray(components) || components.length === 0) {
    throw new InventoryCalculationError(
      'Добавьте хотя бы один табак в микс.',
      'EMPTY_COMPONENTS'
    );
  }

  const normalizedComponents = components.map((component) => ({
    id: String(component.id || component.tobaccoId || '').trim(),
    name: String(component.name || component.tobaccoName || '').trim(),
    percent: Number(component.percent)
  }));

  const invalidComponent = normalizedComponents.find(
    (component) => !Number.isFinite(component.percent) || component.percent <= 0 || (!component.id && !component.name)
  );

  if (invalidComponent) {
    throw new InventoryCalculationError(
      'У каждого компонента должны быть табак и процент больше 0.',
      'INVALID_COMPONENT'
    );
  }

  const totalPercent = calculatePercentTotal(normalizedComponents);
  if (!isPercentTotalValid(totalPercent)) {
    throw new InventoryCalculationError(
      `Сумма компонентов должна составлять 100%. Сейчас: ${totalPercent}%.`,
      'INVALID_PERCENT_TOTAL',
      { totalPercent }
    );
  }

  const gramsByComponent = normalizedComponents.map((component) => calculateGramsByPercent(component.percent));
  const roundedGramsTotal = roundInventoryValue(
    gramsByComponent.reduce((sum, grams) => sum + grams, 0),
    2
  );
  const roundingAdjustment = roundInventoryValue(STANDARD_MIX_GRAMS - roundedGramsTotal, 2);
  const lastComponentIndex = gramsByComponent.length - 1;
  gramsByComponent[lastComponentIndex] = roundInventoryValue(
    gramsByComponent[lastComponentIndex] + roundingAdjustment,
    2
  );

  const usedInventoryIds = new Set();
  const deductions = normalizedComponents.map((component, componentIndex) => {
    const tobacco = inventory.find((item) =>
      (component.id && String(item.id) === component.id) ||
      (!component.id && normalizeName(item.name) === normalizeName(component.name))
    );

    if (!tobacco) {
      throw new InventoryCalculationError(
        `Табак ${component.name || component.id} не найден. Обновите список и попробуйте снова.`,
        'TOBACCO_NOT_FOUND',
        { tobaccoId: component.id, tobaccoName: component.name }
      );
    }

    if (usedInventoryIds.has(tobacco.id)) {
      throw new InventoryCalculationError(
        `Табак ${tobacco.name} добавлен в микс несколько раз.`,
        'DUPLICATE_TOBACCO',
        { tobaccoId: tobacco.id }
      );
    }
    usedInventoryIds.add(tobacco.id);

    const gramsRequired = gramsByComponent[componentIndex];
    const unitsRequired = calculateUnitsByGrams(gramsRequired);
    const availableGrams = roundInventoryValue(tobacco.grams, 2);

    if (availableGrams < gramsRequired) {
      throw new InventoryCalculationError(
        `Недостаточно табака ${tobacco.name}. Нужно ${gramsRequired} г, доступно ${availableGrams} г.`,
        'INSUFFICIENT_STOCK',
        {
          tobaccoId: tobacco.id,
          tobaccoName: tobacco.name,
          requiredGrams: gramsRequired,
          availableGrams
        }
      );
    }

    const rawRemainingGrams = roundInventoryValue(availableGrams - gramsRequired, 2);
    const remainingGrams = rawRemainingGrams < 0 && rawRemainingGrams >= -0.01
      ? 0
      : rawRemainingGrams;
    const remainingUnits = calculateUnitsByGrams(remainingGrams);

    return {
      tobacco,
      component,
      gramsUsed: gramsRequired,
      unitsUsed: unitsRequired,
      remainingGrams,
      remainingUnits
    };
  });

  return {
    percentTotal: totalPercent,
    totalGrams: STANDARD_MIX_GRAMS,
    totalUnits: calculateUnitsByGrams(STANDARD_MIX_GRAMS),
    deductions
  };
}

export function isInventoryRequestProcessed(rows, requestId, requestIdColumnIndex = 2) {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) return false;
  return rows.some((row) => String(row[requestIdColumnIndex] || '').trim() === normalizedRequestId);
}

export function assertInventoryStorageAvailable(isAvailable) {
  if (!isAvailable) {
    throw new InventoryCalculationError(
      'Не удалось обновить склад. Заказ не создан.',
      'INVENTORY_STORAGE_UNAVAILABLE'
    );
  }
}
