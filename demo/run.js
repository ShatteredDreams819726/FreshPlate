import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatQuantity } from '../src/inventory.js';
import { runScenario, scenarios } from './scenarios.js';

export const usage = 'Usage: node demo/run.js [default|no-tomato-egg|compare|--help]';

// Presentation only: every recommendation and projection comes from generatePlan.
export function formatReport({ name, label, result }) {
  const priorityEnd = new Date(Date.parse(`${result.demoDate}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
  const lines = [
    'FreshPlate | Core planning demo',
    `Scenario: ${name} - ${label}`,
    'SIMULATED DATA | DRAFT ONLY',
    'No stock or reservations are modified. Nothing is saved or executed.',
    `Fixed demo date: ${result.demoDate}`,
    `Priority window: ${result.demoDate} through ${priorityEnd}, inclusive. Past-use-by batches are excluded.`,
    'Dates indicate planning priority only, not a food-safety assessment.',
    'Owner caps are extra-prep limits, not sales forecasts or guarantees. Seasonings are assumed sufficient.',
    'Rule: earliest-expiring priority batch, then fixed recipe order; shared stock budget; FEFO per ingredient.',
    'Same planner as the web app. Deterministic heuristic, not a globally optimal plan. No AI arithmetic.',
    '', 'DISHES (whole additional servings)',
  ];
  for (const dish of result.dishes) {
    lines.push(`${dish.name}: ${dish.portions} servings (owner cap ${dish.cap})`, `  ${dish.reason}`);
    for (const limit of dish.limits) lines.push(`  Limit: ${limit}`);
  }
  lines.push(`Total additional servings: ${result.totalPortions}`);
  if (result.totalPortions === 0) lines.push('No feasible plan: no complete serving using priority stock fits the available inventory and owner caps.');
  lines.push('', 'BATCH FORECAST (hypothetical, not actual consumption)',
    'Reserved = input reservations. Available = stock - reserved.',
    'Projected stock = stock - planned use. Unallocated = available - planned use; reservations remain protected.');
  for (const batch of result.projections) {
    const q = field => formatQuantity(batch[field], batch.unit);
    lines.push(`${batch.ingredient} | ${batch.batch} | Use-by: ${batch.deadline}`,
      `  Stock: ${q('stock')} | Reserved: ${q('reserved')} | Available: ${q('available')}`,
      `  Planned use: ${q('plannedUse')} | Projected stock: ${q('projectedStock')} | Unallocated: ${batch.eligible ? q('remainingAvailable') : 'EXCLUDED (unavailable to this plan)'}`);
  }
  const excluded = result.projections.filter(batch => batch.excludedReason);
  lines.push('', 'EXCLUDED BATCHES');
  if (!excluded.length) lines.push('None.');
  for (const batch of excluded) lines.push(`${batch.batch}: ${batch.excludedReason}`);
  lines.push('', 'PRIORITY STOCK LEFT UNALLOCATED (excluding reservations)');
  if (!result.leftovers.length) lines.push('None in eligible priority batches.');
  for (const batch of result.leftovers) lines.push(`${batch.ingredient} | ${batch.batch}: ${formatQuantity(batch.remainingAvailable, batch.unit)}`, `  ${batch.explanation}`);
  lines.push('', 'END OF DRAFT - original inputs, stock and reservations are unchanged.');
  return lines.join('\n');
}

// Importing the formatter in tests must not execute the CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1) throw new Error('Expected at most one scenario argument.');
    const selected = args[0] ?? 'default';
    if (selected === '--help') console.log(usage);
    else {
      const names = selected === 'compare' ? Object.keys(scenarios) : [selected];
      console.log(names.map(name => formatReport(runScenario(name))).join('\n\n' + '='.repeat(76) + '\n\n'));
    }
  } catch (error) {
    console.error(`FreshPlate demo failed: ${error.message}\n${usage}`);
    process.exitCode = 1;
  }
}
