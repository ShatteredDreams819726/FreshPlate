import { isValidDate } from './inventory.js';
import { normalizeImportDate } from './importDates.js';

const text = value => String(value ?? '').trim();
export function inputIssues(kind, row) {
  const issues = [], add = (field,code,message) => issues.push({field,code,message});
  const unit = text(row.unit), quantity = text(row.quantity);
  if (!['g','kg','pcs'].includes(unit)) {
    add('unit',unit?'unsupported':'missing',unit ? `Convert “${unit}” to g, kg or pcs and update the quantity.` : 'Choose g, kg or pcs.');
  }
  // Unsupported package units already request a quantity update; avoid repeating it.
  if (!unit || ['g','kg','pcs'].includes(unit)) {
    if (!/^\d+(\.\d+)?$/.test(quantity) || Number(quantity) <= 0 || !Number.isFinite(Number(quantity))) add('quantity',quantity?'invalid':'missing',quantity ? `Enter a numeric quantity for “${quantity}”.` : 'Add a quantity.');
    else {
      const base = Number(quantity) * (unit === 'kg' ? 1000 : 1);
      if (!Number.isSafeInteger(Math.round(base)) || Math.abs(base - Math.round(base)) > 1e-7) add('quantity','precision',unit === 'pcs' ? 'Use whole pieces.' : 'Use whole grams.');
    }
  }
  if (kind === 'stock') {
    const production = normalizeImportDate(row.productionDate), expiry = normalizeImportDate(row.expiryDate);
    if (!expiry) add('expiryDate','missing','Add an expiry date.');
    else if (!isValidDate(expiry)) add('expiryDate','invalid',`Confirm the expiry date for “${expiry}”.`);
    if (production && !isValidDate(production)) add('productionDate','invalid',`Confirm the production date for “${production}”, or leave it blank.`);
    if (isValidDate(production) && isValidDate(expiry) && production > expiry) add('productionDate','after-expiry','Choose a production date on or before expiry.');
  }
  return issues;
}
export function extractionReviewIssues(extraction) {
  const issues = [];
  if (extraction.kind === 'recipe') {
    if (!text(extraction.name)) issues.push({field:'name',code:'missing',message:'Add a dish name.'});
    if (!/^\d+$/.test(text(extraction.servings)) || !Number.isSafeInteger(Number(extraction.servings)) || Number(extraction.servings) < 1) issues.push({field:'servings',code:'invalid',message:'Add a positive whole recipe yield.'});
  }
  extraction.rows.forEach((row,index) => {
    if (!text(row.ingredientName)) issues.push({rowId:`row-${index+1}`,field:'ingredient',code:'missing',message:'Add an ingredient name.'});
    issues.push(...inputIssues(extraction.kind,row).map(issue=>({...issue,rowId:`row-${index+1}`})));
  });
  return issues;
}
export function mergeReviewIssues(issues) {
  const seen = new Set();
  return issues.filter(issue=>{
    const key = `${issue.rowId??''}:${issue.field??''}:${issue.code??issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);return true;
  });
}
export function rowLabel(id) {
  const index = /^(?:row|part)-(\d+)$/.exec(id ?? '');
  return index ? `Row ${index[1]}` : id ? 'Ingredient row' : '';
}
