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
      { menuItemId: 2, groups: ['Pizza Size', 'Toppings'] },
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

describe('new items and extras', () => {
  it('attaches Protein and Extras to the Mexican items and Extras to the grill plate and burger', () => {
    const items = [
      { id: 10, name: 'Quesadilla' },
      { id: 11, name: 'Nachos' },
      { id: 12, name: 'Grill Chicken Plate' },
      { id: 13, name: 'Cheeseburger' },
    ];
    expect(planAttachments(items, new Set())).toEqual([
      { menuItemId: 10, groups: ['Protein', 'Extras'] },
      { menuItemId: 11, groups: ['Protein', 'Extras'] },
      { menuItemId: 12, groups: ['Extras'] },
      { menuItemId: 13, groups: ['Extras'] },
    ]);
  });

  it('links every stocked choice and recipe line to known inventory', async () => {
    const { NEW_INVENTORY, NEW_MENU_ITEMS } = await import('../server/seedOptions.js');
    const known = new Set([
      ...NEW_INVENTORY.map((i) => i.name),
      'Cheddar Cheese', 'Bacon', 'Ground Beef', 'Burger Buns',
    ]);
    for (const g of OPTION_GROUPS) {
      for (const c of g.choices) if (c.inventory) expect(known.has(c.inventory[0])).toBe(true);
    }
    for (const item of NEW_MENU_ITEMS) {
      for (const [name] of item.recipe) expect(known.has(name)).toBe(true);
    }
  });

  it('prices extras as paid add-ons', () => {
    const extras = OPTION_GROUPS.find((g) => g.name === 'Extras');
    expect(extras.minSelect).toBe(0);
    for (const c of extras.choices) expect(c.priceDelta).toBeGreaterThan(0);
  });
});

describe('pizza toppings', () => {
  it('charges for every topping', () => {
    const toppings = OPTION_GROUPS.find((g) => g.name === 'Toppings');
    expect(toppings.choices.length).toBe(11);
    for (const c of toppings.choices) expect(c.priceDelta).toBeGreaterThan(0);
  });
});
