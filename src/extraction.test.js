import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtractHandler, createLimiter } from '../server/extract.js';
import { validateExtraction, calculateExpiry, validateExtractRequest, EXTRACT_LIMITS, extractionSchema, providerExtractionSchema } from './extractionContract.js';
import { extractionToPreview, requestExtraction, readExtractionImage } from './aiImport.js';
import { validateStockPreview, validateRecipePreview } from './dataEntry.js';
import { createInitialState, transition, validateState } from './workflow.js';
import { createDevServer } from '../dev/server.js';

const env={GEMINI_API_KEY:'TEST_ONLY_NOT_A_REAL_KEY',GEMINI_MODEL:'gemini-3.5-flash-lite'};
const row=overrides=>({ingredientName:'Tomatoes',quantity:'1000',unit:'g',supplierBatch:null,productionDate:null,expiryDate:'2026-10-23',shelfLifeValue:null,shelfLifeUnit:null,shelfLifeText:null,...overrides});
const stock=overrides=>({rows:[row(overrides)],issues:[]});
const provider=value=>new Response(JSON.stringify({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(value)}]}]}),{status:200});
const invoke=async(handler,body={kind:'stock',text:'Tomatoes 1000 g expires 2026-10-23'},extra={})=>{
  const request={method:'POST',headers:{host:'localhost:5173',origin:'http://localhost:5173','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'},body,...extra};
  let result;const headers={};
  await handler(request,{setHeader:(key,value)=>{headers[key]=value;},set statusCode(value){this.status=value;},end(value){result={status:this.status,headers,body:JSON.parse(value)};}});
  return result;
};
const handler=(fetchImpl,extra={})=>createExtractHandler({env,fetchImpl,onDiagnostic:()=>{},...extra});

