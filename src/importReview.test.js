import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { normalizeImportDate, dateControlValue } from './importDates.js';
import { extractionReviewIssues, mergeReviewIssues } from './importReview.js';
import { createInitialState, transition, validateState } from './workflow.js';
import { createStockPreview, parseStockTable, updateStockPreviewRow, validateStockPreview, validateRecipePreview } from './dataEntry.js';
import { validateExtraction } from './extractionContract.js';
import { extractionToPreview } from './aiImport.js';
import { inspectInventory } from './planner.js';

const stock=(overrides={})=>({rows:[{ingredientName:'Tomatoes',quantity:'1000',unit:'g',supplierBatch:null,productionDate:null,expiryDate:'2026-10-25',shelfLifeValue:null,shelfLifeUnit:null,shelfLifeText:null,...overrides}],issues:[]});
const extraction=(overrides={})=>validateExtraction('stock',stock(overrides));
const preview=(state,overrides={},id='IMP-review')=>createStockPreview({version:1,kind:'stock',source:'manual-table',...stock(overrides)},state.ingredients,id);
const commit=(state,preview)=>transition(state,{type:'IMPORT_STOCK',preview,time:'2026-10-23T04:00:00.000Z'});

test('year-first date variants normalize strictly; ambiguous and impossible dates are never rolled forward',()=>{
  for(const value of ['2026-3-4','2026 3 4','2026/3/4',' 2026-03-04 ']) assert.equal(normalizeImportDate(value),'2026-03-04');
  assert.equal(normalizeImportDate('2024/2/29'),'2024-02-29');
  for(const value of ['03/04/2026','2026-02-30','2026/2/29','2026-13-1','2026-0-1']) {
    assert.equal(normalizeImportDate(value),value);assert.equal(dateControlValue(value),'');
  }
  assert.equal(normalizeImportDate(null),'');assert.equal(dateControlValue('2026 3 4'),'2026-03-04');
});

test('editable calendar dates do not shift across time zones',()=>{
  const moduleUrl=new URL('./importDates.js',import.meta.url).href;
  for(const TZ of ['Asia/Shanghai','America/Los_Angeles','Pacific/Kiritimati']) {
    const result=spawnSync(process.execPath,['--input-type=module','-e',`import {normalizeImportDate,dateControlValue} from '${moduleUrl}';console.log(normalizeImportDate('2026/3/4'),dateControlValue('2024-02-29'));`],{encoding:'utf8',env:{TZ}});
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'2026-03-04 2024-02-29');
  }
});

test('manual imports normalize dates, allow optional omissions and expired stock, and restore consistently',()=>{
  const state=createInitialState();
  const text='Ingredient\tQuantity\tUnit\tBatch\tProduction Date\tExpiry Date\nTomatoes\t1\tkg\t\t\t2026/3/4';
  const p=createStockPreview(parseStockTable(text),state.ingredients,'IMP-calendar');
  assert.equal(p.rows[0].expiryDate,'2026-03-04');assert.equal(validateStockPreview(p,state).errors.length,0);
  const next=commit(state,p);assert.equal(next.inventory.at(-1).productionDate,null);assert.equal(next.inventory.at(-1).supplierBatch,null);
  assert.equal(next.inventory.at(-1).deadline,'2026-03-04');validateState(next);
  const batch={...next.inventory.at(-1),reserved:0};assert.equal(inspectInventory([batch],'2026-10-23',next.ingredients)[0].eligible,false);
});

test('duplicate confirmation has one pending error and clears immediately without changing stock',()=>{
  const initial=createInitialState(), state=commit(initial,preview(initial,{},'IMP-first'));
  let p=preview(state,{},'IMP-second');const before=structuredClone(state);
  let check=validateStockPreview(p,state);
  assert.equal(check.errors.filter(item=>item.field==='duplicate').length,1);
  assert.equal(check.errors.find(item=>item.field==='duplicate').message,'Confirm this is an additional delivery.');
  p=updateStockPreviewRow(p,'row-1',{confirmDuplicate:true});check=validateStockPreview(p,state);
  assert.equal(check.errors.length,0);assert.deepEqual(state,before);
  assert.equal(validateStockPreview(updateStockPreviewRow(p,'row-1',{quantity:'1200'}),state).errors.length,0);
});

