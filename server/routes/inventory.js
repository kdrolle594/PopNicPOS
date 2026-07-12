import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/inventory-items
router.get('/', async (_req, res) => {
  try {
    const [items] = await pool.query('SELECT * FROM inventory_item ORDER BY id');
    const result = items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: Number(item.quantity),
      unit: item.unit,
      reorderLevel: Number(item.reorder_level),
      costPerUnit: Number(item.cost_per_unit),
      lastUpdated: item.last_updated,
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function validateInventoryPayload({ name, quantity, reorderLevel, costPerUnit }) {
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required';
  for (const [label, v] of [['quantity', quantity], ['reorderLevel', reorderLevel], ['costPerUnit', costPerUnit]]) {
    if (v != null && (!isFinite(Number(v)) || Number(v) < 0)) return `${label} must be a non-negative number`;
  }
  return null;
}

// POST /api/inventory-items — create new inventory item
router.post('/', async (req, res) => {
  try {
    const { name, quantity, unit, reorderLevel, costPerUnit } = req.body;
    const invalid = validateInventoryPayload(req.body);
    if (invalid) return res.status(400).json({ error: invalid });
    const [result] = await pool.query(
      `INSERT INTO inventory_item (name, quantity, unit, reorder_level, cost_per_unit)
       VALUES (?, ?, ?, ?, ?)`,
      [name, quantity || 0, unit, reorderLevel || 0, costPerUnit || 0]
    );
    res.status(201).json({
      id: result.insertId,
      name,
      quantity: Number(quantity) || 0,
      unit,
      reorderLevel: Number(reorderLevel) || 0,
      costPerUnit: Number(costPerUnit) || 0,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/inventory-items/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, quantity, unit, reorderLevel, costPerUnit } = req.body;
    const invalid = validateInventoryPayload(req.body);
    if (invalid) return res.status(400).json({ error: invalid });
    await pool.query(
      `UPDATE inventory_item
       SET name=?, quantity=?, unit=?, reorder_level=?, cost_per_unit=?, last_updated=NOW()
       WHERE id=?`,
      [name, quantity, unit, reorderLevel, costPerUnit, req.params.id]
    );
    res.json({
      id: Number(req.params.id),
      name,
      quantity: Number(quantity),
      unit,
      reorderLevel: Number(reorderLevel),
      costPerUnit: Number(costPerUnit),
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/inventory-items/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM inventory_item WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
