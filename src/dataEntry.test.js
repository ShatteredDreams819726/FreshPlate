import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, transition, validateState, currentPlan, isDraftStale, planningDate } from './workflow.js';
import { EXTRACTION_VERSION, createStockPreview, parseStockTable, normalizeQuantity, validateStockPreview, validateRecipePreview, todayLocal } from './dataEntry.js';
import { DATA_VERSION, STORAGE_KEY, LEGACY_BACKUP_KEY, loadDemo, saveDemo } from './persistence.js';
import { generatePlan } from './planner.js';
import { batchLabel, ingredientIcon, exactCandidates, suggestedIngredients, ingredientReview, validIcon } from './ingredientPresentation.js';

const date = '2026-10-22', time = '2026-10-22T04:05:06.000Z';
const act = (state, type, extra = {}) => transition(state, { type, time, today: date, ...extra });
const stockPreview = (state, id = 'IMP-test', overrides = {}) => createStockPreview({ version: EXTRACTION_VERSION, kind: 'stock', source: 'manual-table', rows: [{ ingredientName: 'Tomatoes', quantity: '1500', unit: 'g', supplierBatch: '', productionDate: '', expiryDate: date, ...overrides }] }, state.ingredients, id);
const recipePreview = (state, ingredientId = 'tomatoes', id = 'RC-test') => ({ version: 1, kind: 'recipe', source: 'manual-form', id, name: 'Fresh tomato plate', servings: '5', rows: [{ id: 'part-1', ingredientId, ingredientName: '', quantity: '1000', unit: 'g' }] });
const store = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), map }; };
const unchanged = (state, callback, pattern) => { const before = structuredClone(state); assert.throws(() => callback(state), pattern); assert.deepEqual(state, before); };

test('g/kg conversion is explicit; pieces, missing quantities and unsupported units are rejected', () => {
  assert.equal(normalizeQuantity('1500', 'g', 'kg'), 1.5);
  assert.equal(normalizeQuantity('1.5', 'kg', 'kg'), 1.5);
  assert.equal(normalizeQuantity('12', 'pcs', 'pcs'), 12);
  for (const [quantity, unit, target] of [['1','box','kg'], ['1','kg','pcs'], ['2','pcs','kg'], ['', 'g','kg'], ['适量','g','kg'], ['1.5','pcs','pcs']]) assert.throws(() => normalizeQuantity(quantity,unit,target));
});

test('manual extraction and editable preview preserve unknown source fields and require a real expiry date', () => {
  const state = createInitialState();
  const table = 'Ingredient\tQuantity\tUnit\tSupplier Batch\tProduction Date\tExpiry Date\nTomatoes\t1500\tg\t\t\t2026-10-22';
  const preview = createStockPreview(parseStockTable(table),state.ingredients,'IMP-parse');
  assert.equal(preview.rows[0].supplierBatch, '');
  const check = validateStockPreview(preview,state);
  assert.equal(check.errors.length,0);
  assert.equal(check.rows[0].supplierBatch,null); assert.equal(check.rows[0].productionDate,null);
  for (const expiryDate of ['', '2026-02-30']) {
    const bad = stockPreview(state,'IMP-bad',{expiryDate});
    assert.match(validateStockPreview(bad,state).errors[0].message,/expiry date/i);
    unchanged(state,s=>act(s,'IMPORT_STOCK',{preview:bad}),/expiry date/i);
  }
});

test('confirmation appends atomically and import tokens prevent double clicks or refresh duplicates', () => {
  const state=createInitialState(), preview=stockPreview(state);
  const next=act(state,'IMPORT_STOCK',{preview});
  assert.deepEqual(next.inventory.slice(0,state.inventory.length),state.inventory);
  const batch=next.inventory.at(-1);
  assert.equal(batch.stock,1.5);assert.equal(batch.orderReserved,0);assert.deepEqual(batch.planReservations,{});
  assert.equal(batch.supplierBatch,null);assert.equal(batch.productionDate,null);assert.notEqual(batch.batch,batch.supplierBatch);
  const storage=store();saveDemo(storage,next,null);const restored=loadDemo(storage).state;
  unchanged(restored,s=>act(s,'IMPORT_STOCK',{preview}),/already applied/);
  assert.equal(restored.imports.length,1);assert.equal(restored.activity.length,1);
  const bad=stockPreview(state,'IMP-partial');bad.rows.push({...bad.rows[0],id:'row-2',expiryDate:''});
  unchanged(state,s=>act(s,'IMPORT_STOCK',{preview:bad}),/expiry date/i);
  validateState(next);
});

