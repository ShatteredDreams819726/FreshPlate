import { toBaseUnits, fromBaseUnits } from './inventory.js';
import { exactCandidates, unitDimension } from './ingredientPresentation.js';
import { normalizeImportDate } from './importDates.js';
import { inputIssues } from './importReview.js';

export const EXTRACTION_VERSION = 1;
export const STOCK_HEADER = ['Ingredient', 'Quantity', 'Unit', 'Batch', 'Production Date', 'Expiry Date'];
const text = value => String(value ?? '').trim();
const key = value => text(value).toLowerCase();
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9-]+$/.test(value);

export function todayLocal(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// The sole supported conversion boundary. No assumed box/bag/piece-to-mass factor.
export function normalizeQuantity(quantity, unit, canonicalUnit) {
  const raw = text(quantity);
  if (!/^\d+(\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) <= 0) throw new Error('Quantity must be a positive number; missing quantities or "to taste" are not supported.');
  if (!['g', 'kg', 'pcs'].includes(unit)) throw new Error(`Unsupported unit "${unit || '(missing)'}". Convert to g, kg or pcs before saving.`);
  if ((unit === 'pcs') !== (canonicalUnit === 'pcs')) throw new Error('Pieces and weight cannot be converted into one another.');
  const base = Number(raw) * (unit === 'kg' ? 1000 : 1);
  if (!Number.isSafeInteger(Math.round(base)) || Math.abs(base - Math.round(base)) > 1e-7) throw new Error(unit === 'pcs' ? 'Use whole pieces.' : 'Use whole grams (kg supports at most 3 decimal places).');
  return fromBaseUnits(Math.round(base), canonicalUnit);
}

// Shared boundary for manual parsing and a future extraction provider.
// Provider output is untrusted: it creates a preview only, never an inventory write.
export function createStockPreview(extraction, catalog, id) {
  if (extraction?.version !== EXTRACTION_VERSION || extraction.kind !== 'stock' || !Array.isArray(extraction.rows) || !safeId(id)) throw new Error('Invalid stock extraction envelope.');
  if (extraction.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Each extraction row must be an object containing ingredient, quantity, unit and dates.');
  return { version: EXTRACTION_VERSION, kind: 'stock', id, source: text(extraction.source) || 'manual-table', rows: extraction.rows.map((row, index) => ({
    id: `row-${index + 1}`, ingredientId: (() => { const matches = exactCandidates(row.ingredientName, text(row.unit), catalog); return matches.length === 1 ? matches[0].id : ''; })(),
    ingredientName: text(row.ingredientName), quantity: text(row.quantity), unit: text(row.unit),
    supplierBatch: text(row.supplierBatch), productionDate: normalizeImportDate(row.productionDate), expiryDate: normalizeImportDate(row.expiryDate),
    createIngredient: false, confirmDuplicate: false,
    ...(extraction.calculations?.some(item=>item.row===index+1) ? {expiryCalculation: {
      ...structuredClone(extraction.calculations.find(item=>item.row===index+1)),
      productionDate: normalizeImportDate(row.productionDate),
    }, confirmCalculatedExpiry:false} : {}),
  })) };
}

export function updateStockPreviewRow(preview, rowId, fields) {
  return {...preview,rows:preview.rows.map(row=>{
    if(row.id!==rowId)return row;
    const next={...row,...fields};
    if(Object.keys(fields).some(field=>!['confirmDuplicate','confirmCalculatedExpiry'].includes(field))) next.confirmDuplicate=false;
    if(Object.hasOwn(fields,'expiryDate')) { next.expiryDate=normalizeImportDate(fields.expiryDate);delete next.expiryCalculation;delete next.confirmCalculatedExpiry; }
    if(Object.hasOwn(fields,'productionDate')) {
      next.productionDate=normalizeImportDate(fields.productionDate);
      if(row.expiryCalculation&&next.productionDate!==row.productionDate){next.expiryDate='';delete next.expiryCalculation;delete next.confirmCalculatedExpiry;}
    }
    return next;
  })};
}

export function parseStockTable(input) {
  const lines = String(input).replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) throw new Error('Paste the header and at least one row.');
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines.shift().split(delimiter).map(text).map((header, index) => index === 3 && key(header) === 'supplier batch' ? 'Batch' : header);
  if (headers.length !== STOCK_HEADER.length || headers.some((header, index) => key(header) !== key(STOCK_HEADER[index]))) throw new Error(`Use these six columns in order: ${STOCK_HEADER.join(' | ')}. Paste tab-separated cells or simple comma-separated text.`);
  const rows = lines.map((line, index) => {
    const cells = line.split(delimiter).map(text);
    if (cells.length !== 6) throw new Error(`Row ${index + 2}: expected six cells. Keep empty optional cells; quoted CSV is not supported.`);
    return Object.fromEntries(['ingredientName', 'quantity', 'unit', 'supplierBatch', 'productionDate', 'expiryDate'].map((field, i) => [field, cells[i]]));
  });
  return { version: EXTRACTION_VERSION, kind: 'stock', source: 'manual-table', rows };
}

function resolveIngredient(row, catalog, newIngredients, token) {
  if (row.ingredientId) {
    const found = catalog.find(item => item.id === row.ingredientId);
    if (!found) throw new Error('Select a known ingredient ID or explicitly create an ingredient.');
    return found;
  }
  if (!row.createIngredient || !text(row.ingredientName)) throw new Error('Match an ingredient or confirm creation of a named ingredient.');
  if (exactCandidates(row.ingredientName, row.unit, catalog).length) throw new Error('This name and unit dimension already exist. Select the existing ingredient; choose explicitly if there are multiple candidates.');
  const unit = row.unit === 'g' || row.unit === 'kg' ? 'kg' : row.unit === 'pcs' ? 'pcs' : null;
  if (!unit) throw new Error('Choose g, kg or pcs before creating this ingredient.');
  const prior = newIngredients.find(item => key(item.name) === key(row.ingredientName) && unitDimension(item.unit) === unitDimension(row.unit));
  if (prior) {
    if (prior.unit !== unit) throw new Error('The same new ingredient has conflicting weight/piece units.');
    return prior;
  }
  const definition = { id: `ING-${token}-${row.id}`, name: text(row.ingredientName), unit };
  if (catalog.some(item => item.id === definition.id)) throw new Error('Ingredient ID already exists. Start a new preview.');
  newIngredients.push(definition);
  return definition;
}

export function validateStockPreview(preview, state) {
  const errors = [], warnings = [], rows = [], ingredients = [];
  if (preview?.version !== EXTRACTION_VERSION || preview.kind !== 'stock' || !safeId(preview.id) || !Array.isArray(preview.rows) || preview.rows.length === 0) return { errors: [{ message: 'Create a non-empty stock preview first.' }], warnings, rows, ingredients };
  const ids = new Set();
  for (const row of preview.rows) {
    const fieldIssues=inputIssues('stock',row);
    errors.push(...fieldIssues.map(issue=>({...issue,rowId:row.id})));
    try {
      if (!safeId(row.id) || ids.has(row.id)) throw new Error('Invalid or duplicate preview row ID.');
      ids.add(row.id);
      if(fieldIssues.length)continue;
      const definition = resolveIngredient(row, state.ingredients, ingredients, preview.id);
      const quantity = normalizeQuantity(row.quantity, text(row.unit), definition.unit);
      const productionDate=normalizeImportDate(row.productionDate), expiryDate=normalizeImportDate(row.expiryDate);
      if(row.expiryCalculation && (row.expiryCalculation.expiryDate!==expiryDate||row.expiryCalculation.productionDate!==productionDate||!row.confirmCalculatedExpiry)) errors.push({rowId:row.id,field:'expiryDate',code:'calculated',message:row.expiryCalculation.conflict?'Confirm the expiry date against the label.':'Confirm the calculated expiry date.'});
      rows.push({ rowId: row.id, ingredientId: definition.id, ingredient: definition.name, stock: quantity, unit: definition.unit,
        supplierBatch: text(row.supplierBatch) || null, productionDate: productionDate || null, deadline: expiryDate });
    } catch (error) { errors.push({ rowId: row.id, message: error.message }); }
  }
  for (const row of rows) {
    const similar = other => other.ingredientId === row.ingredientId &&
      ((row.supplierBatch && other.supplierBatch === row.supplierBatch) ||
        (!row.supplierBatch && !other.supplierBatch && other.deadline === row.deadline && other.stock === row.stock && (!row.productionDate || !other.productionDate || other.productionDate === row.productionDate)));
    const duplicate = state.inventory.some(similar) || rows.some(other => other.rowId !== row.rowId && similar(other));
    if (duplicate) {
      warnings.push({ rowId: row.rowId, message: 'Possible duplicate of an existing batch or another preview row. This will be a separate arrival, never merged.' });
      if (!preview.rows.find(item => item.id === row.rowId).confirmDuplicate) errors.push({ rowId: row.rowId, field:'duplicate',code:'confirmation',message: 'Confirm this is an additional delivery.' });
    }
  }
  return { errors, warnings, rows, ingredients };
}

export function validateRecipePreview(preview, state) {
  const errors = [], ingredients = [], parts = [];
  if (preview?.version !== EXTRACTION_VERSION || preview.kind !== 'recipe' || !safeId(preview.id)) return { errors: [{ message: 'Review a recipe first.' }], ingredients, recipe: null };
  const servings = Number(preview.servings);
  if (!text(preview.name)) errors.push({ message: 'Dish name is required.' });
  if (!/^\d+$/.test(text(preview.servings)) || !Number.isSafeInteger(servings) || servings <= 0) errors.push({ message: 'Recipe yield must be a positive whole number of servings.' });
  if (!Array.isArray(preview.rows) || !preview.rows.length) errors.push({ message: 'Add at least one ingredient.' });
  const seen = new Set(), rowIds = new Set();
  for (const row of preview.rows ?? []) {
    const fieldIssues=inputIssues('recipe',row);
    errors.push(...fieldIssues.map(issue=>({...issue,rowId:row.id})));
    try {
      if (!safeId(row.id) || rowIds.has(row.id)) throw new Error('Invalid or duplicate recipe row ID.');
      rowIds.add(row.id);
      if(fieldIssues.length)continue;
      const definition = resolveIngredient(row, state.ingredients, ingredients, preview.id);
      if (seen.has(definition.id)) throw new Error('Combine repeated ingredient rows before saving.');
      seen.add(definition.id);
      const total = normalizeQuantity(row.quantity, text(row.unit), definition.unit);
      const base = toBaseUnits(total, definition.unit);
      if (!servings || !Number.isInteger(base / servings)) throw new Error('Per-serving amounts must be whole grams or whole pieces. Adjust quantity or yield.');
      parts.push({ ingredientId: definition.id, ingredient: definition.name, quantity: fromBaseUnits(base / servings, definition.unit), unit: definition.unit });
    } catch (error) { errors.push({ rowId: row.id, message: error.message }); }
  }
  const existing = preview.recipeId ? state.recipes.find(recipe => recipe.id === preview.recipeId) : null;
  if (preview.recipeId && !existing) errors.push({ message: 'The selected recipe no longer exists.' });
  const id = existing?.id ?? `RECIPE-${preview.id}`;
  if (state.recipes.some(recipe => key(recipe.name) === key(preview.name) && recipe.id !== id)) errors.push({ message: 'A dish with this name already exists. Select it to edit.' });
  return { errors, ingredients, recipe: { id, name: text(preview.name), defaultCap: existing?.defaultCap ?? 0,
    sourceServings: servings, sourceRows: structuredClone(preview.rows ?? []), ingredients: parts } };
}

export function commitDataChange(state, action) {
  if (state.plans.some(plan => plan.status === 'Approved')) throw new Error('Complete or cancel the Approved plan before changing stock, recipes or planning mode. Previews are still available.');
  if (action.type === 'SET_MODE') {
    if (!['demo', 'business'].includes(action.mode)) throw new Error('Unknown planning mode.');
    if (action.mode === state.mode) throw new Error('This planning mode is already selected.');
    if (action.mode === 'demo' && state.imports.some(record => record.kind === 'stock')) throw new Error('Imported deliveries use Business dates. Reset Demo to return to the sample-only demo.');
    state.mode = action.mode;
    state.inventoryRevision += 1;
    return { action: 'ModeChanged', payload: { mode: action.mode } };
  }
  const preview = action.preview;
  if (!safeId(preview?.id)) throw new Error('Invalid preview ID.');
  if (state.imports.some(record => record.id === preview.id)) throw new Error('This confirmation was already applied. No rows or records were added.');
  if (action.type === 'IMPORT_STOCK') {
    const validation = validateStockPreview(preview, state);
    if (validation.errors.length) throw new Error(validation.errors.map(item => item.message).join(' '));
    state.ingredients.push(...validation.ingredients);
    const batches = validation.rows.map(row => ({ ...row, batch: `B-${preview.id}-${row.rowId}`, orderReserved: 0, planReservations: {}, importId: preview.id,
      detail: 'Imported arrival', symbol: '◉', color: 'neutral' }));
    if (batches.some(batch => state.inventory.some(existing => existing.batch === batch.batch))) throw new Error('System batch ID collision. Create a fresh preview.');
    state.inventory.push(...batches);
    state.mode = 'business';
    state.inventoryRevision += 1;
    state.imports.push({ id: preview.id, kind: 'stock', time: action.time, batchIds: batches.map(batch => batch.batch), source: preview.source });
    return { action: 'StockImported', payload: { batchIds: batches.map(batch => batch.batch), rows: structuredClone(validation.rows) } };
  }
  if (action.type === 'SAVE_RECIPE') {
    const validation = validateRecipePreview(preview, state);
    if (validation.errors.length) throw new Error(validation.errors.map(item => item.message).join(' '));
    state.ingredients.push(...validation.ingredients);
    const index = state.recipes.findIndex(recipe => recipe.id === validation.recipe.id);
    if (index < 0) { state.recipes.push(validation.recipe); state.caps[validation.recipe.id] = '0'; }
    else state.recipes[index] = validation.recipe;
    state.recipeRevision += 1;
    state.imports.push({ id: preview.id, kind: 'recipe', time: action.time, recipeId: validation.recipe.id, source: preview.source });
    return { action: 'RecipeSaved', payload: { recipe: structuredClone(validation.recipe) } };
  }
  throw new Error('Unknown data confirmation.');
}
