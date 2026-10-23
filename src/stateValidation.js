import { createInitialState, transition, totalReserved } from './workflow.js';
import { getBatchIssues, getDaysUntil, isValidDate, toBaseUnits, DEMO_DATE } from './inventory.js';
import { validIcon } from './ingredientPresentation.js';
import { creationTime, validatePlanNumbering } from './planNumbers.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const whole = value => Number.isSafeInteger(value) && value >= 0;
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const id = value => typeof value === 'string' && /^[A-Za-z0-9-]+$/.test(value);

function validateCatalog(catalog) {
  check(Array.isArray(catalog), 'Missing ingredient catalog.');
  const ids = new Set(), names = new Set();
  for (const item of catalog) {
    check(item && id(item.id) && typeof item.name === 'string' && item.name.trim() && ['kg', 'pcs'].includes(item.unit) && !ids.has(item.id) && !names.has(`${item.name.trim().toLowerCase()}:${item.unit}`), 'Invalid or duplicate ingredient definition.');
    ids.add(item.id); names.add(`${item.name.trim().toLowerCase()}:${item.unit}`);
  }
}

function validateRecipes(book, catalog) {
  check(Array.isArray(book), 'Missing recipe catalog.');
  const ids = new Set();
  for (const recipe of book) {
    check(recipe && id(recipe.id) && !ids.has(recipe.id) && typeof recipe.name === 'string' && recipe.name.trim() && Array.isArray(recipe.ingredients) && recipe.ingredients.length, 'Invalid recipe definition.');
    ids.add(recipe.id);
    const used = new Set();
    for (const part of recipe.ingredients) {
      const definition = catalog.find(item => item.id === part.ingredientId);
      const base = part.quantity * (part.unit === 'kg' ? 1000 : 1);
      check(definition && definition.unit === part.unit && !used.has(part.ingredientId) && typeof part.quantity === 'number' && part.quantity > 0 && Number.isSafeInteger(Math.round(base)) && Math.abs(base - Math.round(base)) < 1e-7, 'Invalid recipe ingredient ID, unit or per-serving quantity.');
      used.add(part.ingredientId);
    }
  }
}

