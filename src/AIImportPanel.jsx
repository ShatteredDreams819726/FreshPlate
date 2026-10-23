import { useEffect, useRef, useState } from 'react';
import ImportIssues from './ImportIssues.jsx';
import { extractionReviewIssues } from './importReview.js';
import { EXTRACT_LIMITS } from './extractionContract.js';
import { readExtractionImage, requestExtraction } from './aiImport.js';

export default function AIImportPanel({kind,onUse,blocked}) {
  const [mode,setMode]=useState('text'), [text,setText]=useState(''), [image,setImage]=useState(null), [filename,setFilename]=useState('');
  const [result,setResult]=useState(null), [busy,setBusy]=useState(false), [loadingImage,setLoadingImage]=useState(false), [error,setError]=useState(''), [reviewed,setReviewed]=useState(false), [used,setUsed]=useState(false);
  const pending=useRef(null), imageRevision=useRef(0);
  useEffect(()=>()=>{pending.current?.abort();imageRevision.current++;},[]);
  function clearResult() {setResult(null);setReviewed(false);setUsed(false);setError('');}
  async function selectImage(event) {
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const revision=++imageRevision.current;clearResult();setImage(null);setFilename('');setLoadingImage(true);
    try {const prepared=await readExtractionImage(file);if(revision===imageRevision.current){setImage(prepared);setFilename(file.name);}}
    catch(failure){if(revision===imageRevision.current)setError(failure.message);}
    finally{if(revision===imageRevision.current)setLoadingImage(false);}
  }
  async function extract() {
    if(pending.current||busy||blocked||loadingImage)return;
    const controller=new AbortController();pending.current=controller;setBusy(true);clearResult();
    try {setResult(await requestExtraction({kind,text:mode==='text'?text:'',image:mode==='image'?image:null},{signal:controller.signal}));}
    catch(failure){setError(failure.message);}finally{pending.current=null;setBusy(false);}
  }
  return <details className="detail-panel ai-import"><summary>Extract {kind==='stock'?'Stock':'Recipe'} with Gemini</summary><p>Extract a draft from text or one image, then edit and confirm below.</p><p className="entry-help">The selected source is sent to Google Gemini when you select Extract.</p>
    <label>Source type<select value={mode} disabled={busy||loadingImage} onChange={event=>{setMode(event.target.value);clearResult();}}><option value="text">Pasted text</option><option value="image">JPG / PNG image</option></select></label>
    {mode==='text'?<label>Original source text<textarea rows={5} maxLength={EXTRACT_LIMITS.text} value={text} disabled={busy} onChange={event=>{setText(event.target.value);clearResult();}} /></label>:<div><label>Source image (JPG/PNG, max. 2 MB)<input type="file" accept="image/jpeg,image/png" disabled={busy||loadingImage} onChange={selectImage}/></label>{image&&<figure className="extraction-source"><img src={`data:${image.mimeType};base64,${image.data}`} alt="Original source for extraction comparison"/><figcaption>{filename}</figcaption></figure>}</div>}
    <div className="workflow-buttons"><button type="button" className="secondary-button" disabled={blocked||busy||loadingImage||(mode==='text'?!text.trim():!image)} onClick={extract}>{loadingImage?'Checking image…':busy?'Extracting…':'Extract'}</button>{busy&&<button type="button" className="secondary-button" onClick={()=>pending.current?.abort()}>Cancel Extraction</button>}</div>
    {busy&&<p role="status">Reading the source. This may take up to 30 seconds.</p>}{error&&<p role="alert" className="input-error">{error}</p>}
    {result&&<div className="extraction-review"><h4>Extracted draft · not saved</h4>
      {!used&&<ImportIssues issues={extractionReviewIssues(result)}/>}
      <details open={!used}><summary>{used?'Original extraction · reference only':'Extracted source fields'}</summary>
      {kind==='recipe'&&<p><strong>{result.name||'Dish name missing'}</strong> · Recipe yield: {result.servings??'Not supplied'}</p>}
      <div className="table-scroll" role="region" aria-label="Extracted source fields" tabIndex="0"><table className="extracted-table"><thead><tr><th>Row</th><th>Original ingredient</th><th>Quantity</th><th>Unit</th>{kind==='stock'&&<><th>Batch</th><th>Production date</th><th>Expiry date</th><th>Stated shelf life</th></>}</tr></thead><tbody>{result.rows.map((row,index)=><tr key={index}><td>{index+1}</td><td>{row.ingredientName}</td><td>{row.quantity}</td><td>{row.unit}</td>{kind==='stock'&&<><td>{row.supplierBatch}</td><td>{row.productionDate}</td><td>{row.expiryDate}{result.calculations.filter(item=>item.row===index+1).map((item,i)=><small className="entry-help" key={i}>{item.basis}</small>)}</td><td>{row.shelfLifeText}</td></>}</tr>)}</tbody></table></div>
      {result.originalIssues?.length>0&&<details><summary>Original AI notes · reference only</summary><ul>{result.originalIssues.map((note,index)=><li key={index}>{note}</li>)}</ul></details>}
      </details>
      {!used&&<label className="checkbox-label"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>I compared the extracted fields with the source.</label>}
      <button type="button" className="secondary-button" disabled={!reviewed||used||blocked} onClick={()=>{onUse(result);setUsed(true);}}>{used?'Loaded into editable form':'Load Editable Preview'}</button>
    </div>}
  </details>;
}
