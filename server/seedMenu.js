// Menu refresh: renames the base and veggie pizzas, moves wings into their own
// category, hides items that left the menu, and adds the new pizzas, waffles,
// subs and pastries. Idempotent — each step checks the current rows first, so
// re-running it changes nothing. Hidden items are marked unavailable, never
// deleted. Runs in one transaction; pass --dry-run to roll it back and only
// print the plan. Run with `npm run seed:menu` after `node server/migrate.js`.
import { pathToFileURL } from 'node:url';
import { seedOptions, OPTION_GROUPS } from './seedOptions.js';

export const RENAMES = [
  { from: 'Pizza', to: 'Build Your Own Pizza' },
  { from: 'Veggie Pizza', to: 'Veggie Lovers Pizza' },
];

export const CATEGORY_MOVES = [{ name: 'Chicken Wings', category: 'Wings' }];

export const HIDDEN_ITEMS = [
  'Pizza', 'Veggie Pizza', // only if a rename was blocked by an existing row
  'Hawaiian Pizza', 'Original Waffle', 'Guava Waffle', 'Blueberry Waffle',
  'Caesar Salad', 'Cheeseburger', 'Pasta Carbonara', 'Grilled Salmon',
  'Tiramisu', 'Soda', 'Coffee',
];

// Placeholder prices — managers adjust them in Menu Management
export const NEW_ITEMS = [
  ...[
    ['Banana Waffle', 5.99], ['Birthday Cake Waffle', 5.99], ['Oreo Waffle', 5.99],
    ['Chocolate Chip Waffle', 5.99], ['Cotton Candy Waffle', 5.99],
  ].map(([name, price]) => ({ name, category: 'Waffles', price })),
  ...[
    ['Meatball Sub', 10.99], ['Chicken Parm Sub', 10.99], ['Philly Cheesesteak Sub', 11.99],
    ['Buffalo Chicken Sub', 10.99], ['Chicken Bacon Ranch Sub', 11.99], ['Veggie Pesto Sub', 9.99],
  ].map(([name, price]) => ({ name, category: 'Subs', price })),
  ...[
    ['Blueberry Muffin', 3.49], ['Chocolate Chip Muffin', 3.49], ['Apple Cinnamon Crumble Muffin', 3.49],
    ['Cherry Cheesecake', 5.99], ['Plain Cheesecake', 5.49],
    ['Chocolate Donut', 2.49], ['Glazed Donut', 2.29], ['Cinnamon Sugar Donut', 2.49], ['Oreo Donut', 2.99],
    ['Walnut Banana Bread', 3.99], ['Chocolate Chip Banana Bread', 3.99],
    ['Cinnamon Roll', 4.49], ['Oreo Cinnamon Roll', 4.99], ['Guava Cinnamon Roll', 4.99],
    ['Chocolate Chip Cookie', 2.49], ['Oatmeal Raisin Cookie', 2.49], ['Sugar Rush Cookie', 2.49],
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

// Pure: works out every change from the current menu and wing-flavor rows.
export function planMenuRefresh(menuRows, wingChoices) {
  const byName = new Map(menuRows.map((m) => [key(m.name), m]));
  const plan = { renames: [], moves: [], hides: [], creates: [], disableChoices: [] };

  for (const { from, to } of RENAMES) {
    const row = byName.get(key(from));
    if (row && !byName.has(key(to))) {
      plan.renames.push({ id: row.id, from: row.name, to });
      byName.delete(key(from));
      byName.set(key(to), { ...row, name: to });
    }
  }
  for (const { name, category } of CATEGORY_MOVES) {
    const row = byName.get(key(name));
    if (row && row.category !== category) plan.moves.push({ id: row.id, name: row.name, category });
  }
  for (const name of HIDDEN_ITEMS) {
    const row = byName.get(key(name));
    if (row && row.available) plan.hides.push({ id: row.id, name: row.name });
  }
  for (const item of NEW_ITEMS) {
    if (!byName.has(key(item.name))) plan.creates.push(item);
  }
  for (const choice of wingChoices) {
    if (choice.available && !WING_FLAVORS.has(key(choice.name))) {
      plan.disableChoices.push({ id: choice.id, name: choice.name });
    }
  }
  return plan;
}

const wingChoicesQuery = `
  SELECT c.id, c.name, c.available FROM option_choice c
  JOIN option_group g ON g.id = c.group_id WHERE g.name = 'Wing Flavor'`;

async function readPlan(conn) {
  const [menuRows] = await conn.query('SELECT id, name, category, available FROM menu_item');
  const [wingChoices] = await conn.query(wingChoicesQuery);
  return planMenuRefresh(menuRows, wingChoices);
}

export async function seedMenu(conn, log = console.log) {
  // Renames go first so seedOptions finds the renamed pizzas and adds no duplicates
  const first = await readPlan(conn);
  for (const { id, from, to } of first.renames) {
    await conn.query('UPDATE menu_item SET name = ? WHERE id = ?', [to, id]);
    log(`✔  Renamed ${from} → ${to}`);
  }

  // Adds the new wing flavors and the Sweet Heat / Supreme pizzas (with Pizza Size)
  await seedOptions(conn, log);

  // Plan again so rows seedOptions just created are hidden or kept correctly
  const plan = await readPlan(conn);
  for (const { id, name, category } of plan.moves) {
    await conn.query('UPDATE menu_item SET category = ? WHERE id = ?', [category, id]);
    log(`✔  Moved ${name} to ${category}`);
  }
  for (const { id, name } of plan.hides) {
    await conn.query('UPDATE menu_item SET available = FALSE WHERE id = ?', [id]);
    log(`✔  Hid ${name}`);
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
