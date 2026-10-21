import test from 'node:test';
import assert from 'node:assert/strict';
import { inventory, getAvailable, getPriority, getDaysUntil } from './inventory.js';
import { recipes, defaultCaps, validateCaps } from './recipes.js';
import { generatePlan } from './planner.js';

const capsFor = overrides => ({ ...Object.fromEntries(recipes.map(recipe => [recipe.id, 0])), ...overrides });
const row = (ingredient, batch, stock, reserved = 0, deadline = '2026-10-21') => ({ ingredient, batch, stock, reserved, deadline, unit: ingredient === 'Eggs' ? 'pcs' : 'kg' });
const dish = (plan, id) => plan.dishes.find(item => item.id === id);

test('shared eggs and chicken use one budget across dishes, with reservations protected', () => {
  const eggs = generatePlan([
    row('Tomatoes', 'A-TOM', 1), row('Cooked rice', 'B-RCE', 1),
    row('Eggs', 'C-EGG', 7, 2, '2026-10-24'), row('Carrots', 'D-CAR', 1, 0, '2026-10-25'),
  ], capsFor({ 'tomato-egg': 2, 'egg-rice': 10 }));
  assert.equal(dish(eggs, 'tomato-egg').portions, 2);
  assert.equal(dish(eggs, 'egg-rice').portions, 1);
  assert.equal(eggs.projections.find(batch => batch.batch === 'C-EGG').plannedUse, 5);
  assert.equal(eggs.projections.find(batch => batch.batch === 'C-EGG').projectedStock, 2);

  const chicken = generatePlan([
    row('Chicken', 'A-CHK', 0.5, 0.1), row('Green peppers', 'B-PEP', 1),
    row('Potatoes', 'C-POT', 1, 0, '2026-10-25'), row('Carrots', 'D-CAR', 1, 0, '2026-10-25'),
  ], capsFor({ 'pepper-chicken': 1, 'potato-chicken': 10 }));
  assert.equal(dish(chicken, 'pepper-chicken').portions, 1);
  assert.equal(dish(chicken, 'potato-chicken').portions, 1);
  const chickenBatch = chicken.projections.find(batch => batch.batch === 'A-CHK');
  assert.equal(chickenBatch.plannedUse, 0.35);
  assert.equal(chickenBatch.remainingAvailable, 0.05);
  assert.equal(chickenBatch.projectedStock, 0.15);
});

test('priority includes today through +2 days; expired batches are excluded; later-only stock is not recommended', () => {
  for (const [date, expected] of [['2026-10-20', 0], ['2026-10-21', 5], ['2026-10-22', 5], ['2026-10-23', 5], ['2026-10-24', 0]]) {
    const result = generatePlan([row('Chinese cabbage', 'CAB', 1, 0, date)], capsFor({ cabbage: 10 }));
    assert.equal(dish(result, 'cabbage').portions, expected, date);
    if (date === '2026-10-20') {
      assert.match(result.projections[0].excludedReason, /Past use-by date/);
      assert.equal(result.projections[0].plannedUse, 0);
    }
  }
  assert.equal(getDaysUntil('2026-11-01'), 11);
});

test('FEFO consumes earlier batches before later supporting batches and stops once priority is gone', () => {
  const result = generatePlan([
    row('Chicken', 'LATER', 2, 0.5, '2026-10-25'),
    row('Chicken', 'EARLY', 0.2, 0.1),
    row('Green peppers', 'PEP', 1, 0, '2026-10-26'),
  ], capsFor({ 'pepper-chicken': 10 }));
  assert.equal(dish(result, 'pepper-chicken').portions, 1);
  assert.equal(result.projections.find(batch => batch.batch === 'EARLY').plannedUse, 0.1);
  assert.equal(result.projections.find(batch => batch.batch === 'LATER').plannedUse, 0.05);
  assert.equal(result.leftovers.length, 0);
});

