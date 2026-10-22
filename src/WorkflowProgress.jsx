import { currentPlan, isDraftStale } from './workflow.js';
export default function WorkflowProgress({ state }) {
  const plan = currentPlan(state);
  const stale = plan && isDraftStale(state, plan);
  const status = plan?.status;
  const current = !plan || stale || status === 'Cancelled' ? 0 : status === 'Draft' ? 1 : status === 'Approved' ? 2 : 3;
  return <div className="workflow-progress"><ol aria-label="Preparation progress">{['Generate', 'Approve', 'Complete'].map((label, index) => {
    const cancelled = status === 'Cancelled' && index === 2;
    const done = !stale && (status === 'Cancelled' ? index < 2 : index < current);
    const active = status !== 'Cancelled' && index === current;
    return <li key={label} className={cancelled ? 'step-cancelled' : done ? 'step-done' : active ? 'step-current' : ''} aria-current={active ? 'step' : undefined}><span className="step-number" aria-hidden="true">{done ? '✓' : index + 1}</span><span>{label}<small>{cancelled ? 'Cancelled' : done ? 'Done' : active ? 'Current step' : 'Next'}</small></span></li>;
  })}</ol>{status === 'Cancelled' && <span className="status-badge status-cancelled">Cancelled · Generate a new plan to restart</span>}</div>;
}
