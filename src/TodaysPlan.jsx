import { formatDate, formatQuantity } from './inventory.js';
import { recipes, validateCaps } from './recipes.js';
import { inspectInventory } from './planner.js';
import { activePlan, currentPlan, inventoryForPlanner, isDraftStale } from './workflow.js';
import { plannedSummary, recordedSummary } from './planSummary.js';
import PlanActions from './PlanActions.jsx';
import RecordedConsumption from './RecordedConsumption.jsx';

export default function TodaysPlan({ demo, onViewLog }) {
  const { state, run, blocked } = demo;
  const plan = currentPlan(state);
  const pendingPlan = activePlan(state);
  const result = plan?.snapshot.result;
  const errors = validateCaps(state.caps);
  const stale = plan && isDraftStale(state, plan);
  const completion = state.activity.find(event => event.planId === plan?.id && event.action === 'Completed');
  const summary = result ? completion ? recordedSummary(completion, result) : plannedSummary(result) : null;
  const exclusions = inspectInventory(inventoryForPlanner(state)).filter(batch => !batch.eligible);
  const mainGenerate = !plan || stale || plan.status === 'Cancelled' || result.totalPortions === 0;

  function generate(event) {
    event.preventDefault();
    if (!blocked && !pendingPlan && errors.length === 0) run({ type: 'GENERATE' });
  }

  return <section className="inventory-panel plan-panel" aria-labelledby="plan-title">
    <div className="panel-heading"><div><p className="eyebrow">FROM INGREDIENTS TO PREPARATION</p><h2 id="plan-title">Today's Plan</h2><p>Set extra servings, review your plan, then prepare.</p></div><span className="draft-badge">{plan?.status ?? 'Ready to generate'}</span></div>
    <div className="plan-body">
      {summary && <div className="plan-summary" aria-label={completion ? 'Recorded consumption summary' : 'Planned summary'}><p>{completion ? 'Recorded consumption' : plan.status === 'Cancelled' ? 'Planned · Cancelled' : 'Planned'}</p><div><article><strong>{summary.portions}</strong><span>{completion ? 'Servings prepared' : 'Additional servings'}</span></article><article><strong>{summary.dishes}</strong><span>{completion ? 'Dishes prepared' : 'Recommended dishes'}</span></article><article><strong>{summary.priorityBatches}</strong><span>Priority batches {completion ? 'used' : 'in plan'}</span></article></div></div>}
      <form onSubmit={generate} noValidate className="caps-form">
        <div className="form-heading"><h3>Extra prep caps</h3><span>Owner limits · whole servings · 0 to skip</span></div>
        <div className="caps-grid">{recipes.map(recipe => {
          const error = errors.find(item => item.recipeId === recipe.id);
          return <div className="cap-field" key={recipe.id}><label htmlFor={`cap-${recipe.id}`}>{recipe.name}</label><input id={`cap-${recipe.id}`} type="text" inputMode="numeric" pattern="[0-9]+" value={state.caps[recipe.id]} disabled={blocked} aria-invalid={Boolean(error)} aria-describedby={error ? `hint-${recipe.id}` : undefined} onChange={event => run({ type: 'SET_CAP', recipeId: recipe.id, value: event.target.value })} />{error && <p className="input-error" id={`hint-${recipe.id}`}>Use a whole number, 0 or more.</p>}</div>;
        })}</div>
        <div className="generate-bar"><span id="generation-hint">{pendingPlan ? 'A plan is Approved. Complete or cancel it before generating another.' : stale ? 'Needs regeneration — inputs or inventory changed.' : 'Caps set extra portions beyond existing orders.'}</span><button className={mainGenerate ? 'generate-button' : 'secondary-button'} type="submit" aria-describedby="generation-hint" disabled={blocked || Boolean(pendingPlan) || errors.length > 0}>Generate Plan</button></div>
      </form>
      <PlanActions state={state} run={run} blocked={blocked} onViewLog={onViewLog} />
      {!result && <div className="plan-placeholder"><strong>Start with a plan.</strong><p>Keep the sample caps or adjust them, then select Generate Plan.</p></div>}
      {result && <div className="draft-results">
        {result.totalPortions === 0 && <div className="plan-notice"><strong>No feasible servings under these caps.</strong><p>Increase a cap or check priority stock in Inventory, then generate again. Open the reasons below for dish-level limits.</p></div>}
        {completion && <RecordedConsumption event={completion} />}
        <div className="result-heading"><h3>{completion ? 'Prepared dishes' : 'Planned dishes'}</h3>{stale && <span>Previous draft · regenerate before approval</span>}</div>
        <div className="dish-results compact-dishes">{(completion ? completion.dishes : result.dishes).filter(dish => dish.portions > 0).map(dish => <article className="dish-result" key={dish.id ?? dish.name}><h4>{dish.name}</h4><span className="portion-count">{dish.portions}<span>servings</span></span></article>)}</div>
        <details className="detail-panel"><summary>Why these dishes? View reasons &amp; allocation</summary>{result.dishes.map(dish => <article className="reason-detail" key={dish.id}><h4>{dish.name} · {dish.portions} servings</h4><p>{dish.reason}</p><ul>{dish.limits.map(limit => <li key={limit}>{limit}</li>)}</ul>{dish.allocations.length > 0 && <details><summary>Planned batch allocation</summary><ul>{dish.allocations.map(item => <li key={item.batch}>{item.ingredient} / {item.batch}: {formatQuantity(item.quantity, item.unit)}</li>)}</ul></details>}</article>)}</details>
        <details className="detail-panel"><summary>Planned batch details ({result.projections.length})</summary><p className="projection-note">Generation-time estimates. Current stock is in Inventory; actual changes are in Activity Log.</p><div className="table-scroll projection-table" role="region" aria-label="Planned batch use and remaining stock" tabIndex="0"><table><thead><tr><th scope="col">Ingredient / Batch</th><th scope="col">Use-by</th><th scope="col">Source stock</th><th scope="col">Reserved</th><th scope="col">Planned use</th><th scope="col">Projected stock</th><th scope="col">Unallocated</th></tr></thead><tbody>{result.projections.map((batch, index) => <tr key={`${batch.batch}-${index}`}><th scope="row"><span className="ingredient-name">{batch.ingredient}</span><span className="ingredient-detail">{batch.batch}</span>{batch.excludedReason && <span className="row-issue">{batch.excludedReason}</span>}</th><td>{formatDate(batch.deadline)}</td><td>{formatQuantity(batch.stock, batch.unit)}</td><td>{formatQuantity(batch.reserved, batch.unit)}</td><td>{formatQuantity(batch.plannedUse, batch.unit)}</td><td>{formatQuantity(batch.projectedStock, batch.unit)}</td><td>{batch.eligible ? formatQuantity(batch.remainingAvailable, batch.unit) : 'Excluded'}</td></tr>)}</tbody></table></div></details>
        <details className="detail-panel"><summary>Priority stock left unallocated ({result.leftovers.length} batches)</summary>{result.leftovers.length ? <ul>{result.leftovers.map(batch => <li key={batch.batch}><strong>{batch.ingredient} / {batch.batch}: {formatQuantity(batch.remainingAvailable, batch.unit)}</strong><p>{batch.explanation}</p></li>)}</ul> : <p>No unallocated priority stock remains in this plan's snapshot.</p>}</details>
      </div>}
      <details className="detail-panel"><summary>Recipes &amp; calculation rules</summary><p>Quantities per serving, in allocation order. Seasonings are assumed sufficient.</p><ol>{recipes.map(recipe => <li key={recipe.id}><strong>{recipe.name}</strong>: {recipe.ingredients.map(part => `${part.ingredient} ${formatQuantity(part.quantity, part.unit)}`).join(' + ')}</li>)}</ol><p>Use earliest-expiring priority batches first, from today through two days ahead. Each serving uses the shared, unreserved budget. Later batches can supply supporting ingredients. Expired or invalid batches are excluded.</p><p>kg is converted to whole grams; eggs remain whole pieces. Owner caps are limits, not sales forecasts. Dates show priority, not food safety. Owner and staff are demo roles.</p>{exclusions.length > 0 && <><h4>Excluded batches</h4><ul>{exclusions.map((batch, index) => <li key={`${batch.batch}-${index}`}>{batch.batch}: {batch.issues.length ? batch.issues.join(' ') : 'Past use-by date.'}</li>)}</ul></>}</details>
    </div>
  </section>;
}
