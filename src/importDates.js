import { isValidDate } from './inventory.js';

// Parse only explicit year-first calendar dates. Never use Date's rollover parser
// or a local/UTC timestamp conversion for editable date values.
export function normalizeImportDate(value) {
  const raw = String(value ?? '').trim();
  const match = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/.exec(raw);
  const spaces = /^(\d{4})\s+(\d{1,2})\s+(\d{1,2})$/.exec(raw);
  const parts = match ? [match[1],match[3],match[4]] : spaces ? spaces.slice(1) : null;
  if (!parts) return raw;
  const iso = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
  return isValidDate(iso) ? iso : raw;
}
export const dateControlValue = value => {
  const normalized = normalizeImportDate(value);
  return isValidDate(normalized) ? normalized : '';
};
export function dateAppearsInSource(value, source) {
  if (source.includes(value)) return true;
  const dates = source.match(/\b\d{4}(?:[-/]\d{1,2}[-/]\d{1,2}|\s+\d{1,2}\s+\d{1,2})\b/g) ?? [];
  return dates.some(raw => normalizeImportDate(raw) === value);
}
