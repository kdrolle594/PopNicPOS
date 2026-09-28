import { describe, it, expect } from 'vitest';
import { planMenuRefresh, NEW_ITEMS, FLAVORED_ITEMS } from '../server/seedMenu.js';
import { OPTION_GROUPS } from '../server/seedOptions.js';

const MENU = [
  { id: 1, name: 'Pizza', category: 'Pizza', available: 1 },
  { id: 2, name: 'Veggie Pizza', category: 'Pizza', available: 1 },
  { id: 3, name: 'Hawaiian Pizza', category: 'Pizza', available: 1 },
  { id: 4, name: 'Chicken Wings', category: 'Appetizers', available: 1 },
  { id: 5, name: 'Chocolate Chip Waffle', category: 'Waffles', available: 1 },
  { id: 6, name: 'Soda', category: 'Beverages', available: 0 },
  { id: 8, name: 'Oreo Waffle', category: 'Waffles', available: 1 },
  { id: 9, name: 'Plain Cheesecake', category: 'Pastry', available: 1 },
];

const WINGS = [
  { id: 10, name: 'Buffalo', available: 1 },
  { id: 11, name: 'BBQ', available: 1 },
  { id: 12, name: 'Original', available: 0 },
  { id: 13, name: 'Sweet Chili', available: 1 },
];

describe('planMenuRefresh', () => {
  const plan = planMenuRefresh(MENU, WINGS);

  it('renames the base and veggie pizzas', () => {
    expect(plan.renames).toEqual([
      { id: 1, from: 'Pizza', to: 'Build Your Own Pizza' },
      { id: 2, from: 'Veggie Pizza', to: 'Veggie Lovers Pizza' },
    ]);
  });

  it('moves wings into their own category', () => {
    expect(plan.moves).toEqual([{ id: 4, name: 'Chicken Wings', category: 'Wings' }]);
  });

  it('hides retired items that are still available, not renamed ones', () => {
    expect(plan.hides).toEqual([
      { id: 3, name: 'Hawaiian Pizza' },
      { id: 5, name: 'Chocolate Chip Waffle' },
    ]);
  });

  it('deletes muffins, cheesecakes and single-flavor items', () => {
    expect(plan.deletes).toEqual([
      { id: 9, name: 'Plain Cheesecake' },
      { id: 8, name: 'Oreo Waffle' },
    ]);
  });

  it('creates only items that do not exist yet', () => {
    expect(plan.creates.map((i) => i.name)).toEqual(NEW_ITEMS.map((i) => i.name));
    expect(planMenuRefresh([{ id: 20, name: 'Waffle', available: 1 }], []).creates)
      .toHaveLength(NEW_ITEMS.length - 1);
  });

  it('never creates an item it also deletes or hides', () => {
    const names = new Set(NEW_ITEMS.map((i) => i.name.toLowerCase()));
    for (const { name } of [...plan.deletes, ...plan.hides]) {
      expect(names.has(name.toLowerCase())).toBe(false);
    }
  });

  it('attaches each flavored item to a group the option seed defines', () => {
    const groups = new Set(OPTION_GROUPS.map((g) => g.name));
    for (const { group } of FLAVORED_ITEMS) expect(groups.has(group)).toBe(true);
    const rows = [{ id: 30, name: 'Sub', available: 1 }, { id: 31, name: 'Cookie', available: 1 }];
    expect(planMenuRefresh(rows, [], [{ menu_item_id: 31, group_name: 'Cookie Flavor' }]).attaches)
      .toEqual([{ id: 30, name: 'Sub', group: 'Sub Type' }]);
  });

  it('turns off wing flavors that left the menu', () => {
    expect(plan.disableChoices).toEqual([{ id: 11, name: 'BBQ' }]);
  });

  it('hides the old row when the new name already exists', () => {
    const blocked = planMenuRefresh(
      [...MENU, { id: 7, name: 'Veggie Lovers Pizza', category: 'Pizza', available: 1 }],
      []
    );
    expect(blocked.renames.map((r) => r.from)).toEqual(['Pizza']);
    expect(blocked.hides).toContainEqual({ id: 2, name: 'Veggie Pizza' });
  });

  it('plans nothing once the refresh has run', () => {
    const after = [
      { id: 1, name: 'Build Your Own Pizza', category: 'Pizza', available: 1 },
      { id: 4, name: 'Chicken Wings', category: 'Wings', available: 1 },
      { id: 3, name: 'Hawaiian Pizza', category: 'Pizza', available: 0 },
      ...NEW_ITEMS.map((item, i) => ({ id: 100 + i, ...item, available: 1 })),
    ];
    const attachments = FLAVORED_ITEMS.map(({ name, group }) => ({
      menu_item_id: 100 + NEW_ITEMS.findIndex((i) => i.name === name), group_name: group,
    }));
    expect(planMenuRefresh(after, [], attachments)).toEqual({
      renames: [], deletes: [], moves: [], hides: [], creates: [], disableChoices: [], attaches: [],
    });
  });
});
