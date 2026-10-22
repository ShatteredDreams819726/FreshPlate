import { activePlan, currentPlan, isDraftStale } from './workflow.js';
import { formatQuantity } from './inventory.js';

export default function PlanActions({ state, run, blocked }) {
  const plan = currentPlan(state);
  const active = activePlan(state);
  if (!plan) return null;
  const stale = isDraftStale(state, plan);
  return <div className="plan-workflow">
    <div className="workflow-heading"><div><p className="eyebrow">SAVED PLAN SNAPSHOT</p><strong className="plan-id">{plan.id}</strong></div><span className={`status-badge status-${plan.status.toLowerCase()}`}>{plan.status}</span></div>
    <label className="history-picker">View a saved plan<select value={plan.id} disabled={blocked} onChange={event => run({ type: 'SELECT_PLAN', planId: event.target.value })}>{[...state.plans].reverse().map(item => <option key={item.id} value={item.id}>{item.status} · {item.id}</option>)}</select></label>
    {active && active.id !== plan.id && <div className="plan-notice"><strong>Only one Approved plan is allowed.</strong><p>{active.id} is awaiting preparation. Complete or cancel it before approving this draft.</p><button type="button" className="secondary-button" disabled={blocked} onClick={() => run({ type: 'SELECT_PLAN', planId: active.id })}>View Active Plan</button></div>}
    {plan.status === 'Draft' && <><p>{stale ? 'Needs regeneration: inventory or owner caps changed. Generate a new plan before approval.' : plan.snapshot.result.totalPortions === 0 ? 'This draft is empty and cannot be approved.' : 'Owner demo action: approval reserves these exact batch quantities. Stock is not deducted yet.'}</p><button type="button" className="generate-button" disabled={blocked || stale || plan.snapshot.result.totalPortions === 0 || Boolean(active)} onClick={() => run({ type: 'APPROVE', planId: plan.id })}>Approve Plan</button></>}
    {plan.status === 'Approved' && <><p>Approved and reserved. Next: staff completes this exact saved allocation, or the owner cancels it. Changing inputs does not change this approved snapshot.</p><div className="workflow-buttons"><button type="button" className="generate-button" disabled={blocked} onClick={() => run({ type: 'COMPLETE', planId: plan.id })}>Complete Preparation</button><button type="button" className="cancel-button" disabled={blocked} onClick={() => run({ type: 'CANCEL', planId: plan.id })}>Cancel Plan</button></div></>}
    {plan.status === 'Completed' && <p>Preparation completed. Actual batch consumption is in Activity Log. This plan cannot be completed again or cancelled.</p>}
    {plan.status === 'Cancelled' && <p>Plan cancelled. Its reservations were released without consuming stock. This plan cannot be approved or cancelled again.</p>}
    <details className="snapshot-recipes"><summary>View recipes saved with this plan</summary><ul>{plan.snapshot.recipes.map(recipe => <li key={recipe.id}><strong>{recipe.name}</strong>: {recipe.ingredients.map(part => `${part.ingredient} ${formatQuantity(part.quantity, part.unit)}`).join(' + ')} per serving</li>)}</ul></details>
  </div>;
}
