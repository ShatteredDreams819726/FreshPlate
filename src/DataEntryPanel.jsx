import { useState } from 'react';
import { activePlan } from './workflow.js';
import { EXTRACTION_VERSION, STOCK_HEADER, todayLocal, parseStockTable, createStockPreview, validateRecipePreview, updateStockPreviewRow } from './dataEntry.js';
import ImportIssues from './ImportIssues.jsx';
import StockImportPreview from './StockImportPreview.jsx';
import AIImportPanel from './AIImportPanel.jsx';
import { extractionToPreview } from './aiImport.js';
import IngredientsPanel from './IngredientsPanel.jsx';
import { exactCandidates, suggestedIngredients } from './ingredientPresentation.js';
import { formatQuantity } from './inventory.js';

const token = prefix => `${prefix}-${crypto.randomUUID()}`;
const blankRow = id => ({ id, ingredientId: '', ingredientName: '', quantity: '', unit: '', createIngredient: false });

function IngredientMatch({ row, catalog, onChange, prefix }) {
  const exact = exactCandidates(row.ingredientName, row.unit, catalog);
  const suggestions = suggestedIngredients(row.ingredientName, row.unit, catalog);
  return <div className="ingredient-match"><label htmlFor={`${prefix}-ingredient`}>Ingredient</label><select id={`${prefix}-ingredient`} value={row.ingredientId || (row.createIngredient ? '__new' : '')} onChange={event => onChange({ ingredientId: event.target.value === '__new' ? '' : event.target.value, createIngredient: event.target.value === '__new' })}><option value="">Match {row.ingredientName || 'an ingredient'}…</option>{catalog.map(item => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}<option value="__new">Create a new ingredient…</option></select>{row.createIngredient && <><label htmlFor={`${prefix}-name`}>New ingredient name</label><input id={`${prefix}-name`} value={row.ingredientName} onChange={event => onChange({ ingredientName: event.target.value })} /><span className="entry-help">Confirming will create a separate ingredient with the selected unit.</span></>}{!row.ingredientId && exact.length === 1 && <p className="entry-help">Suggested match: {exact[0].name} · {exact[0].unit}. Select it above to confirm.</p>}{exact.length > 1 && <p className="entry-help">Multiple exact matches. Choose an ingredient explicitly.</p>}{!row.ingredientId && suggestions.length > 0 && <p className="entry-help">Possible matches: {suggestions.map(item => `${item.name} · ${item.unit}`).join(", ")}. Select one above only if it is the same ingredient; similar names are never merged automatically.</p>}</div>;
}

export default function DataEntryPanel({ demo, onViewPlan }) {
  const { state, run, blocked } = demo;
  const active = activePlan(state);
  const [raw, setRaw] = useState('');
  const [stockPreview, setStockPreview] = useState(null);
  const [parseError, setParseError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [recipeId, setRecipeId] = useState('');
  const [name, setName] = useState('');
  const [servings, setServings] = useState('1');
  const [recipeRows, setRecipeRows] = useState([blankRow('part-1')]);
  const [recipePreview, setRecipePreview] = useState(null);
  const [recipeSource, setRecipeSource] = useState('manual-form');
  const recipeCheck = recipePreview ? validateRecipePreview(recipePreview, state) : null;
  const sampleDate = todayLocal();
  const sample = `${STOCK_HEADER.join('\t')}\nTomatoes\t1500\tg\tSUP-042\t\t${sampleDate}\nEggs\t24\tpcs\t\t\t${sampleDate}`;
  function updateStock(rowId, fields) {
    setStockPreview(previous => updateStockPreviewRow(previous,rowId,fields));
  }
  function updateRecipe(rowId, fields) {
    updateRecipeRows(previous => previous.map(row => row.id === rowId ? { ...row, ...fields } : row));
  }
  function updateRecipeRows(transform) {
    setRecipeRows(transform);
    setRecipePreview(previous=>previous?{...previous,rows:transform(previous.rows)}:null);
  }
  function selectRecipe(id) {
    setRecipeId(id); setRecipePreview(null); setRecipeSource('manual-form');
    const recipe = state.recipes.find(item => item.id === id);
    setName(recipe?.name ?? ''); setServings('1');
    setRecipeRows(recipe ? recipe.ingredients.map((part, index) => ({ ...blankRow(`part-${index + 1}`), ...part, ingredientName: state.ingredients.find(item => item.id === part.ingredientId)?.name ?? '', quantity: String(part.quantity) })) : [blankRow('part-1')]);
  }
  return <section className="inventory-panel entry-panel" aria-labelledby="entry-title"><div className="panel-heading"><div><p className="eyebrow">REVIEW BEFORE SAVING</p><h2 id="entry-title">Stock &amp; recipes</h2><p>Preview, correct and confirm deliveries or recipes.</p></div></div><div className="plan-body">
    {active && <div className="plan-notice"><strong>Approved plan in progress</strong><p>Previews are available. Complete or cancel the active plan before saving changes.</p><button type="button" className="secondary-button" onClick={onViewPlan}>Open Today's Plan</button></div>}
    <details className="detail-panel"><summary>Import Stock</summary><AIImportPanel kind="stock" blocked={blocked} onUse={extraction => { setStockPreview(extractionToPreview(extraction, state.ingredients, token('IMP'))); setParseError(''); }} /><p>Paste six tab-separated columns or simple CSV. Blank batch numbers and production dates stay blank. Each confirmed row appends a separate arrival.</p><details><summary>Copyable example</summary><textarea readOnly rows={4} aria-label="Stock import example" value={sample} /><div className="workflow-buttons"><button type="button" className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(sample); setCopyMessage('Example copied.'); } catch { setCopyMessage('Select the example text and copy it manually.'); } }}>Copy Example</button><button type="button" className="secondary-button" onClick={() => { setRaw(sample); setStockPreview(null); }}>Use Example</button></div>{copyMessage && <p role="status">{copyMessage}</p>}</details>
      <label htmlFor="stock-table">Delivery table</label><textarea id="stock-table" rows={5} value={raw} onChange={event => { setRaw(event.target.value); setStockPreview(null); setParseError(''); }} placeholder={STOCK_HEADER.join('\t')} />
      <button type="button" className="secondary-button" disabled={blocked} onClick={() => { try { setStockPreview(createStockPreview(parseStockTable(raw), state.ingredients, token('IMP'))); setParseError(''); } catch (error) { setParseError(error.message); setStockPreview(null); } }}>Preview Import</button>
      {parseError && <p role="alert" className="input-error">{parseError}</p>}
      {stockPreview && <StockImportPreview preview={stockPreview} state={state} blocked={blocked} IngredientMatch={IngredientMatch} onChange={updateStock} onConfirm={()=>{if(run({type:'IMPORT_STOCK',preview:stockPreview})){setStockPreview(null);setRaw('');}}} onCancel={()=>setStockPreview(null)}/>}
    </details>

    <details className="detail-panel"><summary>Import / Add Recipe</summary><AIImportPanel kind="recipe" blocked={blocked} onUse={extraction => { const preview = extractionToPreview(extraction, state.ingredients, token('RC')); setRecipeId(''); setName(preview.name); setServings(preview.servings); setRecipeRows(preview.rows); setRecipePreview(preview); setRecipeSource('gemini'); }} /><label htmlFor="recipe-choice">New dish or edit an existing recipe</label><select id="recipe-choice" value={recipeId} onChange={event => selectRecipe(event.target.value)}><option value="">Add a new recipe</option>{state.recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select>
      <div className="entry-fields"><label>Dish name<input value={name} onChange={event => { setName(event.target.value); setRecipePreview(previous=>previous?{...previous,name:event.target.value}:null); }} /></label><label>Recipe yield (servings)<input inputMode="numeric" value={servings} onChange={event => { setServings(event.target.value); setRecipePreview(previous=>previous?{...previous,servings:event.target.value}:null); }} /></label></div>
      <p>Enter ingredient totals for the recipe yield, then review the per-serving amounts.</p>
      {recipeRows.map((row, index) => <div className="recipe-entry-row" key={row.id}><IngredientMatch row={row} catalog={state.ingredients} prefix={`recipe-${row.id}`} onChange={fields => updateRecipe(row.id, fields)} /><label>Total quantity<input value={row.quantity} onChange={event => updateRecipe(row.id, { quantity: event.target.value })} /></label><label>Unit<input value={row.unit} placeholder="g / kg / pcs" onChange={event => updateRecipe(row.id, { unit: event.target.value })} /></label><button type="button" className="secondary-button" disabled={recipeRows.length === 1} onClick={() => { updateRecipeRows(previous => previous.filter((_row, i) => i !== index)); }}>Remove</button></div>)}
      <div className="workflow-buttons"><button type="button" className="secondary-button" onClick={() => { const row=blankRow(token('part')); updateRecipeRows(previous => [...previous, row]); }}>Add Ingredient</button><button type="button" className="secondary-button" disabled={blocked} onClick={() => setRecipePreview({ version: EXTRACTION_VERSION, kind: 'recipe', id: token('RC'), source: recipeSource, recipeId, name, servings, rows: structuredClone(recipeRows) })}>Review Per-serving Recipe</button></div>
      {recipePreview && <div className="import-preview"><h3>Per-serving confirmation</h3><ImportIssues issues={recipeCheck.errors} rows={recipeRows} />{recipeCheck.recipe && <ul>{recipeCheck.recipe.ingredients.map(part => <li key={part.ingredientId}>{part.ingredient}: {formatQuantity(part.quantity, part.unit)} per serving</li>)}</ul>}<p>New dishes start with a prep cap of 0. Set a cap in Today's Plan after saving.</p><button type="button" className="generate-button" disabled={blocked || Boolean(active) || recipeCheck.errors.length > 0} onClick={() => { if (run({ type: 'SAVE_RECIPE', preview: recipePreview })) { setRecipePreview(null); selectRecipe(''); } }}>Confirm Recipe</button><button type="button" className="secondary-button" onClick={()=>setRecipePreview(null)}>Cancel Preview</button></div>}
    </details>
    <IngredientsPanel demo={demo} />
  </div></section>;
}
