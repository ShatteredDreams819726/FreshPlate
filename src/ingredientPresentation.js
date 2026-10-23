// Presentation is keyed by stable ingredient ID, never by arrival source or batch ID.
const defaults = {
  tomatoes: ['🍅', 'tomato'], eggs: ['🥚', 'egg'], 'green-peppers': ['🫑', 'pepper'],
  chicken: ['🍗', 'chicken'], potatoes: ['🥔', 'potato'], cabbage: ['🥬', 'cabbage'],
  rice: ['🍚', 'rice'], carrots: ['🥕', 'carrot'],
};
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_ICON_LENGTH = 40000;
export const normalizedName = name => String(name ?? '').trim().toLowerCase();
export const unitDimension = unit => ['kg', 'g'].includes(unit) ? 'weight' : unit === 'pcs' ? 'count' : null;
export function exactCandidates(name, unit, catalog) {
  const dimension = unitDimension(unit);
  return dimension ? catalog.filter(item => normalizedName(item.name) === normalizedName(name) && unitDimension(item.unit) === dimension) : [];
}
const aliases = { tomatoes: ['番茄', '西红柿', 'tomato'], eggs: ['鸡蛋', 'egg'], 'green peppers': ['青椒', 'green pepper'], chicken: ['鸡肉'], potatoes: ['土豆', 'potato'], 'chinese cabbage': ['白菜', 'cabbage'], 'cooked rice': ['米饭', 'rice'], carrots: ['胡萝卜', 'carrot'] };
export function suggestedIngredients(name, unit, catalog) {
  const query = normalizedName(name), dimension = unitDimension(unit);
  if (!query) return [];
  return catalog.filter(item => {
    const candidate = normalizedName(item.name);
    return (!dimension || unitDimension(item.unit) === dimension) && candidate !== query &&
      (candidate.includes(query) || query.includes(candidate) || aliases[candidate]?.includes(query) || aliases[query]?.includes(candidate));
  });
}
export function ingredientIcon(state, ingredientId) {
  const [symbol, color] = defaults[ingredientId] ?? ['🥣', 'neutral'];
  return { symbol, color, image: state.ingredientIcons?.[ingredientId] ?? null };
}
export function validIcon(value) {
  if (typeof value !== 'string' || value.length > MAX_ICON_LENGTH) return false;
  // Only bounded PNG/JPEG data URLs, never remote URLs or executable SVG.
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) &&
    (value.startsWith('data:image/png;base64,iVBORw0KGgo') || value.startsWith('data:image/jpeg;base64,/9j/'));
}
export function batchLabel(batchOrId, inventory) {
  const internalId = typeof batchOrId === 'string' ? batchOrId : batchOrId.batch;
  const index = inventory.findIndex(item => item.batch === internalId);
  const batch = index >= 0 ? inventory[index] : typeof batchOrId === 'object' ? batchOrId : null;
  if (batch?.supplierBatch?.trim()) return batch.supplierBatch.trim();
  if (batch && !batch.importId && !internalId.startsWith('B-IMP-')) return internalId;
  // Inventory is append-only; the full persisted position is stable, not a truncated ID.
  return index >= 0 ? `Batch ${String(index + 1).padStart(3, '0')}` : 'Unlisted batch';
}
export function displayBatchText(value, inventory) {
  let result = value;
  for (const batch of [...inventory].sort((a, b) => b.batch.length - a.batch.length)) {
    result = result.split(batch.batch).join(batchLabel(batch, inventory));
  }
  return result;
}
export function ingredientReview(state) {
  return state.ingredients.flatMap((item, index) => {
    const peers = state.ingredients.slice(index + 1).filter(other => normalizedName(item.name) === normalizedName(other.name) || suggestedIngredients(item.name, item.unit, [other]).length);
    return peers.map(other => ({ candidates: [item, other].map(candidate => ({ ...candidate,
      batches: state.inventory.filter(batch => batch.ingredientId === candidate.id).length,
      recipes: state.recipes.filter(recipe => recipe.ingredients.some(part => part.ingredientId === candidate.id)).length,
      plans: state.plans.filter(plan => plan.snapshot.recipes.some(recipe => recipe.ingredients.some(part => part.ingredientId === candidate.id))).length,
    })) }));
  });
}
