import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, transition, currentPlan, validateState } from './workflow.js';
import { backfillPlanNumbers, creationTime, planLabel, shopDate } from './planNumbers.js';
import { loadDemo, saveDemo, STORAGE_KEY, DATA_VERSION } from './persistence.js';

const time = '2026-10-23T04:00:00.000Z';
const act = (state, type, planId, at = time) => transition(state, { type, planId, time: at });
function storageFor(value) {
  const values = new Map(value ? [[STORAGE_KEY, value]] : []);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('daily numbers use Kuala Lumpur creation dates, saved counters and stable IDs, including beyond 99', () => {
  assert.equal(shopDate('2026-10-22T15:59:59.000Z'), '2026-10-22');
  assert.equal(shopDate('2026-10-22T16:00:00.000Z'), '2026-10-23');
  let state = act(createInitialState(), 'GENERATE', 'FP-first');
  assert.equal(planLabel(state.planNumbering, 'FP-first'), '2026-10-23 · Plan 01');
  state = act(state, 'GENERATE', 'FP-second');
  assert.equal(planLabel(state.planNumbering, 'FP-second'), '2026-10-23 · Plan 02');
  state.plans.reverse();
  state = act(state, 'GENERATE', 'FP-next', '2026-10-23T16:00:00.000Z');
  assert.equal(planLabel(state.planNumbering, 'FP-next'), '2026-10-24 · Plan 01');
  // A retained counter can exceed the number of remaining records: never use array length.
  state.planNumbering.dateCounters['2026-10-23'] = 99;
  state = act(state, 'GENERATE', 'FP-hundred');
  assert.equal(planLabel(state.planNumbering, 'FP-hundred'), '2026-10-23 · Plan 100');
  assert.equal(planLabel(state.planNumbering, 'FP-first'), '2026-10-23 · Plan 01');
  validateState(state);
});

test('approve, complete, cancel, select and restore preserve numbers, snapshots and UUID reservations', () => {
  const initial = createInitialState();
  let state = act(initial, 'GENERATE', 'FP-life');
  const original = structuredClone(currentPlan(state).snapshot), numbers = structuredClone(state.planNumbering);
  state = act(state, 'APPROVE', 'FP-life');
  assert.ok(state.inventory.some(batch => batch.planReservations['FP-life'] > 0));
  const storage = storageFor();
  saveDemo(storage, state, null);
  state = loadDemo(storage).state;
  state = act(state, 'COMPLETE', 'FP-life');
  assert.deepEqual(state.planNumbering, numbers);
  assert.deepEqual(currentPlan(state).snapshot, original);
  assert.throws(() => act(state, 'COMPLETE', 'FP-life'), /Only an Approved/);
  state = act(state, 'GENERATE', 'FP-cancel');
  state = act(state, 'APPROVE', 'FP-cancel');
  const stock = state.inventory.map(batch => [batch.stock, batch.orderReserved]);
  const label = planLabel(state.planNumbering, 'FP-cancel');
  state = act(state, 'CANCEL', 'FP-cancel');
  assert.equal(planLabel(state.planNumbering, 'FP-cancel'), label);
  assert.deepEqual(state.inventory.map(batch => [batch.stock, batch.orderReserved]), stock);
  state = transition(state, { type: 'SELECT_PLAN', planId: 'FP-life' });
  assert.equal(planLabel(state.planNumbering, currentPlan(state).id), '2026-10-23 · Plan 01');
  validateState(state);
});

test('v2 migration sorts trustworthy creation times with ID ties, persists one mapping and leaves business data untouched', () => {
  let old = act(createInitialState(), 'GENERATE', 'FP-z');
  old = act(old, 'GENERATE', 'FP-a');
  old = act(old, 'GENERATE', 'FP-next', '2026-10-23T16:00:00.000Z');
  delete old.planNumbering;
  const raw = JSON.stringify({ version: 2, state: old }), storage = storageFor(raw);
  const restored = loadDemo(storage);
  assert.equal(planLabel(restored.state.planNumbering, 'FP-a'), '2026-10-23 · Plan 01');
  assert.equal(planLabel(restored.state.planNumbering, 'FP-z'), '2026-10-23 · Plan 02');
  assert.equal(planLabel(restored.state.planNumbering, 'FP-next'), '2026-10-24 · Plan 01');
  const { planNumbering, ...business } = restored.state;
  assert.deepEqual(business, old);
  assert.equal(storage.getItem(`${STORAGE_KEY}:v2-backup`), raw);
  assert.equal(JSON.parse(restored.raw).version, DATA_VERSION);
  assert.deepEqual(loadDemo(storage).state, restored.state);
  const reordered = structuredClone(restored.state); reordered.plans.reverse();
  assert.deepEqual(backfillPlanNumbers(reordered).planNumbering, planNumbering);
  assert.deepEqual(old, business);
});

test('old plans use Draft creation evidence or stable Legacy numbers, never completion time or demo date', () => {
  let old = act(createInitialState(), 'GENERATE', 'FP-legacy');
  old = act(old, 'APPROVE', 'FP-legacy');
  delete old.planNumbering; delete old.plans[0].createdAt;
  assert.equal(creationTime(old.plans[0], old.activity), time);
  const evidenced = backfillPlanNumbers(old);
  assert.equal(planLabel(evidenced.planNumbering, 'FP-legacy'), '2026-10-23 · Plan 01');
  delete old.activity[0].time;
  const storage = storageFor(JSON.stringify({ version: 2, state: old }));
  let state = loadDemo(storage).state;
  assert.equal(planLabel(state.planNumbering, 'FP-legacy'), 'Legacy Plan 01');
  assert.deepEqual(state.activity, old.activity);
  state = act(state, 'COMPLETE', 'FP-legacy');
  validateState(state);
  assert.equal(planLabel(state.planNumbering, 'FP-legacy'), 'Legacy Plan 01');
  saveDemo(storage, state, storage.getItem(STORAGE_KEY));
  assert.equal(planLabel(loadDemo(storage).state.planNumbering, 'FP-legacy'), 'Legacy Plan 01');
});

test('migration failures preserve the original save; duplicates, damaged counters and missing mappings are rejected', () => {
  let old = act(createInitialState(), 'GENERATE', 'FP-safe');
  delete old.planNumbering;
  const raw = JSON.stringify({ version: 2, state: old }), storage = storageFor(raw);
  const blocked = { getItem: storage.getItem, setItem() { throw new Error('quota'); } };
  assert.throws(() => loadDemo(blocked), /left untouched/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  let state = backfillPlanNumbers(old);
  state = act(state, 'GENERATE', 'FP-other');
  const damaged = structuredClone(state);
  damaged.planNumbering.byId['FP-other'] = damaged.planNumbering.byId['FP-safe'];
  assert.throws(() => validateState(damaged), /Duplicate saved plan display/);
  const low = structuredClone(state); low.planNumbering.dateCounters['2026-10-23'] = 1;
  assert.throws(() => validateState(low), /Invalid dated plan/);
  delete state.planNumbering.byId['FP-other'];
  assert.throws(() => validateState(state), /number is missing/);
});
