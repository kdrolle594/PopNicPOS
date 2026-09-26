// Resolves one order line against the database's option rules. Pure: the order
// route loads rows and locked stock, this module decides. Uses the same
// selection rules as the storefront and POS (shared/menuOptions.js).
import { validateSelection, selectedChoices, linePrice, lineLabel } from '../../shared/menuOptions.js';
import { isChoiceAvailable, isItemSoldOut } from './availability.js';

export class OrderLineError extends Error {}

export function resolveLine({ menuItem, groups, choiceIds, stock }) {
  if (choiceIds != null && !Array.isArray(choiceIds)) throw new OrderLineError('choiceIds must be an array');
  const ids = (choiceIds || []).map(Number);

  const view = {
    id: menuItem.id,
    name: menuItem.name,
    price: menuItem.price,
    soldOut: isItemSoldOut({ available: menuItem.available, recipe: menuItem.recipe, groups }, stock),
    optionGroups: groups.map((g) => ({
      ...g,
      choices: g.choices.map((c) => ({ ...c, available: isChoiceAvailable(c, stock) })),
    })),
  };

  const { ok, errors } = validateSelection(view, ids);
  if (!ok) throw new OrderLineError(errors[0].message);

  const picked = selectedChoices(view, ids);
  const stockPerUnit = new Map();
  const need = (id, qty) => {
    if (id != null) stockPerUnit.set(id, (stockPerUnit.get(id) || 0) + qty);
  };
  for (const link of menuItem.recipe) need(link.inventoryItemId, link.quantity);
  for (const { choice } of picked) need(choice.inventoryItemId, choice.inventoryQty);

  return {
    unitPrice: linePrice(view, ids),
    label: lineLabel(view, ids),
    snapshot: {
      choices: picked.map(({ group, choice }) => ({
        id: choice.id,
        group: group.name,
        name: choice.name,
        priceDelta: choice.priceDelta,
        inventoryItemId: choice.inventoryItemId,
        inventoryQty: choice.inventoryQty,
      })),
    },
    stockPerUnit,
  };
}

// Stock to put back when an order is cancelled. Legacy rows have no `choices`.
export function snapshotStock(customizations) {
  const choices = Array.isArray(customizations?.choices) ? customizations.choices : [];
  return choices
    .filter((c) => c.inventoryItemId != null && Number(c.inventoryQty) > 0)
    .map((c) => ({ inventoryItemId: c.inventoryItemId, inventoryQty: Number(c.inventoryQty) }));
}