test('AI and program findings become one actionable field issue, resolved by selecting a date',()=>{
  const source=stock({expiryDate:'03/04/2026'});source.issues=['Row 1 expiry is ambiguous.','Please confirm the expiry date.'];
  const result=validateExtraction('stock',source);
  const issues=extractionReviewIssues(result);
  assert.equal(issues.filter(issue=>issue.field==='expiryDate').length,1);
  assert.equal(issues[0].message,'Confirm the expiry date for “03/04/2026”.');
  assert.equal(mergeReviewIssues([...issues,...issues]).length,1);
  const state=createInitialState();let p=extractionToPreview(result,state.ingredients,'IMP-ambiguous');
  assert.equal(validateStockPreview(p,state).errors.filter(issue=>issue.field==='expiryDate').length,1);
  p=updateStockPreviewRow(p,'row-1',{expiryDate:'2026-10-25'});
  assert.equal(validateStockPreview(p,state).errors.length,0);
  assert.equal(result.rows[0].expiryDate,'03/04/2026');assert.equal(result.originalIssues.length,2);
});

test('unknown unit and missing expiry remain separate actionable blockers; shelf life is not required',()=>{
  const state=createInitialState();let p=preview(state,{unit:'bag',expiryDate:null});
  const errors=validateStockPreview(p,state).errors;
  assert.equal(errors.filter(issue=>issue.field==='unit').length,1);assert.equal(errors.filter(issue=>issue.field==='expiryDate').length,1);
  assert.match(errors.find(issue=>issue.field==='unit').message,/Convert “bag”/);
  assert.throws(()=>commit(state,p),/expiry date/);
  p=updateStockPreviewRow(p,'row-1',{unit:'g',ingredientId:'tomatoes',expiryDate:'2026-10-25'});
  assert.equal(validateStockPreview(p,state).errors.length,0);
  const result=extraction({productionDate:'2026-10-23',expiryDate:'2026-10-25',shelfLifeValue:'unknown',shelfLifeUnit:'bag'});
  assert.equal(result.issues.length,0);assert.equal(result.calculations.length,0);
});

test('calculated expiry has an adjacent confirmation; overrides and production changes invalidate its basis safely',()=>{
  const state=createInitialState(),result=extraction({productionDate:'2026-10-23',expiryDate:null,shelfLifeValue:'3',shelfLifeUnit:'days',shelfLifeText:'3 days'});
  assert.equal(result.issues.length,0);assert.equal(result.calculations.length,1);
  let p=extractionToPreview(result,state.ingredients,'IMP-calc');
  assert.equal(validateStockPreview(p,state).errors[0].code,'calculated');
  assert.throws(()=>commit(state,p),/Confirm the calculated/);
  const approved=updateStockPreviewRow(p,'row-1',{confirmCalculatedExpiry:true});
  assert.equal(validateStockPreview(approved,state).errors.length,0);validateState(commit(state,approved));
  const changedProduction=updateStockPreviewRow(approved,'row-1',{productionDate:'2026-10-24'});
  assert.equal(changedProduction.rows[0].expiryDate,'');assert.equal(changedProduction.rows[0].expiryCalculation,undefined);
  p=updateStockPreviewRow(p,'row-1',{expiryDate:'2026-10-27'});
  assert.equal(p.rows[0].expiryCalculation,undefined);assert.equal(validateStockPreview(p,state).errors.length,0);
});

test('date normalization also works at AI and commit boundaries; preview edits/cancellation do not mutate persisted data',()=>{
  const result=validateExtraction('stock',stock({productionDate:'2026-3-4',expiryDate:'2026/3/5'}),{sourceText:'Tomatoes 1000 g produced 2026 3 4, expiry 2026/3/5'});
  assert.equal(result.rows[0].productionDate,'2026-03-04');assert.equal(result.rows[0].expiryDate,'2026-03-05');
  const state=createInitialState(),before=structuredClone(state);
  let p=extractionToPreview(result,state.ingredients,'IMP-discard');
  p=updateStockPreviewRow(p,'row-1',{productionDate:'',expiryDate:'2026-10-25'});
  validateStockPreview(p,state);p=null;
  assert.deepEqual(state,before);assert.equal(state.activity.length,0);
  const recipe={version:1,kind:'recipe',id:'RC-live',name:'Tomato bowl',servings:'',rows:[{id:'part-1',ingredientId:'tomatoes',quantity:'适量',unit:'g'}]};
  assert.ok(validateRecipePreview(recipe,state).errors.length);
  const corrected={...recipe,servings:'5',rows:[{...recipe.rows[0],quantity:'1000'}]};
  assert.equal(validateRecipePreview(corrected,state).errors.length,0);assert.deepEqual(state,before);
});
