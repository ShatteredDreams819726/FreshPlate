// Shared editable demo inputs for the web app and dependency-free Node CLI.
// All data is fictional. Date priorities are not food-safety assessments.
// Edit stock, reserved (existing orders), deadline and owner caps here, then rerun.
// Keep kg to at most 3 decimal places; eggs use whole pcs. Caps are whole servings.
export const DEMO_DATE = '2026-10-21';

export const ingredients = [
  { id: 'tomatoes', name: 'Tomatoes', unit: 'kg' },
  { id: 'eggs', name: 'Eggs', unit: 'pcs' },
  { id: 'green-peppers', name: 'Green peppers', unit: 'kg' },
  { id: 'chicken', name: 'Chicken', unit: 'kg' },
  { id: 'potatoes', name: 'Potatoes', unit: 'kg' },
  { id: 'cabbage', name: 'Chinese cabbage', unit: 'kg' },
  { id: 'rice', name: 'Cooked rice', unit: 'kg' },
  { id: 'carrots', name: 'Carrots', unit: 'kg' },
];

export const inventory = [
  { ingredientId: 'tomatoes', ingredient: 'Tomatoes', detail: 'Produce', batch: 'TOM-1020-A', stock: 8, reserved: 3, unit: 'kg', deadline: '2026-10-21', symbol: '🍅', color: 'tomato' },
  { ingredientId: 'eggs', ingredient: 'Eggs', detail: 'Eggs', batch: 'EGG-1019-A', stock: 120, reserved: 48, unit: 'pcs', deadline: '2026-10-24', symbol: '🥚', color: 'egg' },
  { ingredientId: 'green-peppers', ingredient: 'Green peppers', detail: 'Produce', batch: 'PEP-1020-A', stock: 4.5, reserved: 1.5, unit: 'kg', deadline: '2026-10-22', symbol: '🫑', color: 'pepper' },
  { ingredientId: 'chicken', ingredient: 'Chicken', detail: 'Poultry', batch: 'CHK-1020-A', stock: 6, reserved: 2.5, unit: 'kg', deadline: '2026-10-21', symbol: '🍗', color: 'chicken' },
  { ingredientId: 'potatoes', ingredient: 'Potatoes', detail: 'Produce', batch: 'POT-1018-A', stock: 12, reserved: 4, unit: 'kg', deadline: '2026-10-26', symbol: '🥔', color: 'potato' },
  { ingredientId: 'cabbage', ingredient: 'Chinese cabbage', detail: 'Produce', batch: 'CAB-1020-A', stock: 7, reserved: 2, unit: 'kg', deadline: '2026-10-23', symbol: '🥬', color: 'cabbage' },
  { ingredientId: 'rice', ingredient: 'Cooked rice', detail: 'Prepared ingredient', batch: 'RCE-1021-A', stock: 5, reserved: 3, unit: 'kg', deadline: '2026-10-21', symbol: '🍚', color: 'rice' },
  { ingredientId: 'carrots', ingredient: 'Carrots', detail: 'Produce', batch: 'CAR-1019-A', stock: 6.5, reserved: 1.5, unit: 'kg', deadline: '2026-10-25', symbol: '🥕', color: 'carrot' },
  { ingredientId: 'eggs', ingredient: 'Eggs', detail: 'Eggs · earlier batch', batch: 'EGG-1020-B', stock: 18, reserved: 6, unit: 'pcs', deadline: '2026-10-22', symbol: '🥚', color: 'egg' },
  { ingredientId: 'chicken', ingredient: 'Chicken', detail: 'Poultry · later batch', batch: 'CHK-1021-B', stock: 3, reserved: 1, unit: 'kg', deadline: '2026-10-24', symbol: '🍗', color: 'chicken' },
  { ingredientId: 'tomatoes', ingredient: 'Tomatoes', detail: 'Produce · excluded from plans', batch: 'TOM-1018-X', stock: 0.8, reserved: 0.2, unit: 'kg', deadline: '2026-10-20', symbol: '🍅', color: 'tomato' },
];

// Owner-supplied extra prep caps, not demand forecasts or guarantees of sales.
export const extraPrepCaps = {
  'tomato-egg': 16,
  'pepper-chicken': 12,
  'potato-chicken': 10,
  cabbage: 16,
  'egg-rice': 12,
};