test('server uses structured output, fixed Google endpoint and header credentials without returning secrets',async()=>{
  let outbound;
  const response=await invoke(handler(async(url,options)=>{outbound={url,...options};return provider(stock());}));
  assert.equal(response.status,200);assert.equal(outbound.url,'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(outbound.headers['x-goog-api-key'],env.GEMINI_API_KEY);
  const sent=JSON.parse(outbound.body);assert.equal(sent.model,env.GEMINI_MODEL);assert.equal(sent.store,false);
  assert.equal(sent.response_format.mime_type,'application/json');assert.equal(sent.response_format.schema.additionalProperties,false);
  assert.equal(sent.response_format.schema.properties.rows.maxItems,undefined);
  assert.equal(sent.generation_config.max_output_tokens,8192);assert.match(sent.system_instruction,/untrusted DATA/);
  assert.equal(response.body.extraction.rows[0].supplierBatch,null);
  assert.ok(!JSON.stringify(response).includes(env.GEMINI_API_KEY));assert.equal(response.headers['Cache-Control'],'no-store');
});

test('missing fields, ambiguous dates and unknown package units remain blocked in the existing editable preview',async()=>{
  const response=await invoke(handler(async()=>provider(stock({quantity:'一袋',unit:'bag',productionDate:'03/04/2026',expiryDate:null}))),{kind:'stock',text:'Tomatoes 一袋, production date 03/04/2026; expiry missing.'});
  assert.equal(response.status,200);
  const extraction=response.body.extraction, state=createInitialState(), before=structuredClone(state);
  assert.equal(extraction.rows[0].quantity,'一袋');assert.equal(extraction.rows[0].expiryDate,null);
  assert.ok(extraction.issues.some(issue=>issue.includes('Confirm the production date')));
  const preview=extractionToPreview(extraction,state.ingredients,'IMP-ai-missing');
  assert.ok(validateStockPreview(preview,state).errors.length);assert.deepEqual(state,before);
  const missing=validateExtraction('stock',stock({quantity:'1',unit:'kg',expiryDate:null}));
  assert.ok(validateStockPreview(extractionToPreview(missing,state.ingredients,'IMP-ai-expiry'),state).errors.some(issue=>issue.message.includes('expiry date')));
});

test('text dates guessed from ambiguous source are restored as source text and cannot be confirmed without correction',async()=>{
  const response=await invoke(handler(async()=>provider(stock({expiryDate:'2026-03-04'}))),{kind:'stock',text:'Tomatoes 1000 g expires 03/04/2026'});
  assert.equal(response.body.extraction.rows[0].expiryDate,'03/04/2026');
  assert.ok(response.body.extraction.issues.some(issue=>issue.includes('Confirm the expiry date')));
  const preview=extractionToPreview(response.body.extraction,createInitialState().ingredients,'IMP-date');
  assert.ok(validateStockPreview(preview,createInitialState()).errors.length);
});

test('expiry is computed by calendar code only from explicit production and shelf-life evidence',()=>{
  assert.equal(calculateExpiry('2026-10-23','3','days').expiryDate,'2026-10-26');
  assert.equal(calculateExpiry('2026-01-31','1','months').expiryDate,'2026-02-28');
  const input=stock({productionDate:'2026-10-23',expiryDate:null,shelfLifeValue:'3',shelfLifeUnit:'天',shelfLifeText:'保质期3天'});
  const result=validateExtraction('stock',input,{sourceText:'生产日期2026-10-23，保质期3天'});
  assert.equal(result.rows[0].expiryDate,'2026-10-26');assert.match(result.calculations[0].basis,/production day = day 0/);
  assert.equal(validateExtraction('stock',input,{sourceText:'no shelf life provided'}).rows[0].expiryDate,null);
  assert.equal(validateExtraction('stock',stock({productionDate:null,expiryDate:null})).rows[0].expiryDate,null);
  assert.equal(validateExtraction('stock',stock({expiryDate:'03/04/2026',productionDate:'2026-01-01',shelfLifeValue:'3',shelfLifeUnit:'days',shelfLifeText:'3 days'})).rows[0].expiryDate,'03/04/2026');
  assert.equal(validateExtraction('stock',stock({expiryDate:'2026-10-30'}),{sourceText:'Tomatoes 1000 g; expiry not supplied.'}).rows[0].expiryDate,null);
  assert.equal(validateExtraction('stock',{...input,rows:[{...input.rows[0],shelfLifeValue:'30'}]},{sourceText:'生产日期2026-10-23，保质期3天'}).rows[0].expiryDate,null);
});

test('recipe extraction preserves missing yield, to-taste and unknown units until users explicitly correct and match them',()=>{
  const state=createInitialState(), before=structuredClone(state);
  const result=validateExtraction('recipe',{name:'Tofu bowl',servings:null,rows:[{ingredientName:'Tofu',quantity:'适量',unit:'一袋'}],issues:[]});
  const preview=extractionToPreview(result,state.ingredients,'RC-ai');
  assert.equal(preview.servings,'');assert.equal(preview.rows[0].ingredientId,'');
  assert.ok(validateRecipePreview(preview,state).errors.some(issue=>issue.message.includes('yield')));assert.deepEqual(state,before);
  const known=extractionToPreview(validateExtraction('recipe',{name:'Tomato plate',servings:'5',rows:[{ingredientName:'Tomatoes',quantity:'1000',unit:'g'}],issues:[]}),state.ingredients,'RC-known');
  assert.equal(known.rows[0].ingredientId,'');
  known.rows[0].ingredientId='tomatoes';assert.equal(validateRecipePreview(known,state).errors.length,0);
});

test('successful extraction does not change inventory, logs or recipes; only existing confirmation writes',async()=>{
  const state=createInitialState(),before=structuredClone(state);
  const response=await invoke(handler(async()=>provider(stock())));
  const preview=extractionToPreview(response.body.extraction,state.ingredients,'IMP-not-saved');
  assert.deepEqual(state,before);assert.equal(state.activity.length,0);
  const saved=transition(state,{type:'IMPORT_STOCK',preview,time:'2026-10-23T04:00:00.000Z'});
  assert.equal(saved.inventory.length,state.inventory.length+1);validateState(saved);
  assert.throws(()=>transition(saved,{type:'IMPORT_STOCK',preview,time:'2026-10-23T04:00:01.000Z'}),/already applied/);
});

test('server rejects malformed JSON/schema, field lengths, excessive rows and unfinished responses safely',async()=>{
  for(const value of [{...stock(),rows:[row({quantity:10})]}, {...stock(),extra:'html'}, {rows:Array.from({length:31},()=>row()),issues:[]},stock({ingredientName:'x'.repeat(121)})]) {
    assert.equal((await invoke(handler(async()=>provider(value)))).status,502);
  }
  for(const payload of ['invalid JSON',JSON.stringify({status:'incomplete',steps:[]}),JSON.stringify({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:'<html>not JSON</html>'}]}]})]) {
    assert.equal((await invoke(handler(async()=>new Response(payload)))).status,502);
  }
  assert.equal((await invoke(handler(async()=>provider(stock())),'{bad')).status,400);
});

