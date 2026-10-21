import { DEMO_DATE, getBatchIssues, getDaysUntil, isValidDate, toBaseUnits, fromBaseUnits, formatQuantity } from './inventory.js';
import { recipes, validateCaps } from './recipes.js';

function compareText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

export function inspectInventory(stock, demoDate = DEMO_DATE) {
  if (!isValidDate(demoDate)) throw new Error('Invalid demo date.');
  const idCounts = new Map();
  stock.forEach(item => idCounts.set(item.batch, (idCounts.get(item.batch) ?? 0) + 1));
  return stock.map((item, index) => {
    const issues = getBatchIssues(item);
    if (idCounts.get(item.batch) > 1) issues.push('Duplicate batch ID; all copies are excluded.');
    const days = getDaysUntil(item.deadline, demoDate);
    const expired = Number.isFinite(days) && days < 0;
    const valid = issues.length === 0;
    const availableBase = valid ? toBaseUnits(item.stock, item.unit) - toBaseUnits(item.reserved, item.unit) : null;
    return { ...item, index, issues, expired, eligible: valid && !expired,
      priority: valid && days >= 0 && days <= 2,
      availableBase, remainingBase: availableBase, usedBase: 0 };
  });
}

// Pure deterministic heuristic: never write to the supplied inventory or caps.
export function generatePlan(stock, caps, demoDate = DEMO_DATE) {
  const capErrors = validateCaps(caps);
  if (capErrors.length) throw new Error(capErrors.map(error => error.message).join(' '));
  const batches = inspectInventory(stock, demoDate);
  // FEFO within an ingredient; date ties use batch ID, then original row index.
  const availableBatches = batches.filter(batch => batch.eligible).sort((a, b) =>
    compareText(a.deadline, b.deadline) || compareText(a.batch, b.batch) || a.index - b.index);
  const priorityBatches = availableBatches.filter(batch => batch.priority);
  const dishes = recipes.map(recipe => ({ ...recipe, cap: Number(caps[recipe.id]), portions: 0, allocations: [] }));
  const totalRemaining = ingredient => availableBatches.filter(batch => batch.ingredient === ingredient)
    .reduce((total, batch) => total + batch.remainingBase, 0);

  // Earliest deadline first, then displayed recipe order. One whole serving at a time.
  for (const target of priorityBatches) {
    for (const dish of dishes) {
      if (!dish.ingredients.some(part => part.ingredient === target.ingredient)) continue;
      while (target.remainingBase > 0 && dish.portions < dish.cap) {
        const canMake = dish.ingredients.every(part => totalRemaining(part.ingredient) >= toBaseUnits(part.quantity, part.unit));
        if (!canMake) break;
        // A full serving is feasible: immediately spend from the shared budget.
        for (const part of dish.ingredients) {
          let needed = toBaseUnits(part.quantity, part.unit);
          for (const batch of availableBatches) {
            if (batch.ingredient !== part.ingredient || batch.remainingBase === 0) continue;
            const take = Math.min(needed, batch.remainingBase);
            batch.remainingBase -= take;
            batch.usedBase += take;
            const allocation = dish.allocations.find(entry => entry.batch === batch.batch);
            if (allocation) allocation.amountBase += take;
            else dish.allocations.push({ batch: batch.batch, ingredient: batch.ingredient, unit: batch.unit,
              deadline: batch.deadline, priority: batch.priority, amountBase: take });
            needed -= take;
            if (needed === 0) break;
          }
        }
        dish.portions += 1;
      }
    }
  }

  const results = dishes.map(dish => {
    const priorityUses = dish.allocations.filter(entry => entry.priority);
    const limits = [];
    if (dish.portions === dish.cap) limits.push(`Owner's extra prep cap reached (${dish.cap}).`);
    for (const part of dish.ingredients) {
      const remaining = totalRemaining(part.ingredient);
      if (remaining < toBaseUnits(part.quantity, part.unit)) {
        limits.push(`${part.ingredient}: ${formatQuantity(fromBaseUnits(remaining, part.unit), part.unit)} unallocated; ${formatQuantity(part.quantity, part.unit)} needed for another serving.`);
      }
    }
    const priorityLeft = priorityBatches.some(batch => batch.remainingBase > 0 && dish.ingredients.some(part => part.ingredient === batch.ingredient));
    if (!priorityLeft) limits.push('No unallocated priority ingredient remains for this dish.');
    return { id: dish.id, name: dish.name, cap: dish.cap, portions: dish.portions,
      reason: priorityUses.length ? `Uses priority batches: ${priorityUses.map(entry => `${entry.ingredient} / ${entry.batch} (${formatQuantity(fromBaseUnits(entry.amountBase, entry.unit), entry.unit)})`).join('; ')}.`
        : 'Not recommended: no feasible additional serving using a priority ingredient within the shared budget and owner cap.',
      limits, allocations: dish.allocations.map(entry => ({ ...entry, quantity: fromBaseUnits(entry.amountBase, entry.unit) })) };
  });

  const projections = batches.map(batch => ({ ingredient: batch.ingredient, batch: batch.batch, unit: batch.unit, deadline: batch.deadline,
    stock: batch.stock, reserved: batch.reserved, eligible: batch.eligible, priority: batch.priority,
    issues: batch.issues, excludedReason: batch.issues.length ? batch.issues.join(' ') : batch.expired ? 'Past use-by date; excluded from recommendation.' : null,
    available: batch.availableBase === null ? null : fromBaseUnits(batch.availableBase, batch.unit),
    plannedUse: fromBaseUnits(batch.usedBase, batch.unit),
    projectedStock: batch.availableBase === null ? null : fromBaseUnits(toBaseUnits(batch.stock, batch.unit) - batch.usedBase, batch.unit),
    remainingAvailable: batch.remainingBase === null ? null : fromBaseUnits(batch.remainingBase, batch.unit) }));

  const leftovers = projections.filter(batch => batch.priority && batch.remainingAvailable > 0).map(batch => {
    const related = results.filter(dish => recipes.find(recipe => recipe.id === dish.id).ingredients.some(part => part.ingredient === batch.ingredient));
    return { ...batch, explanation: related.length
      ? related.map(dish => `${dish.name}: ${dish.limits.join(' ')}`).join(' ')
      : 'No recipe uses this ingredient.' };
  });

  return { demoDate, dishes: results, projections, leftovers,
    totalPortions: results.reduce((sum, dish) => sum + dish.portions, 0),
    caps: Object.fromEntries(dishes.map(dish => [dish.id, dish.cap])) };
}
