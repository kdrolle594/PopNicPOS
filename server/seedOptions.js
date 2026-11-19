// Non-destructive option seed: inserts missing option groups/choices, the three
// specialty pizzas, the grill and Mexican items with their recipes and the
// stock they use, and default attachments. Never updates or deletes rows, and
// skips any menu item that already has a group attached, so it is safe on the
// live database. Run with `npm run seed:options` after `node server/migrate.js`.
import { pathToFileURL } from 'node:url';

// Every pizza topping is a paid add-on. Managers change prices in Menu Management.
export const TOPPING_PRICES = {
  Pepperoni: 1.5, Ham: 1.5, Sausage: 1.5, Bacon: 1.5,
  Pineapple: 1, Mushrooms: 1, Onions: 1, 'Bell Peppers': 1,
  'Black Olives': 1, Tomatoes: 1, 'Extra Cheese': 1,
};

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
    choices: Object.entries(TOPPING_PRICES).map(([name, priceDelta]) => ({ name, priceDelta })),
  },
  {
    name: 'Wing Flavor', minSelect: 1, maxSelect: 1,
    choices: [
      { name: 'Buffalo', isDefault: true }, { name: 'Honey Mustard' }, { name: 'Original' },
      { name: 'BBQ' }, { name: 'Sweet and Spicy' },
    ],
  },
  {
    name: 'Protein', minSelect: 1, maxSelect: 1,
    choices: [
      { name: 'Chicken', isDefault: true, inventory: ['Chicken Breast', 0.25] },
      { name: 'Beef', inventory: ['Ground Beef', 0.25] },
      { name: 'Cheese only', priceDelta: -1 },
    ],
  },
  {
    // Paid extra ingredients customers can add. Managers attach this group to
    // more items and change prices in Menu Management.
    name: 'Extras', minSelect: 0, maxSelect: 6,
    choices: [
      { name: 'Extra cheese', priceDelta: 1, inventory: ['Cheddar Cheese', 0.1] },
      { name: 'Extra chicken', priceDelta: 2.5, inventory: ['Chicken Breast', 0.25] },
      { name: 'Bacon', priceDelta: 1.5, inventory: ['Bacon', 0.1] },
      { name: 'Extra corn', priceDelta: 1, inventory: ['Corn on the Cob', 1] },
      { name: 'Jalapeños', priceDelta: 0.75, inventory: ['Jalapeños', 0.05] },
      { name: 'Sour cream', priceDelta: 0.75, inventory: ['Sour Cream', 0.05] },
      { name: 'Guacamole', priceDelta: 1.5, inventory: ['Guacamole', 0.1] },
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

// Stock the new items and extras use. Added only when missing; staff set
// real quantities in Inventory.
export const NEW_INVENTORY = [
  { name: 'Chicken Breast', quantity: 30, unit: 'lbs', reorderLevel: 10, costPerUnit: 3.75 },
  { name: 'Corn on the Cob', quantity: 48, unit: 'pieces', reorderLevel: 18, costPerUnit: 0.6 },
  { name: 'Flour Tortillas', quantity: 100, unit: 'pieces', reorderLevel: 40, costPerUnit: 0.25 },
  { name: 'Tortilla Chips', quantity: 20, unit: 'lbs', reorderLevel: 8, costPerUnit: 2.75 },
  { name: 'Salsa', quantity: 10, unit: 'lbs', reorderLevel: 4, costPerUnit: 3.0 },
  { name: 'Sour Cream', quantity: 8, unit: 'lbs', reorderLevel: 3, costPerUnit: 3.25 },
  { name: 'Jalapeños', quantity: 6, unit: 'lbs', reorderLevel: 2, costPerUnit: 2.5 },
  { name: 'Guacamole', quantity: 8, unit: 'lbs', reorderLevel: 3, costPerUnit: 6.5 },
];

// Starter prices; managers change them in Menu Management.
export const NEW_MENU_ITEMS = [
  {
    name: 'Grill Chicken Plate', category: 'Grill', price: 12.99, cost: 4.25, pointsValue: 65,
    description: 'Grilled chicken with corn on the cob and a toasted bun.',
    recipe: [['Chicken Breast', 0.5], ['Corn on the Cob', 1], ['Burger Buns', 1]],
  },
  {
    name: 'Quesadilla', category: 'Mexican', price: 9.99, cost: 2.75, pointsValue: 50,
    description: 'Toasted flour tortilla with melted cheese and your choice of filling.',
    recipe: [['Flour Tortillas', 2], ['Cheddar Cheese', 0.15], ['Salsa', 0.05]],
  },
  {
    name: 'Nachos', category: 'Mexican', price: 8.99, cost: 2.5, pointsValue: 45,
    description: 'Tortilla chips with melted cheese, salsa and your choice of topping.',
    recipe: [['Tortilla Chips', 0.3], ['Cheddar Cheese', 0.15], ['Salsa', 0.1]],
  },
];

const SPECIALTY_NAMES = new Set(SPECIALTY_PIZZAS.map((p) => p.name.toLowerCase()));

export function planAttachments(menuItems, attachedItemIds) {
  const plan = [];
  for (const item of menuItems) {
    if (attachedItemIds.has(item.id)) continue;
    const name = item.name.toLowerCase();
    // Specialty pizzas come with their toppings; extra ones are paid.
    if (SPECIALTY_NAMES.has(name)) plan.push({ menuItemId: item.id, groups: ['Pizza Size', 'Toppings'] });
    else if (name.includes('pizza')) plan.push({ menuItemId: item.id, groups: ['Pizza Size', 'Toppings'] });
    else if (name.includes('wings')) plan.push({ menuItemId: item.id, groups: ['Wing Flavor'] });
    else if (name === 'soda') plan.push({ menuItemId: item.id, groups: ['Soda Flavor'] });
    else if (name === 'quesadilla' || name === 'nachos') plan.push({ menuItemId: item.id, groups: ['Protein', 'Extras'] });
    else if (name === 'grill chicken plate' || name === 'cheeseburger') plan.push({ menuItemId: item.id, groups: ['Extras'] });
  }
  return plan;
}

export async function seedOptions(db, log = console.log) {
  // 0. Stock used by the new items and extras
  const [invRows] = await db.query('SELECT id, name FROM inventory_item');
  const inventoryIds = new Map(invRows.map((r) => [r.name.toLowerCase(), r.id]));
  for (const inv of NEW_INVENTORY) {
    if (inventoryIds.has(inv.name.toLowerCase())) continue;
    const [r] = await db.query(
      `INSERT INTO inventory_item (name, quantity, unit, reorder_level, cost_per_unit)
       VALUES (?, ?, ?, ?, ?)`,
      [inv.name, inv.quantity, inv.unit, inv.reorderLevel, inv.costPerUnit]
    );
    inventoryIds.set(inv.name.toLowerCase(), r.insertId);
    log(`✔  Added ${inv.name} to inventory`);
  }
  const inventoryId = (name) => inventoryIds.get(name.toLowerCase()) ?? null;

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
      const [invName, invQty] = choice.inventory || [];
      const invId = invName ? inventoryId(invName) : null;
      await db.query(
        `INSERT INTO option_choice
           (group_id, name, price_delta, is_default, sort_order, inventory_item_id, inventory_qty)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [groupId, choice.name, choice.priceDelta ?? 0, Boolean(choice.isDefault), choiceIndex,
          invId, invId != null ? invQty : null]
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

  // 2b. Grill and Mexican items with their recipes
  for (const item of NEW_MENU_ITEMS) {
    if (menuRows.some((m) => m.name.toLowerCase() === item.name.toLowerCase())) continue;
    const [r] = await db.query(
      `INSERT INTO menu_item (name, category, price, cost, points_value, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item.name, item.category, item.price, item.cost, item.pointsValue, item.description]
    );
    const links = item.recipe
      .map(([name, qty]) => [r.insertId, inventoryId(name), qty])
      .filter(([, invId]) => invId != null);
    if (links.length) {
      await db.query(
        'INSERT INTO menu_item_inventory (menu_item_id, inventory_item_id, quantity_used) VALUES ?',
        [links]
      );
    }
    log(`✔  Created ${item.name} at ${item.price} — adjust its price in Menu Management`);
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
