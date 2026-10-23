import { isValidDate } from './inventory.js';
import { normalizeImportDate, dateAppearsInSource } from './importDates.js';
import { extractionReviewIssues, rowLabel } from './importReview.js';

export const EXTRACT_LIMITS = Object.freeze({ text: 12000, imageBytes: 2 * 1024 * 1024, requestBytes: 3000000, rows: 30, responseBytes: 256000, serverMs: 25000, clientMs: 30000 });
const common = { ingredientName: 120, quantity: 64, unit: 40 };
const stockFields = { ...common, supplierBatch: 120, productionDate: 64, expiryDate: 64, shelfLifeValue: 32, shelfLifeUnit: 32, shelfLifeText: 200 };
const record = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const nullable = limit => ({ type: ['string', 'null'], maxLength: limit });
const issuesSchema = { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 240 } };
export function extractionSchema(kind) {
  const fields = kind === 'stock' ? stockFields : common;
  const properties = { rows: { type: 'array', minItems: 1, maxItems: EXTRACT_LIMITS.rows, items: record(Object.fromEntries(Object.entries(fields).map(([key, length]) => [key, nullable(length)]))) }, issues: issuesSchema };
  if (kind === 'recipe') Object.assign(properties, { name: nullable(120), servings: nullable(32) });
  return record(properties);
}
// Provider decoding constraints and application validation have different budgets.
// A live controlled comparison rejected the full bounded schema (HTTP 400), while
// the identical request without maxItems succeeded. Keep all bounds locally.
export function providerExtractionSchema(kind) {
  const schema = structuredClone(extractionSchema(kind));
  function simplify(node) {
    if (!node || typeof node !== 'object') return;
    delete node.maxItems;
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(simplify);
      else simplify(child);
    }
  }
  simplify(schema);
  return schema;
}
function assert(condition, message = 'Gemini returned an invalid extraction format. Try a clearer source or use manual import.') { if (!condition) throw new Error(message); }
export function matchesSchema(value, schema) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (!types.includes(type)) return false;
  if (type === 'string') return value.length <= schema.maxLength;
  if (type === 'array') return value.length >= (schema.minItems ?? 0) && value.length <= schema.maxItems && value.every(item => matchesSchema(item, schema.items));
  if (type === 'object') return Object.keys(value).every(key => Object.hasOwn(schema.properties, key)) && schema.required.every(key => Object.hasOwn(value, key) && matchesSchema(value[key], schema.properties[key]));
  return type === 'null';
}
export function hasImageSignature(bytes, mimeType) {
  return mimeType === 'image/png' ? [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte) : mimeType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}
export function validateExtractRequest(body) {
  assert(body && typeof body === 'object' && !Array.isArray(body), 'Send a JSON extraction request.');
  assert(Object.keys(body).every(key => ['kind', 'text', 'image'].includes(key)), 'Unexpected extraction request fields.');
  assert(['stock', 'recipe'].includes(body.kind), 'Choose stock or recipe extraction.');
  assert(typeof body.text === 'string' && body.text.length <= EXTRACT_LIMITS.text, 'Text must be 12,000 characters or fewer.');
  assert(Boolean(body.text.trim()) !== Boolean(body.image), 'Provide either text or one JPG/PNG image.');
  if (body.image) {
    const image = body.image;
    assert(typeof image === 'object' && !Array.isArray(image) && Object.keys(image).length === 2 && ['image/jpeg', 'image/png'].includes(image.mimeType) && typeof image.data === 'string', 'Choose one JPG or PNG image.');
    assert(image.data.length > 0 && image.data.length <= 4 * Math.ceil(EXTRACT_LIMITS.imageBytes / 3) && image.data.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(image.data), 'Image encoding is invalid or exceeds 2 MB.');
    const bytes = Uint8Array.from(atob(image.data), char => char.charCodeAt(0));
    assert(bytes.length <= EXTRACT_LIMITS.imageBytes && hasImageSignature(bytes, image.mimeType), 'Image content must be JPG/PNG and 2 MB or smaller.');
  }
  return body;
}

