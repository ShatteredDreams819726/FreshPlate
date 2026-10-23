import { inventory as initialInventory, DEMO_DATE, getBatchIssues, getDaysUntil, toBaseUnits, fromBaseUnits } from './inventory.js';
import { recipes, defaultCaps } from './recipes.js';
import { generatePlan } from './planner.js';
import { ingredients as initialIngredients } from './demoInputs.js';
import { commitDataChange, todayLocal } from './dataEntry.js';
import { validIcon } from './ingredientPresentation.js';
import { emptyPlanNumbering, assignPlanNumber } from './planNumbers.js';

const copy = value => structuredClone(value);
function requireCondition(condition, message) { if (!condition) throw new Error(message); }
const whole = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function createInitialState() {
  return { ingredients: copy(initialIngredients), recipes: copy(recipes), mode: 'demo', recipeRevision: 0, imports: [], inventory: initialInventory.map(({ reserved, ...batch }) => ({ ...batch, orderReserved: reserved, planReservations: {} })),
    caps: { ...defaultCaps }, capsRevision: 0, inventoryRevision: 0, plans: [], planNumbering: emptyPlanNumbering(), currentPlanId: null, activity: [] };
}

export function planReserved(batch) {
  return fromBaseUnits(Object.values(batch.planReservations).reduce((sum, value) => sum + toBaseUnits(value, batch.unit), 0), batch.unit);
}

export function totalReserved(batch) {
  return fromBaseUnits(toBaseUnits(batch.orderReserved, batch.unit) + toBaseUnits(planReserved(batch), batch.unit), batch.unit);
}

// One adapter lets the existing planner retain its reserved = total reserved contract.
export function inventoryForPlanner(state) {
  return state.inventory.map(batch => ({ ...batch, ingredient: state.ingredients.find(item => item.id === batch.ingredientId)?.name ?? batch.ingredient, reserved: totalReserved(batch) }));
}

export const activePlan = state => state.plans.find(plan => plan.status === 'Approved') ?? null;
export const currentPlan = state => state.plans.find(plan => plan.id === state.currentPlanId) ?? null;
export const planningDate = (state, today = todayLocal()) => state.mode === 'demo' ? DEMO_DATE : today;
export const isDraftStale = (state, plan, date = planningDate(state)) => plan.status === 'Draft' &&
  (plan.snapshot.inventoryRevision !== state.inventoryRevision || plan.snapshot.capsRevision !== state.capsRevision || plan.snapshot.recipeRevision !== state.recipeRevision || plan.snapshot.result.demoDate !== date);

function allocationBudget(plan) {
  const budget = new Map();
  for (const dish of plan.snapshot.result.dishes) {
    for (const allocation of dish.allocations) {
      const amount = toBaseUnits(allocation.quantity, allocation.unit);
      requireCondition(whole(amount) && amount > 0, 'Invalid snapshot allocation.');
      const previous = budget.get(allocation.batch);
      requireCondition(!previous || (previous.unit === allocation.unit && previous.ingredientId === allocation.ingredientId), 'Conflicting snapshot batch allocation.');
      budget.set(allocation.batch, { ...allocation, amount: (previous?.amount ?? 0) + amount });
    }
  }
  return budget;
}

function batchValues(batch) {
  const reserved = totalReserved(batch);
  return { stock: batch.stock, orderReserved: batch.orderReserved, planReserved: planReserved(batch), totalReserved: reserved,
    available: fromBaseUnits(toBaseUnits(batch.stock, batch.unit) - toBaseUnits(reserved, batch.unit), batch.unit) };
}

// Validate every affected batch first. No inventory writes occur before validation succeeds.
function applyBatchOperation(stock, plan, action, catalog, date = plan.snapshot.result.demoDate) {
  const budget = allocationBudget(plan);
  requireCondition(budget.size > 0, 'An empty plan cannot change inventory.');
  const updates = [];
  for (const [batchId, allocation] of budget) {
    const matching = stock.filter(batch => batch.batch === batchId);
    requireCondition(matching.length === 1, `Missing or duplicate batch: ${batchId}.`);
    const batch = matching[0];
    requireCondition(batch.ingredientId === allocation.ingredientId && batch.unit === allocation.unit && batch.deadline === allocation.deadline,
      `Batch ${batchId} no longer matches the plan snapshot.`);
    const issues = getBatchIssues({ ...batch, reserved: totalReserved(batch) }, catalog);
    requireCondition(issues.length === 0, `Invalid batch ${batchId}: ${issues.join(' ')}`);
    const stockBase = toBaseUnits(batch.stock, batch.unit);
    const totalBase = toBaseUnits(totalReserved(batch), batch.unit);
    const ownBase = toBaseUnits(batch.planReservations[plan.id] ?? 0, batch.unit);
    if (action === 'Approved') {
      requireCondition(getDaysUntil(batch.deadline, date) >= 0, `Batch ${batchId} is past its use-by date.`);
      requireCondition(ownBase === 0, `Plan already has a reservation on ${batchId}.`);
      requireCondition(stockBase - totalBase >= allocation.amount, `Insufficient available stock for batch ${batchId}.`);
    } else {
      requireCondition(ownBase === allocation.amount, `Plan reservation mismatch for ${batchId}; nothing was changed.`);
      requireCondition(stockBase >= totalBase && stockBase >= allocation.amount, `Insufficient stock for batch ${batchId}.`);
    }
    updates.push({ batch, allocation, before: batchValues(batch) });
  }
  return updates.map(({ batch, allocation, before }) => {
    if (action === 'Approved') batch.planReservations[plan.id] = fromBaseUnits(allocation.amount, batch.unit);
    else {
      if (action === 'Completed') batch.stock = fromBaseUnits(toBaseUnits(batch.stock, batch.unit) - allocation.amount, batch.unit);
      delete batch.planReservations[plan.id];
    }
    return { batch: batch.batch, ingredientId: batch.ingredientId, ingredient: batch.ingredient, unit: batch.unit, before, after: batchValues(batch) };
  });
}

