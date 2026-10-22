import { DEMO_DATE, inventory, extraPrepCaps } from '../src/demoInputs.js';
import { generatePlan } from '../src/planner.js';

// Scenario overrides only change inputs. All quantity allocation stays in planner.js.
export const scenarios = {
  default: { label: 'Default owner caps', capOverrides: {} },
  'no-tomato-egg': { label: 'Tomato & Egg Stir-fry cap set to 0', capOverrides: { 'tomato-egg': 0 } },
};

export function getScenarioInputs(name = 'default') {
  if (!Object.hasOwn(scenarios, name)) throw new Error(`Unknown scenario: ${name}. Choose default, no-tomato-egg, or compare.`);
  return structuredClone({ demoDate: DEMO_DATE, inventory, caps: { ...extraPrepCaps, ...scenarios[name].capOverrides } });
}

export function runScenario(name = 'default') {
  const inputs = getScenarioInputs(name);
  return { name, label: scenarios[name].label, inputs, result: generatePlan(inputs.inventory, inputs.caps, inputs.demoDate) };
}
