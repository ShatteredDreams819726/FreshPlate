import { formatQuantity } from './inventory.js';
import RecordedConsumption from './RecordedConsumption.jsx';

export function formatOperationTime(value) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long' }).format(new Date(value));
}
const descriptions = {
  Draft: 'Planned · Draft generated. Review it in Today’s Plan.',
  Approved: 'Ingredients reserved. Next: complete preparation or cancel the plan.',
  Completed: 'Preparation completed. Stock deducted and plan reservations released.',
  Cancelled: 'Reservations released; stock unchanged. Generate a new plan when ready.',
};
export default function ActivityLog({ activity, onViewPlan }) {
  return <section className="inventory-panel activity-panel" aria-labelledby="activity-title"><div className="panel-heading"><div><p className="eyebrow">YOUR PREPARATION RECORD</p><h2 id="activity-title">Activity Log</h2><p>Actual operation times · Your browser's local timezone</p></div></div><div className="plan-body">
    {activity.length === 0 ? <div className="plan-placeholder"><strong>No activity yet.</strong><p>Generate a plan, approve it, then complete preparation to record consumption.</p><button className="generate-button" type="button" onClick={onViewPlan}>Open Today's Plan</button></div> : <ol className="activity-list">{[...activity].reverse().map(event => {
      const dishes = event.dishes.filter(dish => dish.portions > 0);
      const portions = dishes.reduce((sum, dish) => sum + dish.portions, 0);
      return <li className="activity-event" key={event.id}><div className="workflow-heading"><span className={`status-badge status-${event.action.toLowerCase()}`}>{event.action === 'Draft' ? 'Draft generated' : event.action}</span><time dateTime={event.time}>{formatOperationTime(event.time)}</time></div><p className="plan-id">{event.planId}</p><p>{descriptions[event.action]}</p><p className="event-summary"><strong>{portions} {event.action === 'Completed' ? 'servings prepared' : 'servings planned'}</strong> · {dishes.length} dishes</p>
        {event.action === 'Completed' && <RecordedConsumption event={event} />}
        <details className="detail-panel"><summary>Dish portions{event.changes.length ? ' & batch changes' : ''}</summary><ul>{dishes.map(dish => <li key={dish.name}>{dish.name}: {dish.portions} servings</li>)}</ul>{event.changes.length > 0 && <div className="table-scroll" role="region" aria-label="Actual stock and reservation changes" tabIndex="0"><table><thead><tr><th scope="col">Ingredient / Batch</th><th scope="col">Stock before → after</th><th scope="col">Order reserved</th><th scope="col">Plan reserved before → after</th><th scope="col">Available before → after</th></tr></thead><tbody>{event.changes.map(change => <tr key={change.batch}><th scope="row"><span className="ingredient-name">{change.ingredient}</span><span className="ingredient-detail">{change.batch}</span></th><td>{formatQuantity(change.before.stock, change.unit)} → {formatQuantity(change.after.stock, change.unit)}</td><td>{formatQuantity(change.after.orderReserved, change.unit)}</td><td>{formatQuantity(change.before.planReserved, change.unit)} → {formatQuantity(change.after.planReserved, change.unit)}</td><td>{formatQuantity(change.before.available, change.unit)} → {formatQuantity(change.after.available, change.unit)}</td></tr>)}</tbody></table></div>}</details></li>;
    })}</ol>}
  </div></section>;
}
