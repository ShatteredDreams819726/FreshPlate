import { dateControlValue } from './importDates.js';

export default function ImportDateField({row,field,onChange,prefix}) {
  const label = field === 'productionDate' ? 'Production date' : 'Expiry date';
  const value = dateControlValue(row[field]);
  const id = `${prefix}-${field}`;
  const calculation = field === 'expiryDate' && row.expiryCalculation;
  return <div className="import-date-field"><label htmlFor={id}>{label}{field==='productionDate'?' (optional)':''}</label>
    <input id={id} type="date" value={value} required={field==='expiryDate'} aria-describedby={!value&&row[field]?`${id}-source`:undefined} onChange={event=>onChange({[field]:event.target.value})}/>
    {!value&&row[field]&&<small id={`${id}-source`} className="entry-help">Source: {row[field]}</small>}
    {field==='productionDate'&&row[field]&&<button type="button" className="secondary-button date-clear" onClick={()=>onChange({productionDate:''})}>Leave Blank</button>}
    {calculation&&<><small className="entry-help">{calculation.basis}</small><label className="checkbox-label"><input type="checkbox" checked={Boolean(row.confirmCalculatedExpiry)} onChange={event=>onChange({confirmCalculatedExpiry:event.target.checked})}/>{calculation.conflict?'Confirm expiry date':'Confirm calculated date'}</label></>}
  </div>;
}
