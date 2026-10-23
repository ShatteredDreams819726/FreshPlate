import { batchLabel } from './ingredientPresentation.js';
import { formatDate, formatQuantity } from './inventory.js';
import { validateCaps } from './recipes.js';
import { inspectInventory } from './planner.js';
import { activePlan, currentPlan, inventoryForPlanner, isDraftStale, planningDate } from './workflow.js';
import { plannedSummary, recordedSummary } from './planSummary.js';
import { dishLimitFacts, limitText, recommendationText, remainingStockFacts, remainingStockText } from './planExplanation.js';
import PlanActions from './PlanActions.jsx';
import RecordedConsumption from './RecordedConsumption.jsx';

export default function TodaysPlan({ demo, onViewLog }) {
  const { state, run, blocked } = demo;
  const plan = currentPlan(state);
  const recipes = state.recipes;
  const pendingPlan = activePlan(state);
  const result = plan?.snapshot.result;
  const remainingBatchCount = new Set(result?.leftovers.map(batch => batch.batch) ?? []).size;
  const savedRecipes = plan?.snapshot.recipes;
  const errors = validateCaps(state.caps, recipes);
  const stale = plan && isDraftStale(state, plan);
  const completion = state.activity.find(event => event.planId === plan?.id && event.action === 'Completed');
  const summary = result ? completion ? recordedSummary(completion, result) : plannedSummary(result) : null;
  const exclusions = inspectInventory(inventoryForPlanner(state), planningDate(state), state.ingredients).filter(batch => !batch.eligible);
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
        {completion && <RecordedConsumption event={completion} inventory={state.inventory} />}
        <div className="result-heading"><h3>{completion ? 'Prepared dishes' : 'Planned dishes'}</h3>{stale && <span>Previous draft · regenerate before approval</span>}</div>
        <div className="dish-results compact-dishes">{result.dishes.filter(dish => dish.portions > 0).map(dish => <article className="dish-result" key={dish.id}>
          <div className="dish-result-heading"><h4>{dish.name}</h4><span className="portion-count">{dish.portions}<span>servings</span></span></div>
          <p>{recommendationText(dish)}</p>
          <p className="dish-limit">{limitText(dishLimitFacts(dish, savedRecipes.find(recipe => recipe.id === dish.id), result))}</p>
          <details><summary>View batch allocation</summary><ul>{dish.allocations.map(item => <li key={item.batch}>{item.ingredient} / {batchLabel(item, state.inventory)}: {formatQuantity(item.quantity, item.unit)}</li>)}</ul></details>
        </article>)}</div>
        {result.dishes.some(dish => dish.portions === 0) && <details className="detail-panel"><summary>Dishes not planned</summary>{result.dishes.filter(dish => dish.portions === 0).map(dish => <article className="reason-detail" key={dish.id}><h4>{dish.name} · 0 servings</h4><p>{limitText(dishLimitFacts(dish, savedRecipes.find(recipe => recipe.id === dish.id), result))}</p></article>)}</details>}
        <details className="detail-panel remaining-priority"><summary>Remaining priority stock ({remainingBatchCount} {remainingBatchCount === 1 ? 'batch' : 'batches'})</summary>{remainingBatchCount > 0 && <p className="projection-note">{completion ? 'Planned available remainder at generation, after reservations and plan allocation; actual consumption is recorded above.' : 'Planned available remainder after reservations and this plan’s allocation.'}</p>}
          {result.leftovers.length ? <div className="table-scroll remaining-table" role="region" aria-label="Remaining priority stock by batch" tabIndex="0"><table><thead><tr><th scope="col">Ingredient</th><th scope="col">Batch</th><th scope="col">Remaining</th><th scope="col">Reason</th></tr></thead><tbody>{result.leftovers.map(batch => <tr key={batch.batch}><th scope="row">{batch.ingredient}</th><td>{batchLabel(batch, state.inventory)}</td><td>{formatQuantity(batch.remainingAvailable, batch.unit)}</td><td>{remainingStockText(remainingStockFacts(batch, result, savedRecipes))}</td></tr>)}</tbody></table></div> : <p>No priority stock remains unallocated in this plan.</p>}
        </details>
        <details className="detail-panel"><summary>Planned batch details ({result.projections.length})</summary><p className="projection-note">Generation-time estimates. Current stock is in Inventory; actual changes are in Activity Log.</p><div className="table-scroll projection-table" role="region" aria-label="Planned batch use and remaining stock" tabIndex="0"><table><thead><tr><th scope="col">Ingredient / Batch</th><th scope="col">Use-by</th><th scope="col">Source stock</th><th scope="col">Reserved</th><th scope="col">Planned use</th><th scope="col">Projected stock</th><th scope="col">Unallocated</th></tr></thead><tbody>{result.projections.map((batch, index) => <tr key={`${batch.batch}-${index}`}><th scope="row"><span className="ingredient-name">{batch.ingredient}</span><span className="ingredient-detail">{batchLabel(batch, state.inventory)}</span>{batch.excludedReason && <span className="row-issue">{batch.excludedReason}</span>}</th><td>{formatDate(batch.deadline)}</td><td>{formatQuantity(batch.stock, batch.unit)}</td><td>{formatQuantity(batch.reserved, batch.unit)}</td><td>{formatQuantity(batch.plannedUse, batch.unit)}</td><td>{formatQuantity(batch.projectedStock, batch.unit)}</td><td>{batch.eligible ? formatQuantity(batch.remainingAvailable, batch.unit) : 'Excluded'}</td></tr>)}</tbody></table></div></details>
      </div>}
      <details className="detail-panel"><summary>Recipes</summary><p>Ingredients per serving{plan ? ' · saved plan snapshot' : ''}</p><ol>{(savedRecipes ?? recipes).map(recipe => <li key={recipe.id}><strong>{recipe.name}</strong>: {recipe.ingredients.map(part => `${part.ingredient} ${formatQuantity(part.quantity, part.unit)}`).join(' + ')}</li>)}</ol></details>
      {exclusions.length > 0 && <details className="detail-panel"><summary>Excluded batches ({exclusions.length})</summary><ul>{exclusions.map((batch, index) => <li key={`${batch.batch}-${index}`}>{batchLabel(batch, state.inventory)}: {batch.issues.length ? batch.issues.join(' ') : 'Past use-by date.'}</li>)}</ul></details>}
    </div>
  </section>;
}
