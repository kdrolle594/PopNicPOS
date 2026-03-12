import pool from './db.js';

// ── Default data (matches the original localStorage seed) ──────────────────────

const INVENTORY_ITEMS = [
  // ── Original 8 ────────────────────────────────────────────────────────────
  { name: 'Mozzarella Cheese', quantity: 50, unit: 'lbs', reorderLevel: 20, costPerUnit: 4.5 },
  { name: 'Tomato Sauce', quantity: 30, unit: 'cans', reorderLevel: 15, costPerUnit: 3.25 },
  { name: 'Flour', quantity: 100, unit: 'lbs', reorderLevel: 40, costPerUnit: 1.2 },
  { name: 'Ground Beef', quantity: 25, unit: 'lbs', reorderLevel: 10, costPerUnit: 6.75 },
  { name: 'Lettuce', quantity: 15, unit: 'heads', reorderLevel: 8, costPerUnit: 2.0 },
  { name: 'Salmon Fillet', quantity: 12, unit: 'lbs', reorderLevel: 5, costPerUnit: 15.0 },
  { name: 'Pasta', quantity: 40, unit: 'lbs', reorderLevel: 15, costPerUnit: 2.5 },
  { name: 'Coffee Beans', quantity: 8, unit: 'lbs', reorderLevel: 5, costPerUnit: 12.0 },
  // ── New items for full recipe coverage ────────────────────────────────────
  { name: 'Parmesan Cheese', quantity: 20, unit: 'lbs', reorderLevel: 8, costPerUnit: 9.0 },
  { name: 'Croutons', quantity: 30, unit: 'bags', reorderLevel: 10, costPerUnit: 2.5 },
  { name: 'Caesar Dressing', quantity: 15, unit: 'bottles', reorderLevel: 6, costPerUnit: 4.0 },
  { name: 'Burger Buns', quantity: 60, unit: 'pieces', reorderLevel: 24, costPerUnit: 0.65 },
  { name: 'Cheddar Cheese', quantity: 20, unit: 'lbs', reorderLevel: 8, costPerUnit: 5.5 },
  { name: 'Eggs', quantity: 120, unit: 'pieces', reorderLevel: 48, costPerUnit: 0.35 },
  { name: 'Bacon', quantity: 15, unit: 'lbs', reorderLevel: 6, costPerUnit: 8.0 },
  { name: 'Lemon', quantity: 30, unit: 'pieces', reorderLevel: 12, costPerUnit: 0.5 },
  { name: 'Butter', quantity: 20, unit: 'lbs', reorderLevel: 8, costPerUnit: 4.5 },
  { name: 'Asparagus', quantity: 10, unit: 'bunches', reorderLevel: 4, costPerUnit: 3.75 },
  { name: 'Soda Cans', quantity: 96, unit: 'cans', reorderLevel: 36, costPerUnit: 0.45 },
  { name: 'Milk', quantity: 15, unit: 'gallons', reorderLevel: 6, costPerUnit: 3.75 },
  { name: 'Sugar', quantity: 25, unit: 'lbs', reorderLevel: 10, costPerUnit: 1.0 },
  { name: 'Mascarpone', quantity: 10, unit: 'lbs', reorderLevel: 4, costPerUnit: 7.5 },
  { name: 'Ladyfingers', quantity: 20, unit: 'packs', reorderLevel: 8, costPerUnit: 3.0 },
  { name: 'Cocoa Powder', quantity: 10, unit: 'lbs', reorderLevel: 4, costPerUnit: 5.0 },
  { name: 'Chicken Wings', quantity: 30, unit: 'lbs', reorderLevel: 12, costPerUnit: 4.25 },
  { name: 'Hot Sauce', quantity: 12, unit: 'bottles', reorderLevel: 5, costPerUnit: 3.5 },
  { name: 'Maple Syrup', quantity: 10, unit: 'bottles', reorderLevel: 4, costPerUnit: 6.0 },
  // ── Waffle flavor ingredients ────────────────────────────────────────────
  { name: 'Chocolate Chips', quantity: 15, unit: 'lbs', reorderLevel: 6, costPerUnit: 5.5 },
  { name: 'Guava Puree', quantity: 10, unit: 'bottles', reorderLevel: 4, costPerUnit: 6.25 },
  { name: 'Blueberries', quantity: 12, unit: 'lbs', reorderLevel: 5, costPerUnit: 7.0 },
];

