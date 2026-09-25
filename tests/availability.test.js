import { describe, it, expect } from 'vitest';
import {
  isChoiceAvailable, isItemSoldOut, crossesThreshold, totalStockNeeds, findShortfall,
} from '../server/lib/availability.js';

const choice = (over = {}) => ({
  id: 1, groupId: 1, name: 'Sprite', priceDelta: 0, enabled: true, isDefault: false,
  inventoryItemId: null, inventoryQty: null, sortOrder: 0, ...over,
});

describe('isChoiceAvailable', () => {
  it('is off when the switch is off', () => {
    expect(isChoiceAvailable(choice({ enabled: false }), new Map())).toBe(false);
  });
  it('needs enough linked stock for one serving', () => {
    const c = choice({ inventoryItemId: 50, inventoryQty: 1 });
    expect(isChoiceAvailable(c, new Map([[50, 1]]))).toBe(true);
    expect(isChoiceAvailable(c, new Map([[50, 0.5]]))).toBe(false);
  });
  it('treats a missing stock row as unknown, not empty', () => {
    const c = choice({ inventoryItemId: 50, inventoryQty: 1 });
    expect(isChoiceAvailable(c, new Map())).toBe(true);
  });
});

describe('isItemSoldOut', () => {
  const required = { id: 1, name: 'Soda Flavor', minSelect: 1, maxSelect: 1, sortOrder: 0, choices: [choice()] };

  it('is sold out when switched off', () => {
    expect(isItemSoldOut({ available: false, recipe: [], groups: [] }, new Map())).toBe(true);
  });
  it('is sold out when a recipe ingredient is short', () => {
    const recipe = [{ inventoryItemId: 60, quantity: 1 }];
    expect(isItemSoldOut({ available: true, recipe, groups: [] }, new Map([[60, 0]]))).toBe(true);
    expect(isItemSoldOut({ available: true, recipe, groups: [] }, new Map([[60, 3]]))).toBe(false);
  });
  it('is sold out when a required group has no available choice', () => {
    const empty = { ...required, choices: [choice({ enabled: false })] };
    expect(isItemSoldOut({ available: true, recipe: [], groups: [empty] }, new Map())).toBe(true);
    expect(isItemSoldOut({ available: true, recipe: [], groups: [required] }, new Map())).toBe(false);
  });
  it('ignores optional groups with nothing available', () => {
    const optional = { ...required, minSelect: 0, choices: [choice({ enabled: false })] };
    expect(isItemSoldOut({ available: true, recipe: [], groups: [optional] }, new Map())).toBe(false);
  });
});

describe('crossesThreshold', () => {
  const thresholds = new Map([[50, [1, 0.5]]]);
  it('detects a drop below a threshold', () => {
    expect(crossesThreshold(new Map([[50, { before: 1, after: 0 }]]), thresholds)).toBe(true);
  });
  it('detects a restock above a threshold', () => {
    expect(crossesThreshold(new Map([[50, { before: 0, after: 2 }]]), thresholds)).toBe(true);
  });
  it('ignores changes that stay on one side', () => {
    expect(crossesThreshold(new Map([[50, { before: 10, after: 9 }]]), thresholds)).toBe(false);
  });
  it('ignores stock with no thresholds', () => {
    expect(crossesThreshold(new Map([[99, { before: 1, after: 0 }]]), thresholds)).toBe(false);
  });
});

describe('totalStockNeeds / findShortfall', () => {
  it('adds needs across lines so two lines cannot share the last unit', () => {
    const needs = totalStockNeeds([
      { stockPerUnit: new Map([[50, 1]]), quantity: 1 },
      { stockPerUnit: new Map([[50, 1], [60, 0.5]]), quantity: 2 },
    ]);
    expect(needs).toEqual(new Map([[50, 3], [60, 1]]));
    expect(findShortfall(needs, new Map([[50, 2], [60, 5]]))).toBe(50);
    expect(findShortfall(needs, new Map([[50, 3], [60, 1]]))).toBeNull();
  });
  it('never reports a deleted stock row as short', () => {
    expect(findShortfall(new Map([[77, 5]]), new Map())).toBeNull();
  });
});
