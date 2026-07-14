export function distributeUnlockedMixPercentages(items, totalPercent = 100, step = 5) {
  const unlockedItems = items.filter((item) => !item.locked);
  if (unlockedItems.length === 0) return items;

  const lockedPercent = items
    .filter((item) => item.locked)
    .reduce((sum, item) => sum + Number(item.percent || 0), 0);
  const availablePercent = Math.max(0, totalPercent - lockedPercent);
  const availableSteps = Math.max(0, Math.round(availablePercent / step));
  const baseSteps = Math.floor(availableSteps / unlockedItems.length);
  const remainder = availableSteps - baseSteps * unlockedItems.length;
  let unlockedIndex = 0;

  return items.map((item) => {
    if (item.locked) return item;

    const percent = (baseSteps + (unlockedIndex < remainder ? 1 : 0)) * step;
    unlockedIndex += 1;
    return { ...item, percent };
  });
}
