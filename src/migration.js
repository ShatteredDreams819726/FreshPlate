import { ingredients, DEMO_DATE } from './demoInputs.js';
import { recipes } from './recipes.js';
import { validateLegacyState } from './legacyV1.js';

export function migrateV1(original) {
  validateLegacyState(original);
  const state = structuredClone(original);
  const addReference = row => {
    const definition = ingredients.find(item => item.name === row.ingredient);
    if (!definition) throw new Error(`Cannot migrate unknown legacy ingredient: ${row.ingredient}`);
    row.ingredientId = definition.id;
  };
  state.ingredients = structuredClone(ingredients);
  state.recipes = structuredClone(recipes);
  state.mode = 'demo'; state.recipeRevision = 0; state.imports = [];
  state.inventory.forEach(addReference);
  for (const plan of state.plans) {
    plan.snapshot.ingredients = structuredClone(ingredients);
    plan.snapshot.mode = 'demo'; plan.snapshot.recipeRevision = 0;
    if (plan.snapshot.result.demoDate !== DEMO_DATE) throw new Error('Unknown legacy planning date.');
    plan.snapshot.recipes.forEach(recipe => recipe.ingredients.forEach(addReference));
    plan.snapshot.result.dishes.forEach(dish => dish.allocations.forEach(addReference));
    plan.snapshot.result.projections.forEach(addReference);
    plan.snapshot.result.leftovers.forEach(addReference);
  }
  state.activity.forEach(event => event.changes.forEach(addReference));
  return state;
}
