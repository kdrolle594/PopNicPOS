import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/menu-items — list all with inventory recipe links
router.get('/', async (_req, res) => {
  try {
    const [items] = await pool.query('SELECT * FROM menu_item ORDER BY id');
    const [links] = await pool.query('SELECT * FROM menu_item_inventory');

    const result = items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      price: Number(item.price),
      cost: Number(item.cost),
      available: Boolean(item.available),
      isCombo: Boolean(item.is_combo),
      pointsValue: item.points_value,
      inventoryItems: links
        .filter((l) => l.menu_item_id === item.id)
        .map((l) => ({ id: l.inventory_item_id, quantity: Number(l.quantity_used) })),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/menu-items — create menu item + recipe links
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, category, price, cost, available, isCombo, pointsValue, inventoryItems } = req.body;

    const [result] = await conn.query(
      `INSERT INTO menu_item (name, category, price, cost, available, is_combo, points_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, category, price, cost, available ?? true, isCombo ?? false, pointsValue ?? 0]
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
      inventoryItems: inventoryItems || [],
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/menu-items/:id — update menu item + replace recipe links
router.put('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, category, price, cost, available, isCombo, pointsValue, inventoryItems } = req.body;

    await conn.query(
      `UPDATE menu_item SET name=?, category=?, price=?, cost=?, available=?, is_combo=?, points_value=?
       WHERE id=?`,
      [name, category, price, cost, available, isCombo, pointsValue, req.params.id]
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
      inventoryItems: inventoryItems || [],
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
