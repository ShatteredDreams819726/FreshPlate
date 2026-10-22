import { inventory as initialInventory, DEMO_DATE, getBatchIssues, getDaysUntil, toBaseUnits, fromBaseUnits } from './inventory.js';
import { recipes, defaultCaps } from './recipes.js';
import { generatePlan } from './planner.js';

const copy = value => structuredClone(value);
function requireCondition(condition, message) { if (!condition) throw new Error(message); }
const whole = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function createInitialState() {
  return { inventory: initialInventory.map(({ reserved, ...batch }) => ({ ...batch, orderReserved: reserved, planReservations: {} })),
    caps: { ...defaultCaps }, capsRevision: 0, inventoryRevision: 0, plans: [], currentPlanId: null, activity: [] };
}

export function planReserved(batch) {
  return fromBaseUnits(Object.values(batch.planReservations).reduce((sum, value) => sum + toBaseUnits(value, batch.unit), 0), batch.unit);
}

export function totalReserved(batch) {
  return fromBaseUnits(toBaseUnits(batch.orderReserved, batch.unit) + toBaseUnits(planReserved(batch), batch.unit), batch.unit);
}

// One adapter lets the existing planner retain its reserved = total reserved contract.
export function inventoryForPlanner(state) {
  return state.inventory.map(batch => ({ ...batch, reserved: totalReserved(batch) }));
}

export const activePlan = state => state.plans.find(plan => plan.status === 'Approved') ?? null;
export const currentPlan = state => state.plans.find(plan => plan.id === state.currentPlanId) ?? null;
export const isDraftStale = (state, plan) => plan.status === 'Draft' &&
  (plan.snapshot.inventoryRevision !== state.inventoryRevision || plan.snapshot.capsRevision !== state.capsRevision);