function validateSnapshot(plan, state) {
  check(id(plan.id) && ['Draft', 'Approved', 'Completed', 'Cancelled'].includes(plan.status) && (plan.createdAt == null || typeof plan.createdAt === 'string'), 'Invalid saved plan identity, status or time.');
  const snap = plan.snapshot, result = snap?.result;
  check(snap && whole(snap.inventoryRevision) && snap.inventoryRevision <= state.inventoryRevision && whole(snap.capsRevision) && snap.capsRevision <= state.capsRevision && whole(snap.recipeRevision) && snap.recipeRevision <= state.recipeRevision, 'Invalid snapshot revision.');
  check(['demo', 'business'].includes(snap.mode) && result && isValidDate(result.demoDate) && (snap.mode !== 'demo' || result.demoDate === DEMO_DATE), 'Invalid snapshot planning date.');
  validateCatalog(snap.ingredients); validateRecipes(snap.recipes, snap.ingredients);
  check(Array.isArray(result.dishes) && result.dishes.length === snap.recipes.length && Array.isArray(result.projections) && Array.isArray(result.leftovers), 'Incomplete plan snapshot.');
  const budget = new Map(), dishIds = new Set();
  for (const dish of result.dishes) {
    const recipe = snap.recipes.find(item => item.id === dish.id);
    check(recipe && !dishIds.has(dish.id) && dish.name === recipe.name && whole(dish.portions) && whole(dish.cap) && dish.portions <= dish.cap && result.caps?.[dish.id] === dish.cap && typeof dish.reason === 'string' && Array.isArray(dish.limits) && dish.limits.every(item => typeof item === 'string') && Array.isArray(dish.allocations), 'Invalid saved dish or servings.');
    dishIds.add(dish.id);
    const batches = new Set();
    for (const item of dish.allocations) {
      check(!batches.has(item.batch) && recipe.ingredients.some(part => part.ingredientId === item.ingredientId && part.unit === item.unit) && typeof item.quantity === 'number' && item.quantity > 0 && Number.isSafeInteger(item.amountBase) && item.amountBase === toBaseUnits(item.quantity, item.unit), 'Invalid saved allocation.');
      batches.add(item.batch);
      budget.set(item.batch, (budget.get(item.batch) ?? 0) + item.amountBase);
    }
    for (const part of recipe.ingredients) check(dish.allocations.filter(item => item.ingredientId === part.ingredientId).reduce((sum, item) => sum + item.amountBase, 0) === toBaseUnits(part.quantity, part.unit) * dish.portions, 'Snapshot quantities do not match saved recipe servings.');
    check(!dish.portions || dish.allocations.some(item => item.priority), 'Saved dish does not use priority stock.');
  }
  check(result.totalPortions === result.dishes.reduce((sum, dish) => sum + dish.portions, 0), 'Invalid portion total.');
  const batchIds = new Set();
  for (const batch of result.projections) {
    check(!batchIds.has(batch.batch) && getBatchIssues(batch, snap.ingredients).length === 0, 'Invalid snapshot batch.');
    batchIds.add(batch.batch);
    const days = getDaysUntil(batch.deadline, result.demoDate);
    check(batch.eligible === (days >= 0) && batch.priority === (days >= 0 && days <= 2) && Array.isArray(batch.issues) && batch.issues.length === 0 && (batch.excludedReason === null || typeof batch.excludedReason === 'string'), 'Invalid batch eligibility.');
    const amount = budget.get(batch.batch) ?? 0;
    const stock = toBaseUnits(batch.stock, batch.unit), reserved = toBaseUnits(batch.reserved, batch.unit);
    for (const [field, expected] of Object.entries({ available: stock - reserved, plannedUse: amount, projectedStock: stock - amount, remainingAvailable: stock - reserved - amount })) check(typeof batch[field] === 'number' && Number.isFinite(batch[field]) && batch[field] >= 0 && toBaseUnits(batch[field], batch.unit) === expected, 'Invalid projected quantities.');
    for (const item of result.dishes.flatMap(dish => dish.allocations).filter(item => item.batch === batch.batch)) check(item.ingredientId === batch.ingredientId && item.unit === batch.unit && item.deadline === batch.deadline && days >= 0 && item.priority === batch.priority, 'Saved allocation does not match its batch.');
  }
  check([...budget.keys()].every(batch => batchIds.has(batch)), 'Allocation batch is missing from source inventory.');
  const leftovers = result.projections.filter(batch => batch.priority && batch.remainingAvailable > 0);
  check(result.leftovers.length === leftovers.length && new Set(result.leftovers.map(batch => batch.batch)).size === leftovers.length, 'Invalid saved leftovers.');
  for (const item of result.leftovers) {
    const expected = leftovers.find(batch => batch.batch === item.batch);
    check(expected && typeof item.explanation === 'string' && ['ingredientId', 'unit', 'deadline', 'remainingAvailable'].every(field => item[field] === expected[field]), 'Invalid saved leftovers.');
  }
}

