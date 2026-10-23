import { createInitialState, validateState } from './workflow.js';
import { migrateV1 } from './migration.js';
import { backfillPlanNumbers } from './planNumbers.js';

export const STORAGE_KEY = 'freshplate-demo';
export const DATA_VERSION = 3;
export const LEGACY_BACKUP_KEY = `${STORAGE_KEY}:v1-backup`;

export function loadDemo(storage) {
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); }
  catch { throw new Error('Cannot read browser storage. Existing data was not replaced. Allow local storage, then retry.'); }
  if (raw === null) return { state: createInitialState(), raw: null };
  try {
    const saved = JSON.parse(raw);
    if (saved?.version === 1 || saved?.version === 2) {
      const state = validateState(backfillPlanNumbers(saved.version === 1 ? migrateV1(saved.state) : saved.state));
      const upgraded = JSON.stringify({ version: DATA_VERSION, state });
      if (storage.getItem(STORAGE_KEY) !== raw) throw new Error('Saved data changed during migration. Retry loading.');
      const backupKey = saved.version === 1 ? LEGACY_BACKUP_KEY : `${STORAGE_KEY}:v2-backup`;
      if (storage.getItem(backupKey) === null) storage.setItem(backupKey, raw);
      storage.setItem(STORAGE_KEY, upgraded);
      return { state, raw: upgraded, notice: `Saved data upgraded to v3. Plan numbers added; inventory and history preserved. A v${saved.version} backup is retained in this browser.` };
    }
    if (saved?.version !== DATA_VERSION) throw new Error('Unsupported data version.');
    return { state: validateState(saved.state), raw };
  } catch (error) {
    throw new Error(`Saved demo could not be restored: ${error.message} Existing data was left untouched. Retry loading or explicitly Reset Demo.`);
  }
}

// Compare against the last read value to avoid overwriting changes from another tab.
// Save the entire validated state with one write; callers publish UI state only on success.
export function saveDemo(storage, state, expectedRaw, reset = false) {
  validateState(state);
  const raw = JSON.stringify({ version: DATA_VERSION, state });
  try {
    if (!reset && storage.getItem(STORAGE_KEY) !== expectedRaw) {
      throw new Error('STORAGE_CONFLICT');
    }
    storage.setItem(STORAGE_KEY, raw);
  } catch (error) {
    if (error.message === 'STORAGE_CONFLICT') throw new Error('Another tab changed the saved demo. Reload Saved Demo before continuing. Nothing changed in this tab.');
    throw new Error('Cannot save to browser storage. Nothing changed. Check storage availability or space, then retry.');
  }
  return raw;
}