function allocationBudget(plan) {
  const budget = new Map();
  for (const dish of plan.snapshot.result.dishes) {
    for (const allocation of dish.allocations) {
      const amount = toBaseUnits(allocation.quantity, allocation.unit);
      requireCondition(whole(amount) && amount > 0, 'Invalid snapshot allocation.');
      const previous = budget.get(allocation.batch);
      requireCondition(!previous || (previous.unit === allocation.unit && previous.ingredient === allocation.ingredient), 'Conflicting snapshot batch allocation.');
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
function applyBatchOperation(stock, plan, action) {
  const budget = allocationBudget(plan);
  requireCondition(budget.size > 0, 'An empty plan cannot change inventory.');
  const updates = [];
  for (const [batchId, allocation] of budget) {
    const matching = stock.filter(batch => batch.batch === batchId);
    requireCondition(matching.length === 1, `Missing or duplicate batch: ${batchId}.`);
    const batch = matching[0];
    requireCondition(batch.ingredient === allocation.ingredient && batch.unit === allocation.unit && batch.deadline === allocation.deadline,
      `Batch ${batchId} no longer matches the plan snapshot.`);
    const issues = getBatchIssues({ ...batch, reserved: totalReserved(batch) });
    requireCondition(issues.length === 0, `Invalid batch ${batchId}: ${issues.join(' ')}`);
    const stockBase = toBaseUnits(batch.stock, batch.unit);
    const totalBase = toBaseUnits(totalReserved(batch), batch.unit);
    const ownBase = toBaseUnits(batch.planReservations[plan.id] ?? 0, batch.unit);
    if (action === 'Approved') {
      requireCondition(getDaysUntil(batch.deadline) >= 0, `Batch ${batchId} is past its use-by date.`);
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
    return { batch: batch.batch, ingredient: batch.ingredient, unit: batch.unit, before, after: batchValues(batch) };
  });
}

function logEntry(plan, action, time, changes = []) {
  return { id: `${plan.id}:${action}`, planId: plan.id, action, time,
    dishes: plan.snapshot.result.dishes.filter(dish => dish.portions > 0).map(({ name, portions }) => ({ name, portions })), changes };
}

// All actions are pure: a failed transition never mutates the caller's state.
export function transition(state, action) {
  const next = copy(state);
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
  if (action.type === 'GENERATE') {
    requireCondition(!activePlan(next), 'A plan is already Approved. Complete or cancel the active plan before generating another.');
    requireCondition(typeof action.planId === 'string' && /^[A-Za-z0-9-]+$/.test(action.planId) && !next.plans.some(plan => plan.id === action.planId), 'A unique plan ID is required.');
    const result = generatePlan(inventoryForPlanner(next), next.caps);
    const plan = { id: action.planId, status: 'Draft', createdAt: action.time,
      snapshot: { recipes: copy(recipes), result, inventoryRevision: next.inventoryRevision, capsRevision: next.capsRevision } };
    next.plans.push(plan);
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
    requireCondition(!isDraftStale(next, plan), 'Needs regeneration: owner caps or inventory have changed.');
    requireCondition(plan.snapshot.result.totalPortions > 0, 'An empty plan cannot be approved.');
  } else {
    requireCondition(plan.status === 'Approved', `Only an Approved plan can be ${status === 'Completed' ? 'completed' : 'cancelled'}; this plan is ${plan.status}.`);
    requireCondition(activePlan(next)?.id === plan.id, 'This is not the active approved plan.');
  }
  const changes = applyBatchOperation(next.inventory, plan, status);
  plan.status = status;
  plan[{ Approved: 'approvedAt', Completed: 'completedAt', Cancelled: 'cancelledAt' }[status]] = action.time;
  next.inventoryRevision += 1;
  next.activity.push(logEntry(plan, status, action.time, changes));
  return next;
}

// Reading persisted data validates snapshots and replays successful stock changes.
// This checks consistency without recalculating or replacing a saved recipe/plan.
export function validateState(state) {
  requireCondition(state && Array.isArray(state.inventory) && Array.isArray(state.plans) && Array.isArray(state.activity), 'Saved state is missing inventory, plans or activity.');
  requireCondition(whole(state.inventoryRevision) && whole(state.capsRevision), 'Invalid saved revision.');
  requireCondition(state.caps && recipes.every(recipe => typeof state.caps[recipe.id] === 'string'), 'Invalid saved owner inputs.');
  requireCondition(state.inventory.length === initialInventory.length, 'Saved inventory has missing or extra batches.');
  const ids = new Set();
  for (const plan of state.plans) {
    requireCondition(plan && typeof plan.id === 'string' && /^[A-Za-z0-9-]+$/.test(plan.id) && !ids.has(plan.id), 'Invalid or duplicate saved plan ID.');
    ids.add(plan.id);
    requireCondition(['Draft', 'Approved', 'Completed', 'Cancelled'].includes(plan.status) && timestamp(plan.createdAt), 'Invalid saved plan status or creation time.');
    const snap = plan.snapshot;
    requireCondition(snap && whole(snap.inventoryRevision) && snap.inventoryRevision <= state.inventoryRevision && whole(snap.capsRevision) && snap.capsRevision <= state.capsRevision, 'Invalid snapshot revision.');
    const result = snap.result;
    requireCondition(Array.isArray(snap.recipes) && result && result.demoDate === DEMO_DATE && Array.isArray(result.dishes) && Array.isArray(result.projections) && Array.isArray(result.leftovers), 'Invalid plan snapshot.');
    requireCondition(snap.recipes.length === recipes.length && result.dishes.length === snap.recipes.length, 'Incomplete recipe snapshot.');
    const recipeIds = new Set();
    for (const recipe of snap.recipes) {
      requireCondition(recipe && typeof recipe.id === 'string' && !recipeIds.has(recipe.id) && typeof recipe.name === 'string' && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0, 'Invalid saved recipe.');
      recipeIds.add(recipe.id);
      const ingredients = new Set();
      for (const part of recipe.ingredients) {
        const base = initialInventory.find(batch => batch.ingredient === part.ingredient);
        requireCondition(base && !ingredients.has(part.ingredient) && part.unit === base.unit && Number.isFinite(part.quantity) && part.quantity > 0 && Number.isSafeInteger(part.quantity * (part.unit === 'kg' ? 1000 : 1)), 'Invalid saved recipe quantity or unit.');
        ingredients.add(part.ingredient);
      }
    }
    const dishIds = new Set();
    for (const dish of result.dishes) {
      const recipe = snap.recipes.find(item => item.id === dish.id);
      requireCondition(recipe && !dishIds.has(dish.id) && dish.name === recipe.name && whole(dish.portions) && whole(dish.cap) && dish.portions <= dish.cap && result.caps?.[dish.id] === dish.cap && Array.isArray(dish.allocations) && typeof dish.reason === 'string' && Array.isArray(dish.limits) && dish.limits.every(item => typeof item === 'string'), 'Invalid saved dish or servings.');
      dishIds.add(dish.id);
      const usedBatches = new Set();
      for (const allocation of dish.allocations) {
        const batch = initialInventory.find(item => item.batch === allocation.batch);
        requireCondition(batch && !usedBatches.has(batch.batch) && batch.unit === allocation.unit && batch.ingredient === allocation.ingredient && batch.deadline === allocation.deadline && typeof allocation.quantity === 'number' && allocation.quantity > 0 && toBaseUnits(allocation.quantity, allocation.unit) === allocation.amountBase && Number.isSafeInteger(allocation.amountBase), 'Invalid saved batch allocation.');
        requireCondition(recipe.ingredients.some(part => part.ingredient === allocation.ingredient), 'Allocation is not in its recipe.');
        const days = getDaysUntil(batch.deadline);
        requireCondition(days >= 0 && allocation.priority === (days <= 2), 'Saved allocation uses an excluded batch or incorrect priority.');
        usedBatches.add(batch.batch);
      }
      for (const part of recipe.ingredients) {
        const actual = dish.allocations.filter(item => item.ingredient === part.ingredient).reduce((sum, item) => sum + item.amountBase, 0);
        requireCondition(actual === toBaseUnits(part.quantity, part.unit) * dish.portions, 'Snapshot quantities do not match saved recipe servings.');
      }
      requireCondition(dish.portions === 0 || dish.allocations.some(item => item.priority), 'Saved dish does not consume priority stock.');
    }
    requireCondition(result.totalPortions === result.dishes.reduce((sum, dish) => sum + dish.portions, 0), 'Invalid saved portion total.');
    requireCondition(result.projections.length === initialInventory.length && new Set(result.projections.map(batch => batch.batch)).size === initialInventory.length, 'Invalid saved projections.');
    const budget = allocationBudget(plan);
    for (const projection of result.projections) {
      const initial = initialInventory.find(batch => batch.batch === projection.batch);
      requireCondition(initial && projection.unit === initial.unit && projection.ingredient === initial.ingredient && projection.deadline === initial.deadline && getBatchIssues(projection).length === 0, 'Invalid snapshot source inventory.');
      requireCondition(['available', 'plannedUse', 'projectedStock', 'remainingAvailable'].every(field => typeof projection[field] === 'number' && Number.isFinite(projection[field]) && projection[field] >= 0), 'Invalid saved projected quantity.');
      const days = getDaysUntil(projection.deadline);
      requireCondition(projection.eligible === (days >= 0) && projection.priority === (days >= 0 && days <= 2) && Array.isArray(projection.issues) && projection.issues.length === 0 && (projection.excludedReason === null || typeof projection.excludedReason === 'string'), 'Invalid saved batch eligibility.');
      const amount = budget.get(projection.batch)?.amount ?? 0;
      const stock = toBaseUnits(projection.stock, projection.unit);
      const reserved = toBaseUnits(projection.reserved, projection.unit);
      requireCondition(toBaseUnits(projection.plannedUse, projection.unit) === amount && toBaseUnits(projection.available, projection.unit) === stock - reserved && toBaseUnits(projection.projectedStock, projection.unit) === stock - amount && toBaseUnits(projection.remainingAvailable, projection.unit) === stock - reserved - amount && amount <= stock - reserved, 'Invalid snapshot projected quantities.');
    }
    const expectedLeftovers = result.projections.filter(batch => batch.priority && batch.remainingAvailable > 0);
    requireCondition(result.leftovers.length === expectedLeftovers.length && new Set(result.leftovers.map(batch => batch.batch)).size === result.leftovers.length, 'Invalid saved leftovers.');
    for (const leftover of result.leftovers) {
      const expected = expectedLeftovers.find(batch => batch.batch === leftover.batch);
      requireCondition(expected && typeof leftover.explanation === 'string' && ['ingredient', 'unit', 'deadline', 'remainingAvailable'].every(field => leftover[field] === expected[field]), 'Invalid saved leftovers.');
    }
  }
  requireCondition((state.plans.length === 0 && state.currentPlanId === null) || ids.has(state.currentPlanId), 'Current saved plan is missing.');
  const replay = createInitialState();
  const statuses = new Map();
  const times = new Map();
  for (const event of state.activity) {
    const plan = state.plans.find(item => item.id === event.planId);
    requireCondition(plan && timestamp(event.time) && event.id === `${plan.id}:${event.action}`, 'Invalid activity record.');
    const previous = statuses.get(plan.id);
    if (event.action === 'Draft') {
      requireCondition(!previous && event.time === plan.createdAt && plan.snapshot.inventoryRevision === replay.inventoryRevision, 'Invalid draft history.');
      for (const projection of plan.snapshot.result.projections) {
        const source = replay.inventory.find(batch => batch.batch === projection.batch);
        requireCondition(source && source.stock === projection.stock && totalReserved(source) === projection.reserved, 'Draft source inventory does not match its history.');
      }
    } else {
      requireCondition((event.action === 'Approved' && previous === 'Draft') || (['Completed', 'Cancelled'].includes(event.action) && previous === 'Approved'), 'Invalid or repeated saved state transition.');
      if (event.action === 'Approved') {
        requireCondition(![...statuses.values()].includes('Approved') && plan.snapshot.result.totalPortions > 0 && plan.snapshot.inventoryRevision === replay.inventoryRevision, 'Invalid saved approval.');
      }
      const changes = applyBatchOperation(replay.inventory, plan, event.action);
      requireCondition(JSON.stringify(changes) === JSON.stringify(event.changes), 'Activity batch changes do not match the snapshot.');
      replay.inventoryRevision += 1;
    }
    requireCondition(JSON.stringify(logEntry(plan, event.action, event.time, event.changes).dishes) === JSON.stringify(event.dishes) && (event.action !== 'Draft' || (Array.isArray(event.changes) && event.changes.length === 0)), 'Invalid activity servings or draft stock changes.');
    statuses.set(plan.id, event.action);
    times.set(`${plan.id}:${event.action}`, event.time);
  }
  for (const plan of state.plans) {
    requireCondition(statuses.get(plan.id) === plan.status, 'Saved plan status does not match its activity.');
    for (const [status, field] of [['Approved', 'approvedAt'], ['Completed', 'completedAt'], ['Cancelled', 'cancelledAt']]) {
      requireCondition(plan[field] === times.get(`${plan.id}:${status}`), 'Saved plan timestamps do not match activity.');
    }
  }
  requireCondition(state.inventoryRevision === replay.inventoryRevision, 'Inventory revision does not match activity.');
  requireCondition(state.inventory.every((batch, index) => {
    const expected = replay.inventory[index];
    return batch && Object.keys(expected).every(key => JSON.stringify(batch[key]) === JSON.stringify(expected[key]));
  }), 'Inventory or reservations do not match successful plan operations.');
  return state;
}