// Date arithmetic is deterministic; the model must copy shelf-life statements, not calculate.
export function calculateExpiry(productionDate, value, rawUnit) {
  productionDate = normalizeImportDate(productionDate);
  if (!isValidDate(productionDate) || !/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 3650) return null;
  const aliases = { day: 'days', days: 'days', d: 'days', '天': 'days', '日': 'days', week: 'weeks', weeks: 'weeks', '周': 'weeks', month: 'months', months: 'months', '月': 'months', year: 'years', years: 'years', '年': 'years' };
  const unit = aliases[String(rawUnit ?? '').trim().toLowerCase()];
  if (!unit) return null;
  const amount = Number(value), date = new Date(`${productionDate}T00:00:00Z`);
  if (unit === 'days' || unit === 'weeks') date.setUTCDate(date.getUTCDate() + amount * (unit === 'weeks' ? 7 : 1));
  else {
    const day = date.getUTCDate(); date.setUTCDate(1);
    if (unit === 'months') date.setUTCMonth(date.getUTCMonth() + amount);
    else date.setUTCFullYear(date.getUTCFullYear() + amount);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  const expiryDate = date.toISOString().slice(0, 10);
  if (!isValidDate(expiryDate) || date.getUTCFullYear() > 9999) return null;
  return { expiryDate, basis: `${productionDate} + ${amount} calendar ${unit} = ${expiryDate} (production day = day 0${unit === 'months' || unit === 'years' ? '; month end clamped' : ''}).` };
}

// Structural validity is separate from business validity. Preserve uncertain source values.
export function validateExtraction(kind, value, {sourceText = ''} = {}) {
  assert(['stock', 'recipe'].includes(kind) && matchesSchema(value, extractionSchema(kind)));
  const result = structuredClone(value), originalIssues = [...result.issues], calculations = [];
  const ambiguousDates = [...sourceText.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)].filter(match => Number(match[1]) >= 1 && Number(match[1]) <= 12 && Number(match[2]) >= 1 && Number(match[2]) <= 12);
  if (kind === 'stock') for (const [index,row] of result.rows.entries()) {
    for (const field of ['productionDate','expiryDate']) {
      if (row[field] === null) continue;
      row[field] = normalizeImportDate(row[field]);
      if (!row[field] || dateAppearsInSource(row[field],sourceText)) continue;
      const match = ambiguousDates.find(item => [        item[3]+'-'+item[1].padStart(2,'0')+'-'+item[2].padStart(2,'0'),
        item[3]+'-'+item[2].padStart(2,'0')+'-'+item[1].padStart(2,'0')
      ].includes(row[field]));
      if (match) row[field] = match[0];
      else if (sourceText) row[field] = null;
    }
    const evidence = row.shelfLifeText?.trim() && (!sourceText || sourceText.includes(row.shelfLifeText)) && (row.shelfLifeText.match(/\d+/g) ?? []).includes(row.shelfLifeValue);
    const calculated = evidence ? calculateExpiry(row.productionDate,row.shelfLifeValue,row.shelfLifeUnit) : null;
    if (calculated && row.expiryDate === null) {
      row.expiryDate=calculated.expiryDate;
      calculations.push({row:index+1,source:row.shelfLifeText,...calculated});
    } else if (calculated && isValidDate(row.expiryDate) && row.expiryDate !== calculated.expiryDate) {
      calculations.push({row:index+1,source:row.shelfLifeText,expiryDate:row.expiryDate,conflict:true,
        basis:`${calculated.basis} Printed expiry: ${row.expiryDate}.`});
    }
  }
  const review = {kind,...result};
  const issues=extractionReviewIssues(review).map(item=>(item.rowId?rowLabel(item.rowId)+': ':'')+item.message);
  return {version:1,kind,source:'gemini',...result,issues,originalIssues,calculations};
}