test('suspected duplicates need explicit row confirmation and remain separate arrivals', () => {
  const first=act(createInitialState(),'IMPORT_STOCK',{preview:stockPreview(createInitialState(),'IMP-first')});
  const second=stockPreview(first,'IMP-second');
  assert.ok(validateStockPreview(second,first).warnings.length);
  unchanged(first,s=>act(s,'IMPORT_STOCK',{preview:second}),/additional delivery/);
  second.rows[0].confirmDuplicate=true;
  const next=act(first,'IMPORT_STOCK',{preview:second});
  assert.equal(next.inventory.length,first.inventory.length+1);
  assert.notEqual(next.inventory.at(-1).batch,next.inventory.at(-2).batch);
  validateState(next);
});

test('supplier batch duplicates with conflicting dates and repeated preview rows require review', () => {
  const initial=createInitialState();
  const first=act(initial,'IMPORT_STOCK',{preview:stockPreview(initial,'IMP-vendor',{supplierBatch:'SUP-1'})});
  const conflict=stockPreview(first,'IMP-conflict',{supplierBatch:'SUP-1',expiryDate:'2026-10-24'});
  assert.ok(validateStockPreview(conflict,first).warnings.length);
  unchanged(first,s=>act(s,'IMPORT_STOCK',{preview:conflict}),/additional delivery/);
  const repeated=stockPreview(initial,'IMP-two');repeated.rows.push({...repeated.rows[0],id:'row-2'});
  assert.equal(validateStockPreview(repeated,initial).warnings.length,2);
  repeated.rows.forEach(row=>{row.confirmDuplicate=true;});
  const confirmed=act(initial,'IMPORT_STOCK',{preview:repeated});
  assert.equal(confirmed.inventory.length,initial.inventory.length+2);validateState(confirmed);
});

test('recipe confirmation normalizes batch yield and blocks approximate or incompatible inputs', () => {
  const state=createInitialState(), preview=recipePreview(state);
  assert.equal(validateRecipePreview(preview,state).recipe.ingredients[0].quantity,0.2);
  const next=act(state,'SAVE_RECIPE',{preview});
  assert.equal(next.recipes.at(-1).ingredients[0].ingredientId,'tomatoes');
  assert.equal(next.caps[next.recipes.at(-1).id],'0');
  unchanged(next,s=>act(s,'SAVE_RECIPE',{preview}),/already applied/);
  for(const quantity of ['', 'to taste','适量']) {
    const bad=structuredClone(preview);bad.rows[0].quantity=quantity;
    unchanged(state,s=>act(s,'SAVE_RECIPE',{preview:bad}),/quantity/i);
  }
  const fractional=recipePreview(state,'eggs');fractional.rows[0].quantity='3';fractional.rows[0].unit='pcs';fractional.servings='2';
  assert.match(validateRecipePreview(fractional,state).errors[0].message,/whole grams or whole pieces/);
  validateState(next);
});

test('new ingredient IDs and recipes participate in the same planner without name matching', () => {
  let state=createInitialState();const arrival=stockPreview(state,'IMP-tofu',{ingredientName:'Tofu',quantity:'1000',unit:'g'});
  arrival.rows[0].createIngredient=true;
  state=act(state,'IMPORT_STOCK',{preview:arrival});
  const ingredient=state.ingredients.at(-1);
  assert.equal(ingredient.name,'Tofu');assert.equal(ingredient.unit,'kg');
  const recipe=recipePreview(state,ingredient.id,'RC-tofu');recipe.name='Tofu stir-fry';
  state=act(state,'SAVE_RECIPE',{preview:recipe});const recipeId=state.recipes.at(-1).id;
  state=transition(state,{type:'SET_CAP',recipeId,value:'5'});
  state=act(state,'GENERATE',{planId:'FP-custom'});
  assert.equal(currentPlan(state).snapshot.result.dishes.find(dish=>dish.id===recipeId).portions,5);
  const renamedCatalog=state.ingredients.map(item=>item.id===ingredient.id?{...item,name:'Different display label'}:item);
  const batch=state.inventory.at(-1);
  const result=generatePlan([{...batch,ingredient:'Another label',reserved:0}],{[recipeId]:5},date,{ingredients:renamedCatalog,recipes:[state.recipes.at(-1)]});
  assert.equal(result.totalPortions,5);
  state=act(state,'APPROVE',{planId:'FP-custom'});state=act(state,'COMPLETE',{planId:'FP-custom'});
  validateState(state);const storage=store();saveDemo(storage,state,null);assert.deepEqual(loadDemo(storage).state,state);
});

