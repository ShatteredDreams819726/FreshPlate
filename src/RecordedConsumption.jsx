import { formatQuantity, toBaseUnits, fromBaseUnits } from './inventory.js';
import { recordedBatches } from './planSummary.js';
export default function RecordedConsumption({ event }) {
  return <div className="recorded-consumption"><h3>Recorded consumption</h3><ul>{recordedBatches(event).map(change => <li key={change.batch}><span><strong>{change.ingredient}</strong><small>{change.batch}</small></span><b>{formatQuantity(fromBaseUnits(toBaseUnits(change.before.stock, change.unit) - toBaseUnits(change.after.stock, change.unit), change.unit), change.unit)}</b></li>)}</ul></div>;
}
