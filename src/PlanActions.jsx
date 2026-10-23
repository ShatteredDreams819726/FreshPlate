import { activePlan, currentPlan, isDraftStale } from './workflow.js';
import { planLabel } from './planNumbers.js';

export default function PlanActions({ state, run, blocked, onViewLog }) {
  const plan = currentPlan(state);
  const active = activePlan(state);
  if (!plan) return null;
  const stale = isDraftStale(state, plan);
  return <div className="plan-workflow">
    <div className="workflow-heading"><span className={`status-badge status-${plan.status.toLowerCase()}`}>{plan.status}</span><span className="plan-id">{planLabel(state.planNumbering, plan.id)}</span></div>
    {active && active.id !== plan.id && <div className="plan-notice"><strong>A plan is already awaiting preparation.</strong><p>Complete or cancel the active plan before generating or approving another.</p><button type="button" className="secondary-button" disabled={blocked} onClick={() => run({ type: 'SELECT_PLAN', planId: active.id })}>View Active Plan</button></div>}
    {plan.status === 'Draft' && <><p>{stale ? 'Needs regeneration — inventory or prep caps changed. Generate Plan again to review a fresh draft.' : plan.snapshot.result.totalPortions === 0 ? 'No portions planned. Increase a prep cap or review available priority ingredients, then generate again.' : 'Ready for owner approval. Approve to reserve these ingredients for preparation.'}</p><button type="button" className="generate-button" disabled={blocked || stale || plan.snapshot.result.totalPortions === 0 || Boolean(active)} onClick={() => run({ type: 'APPROVE', planId: plan.id })}>Approve Plan</button></>}
    {plan.status === 'Approved' && <><p>Ingredients reserved. Staff can now complete preparation.</p><div className="workflow-buttons"><button type="button" className="generate-button" disabled={blocked} onClick={() => run({ type: 'COMPLETE', planId: plan.id })}>Complete Preparation</button><button type="button" className="secondary-button" disabled={blocked} onClick={() => run({ type: 'CANCEL', planId: plan.id })}>Cancel Plan</button></div></>}
    {plan.status === 'Completed' && <><p>Preparation recorded. Review consumed batches below or open the activity record.</p><button type="button" className="generate-button" onClick={onViewLog}>View Activity Log</button></>}
    {plan.status === 'Cancelled' && <p>Reservations released; stock unchanged. Generate a new plan when ready.</p>}
    <details className="plan-history"><summary>Saved plans</summary><label className="history-picker">View a saved plan<select value={plan.id} disabled={blocked} onChange={event => run({ type: 'SELECT_PLAN', planId: event.target.value })}>{[...state.plans].reverse().map(item => <option key={item.id} value={item.id}>{planLabel(state.planNumbering, item.id)} · {item.status}</option>)}</select></label></details>
  </div>;
}