test('a recipe can explicitly create an ingredient before stock arrives, and expiry never gets inferred', () => {
  let state=createInitialState();const preview=recipePreview(state,'','RC-mushroom');
  preview.name='Mushroom side';preview.rows[0].ingredientName='Mushrooms';preview.rows[0].createIngredient=true;
  state=act(state,'SAVE_RECIPE',{preview});
  const definition=state.ingredients.at(-1);assert.equal(definition.name,'Mushrooms');
  const arrival=stockPreview(state,'IMP-mushroom',{ingredientName:'Mushrooms',expiryDate:''});
  assert.equal(arrival.rows[0].ingredientId,definition.id);
  unchanged(state,s=>act(s,'IMPORT_STOCK',{preview:arrival}),/expiry date/i);
  arrival.rows[0].expiryDate=date;
  state=act(state,'IMPORT_STOCK',{preview:arrival});validateState(state);
});

test('data and recipe modifications stale drafts; Approved plans block commits but allow previews', () => {
  const draft=act(createInitialState(),'GENERATE',{planId:'FP-old'});
  for(const [type,preview] of [['IMPORT_STOCK',stockPreview(draft)],['SAVE_RECIPE',recipePreview(draft)]]) {
    const changed=act(draft,type,{preview});assert.ok(isDraftStale(changed,currentPlan(changed)));
    unchanged(changed,s=>act(s,'APPROVE',{planId:'FP-old'}),/Needs regeneration/);
  }
  const approved=act(draft,'APPROVE',{planId:'FP-old'});
  const snapshot=structuredClone(currentPlan(approved).snapshot);
  assert.equal(validateStockPreview(stockPreview(approved),approved).errors.length,0);
  for(const [type,preview] of [['IMPORT_STOCK',stockPreview(approved)],['SAVE_RECIPE',recipePreview(approved)]]) unchanged(approved,s=>act(s,type,{preview}),/Complete or cancel/);
  unchanged(approved,s=>act(s,'SET_MODE',{mode:'business'}),/Complete or cancel/);
  assert.deepEqual(currentPlan(approved).snapshot,snapshot);
  const completed=act(approved,'COMPLETE',{planId:'FP-old'});
  const edited=recipePreview(completed);edited.recipeId=completed.recipes[0].id;edited.name=completed.recipes[0].name;
  const next=act(completed,'SAVE_RECIPE',{preview:edited});assert.deepEqual(currentPlan(next).snapshot,snapshot);validateState(next);
});

test('Business dates include today/+2, exclude expired stock and invalidate yesterday drafts', () => {
  let state=createInitialState();state=act(state,'SET_MODE',{mode:'business'});
  assert.equal(planningDate(state,date),date);
  state=act(state,'GENERATE',{planId:'FP-business'});
  assert.equal(currentPlan(state).snapshot.result.demoDate,date);
  assert.equal(currentPlan(state).snapshot.result.projections.find(batch=>batch.batch==='TOM-1020-A').plannedUse,0);
  assert.ok(isDraftStale(state,currentPlan(state),'2026-10-23'));
  unchanged(state,s=>transition(s,{type:'APPROVE',planId:'FP-business',time,today:'2026-10-23'}),/Needs regeneration/);
  assert.match(todayLocal(new Date(2026,9,22)),/^2026-10-22$/);
});

function legacyFixture(state) {
  const old=structuredClone(state);
  for(const field of ['ingredients','recipes','mode','recipeRevision','imports']) delete old[field];
  const strip=row=>{delete row.ingredientId;};old.inventory.forEach(strip);
  for(const plan of old.plans) {
    for(const field of ['ingredients','mode','recipeRevision']) delete plan.snapshot[field];
    plan.snapshot.recipes.forEach(recipe=>recipe.ingredients.forEach(strip));
    plan.snapshot.result.dishes.forEach(dish=>dish.allocations.forEach(strip));
    plan.snapshot.result.projections.forEach(strip);plan.snapshot.result.leftovers.forEach(strip);
  }
  old.activity.forEach(event=>event.changes.forEach(strip));return old;
}