// Replay only saved confirmations and state changes. Never regenerate a plan.
export function validateState(state) {
  check(state && Array.isArray(state.inventory) && Array.isArray(state.plans) && Array.isArray(state.activity) && Array.isArray(state.imports), 'Missing inventory, plans, imports or activity.');
  check(whole(state.inventoryRevision) && whole(state.capsRevision) && whole(state.recipeRevision) && ['demo', 'business'].includes(state.mode), 'Invalid data revision or planning mode.');
  validateCatalog(state.ingredients); validateRecipes(state.recipes, state.ingredients);
  if (state.ingredientIcons !== undefined) {
    check(state.ingredientIcons && typeof state.ingredientIcons === 'object' && !Array.isArray(state.ingredientIcons), 'Invalid saved ingredient icons.');
    for (const [ingredientId, image] of Object.entries(state.ingredientIcons)) check(state.ingredients.some(item => item.id === ingredientId) && validIcon(image), 'Invalid saved ingredient icon.');
  }
  check(state.caps && Object.keys(state.caps).length === state.recipes.length && state.recipes.every(recipe => typeof state.caps[recipe.id] === 'string'), 'Invalid owner caps.');
  check(new Set(state.plans.map(plan => plan.id)).size === state.plans.length, 'Duplicate saved plan ID.');
  validatePlanNumbering(state);
  for (const plan of state.plans) validateSnapshot(plan, state);
  check((!state.plans.length && state.currentPlanId === null) || state.plans.some(plan => plan.id === state.currentPlanId), 'Current plan is missing.');
  let replay = createInitialState();
  const eventIds = new Set();
  for (const event of state.activity) {
    const legacyDraft = event?.action === 'Draft' && state.plans.some(plan => plan.id === event.planId && !creationTime(plan, state.activity)) && (event.time == null || event.time === '');
    check(event && (validTime(event.time) || legacyDraft) && !eventIds.has(event.id), 'Invalid or duplicate activity record.');
    eventIds.add(event.id);
    if (['StockImported', 'RecipeSaved', 'ModeChanged'].includes(event.action)) {
      check(event.request && event.request.time === event.time, 'Missing data confirmation request.');
      const next = transition(replay, event.request);
      check(same(next.activity.at(-1), event), 'Import or recipe record does not match confirmation.');
      replay = next;
      continue;
    }
    const plan = state.plans.find(item => item.id === event.planId);
    check(plan && event.id === `${plan.id}:${event.action}`, 'Invalid plan activity.');
    if (event.action === 'Draft') {
      const created = creationTime(plan, state.activity);
      check(!replay.plans.some(item => item.id === plan.id) && (created ? event.time === created : legacyDraft) && plan.snapshot.inventoryRevision === replay.inventoryRevision && plan.snapshot.recipeRevision === replay.recipeRevision && plan.snapshot.mode === replay.mode && same(plan.snapshot.ingredients, replay.ingredients) && same(plan.snapshot.recipes, replay.recipes), 'Invalid draft history or recipe snapshot.');
      check(plan.snapshot.result.projections.length === replay.inventory.length, 'Draft source has missing or extra batches.');
      for (const batch of plan.snapshot.result.projections) {
        const source = replay.inventory.find(item => item.batch === batch.batch);
        check(source && source.ingredientId === batch.ingredientId && source.unit === batch.unit && source.deadline === batch.deadline && source.stock === batch.stock && totalReserved(source) === batch.reserved, 'Draft source inventory does not match history.');
      }
      const inserted = structuredClone(plan);
      inserted.status = 'Draft';
      for (const field of ['approvedAt', 'completedAt', 'cancelledAt']) delete inserted[field];
      replay.plans.push(inserted); replay.currentPlanId = inserted.id;
      check(Array.isArray(event.changes) && !event.changes.length, 'A draft cannot record stock changes.');
      check(same(event.dishes, plan.snapshot.result.dishes.filter(dish => dish.portions > 0).map(({ name, portions }) => ({ name, portions }))), 'Invalid recorded dish portions.');
      replay.activity.push(event);
    } else {
      const type = { Approved: 'APPROVE', Completed: 'COMPLETE', Cancelled: 'CANCEL' }[event.action];
      check(type, 'Unknown activity action.');
      replay.capsRevision = plan.snapshot.capsRevision;
      const next = transition(replay, { type, planId: plan.id, time: event.time, today: plan.snapshot.result.demoDate });
      check(same(next.activity.at(-1), event), 'Activity batch changes do not match the plan snapshot.');
      replay = next;
    }
  }
  for (const plan of state.plans) {
    const expected = replay.plans.find(item => item.id === plan.id);
    check(expected && ['status', 'approvedAt', 'completedAt', 'cancelledAt'].every(field => expected[field] === plan[field]), 'Saved status or timestamps do not match activity.');
  }
  for (const field of ['inventory', 'ingredients', 'recipes', 'mode', 'imports', 'inventoryRevision', 'recipeRevision']) check(same(state[field], replay[field]), 'Inventory, recipes or reservations do not match successful operations.');
  return state;
}
