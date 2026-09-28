// Menu refresh: renames the base and veggie pizzas, moves wings into their own
// category, hides items that left the menu, deletes dropped items, and adds the
// new pizzas, flavored items (waffle, sub, donut, cookie) and pastries.
// Idempotent — each step checks the current rows first, so re-running it
// changes nothing. Runs in one transaction; pass --dry-run to roll it back and
// only print the plan. Run with `npm run seed:menu` after `node server/migrate.js`.
import { pathToFileURL } from 'node:url';
import { seedOptions, OPTION_GROUPS } from './seedOptions.js';

export const RENAMES = [
  { from: 'Pizza', to: 'Build Your Own Pizza' },
  { from: 'Veggie Pizza', to: 'Veggie Lovers Pizza' },
];

export const CATEGORY_MOVES = [{ name: 'Chicken Wings', category: 'Wings' }];

// Retired items with order history: marked unavailable so they can come back
export const HIDDEN_ITEMS = [
  'Pizza', 'Veggie Pizza', // only if a rename was blocked by an existing row
  'Hawaiian Pizza', 'Original Waffle', 'Chocolate Chip Waffle', 'Guava Waffle', 'Blueberry Waffle',
  'Caesar Salad', 'Cheeseburger', 'Pasta Carbonara', 'Grilled Salmon',
  'Tiramisu', 'Soda', 'Coffee',
  'Waffles', // hand-added generic item, replaced by Waffle
];

// On the menu list but switched off in the live database
export const SHOWN_ITEMS = ['Build Your Own Pizza'];

// Dropped from the menu for good. Order lines keep their snapshot name and
// price (order_item.menu_item_id is ON DELETE SET NULL). The single-flavor
// rows come from an earlier version of this script and are now flavor choices.
export const DELETED_ITEMS = [
  'Blueberry Muffin', 'Chocolate Chip Muffin', 'Apple Cinnamon Crumble Muffin',
  'Cherry Cheesecake', 'Plain Cheesecake',
  'Banana Waffle', 'Birthday Cake Waffle', 'Oreo Waffle', 'Cotton Candy Waffle',
  'Meatball Sub', 'Chicken Parm Sub', 'Philly Cheesesteak Sub',
  'Buffalo Chicken Sub', 'Chicken Bacon Ranch Sub', 'Veggie Pesto Sub',
  'Chocolate Donut', 'Glazed Donut', 'Cinnamon Sugar Donut', 'Oreo Donut',
  'Chocolate Chip Cookie', 'Oatmeal Raisin Cookie', 'Sugar Rush Cookie',
];

// One item per product, flavor picked from its option group (see seedOptions.js)
export const FLAVORED_ITEMS = [
  { name: 'Waffle', category: 'Waffles', price: 5.99, group: 'Waffle Flavor' },
  { name: 'Sub', category: 'Subs', price: 10.99, group: 'Sub Type' },
  { name: 'Donut', category: 'Pastry', price: 2.49, group: 'Donut Flavor' },
  { name: 'Cookie', category: 'Pastry', price: 2.49, group: 'Cookie Flavor' },
];

// Placeholder prices — managers adjust them in Menu Management
export const NEW_ITEMS = [
  ...FLAVORED_ITEMS.map(({ name, category, price }) => ({ name, category, price })),
  ...[
    ['Walnut Banana Bread', 3.99], ['Chocolate Chip Banana Bread', 3.99],
    ['Cinnamon Roll', 4.49], ['Oreo Cinnamon Roll', 4.99], ['Guava Cinnamon Roll', 4.99],
  ].map(([name, price]) => ({ name, category: 'Pastry', price })),
].map((item) => ({
  ...item,
  cost: Math.round(item.price * 0.35 * 100) / 100,
  pointsValue: Math.round(item.price * 5),
}));

const WING_FLAVORS = new Set(
  OPTION_GROUPS.find((g) => g.name === 'Wing Flavor').choices.map((c) => c.name.toLowerCase())
);

const key = (name) => name.toLowerCase();

