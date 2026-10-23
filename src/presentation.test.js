import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createInitialState, transition, currentPlan } from './workflow.js';
import { createStockPreview, updateStockPreviewRow } from './dataEntry.js';
import { DATA_VERSION } from './persistence.js';
import { prepareIngredientImage } from './ingredientImages.js';

test('rendered inventory and plan history use ingredient icons, business batch numbers and optional production dates', async () => {
  const server = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const previousWindow = globalThis.window;
  try {
    const {default: App} = await server.ssrLoadModule('/src/App.jsx');
    let state=createInitialState();
    const preview=createStockPreview({version:1,kind:'stock',rows:[
      {ingredientName:' Tomatoes ',quantity:'1000',unit:'g',supplierBatch:'DELIVERY-23',productionDate:'2026-10-23',expiryDate:'2026-10-23'},
      {ingredientName:'Eggs',quantity:'12',unit:'pcs',supplierBatch:'',productionDate:'',expiryDate:'2026-10-23'},
      {ingredientName:'Green peppers',quantity:'1',unit:'kg',supplierBatch:'',productionDate:'',expiryDate:'2026-10-23'},
    ]},state.ingredients,'IMP-render');
    state=transition(state,{type:'IMPORT_STOCK',preview,time:'2026-10-23T04:00:00.000Z'});
    state=transition(state,{type:'GENERATE',planId:'FP-render',today:'2026-10-23',time:'2026-10-23T04:01:00.000Z'});
    state=transition(state,{type:'APPROVE',planId:'FP-render',today:'2026-10-23',time:'2026-10-23T04:02:00.000Z'});
    state=transition(state,{type:'COMPLETE',planId:'FP-render',time:'2026-10-23T04:03:00.000Z'});
    const originalSnapshot=structuredClone(currentPlan(state).snapshot);
    globalThis.window={localStorage:{getItem:()=>JSON.stringify({version:DATA_VERSION,state})}};
    const html=renderToStaticMarkup(React.createElement(App));
    assert.ok((html.match(/🍅/g)??[]).length >= 2);
    assert.ok((html.match(/🥚/g)??[]).length >= 2);
    assert.ok((html.match(/🫑/g)??[]).length >= 2);
    assert.match(html,/<td class="batch">DELIVERY-23<span class="ingredient-detail">Production date: 2026-10-23<\/span><\/td>/);
    assert.match(html,/<td class="batch">Batch 013<\/td>/);
    assert.doesNotMatch(html,/Supplier|Produced:|Not provided|Ingredient IDs|Technical reference details/);
    assert.doesNotMatch(html,/>B-IMP-|\/ B-IMP-|>ING-IMP-/);
    assert.match(html,/Ingredients \(8\)/);
    assert.deepEqual(currentPlan(state).snapshot,originalSnapshot);
  } finally { globalThis.window=previousWindow; await server.close(); }
});

test('image pipeline limits file type/size and resizes to 128px without changing any stock', async () => {
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=','base64');
  await assert.rejects(prepareIngredientImage(new File(['x'],'bad.svg',{type:'image/svg+xml'})),/JPG or PNG/);
  await assert.rejects(prepareIngredientImage(new File([new Uint8Array(2097153)],'big.png',{type:'image/png'})),/2 MB/);
  await assert.rejects(prepareIngredientImage(new File(['fake'],'fake.png',{type:'image/png'})),/File content/);
  const previousBitmap=globalThis.createImageBitmap, previousDocument=globalThis.document;
  let closed=false, drawn=false;
  const canvas={getContext:()=>({fillRect(){},drawImage(){drawn=true;}}),toDataURL:()=> 'data:image/jpeg;base64,/9j/AAAA'};
  globalThis.createImageBitmap=async()=>({width:1024,height:512,close(){closed=true;}});
  globalThis.document={createElement:()=>canvas};
  try {
    assert.equal(await prepareIngredientImage(new File([png],'tiny.png',{type:'image/png'})),'data:image/jpeg;base64,/9j/AAAA');
    assert.equal(canvas.width,128);assert.equal(canvas.height,64);assert.ok(closed&&drawn);
    canvas.toDataURL=()=>{throw new Error('Canvas encoding failed');};closed=false;
    await assert.rejects(prepareIngredientImage(new File([png],'tiny.png',{type:'image/png'})),/encoding failed/);assert.ok(closed);
  } finally { globalThis.createImageBitmap=previousBitmap;globalThis.document=previousDocument; }
});

test('editable preview renders one duplicate alert and labelled native dates; resolved warnings disappear',async()=>{
  const server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const {default:StockImportPreview}=await server.ssrLoadModule('/src/StockImportPreview.jsx');
    const {default:ImportDateField}=await server.ssrLoadModule('/src/ImportDateField.jsx');
    const initial=createInitialState(), source={version:1,kind:'stock',rows:[{ingredientName:'Tomatoes',quantity:'1000',unit:'g',supplierBatch:'',productionDate:'',expiryDate:'2026-10-25'}]};
    const first=createStockPreview(source,initial.ingredients,'IMP-ui-first');
    const state=transition(initial,{type:'IMPORT_STOCK',preview:first,time:'2026-10-23T04:00:00.000Z'});
    let preview=createStockPreview(source,state.ingredients,'IMP-ui-second');
    const props={preview,state,blocked:false,IngredientMatch:()=>React.createElement('span',null,'Tomatoes · kg'),onChange(){},onConfirm(){},onCancel(){}};
    let html=renderToStaticMarkup(React.createElement(StockImportPreview,props));
    assert.equal((html.match(/Row 1: Confirm this is an additional delivery\./g)??[]).length,1);
    assert.doesNotMatch(html,/Possible duplicate|never merged/);assert.match(html,/Cancel Preview/);
    const dateInputs=html.match(/<input[^>]*type="date"[^>]*>/g)??[];
    assert.equal(dateInputs.length,2);assert.equal(dateInputs.filter(input=>input.includes('required=')).length,1);
    assert.ok(dateInputs.every(input=>!input.includes(' min=')&&!input.includes(' max=')));
    assert.match(html,/Production date \(optional\)/);assert.match(html,/>Expiry date<\/label>/);
    preview=updateStockPreviewRow(preview,'row-1',{confirmDuplicate:true});
    html=renderToStaticMarkup(React.createElement(StockImportPreview,{...props,preview}));
    assert.doesNotMatch(html,/Row 1: Confirm this is an additional delivery\./);assert.doesNotMatch(html,/entry-validation/);
    const uncertain={...first,rows:[{...first.rows[0],expiryDate:'03/04/2026'}]};
    html=renderToStaticMarkup(React.createElement(StockImportPreview,{...props,state:initial,preview:uncertain}));
    assert.equal((html.match(/Confirm the expiry date/g)??[]).length,1);assert.match(html,/Source: 03\/04\/2026/);
    html=renderToStaticMarkup(React.createElement(ImportDateField,{row:{id:'row-1',productionDate:''},field:'productionDate',prefix:'test',onChange(){}}));
    assert.doesNotMatch(html,/required|Source:/);
  }finally{await server.close();}
});
