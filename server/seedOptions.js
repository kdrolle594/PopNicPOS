// Non-destructive option seed: inserts missing option groups/choices, the three
// specialty pizzas, and default attachments. Never updates or deletes rows, and
// skips any menu item that already has a group attached, so it is safe on the
// live database. Run with `npm run seed:options` after `node server/migrate.js`.
import { pathToFileURL } from 'node:url';

export const OPTION_GROUPS = [
  {
    name: 'Pizza Size', minSelect: 1, maxSelect: 1,
    choices: [
      { name: 'Personal Pan', priceDelta: -2 },
      { name: 'Medium', priceDelta: 0, isDefault: true },
      { name: 'Large', priceDelta: 3 },
    ],
  },
  {
    name: 'Toppings', minSelect: 0, maxSelect: 11,
    choices: [
      'Pepperoni', 'Ham', 'Sausage', 'Bacon', 'Pineapple', 'Mushrooms',
      'Onions', 'Bell Peppers', 'Black Olives', 'Tomatoes', 'Extra Cheese',
    ].map((name) => ({ name, priceDelta: 0 })),
  },
  {
    name: 'Wing Flavor', minSelect: 1, maxSelect: 1,
    choices: [
      { name: 'Buffalo', isDefault: true }, { name: 'Honey Mustard' }, { name: 'Original' },
      { name: 'BBQ' }, { name: 'Sweet and Spicy' },
    ],
  },
  {
    name: 'Soda Flavor', minSelect: 1, maxSelect: 1,
    choices: [
      { name: 'Coke', isDefault: true }, { name: 'Sprite' }, { name: 'Root Beer' },
      { name: 'Orange Soda' }, { name: 'Grape Soda' },
    ],
  },
];

export const SPECIALTY_PIZZAS = [
  { name: 'Hawaiian Pizza', description: 'Ham and pineapple.' },
  { name: 'Meat Lovers Pizza', description: 'Pepperoni, sausage, bacon and ham.' },
  { name: 'Veggie Pizza', description: 'Mushrooms, onions, bell peppers, black olives and tomatoes.' },
];

const SPECIALTY_NAMES = new Set(SPECIALTY_PIZZAS.map((p) => p.name.toLowerCase()));

export function planAttachments(menuItems, attachedItemIds) {
  const plan = [];
  for (const item of menuItems) {
    if (attachedItemIds.has(item.id)) continue;
    const name = item.name.toLowerCase();
    if (SPECIALTY_NAMES.has(name)) plan.push({ menuItemId: item.id, groups: ['Pizza Size'] });
    else if (name.includes('pizza')) plan.push({ menuItemId: item.id, groups: ['Pizza Size', 'Toppings'] });
    else if (name.includes('wings')) plan.push({ menuItemId: item.id, groups: ['Wing Flavor'] });
    else if (name === 'soda') plan.push({ menuItemId: item.id, groups: ['Soda Flavor'] });
  }
  return plan;
}

export async function seedOptions(db, log = console.log) {
  // 1. Groups and choices
  for (const [groupIndex, group] of OPTION_GROUPS.entries()) {
    const [[existingGroup]] = await db.query('SELECT id FROM option_group WHERE name = ?', [group.name]);
    let groupId = existingGroup?.id;
    if (!groupId) {
      const [r] = await db.query(
        'INSERT INTO option_group (name, min_select, max_select, sort_order) VALUES (?, ?, ?, ?)',
        [group.name, group.minSelect, group.maxSelect, groupIndex]
      );
      groupId = r.insertId;
      log(`✔  Created option group ${group.name}`);
    }
    for (const [choiceIndex, choice] of group.choices.entries()) {
      const [[existingChoice]] = await db.query(
        'SELECT id FROM option_choice WHERE group_id = ? AND name = ?',
        [groupId, choice.name]
      );
      if (existingChoice) continue;
      await db.query(
        'INSERT INTO option_choice (group_id, name, price_delta, is_default, sort_order) VALUES (?, ?, ?, ?, ?)',
        [groupId, choice.name, choice.priceDelta ?? 0, Boolean(choice.isDefault), choiceIndex]
      );
      log(`✔  Added ${choice.name} to ${group.name}`);
    }
  }

  // 2. Specialty pizzas, priced like the build-your-own pizza (managers adjust)
  const [menuRows] = await db.query('SELECT id, name, category, price, cost, points_value FROM menu_item');
  const base = menuRows.find(
    (m) => m.name.toLowerCase().includes('pizza') && !SPECIALTY_NAMES.has(m.name.toLowerCase())
  );
  if (!base) {
    log('⚠  No build-your-own pizza item found — skipping specialty pizzas');
  } else {
    for (const pizza of SPECIALTY_PIZZAS) {
      if (menuRows.some((m) => m.name.toLowerCase() === pizza.name.toLowerCase())) continue;
      await db.query(
        `INSERT INTO menu_item (name, category, price, cost, points_value, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [pizza.name, base.category, base.price, base.cost, base.points_value, pizza.description]
      );
      log(`✔  Created ${pizza.name} at ${base.price} — adjust its price and recipe in Menu Management`);
    }
  }

  // 3. Attachments for items that have none yet
  const [items] = await db.query('SELECT id, name FROM menu_item');
  const [attached] = await db.query('SELECT DISTINCT menu_item_id FROM menu_item_option_group');
  const [groups] = await db.query('SELECT id, name FROM option_group');
  const groupIds = new Map(groups.map((g) => [g.name, g.id]));
  const plan = planAttachments(items, new Set(attached.map((r) => r.menu_item_id)));
  for (const { menuItemId, groups: names } of plan) {
    const values = names.map((name, i) => [menuItemId, groupIds.get(name), i]);
    await db.query('INSERT INTO menu_item_option_group (menu_item_id, group_id, sort_order) VALUES ?', [values]);
    log(`✔  Attached ${names.join(' + ')} to ${items.find((i) => i.id === menuItemId).name}`);
  }
  log('✔  Option seed complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: pool } = await import('./db.js');
  seedOptions(pool)
    .then(() => pool.end())
    .catch((err) => {
      console.error('Option seed failed:', err);
      process.exit(1);
    });
}
