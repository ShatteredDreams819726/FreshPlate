import { isValidDate } from './inventory.js';

export const SHOP_TIME_ZONE = 'Asia/Kuala_Lumpur';
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const positive = value => Number.isSafeInteger(value) && value > 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const check = (value, message) => { if (!value) throw new Error(message); };
const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function shopDate(time) {
  check(validTime(time), 'A valid creation timestamp is required for a plan number.');
  const parts = new Intl.DateTimeFormat('en', { timeZone: SHOP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time));
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function creationTime(plan, activity) {
  if (validTime(plan.createdAt)) return plan.createdAt;
  // A Draft event is evidence of creation; completion/approval times never are.
  const drafts = activity.filter(event => event.planId === plan.id && event.action === 'Draft');
  return drafts.length === 1 && validTime(drafts[0].time) ? drafts[0].time : null;
}

export function emptyPlanNumbering() {
  return { timeZone: SHOP_TIME_ZONE, byId: {}, dateCounters: {}, legacyCounter: 0 };
}

export function validatePlanNumbering(state, allowMissing = false) {
  const numbers = state.planNumbering;
  check(object(numbers) && numbers.timeZone === SHOP_TIME_ZONE && object(numbers.byId) && object(numbers.dateCounters) && Number.isSafeInteger(numbers.legacyCounter) && numbers.legacyCounter >= 0, 'Invalid saved plan numbering.');
  const ids = new Set(state.plans.map(plan => plan.id)), used = new Set();
  for (const [date, counter] of Object.entries(numbers.dateCounters)) check(isValidDate(date) && positive(counter), 'Invalid daily plan counter.');
  for (const [id, number] of Object.entries(numbers.byId)) {
    check(ids.has(id) && object(number), 'Plan number refers to an unknown plan.');
    const plan = state.plans.find(item => item.id === id), created = creationTime(plan, state.activity);
    let key;
    if (number.date !== undefined) {
      check(created && number.date === shopDate(created) && positive(number.sequence) && numbers.dateCounters[number.date] >= number.sequence && number.legacy === undefined, 'Invalid dated plan number.');
      key = `${number.date}:${number.sequence}`;
    } else {
      check(!created && positive(number.legacy) && numbers.legacyCounter >= number.legacy && number.sequence === undefined, 'Invalid legacy plan number.');
      key = `legacy:${number.legacy}`;
    }
    check(!used.has(key), 'Duplicate saved plan display number.');
    used.add(key);
  }
  if (!allowMissing) check(state.plans.every(plan => Object.hasOwn(numbers.byId, plan.id)), 'A saved plan display number is missing.');
  return numbers;
}

function reserve(numbering, date) {
  const sequence = (numbering.dateCounters[date] ?? 0) + 1;
  check(positive(sequence), 'Daily plan number limit reached.');
  numbering.dateCounters[date] = sequence;
  return { date, sequence };
}

// Clone before adding metadata. Never edit IDs, timestamps, snapshots or logs.
export function backfillPlanNumbers(original) {
  const state = structuredClone(original);
  state.planNumbering ??= emptyPlanNumbering();
  validatePlanNumbering(state, true);
  const missing = state.plans.filter(plan => !Object.hasOwn(state.planNumbering.byId, plan.id));
  missing.sort((a, b) => {
    const at = creationTime(a, state.activity), bt = creationTime(b, state.activity);
    if (at && bt) return Date.parse(at) - Date.parse(bt) || compareId(a, b);
    return at ? -1 : bt ? 1 : compareId(a, b);
  });
  for (const plan of missing) {
    const created = creationTime(plan, state.activity);
    if (created) state.planNumbering.byId[plan.id] = reserve(state.planNumbering, shopDate(created));
    else {
      check(positive(state.planNumbering.legacyCounter + 1), 'Legacy plan number limit reached.');
      state.planNumbering.byId[plan.id] = { legacy: ++state.planNumbering.legacyCounter };
    }
  }
  validatePlanNumbering(state);
  return state;
}

export function assignPlanNumber(state, plan) {
  check(!Object.hasOwn(state.planNumbering.byId, plan.id), 'This plan already has a display number.');
  state.planNumbering.byId[plan.id] = reserve(state.planNumbering, shopDate(plan.createdAt));
}

export function planLabel(numbering, planId) {
  const number = numbering?.byId?.[planId];
  if (!number) return 'Plan unavailable';
  return number.date ? `${number.date} · Plan ${String(number.sequence).padStart(2, '0')}` : `Legacy Plan ${String(number.legacy).padStart(2, '0')}`;
}
