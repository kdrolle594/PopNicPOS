import { describe, it, expect } from 'vitest';
import { planAttachments, OPTION_GROUPS } from '../server/seedOptions.js';

const ITEMS = [
  { id: 1, name: 'Pizza' },
  { id: 2, name: 'Hawaiian Pizza' },
  { id: 3, name: 'Chicken Wings' },
  { id: 4, name: 'Soda' },
  { id: 5, name: 'Soda Bread' },
  { id: 6, name: 'Coffee' },
];

describe('planAttachments', () => {
  it('attaches the right groups by name', () => {
    expect(planAttachments(ITEMS, new Set())).toEqual([
      { menuItemId: 1, groups: ['Pizza Size', 'Toppings'] },
      { menuItemId: 2, groups: ['Pizza Size'] },
      { menuItemId: 3, groups: ['Wing Flavor'] },
      { menuItemId: 4, groups: ['Soda Flavor'] },
    ]);
  });
  it('skips items that already have groups', () => {
    expect(planAttachments(ITEMS, new Set([1, 2, 3, 4]))).toEqual([]);
  });
  it('only plans groups that the seed defines', () => {
    const names = new Set(OPTION_GROUPS.map((g) => g.name));
    for (const { groups } of planAttachments(ITEMS, new Set())) {
      for (const g of groups) expect(names.has(g)).toBe(true);
    }
  });
});