function logEntry(plan, action, time, changes = []) {
  return { id: `${plan.id}:${action}`, planId: plan.id, action, time,
    dishes: plan.snapshot.result.dishes.filter(dish => dish.portions > 0).map(({ name, portions }) => ({ name, portions })), changes };
}

export { validateState } from './stateValidation.js';

// All actions are pure: a failed transition never mutates the caller's state.
export function transition(state, action) {
  const next = copy(state);
  const date = planningDate(next, action.today ?? (action.time ? todayLocal(new Date(action.time)) : todayLocal()));
  if (action.type === 'SET_CAP') {
    requireCondition(Object.hasOwn(next.caps, action.recipeId) && typeof action.value === 'string', 'Unknown recipe or invalid input.');
    next.caps[action.recipeId] = action.value;
    next.capsRevision += 1;
    return next;
  }
  if (action.type === 'SELECT_PLAN') {
    requireCondition(next.plans.some(plan => plan.id === action.planId), 'Plan not found.');
    next.currentPlanId = action.planId;
    return next;
  }
  requireCondition(timestamp(action.time), 'A valid actual operation timestamp is required.');
  if (action.type === 'SET_INGREDIENT_ICON') {
    requireCondition(next.ingredients.some(item => item.id === action.ingredientId), 'Ingredient not found.');
    requireCondition(action.image === null || validIcon(action.image), 'Invalid ingredient image. Choose a resized JPG or PNG.');
    next.ingredientIcons ??= {};
    if (action.image === null) delete next.ingredientIcons[action.ingredientId];
    else next.ingredientIcons[action.ingredientId] = action.image;
    return next;
  }
  if (['IMPORT_STOCK', 'SAVE_RECIPE', 'SET_MODE'].includes(action.type)) {
    const event = commitDataChange(next, action);
    next.activity.push({ id: action.preview?.id ?? `MODE-${next.inventoryRevision}`, time: action.time, planId: null, dishes: [], changes: [], ...event, request: copy(action) });
    return next;
  }
  if (action.type === 'GENERATE') {
    requireCondition(!activePlan(next), 'A plan is already Approved. Complete or cancel the active plan before generating another.');
    requireCondition(typeof action.planId === 'string' && /^[A-Za-z0-9-]+$/.test(action.planId) && !next.plans.some(plan => plan.id === action.planId), 'A unique plan ID is required.');
    const result = generatePlan(inventoryForPlanner(next), next.caps, date, { recipes: next.recipes, ingredients: next.ingredients });
    const plan = { id: action.planId, status: 'Draft', createdAt: action.time,
      snapshot: { ingredients: copy(next.ingredients), recipes: copy(next.recipes), mode: next.mode, recipeRevision: next.recipeRevision, result, inventoryRevision: next.inventoryRevision, capsRevision: next.capsRevision } };
    next.plans.push(plan);
    assignPlanNumber(next, plan);
    next.currentPlanId = plan.id;
    next.activity.push(logEntry(plan, 'Draft', action.time));
    return next;
  }
  const plan = next.plans.find(item => item.id === action.planId);
  requireCondition(plan, 'Plan not found.');
  const status = { APPROVE: 'Approved', COMPLETE: 'Completed', CANCEL: 'Cancelled' }[action.type];
  requireCondition(status, 'Unknown operation.');
  if (status === 'Approved') {
    requireCondition(plan.status === 'Draft', `Cannot approve a ${plan.status} plan.`);
    requireCondition(!activePlan(next), 'Another plan is already Approved. Complete or cancel it before approving a second plan.');
    requireCondition(!isDraftStale(next, plan, date), 'Needs regeneration: owner caps or inventory have changed.');
    requireCondition(plan.snapshot.result.totalPortions > 0, 'An empty plan cannot be approved.');
  } else {
    requireCondition(plan.status === 'Approved', `Only an Approved plan can be ${status === 'Completed' ? 'completed' : 'cancelled'}; this plan is ${plan.status}.`);
    requireCondition(activePlan(next)?.id === plan.id, 'This is not the active approved plan.');
  }
  const changes = applyBatchOperation(next.inventory, plan, status, next.ingredients, date);
  plan.status = status;
  plan[{ Approved: 'approvedAt', Completed: 'completedAt', Cancelled: 'cancelledAt' }[status]] = action.time;
  next.inventoryRevision += 1;
  next.activity.push(logEntry(plan, status, action.time, changes));
  return next;
}
