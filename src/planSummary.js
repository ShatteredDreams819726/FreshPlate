// Presentation selectors only: quantities with different units are never combined.
export function plannedSummary(result) {
  const dishes = result.dishes.filter(dish => dish.portions > 0);
  const ids = new Set(dishes.flatMap(dish => dish.allocations).filter(item => item.priority && item.quantity > 0).map(item => item.batch));
  return { portions: dishes.reduce((sum, dish) => sum + dish.portions, 0), dishes: dishes.length, priorityBatches: ids.size };
}
export function recordedBatches(event) {
  return (event?.action === 'Completed' ? event.changes : []).filter(change => change.before.stock > change.after.stock);
}
export function recordedSummary(event, result) {
  const priority = new Set(result.dishes.flatMap(dish => dish.allocations).filter(item => item.priority && item.quantity > 0).map(item => item.batch));
  const dishes = event.dishes.filter(dish => dish.portions > 0);
  return { portions: dishes.reduce((sum, dish) => sum + dish.portions, 0), dishes: dishes.length,
    priorityBatches: new Set(recordedBatches(event).filter(change => priority.has(change.batch)).map(change => change.batch)).size };
}
