import { formatQuantity } from './inventory.js';

export function formatOperationTime(value) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long' }).format(new Date(value));
}

const descriptions = {
  Draft: 'Draft generated. No inventory or reservations changed. All quantities in the plan are estimates.',
  Approved: 'Owner demo action: plan reservations added. Actual stock consumption: none.',
  Completed: 'Staff demo action: preparation completed. Actual stock deducted and this plan’s reservations released.',
  Cancelled: 'Owner demo action: plan reservations released. Actual stock consumption: none.',
};

export default function ActivityLog({ activity }) {
  return <section className="inventory-panel activity-panel" aria-labelledby="activity-title"><div className="panel-heading"><div><p className="eyebrow">SUCCESSFUL OPERATIONS ONLY</p><h2 id="activity-title">Activity Log</h2><p>Actual operation times, shown in your browser's local timezone. Planning still uses the fixed demo date.</p></div></div><div className="plan-body">{activity.length === 0 ? <p className="projection-note">No operations yet. Generate a plan to begin.</p> : <ol className="activity-list">{[...activity].reverse().map(event => <li className="activity-event" key={event.id}><div className="workflow-heading"><span className={`status-badge status-${event.action.toLowerCase()}`}>{event.action === 'Draft' ? 'Draft generated' : event.action}</span><time dateTime={event.time}>{formatOperationTime(event.time)}</time></div><p className="plan-id">{event.planId}</p><p>{descriptions[event.action]}</p><p className="activity-dishes">{event.dishes.length ? event.dishes.map(dish => `${dish.name}: ${dish.portions}`).join(' · ') : 'No dishes allocated.'}</p>{event.changes.length > 0 && <details><summary>Batch changes actually applied ({event.changes.length})</summary><div className="table-scroll" role="region" aria-label="Actual stock and reservation changes" tabIndex="0"><table><thead><tr><th scope="col">Ingredient / Batch</th><th scope="col">Stock before → after</th><th scope="col">Order reservations</th><th scope="col">Plan reservations before → after</th><th scope="col">Available before → after</th></tr></thead><tbody>{event.changes.map(change => <tr key={change.batch}><th scope="row"><span className="ingredient-name">{change.ingredient}</span><span className="ingredient-detail">{change.batch}</span></th><td>{formatQuantity(change.before.stock, change.unit)} → {formatQuantity(change.after.stock, change.unit)}</td><td>{formatQuantity(change.before.orderReserved, change.unit)} → {formatQuantity(change.after.orderReserved, change.unit)}</td><td>{formatQuantity(change.before.planReserved, change.unit)} → {formatQuantity(change.after.planReserved, change.unit)}</td><td>{formatQuantity(change.before.available, change.unit)} → {formatQuantity(change.after.available, change.unit)}</td></tr>)}</tbody></table></div></details>}</li>)}</ol>}</div></section>;
}
