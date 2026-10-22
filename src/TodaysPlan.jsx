import { DEMO_DATE, formatDate, formatQuantity } from './inventory.js';
import { recipes, validateCaps } from './recipes.js';
import { inspectInventory } from './planner.js';
import { currentPlan, inventoryForPlanner, isDraftStale } from './workflow.js';
import PlanActions from './PlanActions.jsx';

const priorityEndDate = new Date(Date.parse(`${DEMO_DATE}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);

export default function TodaysPlan({ demo }) {
  const { state, run, blocked } = demo;
  const caps = state.caps;
  const plan = currentPlan(state);
  const draft = plan ? { result: plan.snapshot.result } : null;
  const errors = validateCaps(caps);
  const stale = plan !== null && isDraftStale(state, plan);
  const exclusions = inspectInventory(inventoryForPlanner(state)).filter(batch => !batch.eligible);

  function handleGenerate(event) {
    event.preventDefault();
    if (errors.length || blocked) return;
    run({ type: 'GENERATE' });
  }

  return <section className="inventory-panel plan-panel" id="todays-plan" aria-labelledby="plan-title">
    <div className="panel-heading"><div><p className="eyebrow">PLAN · APPROVE · PREPARE</p><h2 id="plan-title">Today's Plan</h2><p>Simulated data · Fixed planning date: {formatDate(DEMO_DATE)}</p></div><span className="draft-badge">BROWSER-LOCAL DEMO</span></div>
    <div className="plan-body">
      <div className="plan-intro"><h3>Set your extra prep limits</h3><p>These caps apply to newly generated drafts, not an existing approved snapshot. They are supplied by the owner, not a sales forecast or guarantee. Existing-order reservations stay protected. Oil, salt and other seasonings are assumed sufficient. Owner and staff are demo roles only.</p></div>
      <details className="plan-rules"><summary>How this draft is calculated</summary><ol>
        <li>Exclude invalid and past-use-by batches. Priority dates are {formatDate(DEMO_DATE)} through {formatDate(priorityEndDate)}, inclusive. Later valid batches may supply supporting ingredients.</li>
        <li>Start with stock minus existing-order reservations. Process priority batches by earliest use-by date; ties use batch ID.</li>
        <li>For each batch, try dishes in the numbered order below. Allocate one whole serving at a time only if it uses a priority ingredient, fits the owner cap, and all ingredients are available.</li>
        <li>Immediately reduce the one shared calculation budget. Within each ingredient, always use the earliest-dated eligible batch first.</li>
        <li>Mass is stored in kg and converted to integer grams for arithmetic (1 kg = 1,000 g); eggs stay in whole pieces. Different ingredient quantities or units are never added to rank dishes.</li>
      </ol><p>A deterministic heuristic, not a globally optimal plan. It does not predict demand, judge food safety, or model staffing, equipment or profitability. Dates indicate demo priority only.</p></details>
      {exclusions.length > 0 && <div className="plan-notice"><strong>Excluded batches ({exclusions.length})</strong><ul>{exclusions.map((batch, index) => <li key={`${batch.batch}-${index}`}>{batch.ingredient} / {batch.batch}: {batch.issues.length ? batch.issues.join(' ') : 'Past use-by date. Not used in any recommendation.'}</li>)}</ul></div>}
      <form onSubmit={handleGenerate} noValidate>
        <div className="recipe-grid">{recipes.map((recipe, index) => {
          const error = errors.find(item => item.recipeId === recipe.id);
          return <article className="recipe-card" key={recipe.id}><p className="eyebrow">DISH PRIORITY {String(index + 1).padStart(2, '0')}</p><h4>{recipe.name}</h4><p className="recipe-label">Main ingredients per serving</p><ul>{recipe.ingredients.map(part => <li key={part.ingredient}><span>{part.ingredient}</span><strong>{formatQuantity(part.quantity, part.unit)}</strong></li>)}</ul><label htmlFor={`cap-${recipe.id}`}>Owner's extra prep cap <span>(servings)</span></label><input id={`cap-${recipe.id}`} type="text" inputMode="numeric" pattern="[0-9]+" value={caps[recipe.id]} disabled={blocked} aria-invalid={Boolean(error)} aria-describedby={`hint-${recipe.id}`} onChange={event => run({ type: 'SET_CAP', recipeId: recipe.id, value: event.target.value })} /><p id={`hint-${recipe.id}`} className={error ? 'input-error' : 'input-hint'}>{error ? 'Enter a non-negative whole number.' : 'Whole servings only. Set 0 to skip.'}</p></article>;
        })}</div>
        <div className="generate-bar"><p>Generation creates a new saved Draft with a unique ID. No stock or reservations change.</p><button className="generate-button" type="submit" disabled={blocked || errors.length > 0}>Generate Plan <span aria-hidden="true">↗</span></button></div>
      </form>
      <PlanActions state={state} run={run} blocked={blocked} />
      {demo.error && <p className="plan-notice error-notice">{demo.error}</p>}
      {demo.message && <p className="plan-notice fresh-notice">{demo.message}</p>}
      {!draft && <div className="plan-placeholder"><strong>Your draft starts here.</strong><p>Review the recipes and owner caps, then choose Generate Plan.</p></div>}
      {draft && <div className="draft-results">
        <p className={`plan-notice ${stale ? 'stale-notice' : 'fresh-notice'}`}>{stale ? 'Needs regeneration — owner caps or inventory changed. This old draft cannot be approved.' : plan.status === 'Draft' ? 'Current Draft — estimates only. Generation did not change stock or reservations.' : `${plan.status} plan — the original planning snapshot below stays unchanged. See live inventory and Activity Log for actual changes.`}</p>
        <div className="result-heading"><h3>{stale ? 'Previous draft' : 'Saved prep snapshot'}</h3><span>{draft.result.totalPortions} additional servings · {draft.result.dishes.filter(dish => dish.portions > 0).length} dishes</span></div>
        {draft.result.totalPortions === 0 && <div className="plan-notice"><strong>No feasible plan under these caps and available batches.</strong><p>A dish must use at least one priority ingredient and have every ingredient available for a whole serving. Review the per-dish limits below; caps of 0 disable a dish. Invalid and expired batches cannot be used.</p></div>}
        <div className="dish-results">{draft.result.dishes.map(dish => <article className="dish-result" key={dish.id}><div><h4>{dish.name}</h4><span className="portion-count">{dish.portions} <span>servings / cap {dish.cap}</span></span></div><p>{dish.reason}</p><p className="limit-label">Why allocation stops (at the end of this draft)</p><ul>{dish.limits.map(limit => <li key={limit}>{limit}</li>)}</ul><details><summary>View this dish's batch allocation</summary>{dish.allocations.length ? <ul>{dish.allocations.map(allocation => <li key={allocation.batch}>{allocation.ingredient} / {allocation.batch}: {formatQuantity(allocation.quantity, allocation.unit)}{allocation.priority ? ' · Priority batch' : ' · Supporting batch'}</li>)}</ul> : <p>No ingredients allocated.</p>}</details></article>)}</div>
        <div className="result-heading"><h3>Planning snapshot: expected use by batch</h3></div><p className="projection-note">These are frozen generation-time estimates, not live stock or an actual consumption record. Snapshot reserved includes orders and any plan active at generation. Projected stock = source stock − planned use; unallocated = projected stock − snapshot reserved. See Activity Log for changes actually applied.</p>
        <div className="table-scroll projection-table" role="region" aria-label="Draft ingredient and batch projections, horizontally scrollable" tabIndex="0"><table><caption className="sr-only">Hypothetical inventory after the draft. Existing reservations remain protected.</caption><thead><tr><th scope="col">Ingredient / Batch</th><th scope="col">Use-by date</th><th scope="col" className="numeric">Original stock</th><th scope="col" className="numeric">Reserved</th><th scope="col" className="numeric">Planned use</th><th scope="col" className="numeric">Projected stock</th><th scope="col" className="numeric">Unallocated</th></tr></thead><tbody>{draft.result.projections.map((batch, index) => <tr key={`${batch.batch}-${index}`}><th scope="row"><span className="ingredient-name">{batch.ingredient}</span><span className="ingredient-detail">{batch.batch}</span>{batch.excludedReason && <span className="row-issue">Excluded: {batch.excludedReason}</span>}</th><td>{formatDate(batch.deadline)}</td><td className="numeric">{formatQuantity(batch.stock, batch.unit)}</td><td className="numeric reserved">{formatQuantity(batch.reserved, batch.unit)}</td><td className="numeric available">{formatQuantity(batch.plannedUse, batch.unit)}</td><td className="numeric">{formatQuantity(batch.projectedStock, batch.unit)}</td><td className="numeric">{batch.eligible ? formatQuantity(batch.remainingAvailable, batch.unit) : 'Excluded'}</td></tr>)}</tbody></table></div>
        <div className="leftovers"><h3>Snapshot: priority ingredients left unallocated</h3>{draft.result.leftovers.length ? <ul>{draft.result.leftovers.map(batch => <li key={batch.batch}><strong>{batch.ingredient} / {batch.batch}: {formatQuantity(batch.remainingAvailable, batch.unit)}</strong><span>Use-by: {formatDate(batch.deadline)} · Excludes snapshot reservations</span><p>{batch.explanation}</p></li>)}</ul> : <p>No unallocated priority ingredients remain in this snapshot. Existing reservations are still protected.</p>}</div>
      </div>}
    </div>
  </section>;
}