// Pure: works out every change from the current menu rows, wing-flavor choices
// and item/group attachments ({ menu_item_id, group_name }).
export function planMenuRefresh(menuRows, wingChoices, attachments = []) {
  const byName = new Map(menuRows.map((m) => [key(m.name), m]));
  const plan = { renames: [], deletes: [], moves: [], hides: [], shows: [], creates: [], disableChoices: [], attaches: [] };

  for (const { from, to } of RENAMES) {
    const row = byName.get(key(from));
    if (row && !byName.has(key(to))) {
      plan.renames.push({ id: row.id, from: row.name, to });
      byName.delete(key(from));
      byName.set(key(to), { ...row, name: to });
    }
  }
  for (const name of DELETED_ITEMS) {
    const row = byName.get(key(name));
    if (row) plan.deletes.push({ id: row.id, name: row.name });
  }
  for (const { name, category } of CATEGORY_MOVES) {
    const row = byName.get(key(name));
    if (row && row.category !== category) plan.moves.push({ id: row.id, name: row.name, category });
  }
  for (const name of HIDDEN_ITEMS) {
    const row = byName.get(key(name));
    if (row && row.available) plan.hides.push({ id: row.id, name: row.name });
  }
  for (const name of SHOWN_ITEMS) {
    const row = byName.get(key(name));
    if (row && !row.available) plan.shows.push({ id: row.id, name: row.name });
  }
  for (const item of NEW_ITEMS) {
    if (!byName.has(key(item.name))) plan.creates.push(item);
  }
  for (const choice of wingChoices) {
    if (choice.available && !WING_FLAVORS.has(key(choice.name))) {
      plan.disableChoices.push({ id: choice.id, name: choice.name });
    }
  }
  const attached = new Set(attachments.map((a) => `${a.menu_item_id}:${a.group_name}`));
  for (const { name, group } of FLAVORED_ITEMS) {
    const row = byName.get(key(name));
    if (row && !attached.has(`${row.id}:${group}`)) plan.attaches.push({ id: row.id, name: row.name, group });
  }
  return plan;
}

const wingChoicesQuery = `
  SELECT c.id, c.name, c.available FROM option_choice c
  JOIN option_group g ON g.id = c.group_id WHERE g.name = 'Wing Flavor'`;

async function readPlan(conn) {
  const [menuRows] = await conn.query('SELECT id, name, category, available FROM menu_item');
  const [wingChoices] = await conn.query(wingChoicesQuery);
  const [attachments] = await conn.query(
    `SELECT a.menu_item_id, g.name AS group_name FROM menu_item_option_group a
     JOIN option_group g ON g.id = a.group_id`
  );
  return planMenuRefresh(menuRows, wingChoices, attachments);
}

export async function seedMenu(conn, log = console.log) {
  // Renames go first so seedOptions finds the renamed pizzas and adds no duplicates
  const first = await readPlan(conn);
  for (const { id, from, to } of first.renames) {
    await conn.query('UPDATE menu_item SET name = ? WHERE id = ?', [to, id]);
    log(`✔  Renamed ${from} → ${to}`);
  }

  // Adds the flavor groups and the Sweet Heat / Supreme pizzas (with Pizza Size)
  await seedOptions(conn, log);

  // Plan again so rows seedOptions just created are hidden or kept correctly
  const plan = await readPlan(conn);
  for (const { id, name } of plan.deletes) {
    await conn.query('DELETE FROM menu_item WHERE id = ?', [id]);
    log(`✔  Deleted ${name}`);
  }
  for (const { id, name, category } of plan.moves) {
    await conn.query('UPDATE menu_item SET category = ? WHERE id = ?', [category, id]);
    log(`✔  Moved ${name} to ${category}`);
  }
  for (const { id, name } of plan.hides) {
    await conn.query('UPDATE menu_item SET available = FALSE WHERE id = ?', [id]);
    log(`✔  Hid ${name}`);
  }
  for (const { id, name } of plan.shows) {
    await conn.query('UPDATE menu_item SET available = TRUE WHERE id = ?', [id]);
    log(`✔  Switched on ${name}`);
  }
  for (const { id, name } of plan.disableChoices) {
    await conn.query('UPDATE option_choice SET available = FALSE WHERE id = ?', [id]);
    log(`✔  Turned off wing flavor ${name}`);
  }
  for (const item of plan.creates) {
    await conn.query(
      'INSERT INTO menu_item (name, category, price, cost, points_value) VALUES (?, ?, ?, ?, ?)',
      [item.name, item.category, item.price, item.cost, item.pointsValue]
    );
    log(`✔  Added ${item.name} (${item.category}) at ${item.price.toFixed(2)}`);
  }

  // Flavor groups go on the flavored items once they exist
  const groupIds = new Map((await conn.query('SELECT id, name FROM option_group'))[0].map((g) => [g.name, g.id]));
  for (const { id, name, group } of (await readPlan(conn)).attaches) {
    await conn.query(
      'INSERT INTO menu_item_option_group (menu_item_id, group_id, sort_order) VALUES (?, ?, 0)',
      [id, groupIds.get(group)]
    );
    log(`✔  Attached ${group} to ${name}`);
  }
  log('✔  Menu refresh complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  const { default: pool } = await import('./db.js');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await seedMenu(conn);
    if (dryRun) {
      await conn.rollback();
      console.log('Dry run — rolled back, nothing was saved.');
    } else {
      await conn.commit();
      const { emitMenuChanged } = await import('./realtime.js');
      await emitMenuChanged();
    }
  } catch (err) {
    await conn.rollback();
    console.error('Menu refresh failed:', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}
