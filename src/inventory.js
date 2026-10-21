// All quantities and dates are fictional. Units are consistent within each batch.
export const DEMO_DATE = '2026-10-21';

export const INGREDIENT_UNITS = {
  Tomatoes: 'kg', Eggs: 'pcs', 'Green peppers': 'kg', Chicken: 'kg',
  Potatoes: 'kg', 'Chinese cabbage': 'kg', 'Cooked rice': 'kg', Carrots: 'kg',
};

export const inventory = [
  { ingredient: 'Tomatoes', detail: 'Produce', batch: 'TOM-1020-A', stock: 8, reserved: 3, unit: 'kg', deadline: '2026-10-21', symbol: '🍅', color: 'tomato' },
  { ingredient: 'Eggs', detail: 'Eggs', batch: 'EGG-1019-A', stock: 120, reserved: 48, unit: 'pcs', deadline: '2026-10-24', symbol: '🥚', color: 'egg' },
  { ingredient: 'Green peppers', detail: 'Produce', batch: 'PEP-1020-A', stock: 4.5, reserved: 1.5, unit: 'kg', deadline: '2026-10-22', symbol: '🫑', color: 'pepper' },
  { ingredient: 'Chicken', detail: 'Poultry', batch: 'CHK-1020-A', stock: 6, reserved: 2.5, unit: 'kg', deadline: '2026-10-21', symbol: '🍗', color: 'chicken' },
  { ingredient: 'Potatoes', detail: 'Produce', batch: 'POT-1018-A', stock: 12, reserved: 4, unit: 'kg', deadline: '2026-10-26', symbol: '🥔', color: 'potato' },
  { ingredient: 'Chinese cabbage', detail: 'Produce', batch: 'CAB-1020-A', stock: 7, reserved: 2, unit: 'kg', deadline: '2026-10-23', symbol: '🥬', color: 'cabbage' },
  { ingredient: 'Cooked rice', detail: 'Prepared ingredient', batch: 'RCE-1021-A', stock: 5, reserved: 3, unit: 'kg', deadline: '2026-10-21', symbol: '🍚', color: 'rice' },
  { ingredient: 'Carrots', detail: 'Produce', batch: 'CAR-1019-A', stock: 6.5, reserved: 1.5, unit: 'kg', deadline: '2026-10-25', symbol: '🥕', color: 'carrot' },
  { ingredient: 'Eggs', detail: 'Eggs · earlier batch', batch: 'EGG-1020-B', stock: 18, reserved: 6, unit: 'pcs', deadline: '2026-10-22', symbol: '🥚', color: 'egg' },
  { ingredient: 'Chicken', detail: 'Poultry · later batch', batch: 'CHK-1021-B', stock: 3, reserved: 1, unit: 'kg', deadline: '2026-10-24', symbol: '🍗', color: 'chicken' },
  { ingredient: 'Tomatoes', detail: 'Produce · excluded from plans', batch: 'TOM-1018-X', stock: 0.8, reserved: 0.2, unit: 'kg', deadline: '2026-10-20', symbol: '🍅', color: 'tomato' },
];

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

export function getBatchIssues(item) {
  const issues = [];
  if (!item.batch || typeof item.batch !== 'string') issues.push('Missing batch ID.');
  if (!Object.hasOwn(INGREDIENT_UNITS, item.ingredient)) issues.push('Unknown ingredient.');
  if (!Object.hasOwn(INGREDIENT_UNITS, item.ingredient) || item.unit !== INGREDIENT_UNITS[item.ingredient]) {
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

export function getPriority(deadline) {
  const days = getDaysUntil(deadline);
  if (!Number.isFinite(days)) return { key: 'invalid', label: 'Invalid date', detail: 'Excluded from plans' };
  if (days < 0) return { key: 'past', label: 'Past demo date', detail: `${Math.abs(days)} day${days === -1 ? '' : 's'} ago` };
  if (days === 0) return { key: 'today', label: 'Due today', detail: 'Today' };
  if (days <= 2) return { key: 'soon', label: 'Due soon', detail: `In ${days} day${days === 1 ? '' : 's'}` };
  return { key: 'later', label: 'Later', detail: `In ${days} days` };
}

export function getAvailable(item) {
  if (getBatchIssues(item).length) return null;
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
