import { describe, it, expect } from 'vitest';
import { mapChoiceRow, assembleGroups, groupAttachments, groupsForItem } from '../server/lib/optionData.js';

const CHOICE_ROW = {
  id: 12, group_id: 1, name: 'Sprite', price_delta: '0.50', available: 1, is_default: 0,
  inventory_item_id: 50, inventory_qty: '1.000', sort_order: 1,
};

describe('mapChoiceRow', () => {
  it('converts DB types', () => {
    expect(mapChoiceRow(CHOICE_ROW)).toEqual({
      id: 12, groupId: 1, name: 'Sprite', priceDelta: 0.5, enabled: true, isDefault: false,
      inventoryItemId: 50, inventoryQty: 1, sortOrder: 1,
    });
  });
  it('keeps an unlinked choice null', () => {
    const c = mapChoiceRow({ ...CHOICE_ROW, inventory_item_id: null, inventory_qty: null });
    expect(c.inventoryItemId).toBeNull();
    expect(c.inventoryQty).toBeNull();
  });
});

describe('assembleGroups', () => {
  it('nests and orders choices', () => {
    const groups = assembleGroups(
      [{ id: 1, name: 'Soda Flavor', min_select: 1, max_select: 1, sort_order: 0 }],
      [CHOICE_ROW, { ...CHOICE_ROW, id: 11, name: 'Coke', sort_order: 0 }],
    );
    const g = groups.get(1);
    expect(g).toMatchObject({ id: 1, name: 'Soda Flavor', minSelect: 1, maxSelect: 1 });
    expect(g.choices.map((c) => c.name)).toEqual(['Coke', 'Sprite']);
  });
  it('ignores choices of unknown groups', () => {
    expect(assembleGroups([], [CHOICE_ROW]).size).toBe(0);
  });
});

describe('groupAttachments / groupsForItem', () => {
  it('orders an item\'s groups by sort_order', () => {
    const attachments = groupAttachments([
      { menu_item_id: 5, group_id: 2, sort_order: 1 },
      { menu_item_id: 5, group_id: 1, sort_order: 0 },
      { menu_item_id: 6, group_id: 3, sort_order: 0 },
    ]);
    expect(attachments.get(5)).toEqual([1, 2]);
    const groups = new Map([[1, { id: 1 }], [2, { id: 2 }]]);
    expect(groupsForItem(5, { groups, attachments }).map((g) => g.id)).toEqual([1, 2]);
    expect(groupsForItem(6, { groups, attachments })).toEqual([]);
    expect(groupsForItem(9, { groups, attachments })).toEqual([]);
  });
});
