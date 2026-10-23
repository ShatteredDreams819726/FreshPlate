import { batchLabel } from './ingredientPresentation.js';
import { isValidDate, formatQuantity } from './inventory.js';
import RecordedConsumption from './RecordedConsumption.jsx';
import { planLabel } from './planNumbers.js';

export function formatOperationTime(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long' }).format(new Date(value));
}
const descriptions = {
  Draft: 'Planned · Draft generated. Review it in Today’s Plan.',
  Approved: 'Ingredients reserved. Next: complete preparation or cancel the plan.',
  Completed: 'Preparation completed. Stock deducted and plan reservations released.',
  Cancelled: 'Reservations released; stock unchanged. Generate a new plan when ready.',
};
export default function ActivityLog({ activity, inventory = [], planNumbering, onViewPlan }) {
  return <section className="inventory-panel activity-panel" aria-labelledby="activity-title"><div className="panel-heading"><div><p className="eyebrow">YOUR PREPARATION RECORD</p><h2 id="activity-title">Activity Log</h2><p>Actual operation times · Your browser's local timezone</p></div></div><div className="plan-body">
    {activity.length === 0 ? <div className="plan-placeholder"><strong>No activity yet.</strong><p>Generate a plan, approve it, then complete preparation to record consumption.</p><button className="generate-button" type="button" onClick={onViewPlan}>Open Today's Plan</button></div> : <ol className="activity-list">{[...activity].reverse().map(event => {
      if (event.action === 'StockImported') return <li className="activity-event" key={event.id}><div className="workflow-heading"><strong>Stock imported · {event.payload.batchIds.length} new batches</strong><time dateTime={event.time}>{formatOperationTime(event.time)}</time></div><p>Arrival quantities appended. Existing-order reservations unchanged.</p><details className="detail-panel"><summary>Confirmed arrival details</summary><ul>{event.payload.rows.map((row, index) => <li key={row.rowId}><strong>{row.ingredient}: {formatQuantity(row.stock, row.unit)}</strong><p>Batch: {batchLabel(event.payload.batchIds[index], inventory)} · Expiry: {row.deadline}</p>{isValidDate(row.productionDate) && <p>Production date: {row.productionDate}</p>}</li>)}</ul></details></li>;
      if (event.action === 'RecipeSaved') return <li className="activity-event" key={event.id}><div className="workflow-heading"><strong>Recipe saved · {event.payload.recipe.name}</strong><time dateTime={event.time}>{formatOperationTime(event.time)}</time></div><p>Normalized per-serving recipe confirmed. Existing plan snapshots are unchanged.</p><ul>{event.payload.recipe.ingredients.map(part => <li key={part.ingredientId}>{part.ingredient}: {formatQuantity(part.quantity, part.unit)} per serving</li>)}</ul></li>;
      if (event.action === 'ModeChanged') return <li className="activity-event" key={event.id}><strong>Planning mode: {event.payload.mode}</strong><p><time dateTime={event.time}>{formatOperationTime(event.time)}</time></p></li>;
      const dishes = event.dishes.filter(dish => dish.portions > 0);
      const portions = dishes.reduce((sum, dish) => sum + dish.portions, 0);
      return <li className="activity-event" key={event.id}><div className="workflow-heading"><span className={`status-badge status-${event.action.toLowerCase()}`}>{event.action === 'Draft' ? 'Draft generated' : event.action}</span><time dateTime={Number.isFinite(Date.parse(event.time)) ? event.time : undefined}>{formatOperationTime(event.time)}</time></div><p className="plan-id">{planLabel(planNumbering, event.planId)}</p><p>{descriptions[event.action]}</p><p className="event-summary"><strong>{portions} {event.action === 'Completed' ? 'servings prepared' : 'servings planned'}</strong> · {dishes.length} dishes</p>
        {event.action === 'Completed' && <details className="detail-panel"><summary>Recorded consumption</summary><RecordedConsumption event={event} inventory={inventory} showHeading={false} /></details>}
        <details className="detail-panel"><summary>Dish portions{event.changes.length ? ' & batch changes' : ''}</summary><ul>{dishes.map(dish => <li key={dish.name}>{dish.name}: {dish.portions} servings</li>)}</ul>{event.changes.length > 0 && <div className="table-scroll" role="region" aria-label="Actual stock and reservation changes" tabIndex="0"><table><thead><tr><th scope="col">Ingredient / Batch</th><th scope="col">Stock before → after</th><th scope="col">Order reserved</th><th scope="col">Plan reserved before → after</th><th scope="col">Available before → after</th></tr></thead><tbody>{event.changes.map(change => <tr key={change.batch}><th scope="row"><span className="ingredient-name">{change.ingredient}</span><span className="ingredient-detail">{batchLabel(change, inventory)}</span></th><td>{formatQuantity(change.before.stock, change.unit)} → {formatQuantity(change.after.stock, change.unit)}</td><td>{formatQuantity(change.after.orderReserved, change.unit)}</td><td>{formatQuantity(change.before.planReserved, change.unit)} → {formatQuantity(change.after.planReserved, change.unit)}</td><td>{formatQuantity(change.before.available, change.unit)} → {formatQuantity(change.after.available, change.unit)}</td></tr>)}</tbody></table></div>}</details></li>;
    })}</ol>}
  </div></section>;
}
