import { describe, it, expect } from 'vitest';
import { serializeMenuItem, validateMenuPayload } from '../server/routes/menu.js';

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
