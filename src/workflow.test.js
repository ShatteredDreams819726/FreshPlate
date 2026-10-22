import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, transition, currentPlan, totalReserved, validateState, isDraftStale } from './workflow.js';
import { toBaseUnits } from './inventory.js';
import { loadDemo, saveDemo, STORAGE_KEY, DATA_VERSION } from './persistence.js';

const time = '2026-10-22T04:05:06.000Z';
const act = (state, type, planId = 'FP-test', extra = {}) => transition(state, { type, planId, time, ...extra });
const draft = () => act(createInitialState(), 'GENERATE');
const approved = () => act(draft(), 'APPROVE');
const base = (value, batch) => toBaseUnits(value, batch.unit);
function unchangedOnFailure(state, operation, pattern) {
  const before = structuredClone(state);
  assert.throws(() => operation(state), pattern);
  assert.deepEqual(state, before);
}
function storageMock() {
  let value = null;
  return { getItem: key => { assert.equal(key, STORAGE_KEY); return value; }, setItem: (key, raw) => { assert.equal(key, STORAGE_KEY); value = raw; } };
}

test('approval reserves snapshot quantities without deducting stock or original orders', () => {
  const before = draft();
  const next = act(before, 'APPROVE');
  assert.equal(currentPlan(next).status, 'Approved');
  assert.deepEqual(currentPlan(next).snapshot, currentPlan(before).snapshot);
  assert.ok(next.inventory.some(batch => Object.keys(batch.planReservations).length));
  for (let i = 0; i < next.inventory.length; i++) {
    const batch = next.inventory[i];
    assert.equal(batch.stock, before.inventory[i].stock);
    assert.equal(batch.orderReserved, before.inventory[i].orderReserved);
    const allocated = currentPlan(next).snapshot.result.dishes.flatMap(dish => dish.allocations).filter(item => item.batch === batch.batch).reduce((sum, item) => sum + base(item.quantity, batch), 0);
    assert.equal(base(totalReserved(batch), batch), base(batch.orderReserved, batch) + allocated);
  }
  assert.ok(next.activity.at(-1).changes.every(change => change.before.stock === change.after.stock));
  validateState(next);
});

test('completion deducts only approved snapshot usage and releases only its own reservations', () => {
  const before = approved();
  // Current inputs may change after approval; completion still uses the saved snapshot.
  const changedCaps = transition(before, { type: 'SET_CAP', recipeId: 'cabbage', value: '0' });
  const next = act(changedCaps, 'COMPLETE');
  assert.equal(currentPlan(next).status, 'Completed');
  for (let i = 0; i < next.inventory.length; i++) {
    const batch = next.inventory[i];
    const previous = before.inventory[i];
    assert.equal(base(batch.stock, batch), base(previous.stock, batch) - base(previous.planReservations['FP-test'] ?? 0, batch));
    assert.equal(batch.orderReserved, previous.orderReserved);
    assert.deepEqual(batch.planReservations, {});
    assert.ok(batch.stock >= batch.orderReserved);
  }
  validateState(next);
});

test('cancellation releases plan reservations without changing stock or original reservations', () => {
  const before = approved();
  const next = act(before, 'CANCEL');
  assert.equal(currentPlan(next).status, 'Cancelled');
  next.inventory.forEach((batch, index) => {
    assert.equal(batch.stock, before.inventory[index].stock);
    assert.equal(batch.orderReserved, before.inventory[index].orderReserved);
    assert.deepEqual(batch.planReservations, {});
  });
  validateState(next);
});

test('business guards reject repeated approvals, completions, cancellations and completed-plan cancellation', () => {
  const active = approved();
  unchangedOnFailure(active, state => act(state, 'APPROVE'), /Cannot approve/);
  const completed = act(active, 'COMPLETE');
  unchangedOnFailure(completed, state => act(state, 'COMPLETE'), /Only an Approved/);
  unchangedOnFailure(completed, state => act(state, 'CANCEL'), /Only an Approved/);
  const cancelled = act(active, 'CANCEL');
  unchangedOnFailure(cancelled, state => act(state, 'CANCEL'), /Only an Approved/);
  unchangedOnFailure(cancelled, state => act(state, 'COMPLETE'), /Only an Approved/);
  unchangedOnFailure(cancelled, state => act(state, 'APPROVE'), /Cannot approve/);
});

