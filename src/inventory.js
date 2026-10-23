// All quantities and dates are fictional. Units are consistent within each batch.
import { DEMO_DATE, ingredients } from './demoInputs.js';
export { DEMO_DATE, inventory } from './demoInputs.js';

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

// Mass is represented as integer grams internally; eggs remain integer pieces.
export function toBaseUnits(value, unit) {
  return Math.round(value * (unit === 'kg' ? 1000 : 1));
}

export function fromBaseUnits(value, unit) {
  return value / (unit === 'kg' ? 1000 : 1);
}

export function getBatchIssues(item, catalog = ingredients) {
  const issues = [];
  const definition = catalog.find(entry => entry.id === item.ingredientId);
  if (!item.batch || typeof item.batch !== 'string') issues.push('Missing batch ID.');
  if (!definition) issues.push('Unknown ingredient ID.');
  if (!definition || item.unit !== definition.unit) {
    issues.push('Unit does not match the ingredient; expected kg for mass or pcs for eggs.');
  }
  if (!isValidDate(item.deadline)) issues.push('Invalid use-by date; expected a real YYYY-MM-DD date.');
  for (const field of ['stock', 'reserved']) {
    const value = item[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      issues.push(`${field === 'stock' ? 'Stock' : 'Reserved quantity'} must be a finite non-negative number.`);
    } else {
      const base = value * (item.unit === 'kg' ? 1000 : 1);
      if (!Number.isSafeInteger(Math.round(base)) || Math.abs(base - Math.round(base)) > 1e-7) {
        issues.push(item.unit === 'kg' ? `${field}: use whole grams (at most 3 decimal places in kg).` : `${field}: eggs must be whole pieces.`);
      }
    }
  }
  if (typeof item.stock === 'number' && typeof item.reserved === 'number' && item.reserved > item.stock) {
    issues.push('Reserved quantity exceeds stock.');
  }
  return issues;
}

// UTC calendar-day arithmetic keeps the fixed demo independent of local timezones.
export function getDaysUntil(deadline, referenceDate = DEMO_DATE) {
  if (!isValidDate(deadline) || !isValidDate(referenceDate)) return NaN;
  return Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${referenceDate}T00:00:00Z`)) / 86400000);
}

export function getPriority(deadline, referenceDate = DEMO_DATE) {
  const days = getDaysUntil(deadline, referenceDate);
  if (!Number.isFinite(days)) return { key: 'invalid', label: 'Invalid date', detail: 'Excluded from plans' };
  if (days < 0) return { key: 'past', label: 'Past use-by date', detail: `${Math.abs(days)} day${days === -1 ? '' : 's'} ago` };
  if (days === 0) return { key: 'today', label: 'Due today', detail: 'Today' };
  if (days <= 2) return { key: 'soon', label: 'Due soon', detail: `In ${days} day${days === 1 ? '' : 's'}` };
  return { key: 'later', label: 'Later', detail: `In ${days} days` };
}

export function getAvailable(item, catalog = ingredients) {
  if (getBatchIssues(item, catalog).length) return null;
  return fromBaseUnits(toBaseUnits(item.stock, item.unit) - toBaseUnits(item.reserved, item.unit), item.unit);
}

export function formatDate(date) {
  if (!isValidDate(date)) return 'Invalid date';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

export function formatQuantity(value, unit) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)} ${unit}`;
}
