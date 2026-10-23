import { mergeReviewIssues, rowLabel } from './importReview.js';
export default function ImportIssues({issues,rows=[]}) {
  const current = mergeReviewIssues(issues);
  if (!current.length) return null;
  return <div className="entry-validation" aria-live="polite">{current.map((item,index)=>{const rowIndex=rows.findIndex(row=>row.id===item.rowId);return <p className="input-error" key={index}>{item.rowId ? `${rowIndex>=0?`Row ${rowIndex+1}`:rowLabel(item.rowId)}: ` : ''}{item.message}</p>;})}</div>;
}