test('zero owner caps create a clear empty plan and leave every quantity unchanged', () => {
  const result = generatePlan(inventory, capsFor({}));
  assert.equal(result.totalPortions, 0);
  assert.ok(result.dishes.every(item => item.portions === 0 && item.limits.some(limit => limit.includes('cap reached (0)'))));
  assert.ok(result.projections.every(batch => batch.plannedUse === 0 && batch.projectedStock === batch.stock));
  assert.ok(result.leftovers.length > 0);
});

test('invalid dates, quantities, excessive reservations, units and duplicate IDs surface exclusion reasons', () => {
  const invalidRows = [
    row('Chinese cabbage', 'BAD-DATE', 1, 0, '2026-02-30'),
    row('Chinese cabbage', 'NEGATIVE', -1),
    row('Chinese cabbage', 'OVER-RESERVED', 1, 2),
    { ...row('Chinese cabbage', 'UNIT', 1000), unit: 'g' },
    row('Eggs', 'FRACTION', 2.5),
    row('Chinese cabbage', 'NAN', NaN),
    row('Chinese cabbage', 'NEGATIVE-RESERVED', 1, -1),
    row('Chinese cabbage', 'DUPLICATE', 1), row('Chinese cabbage', 'DUPLICATE', 2),
  ];
  const result = generatePlan(invalidRows, capsFor({ cabbage: 10 }));
  assert.equal(result.totalPortions, 0);
  for (const batch of result.projections) {
    assert.equal(batch.eligible, false);
    assert.ok(batch.excludedReason);
    assert.equal(batch.available, null);
    assert.equal(batch.plannedUse, 0);
  }
  assert.equal(getAvailable(invalidRows[2]), null);
  assert.equal(getPriority('2026-02-30').key, 'invalid');
});

test('cap validation rejects empty, negative, fractional and non-finite input without silently fixing it', () => {
  for (const invalid of ['', '-1', '1.5', '1e2', 'hello', Infinity, null]) {
    const caps = { ...defaultCaps, cabbage: invalid };
    assert.equal(validateCaps(caps).length, 1);
    assert.throws(() => generatePlan(inventory, caps), /non-negative whole number/);
  }
  assert.deepEqual(validateCaps({ ...defaultCaps, cabbage: '0' }), []);
});

test('repeated plans are identical, never mutate input, and account for every allocated ingredient', () => {
  const frozenStock = Object.freeze(inventory.map(item => Object.freeze({ ...item })));
  const frozenCaps = Object.freeze({ ...defaultCaps });
  const before = JSON.stringify(frozenStock);
  const first = generatePlan(frozenStock, frozenCaps);
  assert.deepEqual(generatePlan(frozenStock, frozenCaps), first);
  assert.equal(JSON.stringify(frozenStock), before);
  for (const batch of first.projections) {
    assert.ok(batch.plannedUse <= batch.available);
    assert.ok(batch.projectedStock >= batch.reserved);
    const allocationTotal = first.dishes.flatMap(item => item.allocations).filter(item => item.batch === batch.batch).reduce((sum, item) => sum + Math.round(item.quantity * (item.unit === 'kg' ? 1000 : 1)), 0);
    assert.equal(allocationTotal, Math.round(batch.plannedUse * (batch.unit === 'kg' ? 1000 : 1)));
  }
  for (const item of first.dishes) {
    assert.ok(Number.isInteger(item.portions) && item.portions <= item.cap);
    if (item.portions > 0) assert.ok(item.allocations.some(allocation => allocation.priority && allocation.quantity > 0));
    const recipe = recipes.find(recipe => recipe.id === item.id);
    for (const part of recipe.ingredients) {
      const factor = part.unit === 'kg' ? 1000 : 1;
      const used = item.allocations.filter(allocation => allocation.ingredient === part.ingredient).reduce((sum, allocation) => sum + Math.round(allocation.quantity * factor), 0);
      assert.equal(used, Math.round(part.quantity * factor) * item.portions);
    }
  }
});
