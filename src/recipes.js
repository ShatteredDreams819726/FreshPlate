// Fixed display/allocation order. kg values are converted to whole grams in planner.js.
export const recipes = [
  { id: 'tomato-egg', name: 'Tomato & Egg Stir-fry', defaultCap: 16, ingredients: [
    { ingredient: 'Tomatoes', quantity: 0.2, unit: 'kg' },
    { ingredient: 'Eggs', quantity: 2, unit: 'pcs' },
  ] },
  { id: 'pepper-chicken', name: 'Pepper Chicken', defaultCap: 12, ingredients: [
    { ingredient: 'Green peppers', quantity: 0.12, unit: 'kg' },
    { ingredient: 'Chicken', quantity: 0.15, unit: 'kg' },
  ] },
  { id: 'potato-chicken', name: 'Potato Chicken Stew', defaultCap: 10, ingredients: [
    { ingredient: 'Potatoes', quantity: 0.25, unit: 'kg' },
    { ingredient: 'Chicken', quantity: 0.2, unit: 'kg' },
    { ingredient: 'Carrots', quantity: 0.05, unit: 'kg' },
  ] },
  { id: 'cabbage', name: 'Stir-fried Cabbage', defaultCap: 16, ingredients: [
    { ingredient: 'Chinese cabbage', quantity: 0.2, unit: 'kg' },
  ] },
  { id: 'egg-rice', name: 'Egg Fried Rice', defaultCap: 12, ingredients: [
    { ingredient: 'Cooked rice', quantity: 0.25, unit: 'kg' },
    { ingredient: 'Eggs', quantity: 1, unit: 'pcs' },
    { ingredient: 'Carrots', quantity: 0.04, unit: 'kg' },
  ] },
];

export const defaultCaps = Object.fromEntries(recipes.map(recipe => [recipe.id, String(recipe.defaultCap)]));

// Do not coerce empty strings, decimals or scientific notation into valid caps.
export function validateCaps(caps) {
  return recipes.flatMap(recipe => {
    const raw = caps[recipe.id];
    const valid = (typeof raw === 'number' || typeof raw === 'string') && /^\d+$/.test(String(raw)) && Number.isSafeInteger(Number(raw));
    return valid ? [] : [{ recipeId: recipe.id, message: `${recipe.name}: enter a non-negative whole number (0 or more).` }];
  });
}
