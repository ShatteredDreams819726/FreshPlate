import { EXTRACT_LIMITS, hasImageSignature, validateExtractRequest, validateExtraction } from './extractionContract.js';
import { createStockPreview } from './dataEntry.js';

export async function readExtractionImage(file) {
  if (!['image/jpeg','image/png'].includes(file.type)) throw new Error('Choose one JPG or PNG image.');
  if (file.size > EXTRACT_LIMITS.imageBytes) throw new Error('Image must be 2 MB or smaller. Crop or resize it before uploading.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasImageSignature(bytes,file.type)) throw new Error('File content must match its JPG/PNG type.');
  let binary = '';
  for (let index=0; index<bytes.length; index+=8192) binary += String.fromCharCode(...bytes.subarray(index,index+8192));
  return {mimeType:file.type,data:btoa(binary)};
}

export async function requestExtraction(input, { fetchImpl = (...args) => fetch(...args), timeoutMs = EXTRACT_LIMITS.clientMs, signal } = {}) {
  validateExtractRequest(input);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort,timeoutMs);
  try {
    const response = await fetchImpl('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:controller.signal});
    if (response.status === 429) throw new Error('Extraction limit or free-tier quota reached. Wait and retry later; manual import is still available.');
    if (response.status === 413) throw new Error('Request is too large. Use a JPG/PNG up to 2 MB or shorter text.');
    let payload;
    try { payload = await response.json(); } catch { throw new Error('The extraction endpoint returned an invalid response. Use npm.cmd run dev:full locally; plain Vite does not run the API.'); }
    if (!response.ok) {
      const messages = {
        NOT_CONFIGURED:'AI extraction is not configured. Set GEMINI_API_KEY and GEMINI_MODEL on the server, then restart or redeploy. Manual import is available.',
        MODEL_CONFIG:'Check the server-side GEMINI_MODEL configuration.',
        MODEL_UNAVAILABLE:'The configured Gemini model or request format is unavailable. Check the model configuration.',
        REQUEST_REJECTED:'Gemini rejected the extraction request (upstream HTTP 400). Check the redacted server diagnostic for schema or parameter errors. Manual import is available.',
        MODEL_NOT_FOUND:'Gemini could not find the model or API route (upstream HTTP 404). Check GEMINI_MODEL and the API version on the server.',
        KEY_ACCESS:'Gemini rejected the server credentials or access. Check the server key and project permissions.',
        TIMEOUT:'Extraction timed out. Try a smaller source or retry manually.',
        NETWORK:'The server cannot reach Gemini. Retry later or use manual import.',
        INVALID_RESPONSE:'Gemini returned an invalid extraction format. Try a clearer source or use manual import.',
        INCOMPLETE:'Extraction did not finish. Try fewer rows or a clearer image.',
        ORIGIN:'Open FreshPlate and extract from the same site.',
        INVALID_INPUT:'The source is invalid. Check text length, image type and size.',
      };
      throw new Error(messages[payload?.error?.code] ?? 'Extraction failed. Retry later or use manual import.');
    }
    const data = payload?.extraction;
    if (data?.version !== 1 || data.kind !== input.kind || data.source !== 'gemini') throw new Error('Invalid extraction response. Use manual import or retry.');
    // Check the source fields again in the browser. Do not trust arbitrary API output.
    const fields = {rows:data.rows,issues:[]};
    if (input.kind === 'recipe') Object.assign(fields,{name:data.name,servings:data.servings});
    validateExtraction(input.kind,fields);
    if (data.originalIssues !== undefined && (!Array.isArray(data.originalIssues) || data.originalIssues.length>30 || data.originalIssues.some(note=>typeof note!=='string'||note.length>240))) throw new Error('Invalid original extraction notes. Use manual import or retry.');
    if (!Array.isArray(data.issues) || data.issues.length > 400 || data.issues.some(item=>typeof item!=='string'||item.length>600) || !Array.isArray(data.calculations) || data.calculations.length > 30 || data.calculations.some(item=>!Number.isInteger(item.row)||typeof item.basis!=='string'||item.basis.length>600||typeof item.source!=='string'||item.source.length>200)) throw new Error('Invalid extraction review notes. Use manual import or retry.');
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? 'Extraction cancelled. Nothing was saved.' : 'Extraction timed out. Try a smaller source or retry manually.');
    if (error instanceof TypeError) throw new Error('Cannot reach the extraction endpoint. Check your connection and use npm.cmd run dev:full locally.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
}

// These adapters populate the existing editable forms; neither adapter can commit data.
export function extractionToPreview(extraction, catalog, id) {
  if (extraction.kind === 'stock') return createStockPreview(extraction,catalog,id);
  return {version:1,kind:'recipe',id,source:'gemini',recipeId:'',name:extraction.name??'',servings:extraction.servings??'',
    rows:extraction.rows.map((row,index)=>({id:`part-${index+1}`,ingredientId:'',ingredientName:row.ingredientName??'',quantity:row.quantity??'',unit:row.unit??'',createIngredient:false}))};
}