test('v1 migration preserves all statuses, quantities and history, backs up data and keeps Approved plans executable', () => {
  const draft=act(createInitialState(),'GENERATE',{planId:'FP-migrate'}), approved=act(draft,'APPROVE',{planId:'FP-migrate'});
  for(const state of [createInitialState(),draft,approved,act(approved,'COMPLETE',{planId:'FP-migrate'}),act(approved,'CANCEL',{planId:'FP-migrate'})]) {
    const old=legacyFixture(state), raw=JSON.stringify({version:1,state:old}), storage=store();storage.setItem(STORAGE_KEY,raw);
    const restored=loadDemo(storage);
    assert.match(restored.notice,/upgraded/);assert.equal(storage.getItem(LEGACY_BACKUP_KEY),raw);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version,DATA_VERSION);
    assert.deepEqual(restored.state,state);assert.deepEqual(loadDemo(storage).state,state);
    if(currentPlan(state)?.status==='Approved') validateState(act(restored.state,'COMPLETE',{planId:'FP-migrate'}));
  }
});

test('invalid legacy data and migration-save failures never replace saved inventory with initial data', () => {
  const original=legacyFixture(createInitialState());original.inventory[0].stock-=1;
  const storage=store(), raw=JSON.stringify({version:1,state:original});storage.setItem(STORAGE_KEY,raw);
  assert.throws(()=>loadDemo(storage),/left untouched/);assert.equal(storage.getItem(STORAGE_KEY),raw);
  const valid=JSON.stringify({version:1,state:legacyFixture(createInitialState())});storage.setItem(STORAGE_KEY,valid);
  const blocked={getItem:storage.getItem,setItem:()=>{throw new Error('quota');}};
  assert.throws(()=>loadDemo(blocked),/left untouched/);assert.equal(storage.getItem(STORAGE_KEY),valid);
});

test('matching ignores outer whitespace and case, requires dimension, and never picks the first of multiple candidates', () => {
  const state = createInitialState();
  for (const [name, unit, expected] of [[' tomatoes ', 'g', 'tomatoes'], ['EGGS', 'pcs', 'eggs'], [' Green PEPPERS ', 'kg', 'green-peppers'], ['Tomatoes', 'pcs', ''], ['Cabbage', 'kg', ''], ['番茄', 'g', '']]) {
    assert.equal(stockPreview(state, 'IMP-match', { ingredientName: name, unit }).rows[0].ingredientId, expected);
  }
  const catalog = [...state.ingredients, { id: 'another-tomato', name: 'TOMATOES', unit: 'kg' }];
  assert.equal(exactCandidates('tomatoes', 'g', catalog).length, 2);
  assert.equal(createStockPreview({version:1,kind:'stock',rows:[{ingredientName:'tomatoes',unit:'g'}]}, catalog,'IMP-many').rows[0].ingredientId, '');
  assert.equal(suggestedIngredients('Cabbage', 'kg', state.ingredients)[0].id, 'cabbage');
  assert.equal(suggestedIngredients('番茄', 'g', state.ingredients)[0].id, 'tomatoes');
});

test('same name with a different dimension stays separate and survives restore', () => {
  let state = createInitialState();
  const preview = stockPreview(state, 'IMP-count', {ingredientName:'Tomatoes',quantity:'4',unit:'pcs'});
  preview.rows[0].createIngredient = true;
  state = act(state, 'IMPORT_STOCK', {preview});
  assert.notEqual(state.inventory.at(-1).ingredientId, 'tomatoes');
  assert.equal(state.ingredients.at(-1).unit, 'pcs');
  assert.equal(stockPreview(state,'IMP-kg',{ingredientName:'tomatoes',unit:'g'}).rows[0].ingredientId,'tomatoes');
  assert.equal(stockPreview(state,'IMP-pcs',{ingredientName:'tomatoes',unit:'pcs'}).rows[0].ingredientId,state.ingredients.at(-1).id);
  const storage=store(); saveDemo(storage,state,null); assert.deepEqual(loadDemo(storage).state,state);
});

