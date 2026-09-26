import { describe, it, expect } from 'vitest';
import { resolveLine, snapshotStock, OrderLineError } from '../server/lib/orderOptions.js';

const choice = (over) => ({
  groupId: 1, priceDelta: 0, enabled: true, isDefault: false,
  inventoryItemId: null, inventoryQty: null, sortOrder: 0, ...over,
});
const SODA_FLAVOR = {
  id: 1, name: 'Soda Flavor', minSelect: 1, maxSelect: 1, sortOrder: 0,
  choices: [
    choice({ id: 11, name: 'Coke', isDefault: true }),
    choice({ id: 12, name: 'Sprite', inventoryItemId: 50, inventoryQty: 1, sortOrder: 1 }),
    choice({ id: 13, name: 'Root Beer', enabled: false, sortOrder: 2 }),
  ],
};
const SIZE = {
  id: 2, name: 'Pizza Size', minSelect: 1, maxSelect: 1, sortOrder: 0,
  choices: [choice({ id: 21, groupId: 2, name: 'Large', priceDelta: 3 })],
};
const SODA = { id: 5, name: 'Soda', price: 1, available: true, recipe: [{ inventoryItemId: 60, quantity: 1 }] };
const HAWAIIAN = { id: 6, name: 'Hawaiian Pizza', price: 14.99, available: true, recipe: [] };
const STOCK = new Map([[50, 1], [60, 10]]);

function reason(fn) {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(OrderLineError); return e.message; }
  throw new Error('expected an OrderLineError');
}

describe('resolveLine', () => {
  it('prices, labels and snapshots a valid line', () => {
    const r = resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: [12], stock: STOCK });
    expect(r.unitPrice).toBe(1);
    expect(r.label).toBe('Soda (Sprite)');
    expect(r.stockPerUnit).toEqual(new Map([[60, 1], [50, 1]]));
    expect(r.snapshot).toEqual({
      choices: [{ id: 12, group: 'Soda Flavor', name: 'Sprite', priceDelta: 0, inventoryItemId: 50, inventoryQty: 1 }],
    });
  });

  it('accepts ids sent as strings', () => {
    const r = resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: ['12'], stock: STOCK });
    expect(r.label).toBe('Soda (Sprite)');
  });

  it('adds price deltas into the unit price', () => {
    const r = resolveLine({ menuItem: HAWAIIAN, groups: [SIZE], choiceIds: [21], stock: STOCK });
    expect(r.unitPrice).toBe(17.99);
  });

  it('rejects a switched-off choice', () => {
    expect(reason(() => resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: [13], stock: STOCK })))
      .toBe('Root Beer is no longer available');
  });

  it('rejects a choice whose stock ran out', () => {
    const stock = new Map([[50, 0], [60, 10]]);
    expect(reason(() => resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: [12], stock })))
      .toBe('Sprite is no longer available');
  });

  it('rejects a missing required choice', () => {
    expect(reason(() => resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: [], stock: STOCK })))
      .toBe('Choose a Soda Flavor');
  });

  it('rejects toppings on a specialty pizza', () => {
    expect(reason(() => resolveLine({ menuItem: HAWAIIAN, groups: [SIZE], choiceIds: [21, 11], stock: STOCK })))
      .toBe("Hawaiian Pizza doesn't offer that option");
  });

  it('rejects a sold-out item', () => {
    const stock = new Map([[50, 1], [60, 0]]);
    expect(reason(() => resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: [11], stock })))
      .toBe('Soda is sold out');
  });

  it('rejects a non-array choiceIds', () => {
    expect(reason(() => resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: 'x', stock: STOCK })))
      .toBe('choiceIds must be an array');
  });

  it('treats absent choiceIds as none', () => {
    const r = resolveLine({ menuItem: { ...SODA, recipe: [] }, groups: [], choiceIds: undefined, stock: STOCK });
    expect(r.label).toBe('Soda');
  });
});

describe('snapshotStock', () => {
  it('lists linked stock from a saved snapshot', () => {
    expect(snapshotStock({ choices: [
      { id: 12, inventoryItemId: 50, inventoryQty: 1 },
      { id: 11, inventoryItemId: null, inventoryQty: null },
    ] })).toEqual([{ inventoryItemId: 50, inventoryQty: 1 }]);
  });
  it('handles legacy customizations', () => {
    expect(snapshotStock({ pizzaSize: 'large' })).toEqual([]);
    expect(snapshotStock(null)).toEqual([]);
  });
});
