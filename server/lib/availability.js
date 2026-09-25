// Availability rules (spec §4.4) and stock arithmetic. Pure.
// `stock` is a Map<inventoryItemId, quantity>. A stock id missing from the map
// (e.g. the row was deleted) counts as unknown: it never blocks and is never short.

function hasStock(stock, inventoryItemId, needed) {
  if (inventoryItemId == null) return true;
  const qty = stock.get(inventoryItemId);
  return qty === undefined || qty >= needed;
}

export function isChoiceAvailable(choice, stock) {
  return Boolean(choice.enabled) && hasStock(stock, choice.inventoryItemId, choice.inventoryQty);
}

export function isItemSoldOut({ available, recipe, groups }, stock) {
  if (!available) return true;
  for (const link of recipe) {
    if (!hasStock(stock, link.inventoryItemId, link.quantity)) return true;
  }
  for (const group of groups) {
    if (group.minSelect === 0) continue;
    const offered = group.choices.filter((c) => isChoiceAvailable(c, stock)).length;
    if (offered < group.minSelect) return true;
  }
  return false;
}

export function crossesThreshold(changes, thresholds) {
  for (const [id, { before, after }] of changes) {
    for (const t of thresholds.get(id) || []) {
      if ((before >= t) !== (after >= t)) return true;
    }
  }
  return false;
}

export function totalStockNeeds(lines) {
  const needs = new Map();
  for (const { stockPerUnit, quantity } of lines) {
    for (const [id, perUnit] of stockPerUnit) {
      needs.set(id, (needs.get(id) || 0) + perUnit * quantity);
    }
  }
  return needs;
}

export function findShortfall(needs, stock) {
  for (const [id, needed] of needs) {
    if (!stock.has(id)) continue;
    if (stock.get(id) < needed) return id;
  }
  return null;
}
