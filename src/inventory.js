// All quantities and dates are fictional. Units are consistent within each batch.
export const DEMO_DATE = '2026-10-21';

export const inventory = [
  { ingredient: 'Tomatoes', detail: 'Produce', batch: 'TOM-1020-A', stock: 8, reserved: 3, unit: 'kg', deadline: '2026-10-21', symbol: '🍅', color: 'tomato' },
  { ingredient: 'Eggs', detail: 'Eggs', batch: 'EGG-1019-A', stock: 120, reserved: 48, unit: 'pcs', deadline: '2026-10-24', symbol: '🥚', color: 'egg' },
  { ingredient: 'Green peppers', detail: 'Produce', batch: 'PEP-1020-A', stock: 4.5, reserved: 1.5, unit: 'kg', deadline: '2026-10-22', symbol: '🫑', color: 'pepper' },
  { ingredient: 'Chicken', detail: 'Poultry', batch: 'CHK-1020-A', stock: 6, reserved: 2.5, unit: 'kg', deadline: '2026-10-21', symbol: '🍗', color: 'chicken' },
  { ingredient: 'Potatoes', detail: 'Produce', batch: 'POT-1018-A', stock: 12, reserved: 4, unit: 'kg', deadline: '2026-10-26', symbol: '🥔', color: 'potato' },
  { ingredient: 'Chinese cabbage', detail: 'Produce', batch: 'CAB-1020-A', stock: 7, reserved: 2, unit: 'kg', deadline: '2026-10-23', symbol: '🥬', color: 'cabbage' },
  { ingredient: 'Cooked rice', detail: 'Prepared ingredient', batch: 'RCE-1021-A', stock: 5, reserved: 3, unit: 'kg', deadline: '2026-10-21', symbol: '🍚', color: 'rice' },
  { ingredient: 'Carrots', detail: 'Produce', batch: 'CAR-1019-A', stock: 6.5, reserved: 1.5, unit: 'kg', deadline: '2026-10-25', symbol: '🥕', color: 'carrot' },
];

// UTC calendar-day arithmetic keeps the fixed demo independent of local timezones.
export function getDaysUntil(deadline, referenceDate = DEMO_DATE) {
  return Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${referenceDate}T00:00:00Z`)) / 86400000);
}

export function getPriority(deadline) {
  const days = getDaysUntil(deadline);
  if (days < 0) return { key: 'past', label: 'Past demo date', detail: `${Math.abs(days)} day${days === -1 ? '' : 's'} ago` };
  if (days === 0) return { key: 'today', label: 'Due today', detail: 'Today' };
  if (days <= 2) return { key: 'soon', label: 'Due soon', detail: `In ${days} day${days === 1 ? '' : 's'}` };
  return { key: 'later', label: 'Later', detail: `In ${days} days` };
}

export function getAvailable(item) {
  return Number((item.stock - item.reserved).toFixed(3));
}

export function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

export function formatQuantity(value, unit) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)} ${unit}`;
}
