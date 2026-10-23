import { validateStockPreview } from './dataEntry.js';
import { activePlan } from './workflow.js';
import { formatQuantity } from './inventory.js';
import ImportDateField from './ImportDateField.jsx';
import ImportIssues from './ImportIssues.jsx';

export default function StockImportPreview({preview,state,blocked,IngredientMatch,onChange,onConfirm,onCancel}) {
  const check=validateStockPreview(preview,state);
  return <div className="import-preview"><h3>Editable delivery preview</h3><p>Confirm to append these arrivals in Business mode, using today's planning date.</p>
    <div className="table-scroll" role="region" aria-label="Editable delivery rows" tabIndex="0"><table className="entry-table"><thead><tr><th>Ingredient</th><th>Arrival quantity</th><th>Unit</th><th>Batch (optional)</th><th>Production date</th><th>Expiry date</th><th>Review</th></tr></thead><tbody>{preview.rows.map((row,index)=>{
      const normalized=check.rows.find(item=>item.rowId===row.id);
      return <tr key={row.id} className={check.errors.some(issue=>issue.rowId===row.id)?'entry-row-invalid':''}>
        <td><strong>Row {index+1}</strong><IngredientMatch row={row} catalog={state.ingredients} prefix={`stock-${row.id}`} onChange={fields=>onChange(row.id,fields)}/></td>
        {[['quantity','Arrival quantity'],['unit','Unit'],['supplierBatch','Batch']].map(([field,label])=><td key={field}><input type="text" aria-label={`Row ${index+1} ${label}`} value={row[field]} onChange={event=>onChange(row.id,{[field]:event.target.value})} placeholder={field==='unit'?'g / kg / pcs':undefined}/></td>)}
        {['productionDate','expiryDate'].map(field=><td key={field}><ImportDateField row={row} field={field} prefix={`stock-${row.id}`} onChange={fields=>onChange(row.id,fields)}/></td>)}
        <td>{normalized&&<span>{formatQuantity(normalized.stock,normalized.unit)}</span>}{check.warnings.some(issue=>issue.rowId===row.id)&&<label className="checkbox-label"><input type="checkbox" checked={Boolean(row.confirmDuplicate)} onChange={event=>onChange(row.id,{confirmDuplicate:event.target.checked})}/>I confirm this is an additional delivery</label>}</td>
      </tr>;
    })}</tbody></table></div>
    <ImportIssues issues={check.errors} rows={preview.rows}/>
    <div className="workflow-buttons"><button type="button" className="generate-button" disabled={blocked||Boolean(activePlan(state))||check.errors.length>0} onClick={onConfirm}>Confirm &amp; Append Stock</button><button type="button" className="secondary-button" onClick={onCancel}>Cancel Preview</button></div>
  </div>;
}
