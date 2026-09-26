import { Router } from 'express';
import pool from '../db.js';
import { emitMenuChanged } from '../realtime.js';
import { isChoiceAvailable, isItemSoldOut } from '../lib/availability.js';
import { loadOptionData, loadStock, groupsForItem } from '../lib/optionData.js';

const router = Router();

export function validateMenuPayload({ name, price, cost, inventoryItems, imageUrl, description, optionGroupIds }) {
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
  if (optionGroupIds != null) {
    if (!Array.isArray(optionGroupIds) || !optionGroupIds.every((id) => Number.isInteger(id) && id > 0)) {
      return 'optionGroupIds must be an array of group ids';
    }
    if (new Set(optionGroupIds).size !== optionGroupIds.length) return 'optionGroupIds must not repeat';
  }
  return null;
}

// Exported for tests. Pure — no db, no req/res.
export function serializeGroup(group, stock, isPrivileged) {
  const choices = group.choices
    .map((c) => ({ c, available: isChoiceAvailable(c, stock) }))
    .filter(({ available }) => isPrivileged || available)
    .map(({ c, available }) => ({
      id: c.id,
      name: c.name,
      priceDelta: c.priceDelta,
      isDefault: c.isDefault,
      available,
      ...(isPrivileged
        ? { enabled: c.enabled, inventoryItemId: c.inventoryItemId, inventoryQty: c.inventoryQty }
        : {}),
    }));
  return { id: group.id, name: group.name, minSelect: group.minSelect, maxSelect: group.maxSelect, choices };
}

// Exported for tests. Pure — no db, no req/res.
export function serializeMenuItem(item, links, isPrivileged, { groups = [], stock = new Map() } = {}) {
  const inventoryItems = links
    .filter((l) => l.menu_item_id === item.id)
    .map((l) => ({ id: l.inventory_item_id, quantity: Number(l.quantity_used) }));
  const soldOut = isItemSoldOut({
    available: Boolean(item.available),
    recipe: inventoryItems.map((l) => ({ inventoryItemId: l.id, quantity: l.quantity })),
    groups,
  }, stock);

  return {
    id: item.id,
    name: item.name,
    category: item.category,
    price: Number(item.price),
    // Margin data is staff-only — the storefront is a public surface.
    ...(isPrivileged ? { cost: Number(item.cost) } : {}),
    available: Boolean(item.available),
    soldOut,
    isCombo: Boolean(item.is_combo),
    pointsValue: item.points_value,
    imageUrl: item.image_url || null,
    description: item.description || null,
    inventoryItems,
    optionGroupIds: groups.map((g) => g.id),
    optionGroups: groups.map((g) => serializeGroup(g, stock, isPrivileged)),
  };
}

// GET /api/menu-items — list all with inventory recipe links
router.get('/', async (req, res) => {
  try {
    const [items] = await pool.query('SELECT * FROM menu_item ORDER BY id');
    const [links] = await pool.query('SELECT * FROM menu_item_inventory');
    const optionData = await loadOptionData(pool);
    const stock = await loadStock(pool);

    const isPrivileged = !!req.user && ['manager', 'admin'].includes(req.user.role);
    const result = items.map((item) =>
      serializeMenuItem(item, links, isPrivileged, { groups: groupsForItem(item.id, optionData), stock })
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Replaces an item's attached option groups. Returns false if any id is unknown.
async function replaceOptionGroups(conn, menuId, optionGroupIds) {
  await conn.query('DELETE FROM menu_item_option_group WHERE menu_item_id = ?', [menuId]);
  if (!optionGroupIds.length) return true;
  const [found] = await conn.query('SELECT id FROM option_group WHERE id IN (?)', [optionGroupIds]);
  if (found.length !== optionGroupIds.length) return false;
  await conn.query(
    'INSERT INTO menu_item_option_group (menu_item_id, group_id, sort_order) VALUES ?',
    [optionGroupIds.map((gid, i) => [menuId, gid, i])]
  );
  return true;
}

// Write responses return the same shape GET does, so the client can swap it in.
async function loadSerializedItem(db, id) {
  const [[item]] = await db.query('SELECT * FROM menu_item WHERE id = ?', [id]);
  if (!item) return null;
  const [links] = await db.query('SELECT * FROM menu_item_inventory WHERE menu_item_id = ?', [id]);
  const optionData = await loadOptionData(db);
  const stock = await loadStock(db);
  return serializeMenuItem(item, links, true, { groups: groupsForItem(item.id, optionData), stock });
}

// POST /api/menu-items — create menu item + recipe links
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, category, price, cost, available, isCombo, pointsValue, inventoryItems, imageUrl, description, optionGroupIds } = req.body;

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

    if (Array.isArray(optionGroupIds) && !(await replaceOptionGroups(conn, menuId, optionGroupIds))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Unknown option group id' });
    }

    await conn.commit();
    await emitMenuChanged();

    res.status(201).json(await loadSerializedItem(pool, menuId));
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
    const { name, category, price, cost, available, isCombo, pointsValue, inventoryItems, imageUrl, description, optionGroupIds } = req.body;

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

    // Absent → keep the current attachments (older clients do not send it).
    if (Array.isArray(optionGroupIds) && !(await replaceOptionGroups(conn, Number(req.params.id), optionGroupIds))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Unknown option group id' });
    }

    await conn.commit();
    await emitMenuChanged();

    res.json(await loadSerializedItem(pool, Number(req.params.id)));
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
    await emitMenuChanged();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
