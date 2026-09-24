import { Router } from 'express';
import pool from '../db.js';

const router = Router();

export function validateMenuPayload({ name, price, cost, inventoryItems, imageUrl, description }) {
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required';
  if (!isFinite(Number(price)) || Number(price) < 0) return 'price must be a non-negative number';
  if (cost != null && (!isFinite(Number(cost)) || Number(cost) < 0)) return 'cost must be a non-negative number';
  if (inventoryItems != null) {
    if (!Array.isArray(inventoryItems)) return 'inventoryItems must be an array';
    for (const inv of inventoryItems) {
      if (!inv || !Number.isInteger(Number(inv.id)) || !isFinite(Number(inv.quantity)) || Number(inv.quantity) <= 0) {
        return 'each inventory link needs an id and a positive quantity';
      }
    }
  }
  if (imageUrl != null && imageUrl !== '') {
    if (typeof imageUrl !== 'string' || imageUrl.length > 512) {
      return 'imageUrl must be a string of at most 512 characters';
    }
    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return 'imageUrl must be a valid URL';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'imageUrl must use http or https';
    }
  }
  if (description != null && (typeof description !== 'string' || description.length > 280)) {
    return 'description must be a string of at most 280 characters';
  }
  return null;
}

// Exported for tests. Pure — no db, no req/res.
export function serializeMenuItem(item, links, isPrivileged) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    price: Number(item.price),
    // Margin data is staff-only — the storefront is a public surface.
    ...(isPrivileged ? { cost: Number(item.cost) } : {}),
    available: Boolean(item.available),
    isCombo: Boolean(item.is_combo),
    pointsValue: item.points_value,
    imageUrl: item.image_url || null,
    description: item.description || null,
    inventoryItems: links
      .filter((l) => l.menu_item_id === item.id)
      .map((l) => ({ id: l.inventory_item_id, quantity: Number(l.quantity_used) })),
  };
}

// GET /api/menu-items — list all with inventory recipe links
router.get('/', async (req, res) => {
  try {
    const [items] = await pool.query('SELECT * FROM menu_item ORDER BY id');
    const [links] = await pool.query('SELECT * FROM menu_item_inventory');

    const isPrivileged = !!req.user && ['manager', 'admin'].includes(req.user.role);
    const result = items.map((item) => serializeMenuItem(item, links, isPrivileged));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/menu-items — create menu item + recipe links
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, category, price, cost, available, isCombo, pointsValue, inventoryItems, imageUrl, description } = req.body;

    const invalid = validateMenuPayload(req.body);
    if (invalid) {
      await conn.rollback();
      return res.status(400).json({ error: invalid });
    }

    const [result] = await conn.query(
      `INSERT INTO menu_item (name, category, price, cost, available, is_combo, points_value, image_url, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, category, price, cost, available ?? true, isCombo ?? false, pointsValue ?? 0, imageUrl || null, description || null]
    );
    const menuId = result.insertId;

    if (Array.isArray(inventoryItems) && inventoryItems.length) {
      const values = inventoryItems.map((inv) => [menuId, inv.id, inv.quantity]);
      await conn.query(
        'INSERT INTO menu_item_inventory (menu_item_id, inventory_item_id, quantity_used) VALUES ?',
        [values]
      );
    }

    await conn.commit();

    res.status(201).json({
      id: menuId,
      name,
      category,
      price: Number(price),
      cost: Number(cost),
      available: available ?? true,
      isCombo: isCombo ?? false,
      pointsValue: pointsValue ?? 0,
      imageUrl: imageUrl || null,
      description: description || null,
      inventoryItems: inventoryItems || [],
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// PUT /api/menu-items/:id — update menu item + replace recipe links
router.put('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, category, price, cost, available, isCombo, pointsValue, inventoryItems, imageUrl, description } = req.body;

    const invalid = validateMenuPayload(req.body);
    if (invalid) {
      await conn.rollback();
      return res.status(400).json({ error: invalid });
    }

    await conn.query(
      `UPDATE menu_item SET name=?, category=?, price=?, cost=?, available=?, is_combo=?, points_value=?, image_url=?, description=?
       WHERE id=?`,
      [name, category, price, cost, available, isCombo, pointsValue, imageUrl || null, description || null, req.params.id]
    );

    // Replace inventory links
    await conn.query('DELETE FROM menu_item_inventory WHERE menu_item_id = ?', [req.params.id]);
    if (Array.isArray(inventoryItems) && inventoryItems.length) {
      const values = inventoryItems.map((inv) => [Number(req.params.id), inv.id, inv.quantity]);
      await conn.query(
        'INSERT INTO menu_item_inventory (menu_item_id, inventory_item_id, quantity_used) VALUES ?',
        [values]
      );
    }

    await conn.commit();

    res.json({
      id: Number(req.params.id),
      name,
      category,
      price: Number(price),
      cost: Number(cost),
      available: Boolean(available),
      isCombo: Boolean(isCombo),
      pointsValue: pointsValue ?? 0,
      imageUrl: imageUrl || null,
      description: description || null,
      inventoryItems: inventoryItems || [],
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// DELETE /api/menu-items/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM menu_item WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