const MENU_ITEMS = [
  { name: 'Pizza', category: 'Pizza', price: 14.99, cost: 5.25, pointsValue: 70 },
  { name: 'Caesar Salad', category: 'Salads', price: 8.99, cost: 3.0, pointsValue: 45 },
  { name: 'Cheeseburger', category: 'Burgers', price: 11.99, cost: 4.75, pointsValue: 55 },
  { name: 'Pasta Carbonara', category: 'Pasta', price: 13.99, cost: 4.25, pointsValue: 65 },
  { name: 'Grilled Salmon', category: 'Seafood', price: 18.99, cost: 8.5, pointsValue: 95 },
  { name: 'Soda', category: 'Beverages', price: 1.0, cost: 0.75, pointsValue: 15 },
  { name: 'Coffee', category: 'Beverages', price: 3.49, cost: 0.5, pointsValue: 18 },
  { name: 'Tiramisu', category: 'Desserts', price: 6.99, cost: 2.25, pointsValue: 35 },
  { name: 'Chicken Wings', category: 'Appetizers', price: 9.99, cost: 3.75, pointsValue: 50 },
  { name: 'Original Waffle', category: 'Waffles', price: 5.0, cost: 2.0, pointsValue: 50 },
  { name: 'Chocolate Chip Waffle', category: 'Waffles', price: 5.99, cost: 2.4, pointsValue: 55 },
  { name: 'Guava Waffle', category: 'Waffles', price: 5.99, cost: 2.5, pointsValue: 55 },
  { name: 'Blueberry Waffle', category: 'Waffles', price: 5.99, cost: 2.5, pointsValue: 55 },
];

// Recipe links: which inventory items each menu item uses
const RECIPES = {
  Pizza: [
    { inventoryName: 'Mozzarella Cheese', quantity: 0.25 },
    { inventoryName: 'Tomato Sauce', quantity: 0.2 },
    { inventoryName: 'Flour', quantity: 0.3 },
  ],
  'Caesar Salad': [
    { inventoryName: 'Lettuce', quantity: 0.5 },
    { inventoryName: 'Parmesan Cheese', quantity: 0.05 },
    { inventoryName: 'Croutons', quantity: 0.1 },
    { inventoryName: 'Caesar Dressing', quantity: 0.08 },
  ],
  Cheeseburger: [
    { inventoryName: 'Ground Beef', quantity: 0.35 },
    { inventoryName: 'Burger Buns', quantity: 1 },
    { inventoryName: 'Cheddar Cheese', quantity: 0.1 },
    { inventoryName: 'Lettuce', quantity: 0.1 },
  ],
  'Pasta Carbonara': [
    { inventoryName: 'Pasta', quantity: 0.3 },
    { inventoryName: 'Eggs', quantity: 2 },
    { inventoryName: 'Parmesan Cheese', quantity: 0.06 },
    { inventoryName: 'Bacon', quantity: 0.15 },
  ],
  'Grilled Salmon': [
    { inventoryName: 'Salmon Fillet', quantity: 0.5 },
    { inventoryName: 'Lemon', quantity: 0.5 },
    { inventoryName: 'Butter', quantity: 0.05 },
    { inventoryName: 'Asparagus', quantity: 0.25 },
  ],
  Soda: [
    { inventoryName: 'Soda Cans', quantity: 1 },
  ],
  Coffee: [
    { inventoryName: 'Coffee Beans', quantity: 0.06 },
    { inventoryName: 'Milk', quantity: 0.03 },
    { inventoryName: 'Sugar', quantity: 0.02 },
  ],
  Tiramisu: [
    { inventoryName: 'Mascarpone', quantity: 0.15 },
    { inventoryName: 'Ladyfingers', quantity: 0.25 },
    { inventoryName: 'Cocoa Powder', quantity: 0.02 },
    { inventoryName: 'Eggs', quantity: 1 },
    { inventoryName: 'Coffee Beans', quantity: 0.02 },
  ],
  'Chicken Wings': [
    { inventoryName: 'Chicken Wings', quantity: 0.5 },
    { inventoryName: 'Flour', quantity: 0.15 },
    { inventoryName: 'Hot Sauce', quantity: 0.05 },
    { inventoryName: 'Butter', quantity: 0.04 },
  ],
  Waffles: [
    { inventoryName: 'Flour', quantity: 0.3 },
    { inventoryName: 'Eggs', quantity: 2 },
    { inventoryName: 'Butter', quantity: 0.06 },
    { inventoryName: 'Maple Syrup', quantity: 0.1 },
  ],
  'Original Waffle': [
    { inventoryName: 'Flour', quantity: 0.3 },
    { inventoryName: 'Eggs', quantity: 2 },
    { inventoryName: 'Butter', quantity: 0.06 },
    { inventoryName: 'Maple Syrup', quantity: 0.1 },
  ],
  'Chocolate Chip Waffle': [
    { inventoryName: 'Flour', quantity: 0.3 },
    { inventoryName: 'Eggs', quantity: 2 },
    { inventoryName: 'Butter', quantity: 0.06 },
    { inventoryName: 'Maple Syrup', quantity: 0.1 },
    { inventoryName: 'Chocolate Chips', quantity: 0.1 },
  ],
  'Guava Waffle': [
    { inventoryName: 'Flour', quantity: 0.3 },
    { inventoryName: 'Eggs', quantity: 2 },
    { inventoryName: 'Butter', quantity: 0.06 },
    { inventoryName: 'Maple Syrup', quantity: 0.1 },
    { inventoryName: 'Guava Puree', quantity: 0.08 },
  ],
  'Blueberry Waffle': [
    { inventoryName: 'Flour', quantity: 0.3 },
    { inventoryName: 'Eggs', quantity: 2 },
    { inventoryName: 'Butter', quantity: 0.06 },
    { inventoryName: 'Maple Syrup', quantity: 0.1 },
    { inventoryName: 'Blueberries', quantity: 0.12 },
  ],
};

