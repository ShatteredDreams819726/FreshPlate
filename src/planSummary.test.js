import test from 'node:test';
import assert from 'node:assert/strict';
import { plannedSummary, recordedSummary, recordedBatches } from './planSummary.js';
import { dishLimitFacts, limitText, recommendationText, remainingStockFacts, remainingStockText } from './planExplanation.js';
import { generatePlan } from './planner.js';
import { recipes } from './recipes.js';
import { inventory, extraPrepCaps } from './demoInputs.js';

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

test('concise reasons use actual priority allocations, not later supporting stock or batch IDs', () => {
  const plan = generatePlan(inventory, extraPrepCaps);
  const dish = plan.dishes.find(item => item.id === 'tomato-egg');
  assert.equal(recommendationText(dish), 'Uses 3.2 kg of tomatoes and 4 eggs from priority batches.');
  assert.equal(dish.allocations.filter(item => item.ingredientId === 'eggs').reduce((sum, item) => sum + item.quantity, 0), 32);
  const allocation = { ingredientId: 'eggs', ingredient: 'Eggs', unit: 'pcs', priority: true };
  assert.equal(recommendationText({ allocations: [
    { ...allocation, batch: 'A', amountBase: 3 }, { ...allocation, batch: 'B', amountBase: 11 },
    { ...allocation, batch: 'C', amountBase: 50, priority: false },
  ] }), 'Uses 14 eggs from priority batches.');
});

test('structured display factors preserve every planner limit and never change legacy snapshots or 61/45 allocations', () => {
  for (const [overrides, total] of [[{}, 61], [{ 'tomato-egg': 0 }, 45]]) {
    const plan = generatePlan(inventory, { ...extraPrepCaps, ...overrides });
    const original = structuredClone(plan);
    assert.equal(plan.totalPortions, total);
    for (const dish of plan.dishes) {
      const facts = dishLimitFacts(dish, recipes.find(recipe => recipe.id === dish.id), plan);
      assert.equal(Number(facts.capReached) + facts.shortages.length + Number(facts.priorityExhausted), dish.limits.length);
      const text = limitText(facts);
      for (const part of facts.shortages) assert.ok(text.includes(part.ingredient.toLowerCase()));
      assert.equal(text.includes('Prep limit reached'), facts.capReached);
      assert.equal(text.includes('No priority stock remains'), facts.priorityExhausted);
      assert.doesNotMatch(text, /unallocated;|needed for another/);
      recommendationText(dish);
    }
    for (const batch of plan.leftovers) remainingStockText(remainingStockFacts(batch, plan, recipes));
    assert.deepEqual(plan, original);
    assert.deepEqual(plan, generatePlan(inventory, { ...extraPrepCaps, ...overrides }));
  }
});

test('remaining stock distinguishes supporting shortages, sub-serving amounts, caps and missing recipes without parsing old prose', () => {
  const book = [{ id: 'egg-tom', name: 'Eggs with tomato', ingredients: [
    { ingredientId: 'eggs', ingredient: 'Eggs', unit: 'pcs', quantity: 2 },
    { ingredientId: 'tomatoes', ingredient: 'Tomatoes', unit: 'kg', quantity: 0.2 },
  ] }, { id: 'egg-rice', name: 'Eggs with rice', ingredients: [
    { ingredientId: 'eggs', ingredient: 'Eggs', unit: 'pcs', quantity: 1 },
    { ingredientId: 'rice', ingredient: 'Cooked rice', unit: 'kg', quantity: 0.25 },
  ] }];
  const stock = [
    { ingredientId: 'eggs', ingredient: 'Eggs', unit: 'pcs', stock: 12, reserved: 2, batch: 'E', deadline: '2026-10-21' },
    { ingredientId: 'tomatoes', ingredient: 'Tomatoes', unit: 'kg', stock: 0.1, reserved: 0, batch: 'T', deadline: '2026-10-21' },
    { ingredientId: 'rice', ingredient: 'Cooked rice', unit: 'kg', stock: 0.1, reserved: 0, batch: 'R', deadline: '2026-10-21' },
    { ingredientId: 'carrots', ingredient: 'Carrots', unit: 'kg', stock: 1, reserved: 0, batch: 'C', deadline: '2026-10-21' },
  ];
  const plan = generatePlan(stock, { 'egg-tom': 10, 'egg-rice': 10 }, undefined, { recipes: book });
  const text = id => remainingStockText(remainingStockFacts(plan.leftovers.find(item => item.ingredientId === id), plan, book));
  assert.equal(text('eggs'), 'Supporting ingredients insufficient (tomatoes and cooked rice).');
  assert.equal(text('tomatoes'), 'Not enough for another serving.');
  assert.equal(text('carrots'), 'No matching recipe.');
  assert.equal(plan.leftovers.find(item => item.ingredientId === 'eggs').remainingAvailable, 10);
  const capped = generatePlan(stock, { 'egg-tom': 0, 'egg-rice': 0 }, undefined, { recipes: book });
  const cappedFacts = remainingStockFacts(capped.leftovers[0], capped, book);
  assert.deepEqual(cappedFacts.map(item => item.type), ['prepLimit', 'supportingShortage']);
  assert.equal(remainingStockText(cappedFacts), 'Prep limit reached; Supporting ingredients insufficient (tomatoes and cooked rice).');
  // Old strings can be obsolete or localized: they never drive business reasons.
  plan.dishes.forEach(dish => { dish.limits = ['legacy text']; dish.reason = 'legacy text'; });
  plan.leftovers.forEach(batch => { batch.explanation = 'legacy text'; });
  assert.equal(text('eggs'), 'Supporting ingredients insufficient (tomatoes and cooked rice).');
});