test('429, missing configuration, model/access failures and network exceptions never leak provider details',async()=>{
  for(const [status,expected,code] of [[429,429,'QUOTA'],[401,503,'KEY_ACCESS'],[403,503,'KEY_ACCESS'],[404,503,'MODEL_NOT_FOUND'],[400,502,'REQUEST_REJECTED'],[503,502,'PROVIDER_ERROR']]) {
    const response=await invoke(handler(async()=>new Response(`secret ${env.GEMINI_API_KEY}`,{status})));
    assert.equal(response.status,expected);assert.equal(response.body.error.code,code);assert.ok(!JSON.stringify(response).includes(env.GEMINI_API_KEY));
  }
  assert.equal((await invoke(handler(()=>assert.fail('must not call Gemini'),{env:{}}))).body.error.code,'NOT_CONFIGURED');
  const failure=await invoke(handler(async()=>{throw new Error(env.GEMINI_API_KEY);}));
  assert.equal(failure.body.error.code,'NETWORK');assert.ok(!JSON.stringify(failure).includes(env.GEMINI_API_KEY));
});

test('provider schema avoids the live rejected array-bound combination while local schema retains strict limits',()=>{
  for(const kind of ['stock','recipe']) {
    const provider=providerExtractionSchema(kind), local=extractionSchema(kind);
    assert.equal(local.properties.rows.maxItems,30);assert.equal(local.properties.issues.maxItems,30);
    assert.equal(provider.properties.rows.maxItems,undefined);assert.equal(provider.properties.issues.maxItems,undefined);
    assert.deepEqual(provider.properties.rows.items,local.properties.rows.items);
    assert.equal(provider.properties.rows.minItems,1);
    assert.equal(provider.additionalProperties,false);
    assert.equal(extractionSchema(kind).properties.rows.maxItems,30);
  }
});

test('server-only diagnostics distinguish upstream 400/404 and redact keys, URLs, headers and request data',async()=>{
  for(const upstreamStatus of [400,404]) {
    const reports=[];
    const response=await invoke(handler(async()=>new Response(JSON.stringify({error:{code:upstreamStatus===400?'invalid_request':404,status:upstreamStatus===400?'INVALID_ARGUMENT':'NOT_FOUND',message:`Invalid schema. ${env.GEMINI_API_KEY} https://example.test/?key=hidden request: {"headers":{"x-goog-api-key":"other-secret"},"input":"private text"}`}}),{status:upstreamStatus}),{onDiagnostic:entry=>reports.push(entry)}));
    assert.equal(reports[0].source,'gemini');assert.equal(reports[0].httpStatus,upstreamStatus);
    assert.ok(reports[0].message.includes('Invalid schema'));
    assert.doesNotMatch(JSON.stringify(reports),/TEST_ONLY_NOT_A_REAL_KEY|other-secret|private text|https:\/\//);
    assert.equal(response.body.error.code,upstreamStatus===400?'REQUEST_REJECTED':'MODEL_NOT_FOUND');
    assert.ok(!JSON.stringify(response.body).includes('Invalid schema.'));
    assert.equal(response.status,upstreamStatus===400?502:503);
  }
});

test('server and client timeout once without automatic retries',async()=>{
  let calls=0;
  const aborting=async(_url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));};
  const server=await invoke(handler(aborting,{timeoutMs:5}));assert.equal(server.status,504);assert.equal(calls,1);
  await assert.rejects(requestExtraction({kind:'stock',text:'Tomatoes 1 kg'},{fetchImpl:aborting,timeoutMs:5}),/timed out/);assert.equal(calls,2);
});

