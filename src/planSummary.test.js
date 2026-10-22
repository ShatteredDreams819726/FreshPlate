import test from 'node:test';
import assert from 'node:assert/strict';
import { plannedSummary, recordedSummary, recordedBatches } from './planSummary.js';

const result = { dishes: [
  { portions: 2, allocations: [{ batch: 'EGG', priority: true, quantity: 2, unit: 'pcs' }, { batch: 'TOM', priority: true, quantity: 0.4, unit: 'kg' }] },
  { portions: 1, allocations: [{ batch: 'EGG', priority: true, quantity: 1, unit: 'pcs' }, { batch: 'LATER', priority: false, quantity: 0.25, unit: 'kg' }] },
  { portions: 0, allocations: [] },
] };
test('planned summary counts portions and dishes and deduplicates shared priority batches', () => {
  assert.deepEqual(plannedSummary(result), { portions: 3, dishes: 2, priorityBatches: 2 });
  assert.deepEqual(plannedSummary({ dishes: [] }), { portions: 0, dishes: 0, priorityBatches: 0 });
});
test('recorded summary uses actual completion records, not planned totals or mixed-unit sums', () => {
  const event = { action: 'Completed', dishes: [{ portions: 1 }], changes: [
    { batch: 'EGG', before: { stock: 8 }, after: { stock: 7 } },
    { batch: 'LATER', before: { stock: 2 }, after: { stock: 1.75 } },
    { batch: 'TOM', before: { stock: 4 }, after: { stock: 4 } },
  ] };
  assert.deepEqual(recordedSummary(event, result), { portions: 1, dishes: 1, priorityBatches: 1 });
  assert.equal(recordedBatches(event).length, 2);
  assert.deepEqual(recordedBatches({ ...event, action: 'Approved' }), []);
  assert.deepEqual(recordedBatches({ ...event, action: 'Cancelled' }), []);
});