// ── Seed function ──────────────────────────────────────────────────────────────

async function seed() {
  // Skip if data already exists
  const [menuCheck] = await pool.query('SELECT COUNT(*) AS cnt FROM menu_item');
  if (menuCheck[0].cnt > 0) {
    console.log('Database already has menu data — skipping seed.');
    await pool.end();
    return;
  }

  console.log('Seeding database...');

  // 1) Inventory items
  for (const item of INVENTORY_ITEMS) {
    await pool.query(
      `INSERT INTO inventory_item (name, quantity, unit, reorder_level, cost_per_unit)
       VALUES (?, ?, ?, ?, ?)`,
      [item.name, item.quantity, item.unit, item.reorderLevel, item.costPerUnit]
    );
  }
  console.log(`✔  Inserted ${INVENTORY_ITEMS.length} inventory items`);

  // 2) Menu items
  for (const item of MENU_ITEMS) {
    await pool.query(
      `INSERT INTO menu_item (name, category, price, cost, points_value)
       VALUES (?, ?, ?, ?, ?)`,
      [item.name, item.category, item.price, item.cost, item.pointsValue]
    );
  }
  console.log(`✔  Inserted ${MENU_ITEMS.length} menu items`);

  // 3) Recipe links (menu_item_inventory)
  const [menuRows] = await pool.query('SELECT id, name FROM menu_item');
  const [invRows] = await pool.query('SELECT id, name FROM inventory_item');
  const menuMap = new Map(menuRows.map((r) => [r.name, r.id]));
  const invMap = new Map(invRows.map((r) => [r.name, r.id]));

  let linkCount = 0;
  for (const [menuName, ingredients] of Object.entries(RECIPES)) {
    const menuId = menuMap.get(menuName);
    if (!menuId) continue;

    for (const ing of ingredients) {
      const invId = invMap.get(ing.inventoryName);
      if (!invId) continue;

      await pool.query(
        `INSERT INTO menu_item_inventory (menu_item_id, inventory_item_id, quantity_used)
         VALUES (?, ?, ?)`,
        [menuId, invId, ing.quantity]
      );
      linkCount++;
    }
  }
  console.log(`✔  Inserted ${linkCount} recipe links`);

  console.log('✔  Seed complete!');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