test('client handles 429, HTML/invalid JSON and safe server errors without displaying raw provider content',async()=>{
  const input={kind:'stock',text:'Tomatoes 1 kg'};
  await assert.rejects(requestExtraction(input,{fetchImpl:async()=>new Response('do not show',{status:429})}),/quota/);
  await assert.rejects(requestExtraction(input,{fetchImpl:async()=>new Response('<html>Vite fallback</html>')}),/dev:full/);
  await assert.rejects(requestExtraction(input,{fetchImpl:async()=>new Response(JSON.stringify({error:{code:'KEY_ACCESS',message:env.GEMINI_API_KEY}}),{status:503})}),error=>!error.message.includes(env.GEMINI_API_KEY)&&/credentials/.test(error.message));
  const response=validateExtraction('stock',stock());
  assert.deepEqual(await requestExtraction(input,{fetchImpl:async()=>new Response(JSON.stringify({extraction:response}))}),response);
});

test('same-origin/method/size checks and warm-instance limits guard the public endpoint',async()=>{
  let calls=0;const endpoint=handler(async()=>{calls++;return provider(stock());});
  assert.equal((await invoke(endpoint,undefined,{method:'GET'})).status,405);
  assert.equal((await invoke(endpoint,undefined,{headers:{host:'freshplate.test',origin:'https://other.test','content-type':'application/json'}})).status,403);
  assert.equal((await invoke(endpoint,{kind:'stock',text:'x'.repeat(EXTRACT_LIMITS.text+1)})).status,400);
  assert.equal((await invoke(endpoint,undefined,{headers:{host:'localhost:5173',origin:'http://localhost:5173','content-type':'application/json','content-length':String(EXTRACT_LIMITS.requestBytes+1)}})).status,413);
  assert.equal(calls,0);
  let time=0;const limiter=createLimiter(()=>time);
  for(let index=0;index<5;index++){assert.equal(limiter.acquire('same-ip'),true);limiter.release();}
  assert.equal(limiter.acquire('same-ip'),false);time=600001;assert.equal(limiter.acquire('same-ip'),true);limiter.release();
  assert.equal(limiter.acquire('one'),true);assert.equal(limiter.acquire('two'),true);assert.equal(limiter.acquire('three'),false);limiter.release();limiter.release();
  const global=createLimiter(()=>0);for(let index=0;index<30;index++){assert.equal(global.acquire(`ip-${index}`),true);global.release();}assert.equal(global.acquire('ip-31'),false);
});

test('JPG/PNG are checked on both sides, including decoded size, signature and single-source restriction',async()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=','base64');
  const image=await readExtractionImage(new File([png],'source.png',{type:'image/png'}));
  validateExtractRequest({kind:'stock',text:'',image});
  assert.throws(()=>validateExtractRequest({kind:'stock',text:'also text',image}));
  assert.throws(()=>validateExtractRequest({kind:'stock',text:'',image:{mimeType:'image/png',data:'AAAA'}}));
  await assert.rejects(readExtractionImage(new File(['fake'],'source.png',{type:'image/png'})),/content/);
  await assert.rejects(readExtractionImage(new File([new Uint8Array(EXTRACT_LIMITS.imageBytes+1)],'source.png',{type:'image/png'})),/2 MB/);
  const response=await invoke(handler(async()=>provider(stock())),{kind:'stock',text:'',image});assert.equal(response.status,200);
});

test('full local server serves frontend and the exact API handler over real HTTP with a mocked provider',async()=>{
  const app=await createDevServer({port:0,env,fetchImpl:async()=>provider(stock())});
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  try {
    const page=await fetch(origin);assert.equal(page.status,200);assert.match(await page.text(),/src\/main.jsx/);
    const response=await fetch(`${origin}/api/extract`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({kind:'stock',text:'Tomatoes 1000 g expires 2026-10-23'})});
    assert.equal(response.status,200);assert.equal((await response.json()).extraction.kind,'stock');
    const missing=await fetch(`${origin}/api/not-found`);assert.equal(missing.status,404);
    const serverCode=await fetch(`${origin}/server/extract.js`);assert.equal(serverCode.status,404);
  } finally {await app.close();}
});