test('ingredient icons are shared across arrivals; icon-only changes preserve Approved snapshots, quantities and restore', () => {
  let state = act(createInitialState(), 'GENERATE', {planId:'FP-icon'});
  state = act(state, 'APPROVE', {planId:'FP-icon'});
  const before=structuredClone(state), image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=';
  state=act(state,'SET_INGREDIENT_ICON',{ingredientId:'tomatoes',image});
  assert.deepEqual(state.inventory,before.inventory);assert.deepEqual(state.plans,before.plans);assert.deepEqual(state.activity,before.activity);
  assert.equal(ingredientIcon(state,'tomatoes').image,image);
  const storage=store();saveDemo(storage,state,null);state=loadDemo(storage).state;
  assert.equal(ingredientIcon(state,'tomatoes').image,image);
  state=act(state,'COMPLETE',{planId:'FP-icon'});
  state=act(state,'IMPORT_STOCK',{preview:stockPreview(state,'IMP-icon')});
  assert.equal(ingredientIcon(state,state.inventory.at(-1).ingredientId).image,image);
  assert.equal(ingredientIcon(createInitialState(),'tomatoes').symbol,'🍅');
  assert.equal(ingredientIcon(state,'a-new-ingredient').symbol,'🥣');
  const previous=structuredClone(state.inventory);
  state=act(state,'SET_INGREDIENT_ICON',{ingredientId:'tomatoes',image:null});
  assert.equal(ingredientIcon(state,'tomatoes').image,null);assert.deepEqual(state.inventory,previous);validateState(state);
});

test('invalid images and quota failures leave the saved inventory and previous image untouched', () => {
  const state=createInitialState(), storage=store(), raw=saveDemo(storage,state,null);
  for (const image of ['https://example.test/icon.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,AAAA',`data:image/jpeg;base64,/9j/${'A'.repeat(40000)}`]) {
    assert.equal(validIcon(image),false);
    unchanged(state,s=>act(s,'SET_INGREDIENT_ICON',{ingredientId:'tomatoes',image}),/Invalid ingredient image/);
  }
  const changed=act(state,'SET_INGREDIENT_ICON',{ingredientId:'tomatoes',image:'data:image/jpeg;base64,/9j/AAAA'});
  assert.throws(()=>saveDemo({getItem:storage.getItem,setItem:()=>{throw new Error('quota');}},changed,raw),/Cannot save/);
  assert.equal(storage.getItem(STORAGE_KEY),raw);assert.deepEqual(loadDemo(storage).state,state);
});

test('batch labels preserve old supplierBatch data, hide internal IDs, and are stable across append and restore', () => {
  let state=createInitialState();
  state=act(state,'IMPORT_STOCK',{preview:stockPreview(state,'IMP-labelled',{supplierBatch:'BUSINESS-42'})});
  const withNumber=state.inventory.at(-1);assert.equal(batchLabel(withNumber,state.inventory),'BUSINESS-42');
  state=act(state,'IMPORT_STOCK',{preview:stockPreview(state,'IMP-blank')});
  const withoutNumber=state.inventory.at(-1), label=batchLabel(withoutNumber,state.inventory);
  assert.match(label,/^Batch \d{3}$/);assert.ok(!label.includes('IMP'));
  const duplicate=stockPreview(state,'IMP-same-number',{supplierBatch:'BUSINESS-42'});duplicate.rows[0].confirmDuplicate=true;
  state=act(state,'IMPORT_STOCK',{preview:duplicate});assert.notEqual(state.inventory.at(-1).batch,withNumber.batch);
  assert.equal(batchLabel(withoutNumber.batch,state.inventory),label);
  const storage=store();saveDemo(storage,state,null);const restored=loadDemo(storage).state;
  assert.equal(batchLabel(withoutNumber.batch,restored.inventory),label);assert.equal(restored.inventory.find(item=>item.batch===withNumber.batch).supplierBatch,'BUSINESS-42');
  const legacy=parseStockTable('Ingredient\tQuantity\tUnit\tSupplier Batch\tProduction Date\tExpiry Date\nTomatoes\t1\tkg\tOLD-42\t\t2026-10-22');
  assert.equal(legacy.rows[0].supplierBatch,'OLD-42');
});

test('similar-name review reports existing references without merging or modifying IDs', () => {
  let state=createInitialState();const preview=stockPreview(state,'IMP-cabbage',{ingredientName:'Cabbage'});
  preview.rows[0].createIngredient=true;state=act(state,'IMPORT_STOCK',{preview});
  const before=structuredClone(state), reviews=ingredientReview(state);
  const pair=reviews.find(review=>review.candidates.some(item=>item.name==='Chinese cabbage')&&review.candidates.some(item=>item.name==='Cabbage'));
  assert.ok(pair);assert.equal(pair.candidates.find(item=>item.name==='Cabbage').batches,1);
  assert.ok(pair.candidates.find(item=>item.name==='Chinese cabbage').recipes>0);
  assert.deepEqual(state,before);validateState(state);
});