test('stale caps, empty drafts, insufficient availability and an active plan block approval', () => {
  const stale = transition(draft(), { type: 'SET_CAP', recipeId: 'cabbage', value: '1' });
  assert.ok(isDraftStale(stale, currentPlan(stale)));
  unchangedOnFailure(stale, state => act(state, 'APPROVE'), /Needs regeneration/);
  let empty = createInitialState();
  for (const recipeId of Object.keys(empty.caps)) empty = transition(empty, { type: 'SET_CAP', recipeId, value: '0' });
  empty = act(empty, 'GENERATE');
  unchangedOnFailure(empty, state => act(state, 'APPROVE'), /empty plan/);
  const insufficient = draft();
  insufficient.inventory.find(batch => batch.batch === 'CAR-1019-A').stock = 1.5;
  unchangedOnFailure(insufficient, state => act(state, 'APPROVE'), /Insufficient available/);
  const second = act(approved(), 'GENERATE', 'FP-second');
  unchangedOnFailure(second, state => act(state, 'APPROVE', 'FP-second'), /already Approved/);
  const afterCancel = act(second, 'CANCEL', 'FP-test');
  assert.ok(isDraftStale(afterCancel, currentPlan(afterCancel)));
  unchangedOnFailure(afterCancel, state => act(state, 'APPROVE', 'FP-second'), /Needs regeneration/);
  validateState(afterCancel);
});

test('multi-batch approval, completion and cancellation failures are all-or-nothing', () => {
  const insufficient = draft();
  insufficient.inventory.find(batch => batch.batch === 'CAR-1019-A').stock = 1.5;
  unchangedOnFailure(insufficient, state => act(state, 'APPROVE'), /Insufficient/);
  for (const action of ['COMPLETE', 'CANCEL']) {
    const broken = approved();
    delete broken.inventory.find(batch => batch.batch === 'CAR-1019-A').planReservations['FP-test'];
    unchangedOnFailure(broken, state => act(state, action), /reservation mismatch/);
  }
});

test('saved approved state restores, completes once and retains the exact plan snapshot', () => {
  const storage = storageMock();
  const initialRead = loadDemo(storage);
  assert.equal(initialRead.raw, null);
  const active = approved();
  const raw = saveDemo(storage, active, null);
  const restored = loadDemo(storage);
  assert.equal(restored.raw, raw);
  assert.deepEqual(restored.state, active);
  const completed = act(restored.state, 'COMPLETE');
  saveDemo(storage, completed, restored.raw);
  const again = loadDemo(storage).state;
  assert.equal(currentPlan(again).status, 'Completed');
  assert.deepEqual(currentPlan(again).snapshot, currentPlan(active).snapshot);
  unchangedOnFailure(again, state => act(state, 'COMPLETE'), /Only an Approved/);
  const cancelled = act(active, 'CANCEL');
  saveDemo(storage, cancelled, storage.getItem(STORAGE_KEY));
  assert.equal(currentPlan(loadDemo(storage).state).status, 'Cancelled');
});

test('corrupt, inconsistent and unsupported saves are not replaced; save failures and conflicts are reported', () => {
  const storage = storageMock();
  for (const value of ['broken json', JSON.stringify({ version: DATA_VERSION + 1, state: createInitialState() })]) {
    storage.setItem(STORAGE_KEY, value);
    assert.throws(() => loadDemo(storage), /left untouched/);
    assert.equal(storage.getItem(STORAGE_KEY), value);
  }
  const broken = approved();
  broken.inventory[0].stock -= 0.1;
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: DATA_VERSION, state: broken }));
  assert.throws(() => loadDemo(storage), /do not match/);
  const initial = createInitialState();
  assert.throws(() => saveDemo({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, initial, null), /Cannot save/);
  assert.throws(() => loadDemo({ getItem: () => { throw new Error('denied'); } }), /Cannot read/);
  assert.throws(() => saveDemo(storage, initial, null), /Another tab changed/);
  saveDemo(storage, initial, null, true);
  assert.deepEqual(loadDemo(storage).state, initial);
});
