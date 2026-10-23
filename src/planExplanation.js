import { formatQuantity, fromBaseUnits, toBaseUnits } from './inventory.js';

const join = values => new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(values);
const name = value => value.toLowerCase();

// Presentation only: read the saved recipe and final shared budget, never rerun
// allocation or consult today's inventory. This also supports existing snapshots.
export function dishLimitFacts(dish, recipe, result) {
  const eligible = result.projections.filter(batch => batch.eligible);
  const shortages = recipe.ingredients.flatMap(part => {
    const remainingBase = eligible.filter(batch => batch.ingredientId === part.ingredientId)
      .reduce((sum, batch) => sum + toBaseUnits(batch.remainingAvailable, batch.unit), 0);
    const requiredBase = toBaseUnits(part.quantity, part.unit);
    return remainingBase < requiredBase ? [{ ...part, remainingBase, requiredBase }] : [];
  });
  return {
    capReached: dish.portions === dish.cap,
    shortages,
    priorityExhausted: !eligible.some(batch => batch.priority && batch.remainingAvailable > 0 &&
      recipe.ingredients.some(part => part.ingredientId === batch.ingredientId)),
  };
}

export function recommendationText(dish) {
  const uses = new Map(), batches = new Set();
  for (const allocation of dish.allocations.filter(item => item.priority && item.amountBase > 0)) {
    const key = allocation.ingredientId;
    const use = uses.get(key) ?? { ...allocation, amountBase: 0 };
    use.amountBase += allocation.amountBase;
    uses.set(key, use);
    batches.add(allocation.batch);
  }
  if (!uses.size) return '';
  const quantities = [...uses.values()].map(use => {
    const quantity = fromBaseUnits(use.amountBase, use.unit);
    return use.unit === 'pcs'
      ? `${quantity} ${name(use.ingredient)}`
      : `${formatQuantity(quantity, use.unit)} of ${name(use.ingredient)}`;
  });
  return `Uses ${join(quantities)} from ${batches.size === 1 ? 'a priority batch' : 'priority batches'}.`;
}

export function limitText(facts) {
  const parts = [];
  if (facts.capReached) parts.push('Prep limit reached');
  if (facts.shortages.length) parts.push(`Limited by available ${join(facts.shortages.map(part => name(part.ingredient)))}`);
  if (facts.priorityExhausted) parts.push('No priority stock remains for this dish');
  return parts.length ? `${parts.join('; ')}.` : '';
}

export function remainingStockFacts(batch, result, recipes) {
  const related = result.dishes.flatMap(dish => {
    const recipe = recipes.find(item => item.id === dish.id);
    if (!recipe?.ingredients.some(part => part.ingredientId === batch.ingredientId)) return [];
    return [{ dishId: dish.id, ...dishLimitFacts(dish, recipe, result) }];
  });
  if (!related.length) return [{ type: 'noRecipe' }];
  const facts = [];
  if (related.some(item => item.capReached)) facts.push({ type: 'prepLimit' });
  const supporting = new Map();
  for (const item of related) for (const part of item.shortages) {
    if (part.ingredientId !== batch.ingredientId) supporting.set(part.ingredientId, part.ingredient);
  }
  if (supporting.size) facts.push({ type: 'supportingShortage', ingredients: [...supporting.values()] });
  if (related.some(item => item.shortages.some(part => part.ingredientId === batch.ingredientId))) {
    facts.push({ type: 'servingShortage' });
  }
  return facts;
}

export function remainingStockText(facts) {
  const phrases = facts.map(fact => {
    switch (fact.type) {
      case 'noRecipe': return 'No matching recipe';
      case 'prepLimit': return 'Prep limit reached';
      case 'supportingShortage': return `Supporting ingredients insufficient (${join(fact.ingredients.map(name))})`;
      case 'servingShortage': return 'Not enough for another serving';
      default: throw new Error('Unknown remaining stock reason.');
    }
  });
  return phrases.length ? `${phrases.join('; ')}.` : 'Review batch allocation.';
}
