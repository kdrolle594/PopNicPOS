import { describe, it, expect } from 'vitest';
import { serializeMenuItem, validateMenuPayload, serializeGroup } from '../server/routes/menu.js';

const ROW = {
  id: 1, name: 'Margherita', category: 'Pizza',
  price: '12.00', cost: '4.50', available: 1, is_combo: 0, points_value: 10,
  image_url: null, description: null,
};

describe('serializeMenuItem — cost gating', () => {
  it('omits cost for an unauthenticated caller', () => {
    const out = serializeMenuItem(ROW, [], false);
    expect(out).not.toHaveProperty('cost');
    expect(out.price).toBe(12);
  });

  it('includes cost for a privileged caller', () => {
    const out = serializeMenuItem(ROW, [], true);
    expect(out.cost).toBe(4.5);
  });

  it('normalises absent imagery to null, not undefined', () => {
    const out = serializeMenuItem(ROW, [], false);
    expect(out.imageUrl).toBeNull();
    expect(out.description).toBeNull();
  });

  it('maps only this item\'s inventory links', () => {
    const links = [
      { menu_item_id: 1, inventory_item_id: 7, quantity_used: '2' },
      { menu_item_id: 2, inventory_item_id: 9, quantity_used: '1' },
    ];
    const out = serializeMenuItem(ROW, links, false);
    expect(out.inventoryItems).toEqual([{ id: 7, quantity: 2 }]);
  });
});

describe('validateMenuPayload — imageUrl scheme', () => {
  const base = { name: 'X', price: 5 };

  it('rejects a javascript: URL', () => {
    expect(validateMenuPayload({ ...base, imageUrl: 'javascript:alert(1)' }))
      .toBe('imageUrl must use http or https');
  });

  it('rejects a data: URL', () => {
    expect(validateMenuPayload({ ...base, imageUrl: 'data:text/html;base64,PHA+' }))
      .toBe('imageUrl must use http or https');
  });

  it('rejects a string that is not a URL at all', () => {
    expect(validateMenuPayload({ ...base, imageUrl: 'not a url' }))
      .toBe('imageUrl must be a valid URL');
  });

  it('accepts an https URL', () => {
    expect(validateMenuPayload({ ...base, imageUrl: 'https://cdn.example.com/a.jpg' }))
      .toBeNull();
  });

  it('accepts an empty string as "no image"', () => {
    expect(validateMenuPayload({ ...base, imageUrl: '' })).toBeNull();
  });

  it('rejects a description over 280 characters', () => {
    expect(validateMenuPayload({ ...base, description: 'x'.repeat(281) }))
      .toBe('description must be a string of at most 280 characters');
  });

  it('accepts a description of exactly 280 characters', () => {
    expect(validateMenuPayload({ ...base, description: 'x'.repeat(280) })).toBeNull();
  });
});

const SIZE_GROUP = {
  id: 10, name: 'Pizza Size', minSelect: 1, maxSelect: 1, sortOrder: 0,
  choices: [
    { id: 100, groupId: 10, name: 'Medium', priceDelta: 0, enabled: true, isDefault: true, inventoryItemId: null, inventoryQty: null, sortOrder: 0 },
    { id: 101, groupId: 10, name: 'Large', priceDelta: 3, enabled: false, isDefault: false, inventoryItemId: null, inventoryQty: null, sortOrder: 1 },
  ],
};

describe('serializeMenuItem — options', () => {
  it('has no options and is not sold out by default', () => {
    const out = serializeMenuItem(ROW, [], false);
    expect(out.optionGroups).toEqual([]);
    expect(out.optionGroupIds).toEqual([]);
    expect(out.soldOut).toBe(false);
  });

  it('shows customers only available choices without stock fields', () => {
    const out = serializeMenuItem(ROW, [], false, { groups: [SIZE_GROUP] });
    expect(out.optionGroupIds).toEqual([10]);
    expect(out.optionGroups[0].choices).toEqual([
      { id: 100, name: 'Medium', priceDelta: 0, isDefault: true, available: true },
    ]);
  });

  it('shows managers every choice with raw switch and stock link', () => {
    const out = serializeMenuItem(ROW, [], true, { groups: [SIZE_GROUP] });
    expect(out.optionGroups[0].choices).toHaveLength(2);
    expect(out.optionGroups[0].choices[1]).toEqual({
      id: 101, name: 'Large', priceDelta: 3, isDefault: false, available: false,
      enabled: false, inventoryItemId: null, inventoryQty: null,
    });
  });

  it('is sold out when a recipe ingredient is short', () => {
    const links = [{ menu_item_id: 1, inventory_item_id: 7, quantity_used: '2' }];
    const out = serializeMenuItem(ROW, links, false, { stock: new Map([[7, 1]]) });
    expect(out.soldOut).toBe(true);
    expect(out.available).toBe(true);
  });

  it('serializeGroup keeps group limits', () => {
    expect(serializeGroup(SIZE_GROUP, new Map(), false)).toMatchObject({ id: 10, minSelect: 1, maxSelect: 1 });
  });
});

describe('validateMenuPayload — optionGroupIds', () => {
  const base = { name: 'X', price: 5 };
  it('accepts a list of ids', () => {
    expect(validateMenuPayload({ ...base, optionGroupIds: [1, 2] })).toBeNull();
  });
  it('rejects non-integer ids', () => {
    expect(validateMenuPayload({ ...base, optionGroupIds: ['a'] })).toBe('optionGroupIds must be an array of group ids');
  });
  it('rejects repeats', () => {
    expect(validateMenuPayload({ ...base, optionGroupIds: [1, 1] })).toBe('optionGroupIds must not repeat');
  });
});
