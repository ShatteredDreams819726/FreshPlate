import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenario, getScenarioInputs, scenarios } from './scenarios.js';
import { formatReport } from './run.js';
import { createInitialState, transition, currentPlan } from '../src/workflow.js';

test('both CLI scenarios exactly match the web workflow snapshot, deterministically and without input mutation', () => {
  for (const name of Object.keys(scenarios)) {
    const before = getScenarioInputs(name);
    const output = runScenario(name);
    assert.deepEqual(output.inputs, before);
    assert.deepEqual(runScenario(name), output);
    const state = createInitialState();
    state.caps = Object.fromEntries(Object.entries(before.caps).map(([id, value]) => [id, String(value)]));
    const web = transition(state, { type: 'GENERATE', planId: 'FP-cli-parity', time: '2026-10-22T00:00:00.000Z' });
    assert.deepEqual(output.result, currentPlan(web).snapshot.result);
    assert.deepEqual(web.inventory, state.inventory);
    const report = formatReport(output);
    for (const label of ['DRAFT ONLY', 'Fixed demo date:', 'BATCH FORECAST', 'EXCLUDED BATCHES', 'TOM-1018-X', 'Past use-by date', 'unchanged']) assert.ok(report.includes(label), label);
  }
});

test('zero tomato-egg cap makes the comparison visible and keeps scenario inputs isolated', () => {
  const normal = runScenario('default');
  const zero = runScenario('no-tomato-egg');
  assert.equal(normal.result.dishes.find(dish => dish.id === 'tomato-egg').portions, 16);
  assert.equal(zero.result.dishes.find(dish => dish.id === 'tomato-egg').portions, 0);
  assert.equal(normal.result.projections.find(batch => batch.batch === 'TOM-1020-A').plannedUse, 3.2);
  assert.equal(zero.result.projections.find(batch => batch.batch === 'TOM-1020-A').plannedUse, 0);
  zero.inputs.inventory[0].stock = 0;
  zero.inputs.caps['tomato-egg'] = 999;
  assert.deepEqual(getScenarioInputs('default'), normal.inputs);
  assert.equal(getScenarioInputs('no-tomato-egg').caps['tomato-egg'], 0);
});

test('the documented seven-file upload runs without node_modules and reports invalid arguments', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const folder = await mkdtemp(join(tmpdir(), 'freshplate-cli-'));
  const files = ['package.json', 'src/demoInputs.js', 'src/inventory.js', 'src/recipes.js', 'src/planner.js', 'demo/scenarios.js', 'demo/run.js'];
  try {
    await Promise.all(files.map(async file => {
      const destination = join(folder, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(root, file), destination);
    }));
    const run = args => spawnSync(process.execPath, [join(folder, 'demo/run.js'), ...args], { cwd: folder, encoding: 'utf8', timeout: 15000, windowsHide: true });
    const normal = run([]);
    assert.equal(normal.status, 0, normal.stderr);
    assert.ok(normal.stdout.includes('Scenario: default'));
    const compare = run(['compare']);
    assert.equal(compare.status, 0, compare.stderr);
    assert.ok(compare.stdout.includes('Tomato & Egg Stir-fry: 16 servings'));
    assert.ok(compare.stdout.includes('Tomato & Egg Stir-fry: 0 servings'));
    const zero = run(['no-tomato-egg']);
    assert.equal(zero.status, 0, zero.stderr);
    assert.ok(zero.stdout.includes('Scenario: no-tomato-egg'));
    const invalid = run(['unknown']);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Unknown scenario/);
    assert.equal(invalid.stdout, '');
  } finally {
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    assert.ok(basename(folder).startsWith('freshplate-cli-'));
    await rm(folder, { recursive: true, force: true });
  }
});
