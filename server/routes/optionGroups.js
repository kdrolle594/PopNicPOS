import { Router } from 'express';
import pool from '../db.js';
import { loadOptionData, loadStock } from '../lib/optionData.js';
import { serializeGroup } from './menu.js';
import { emitMenuChanged } from '../realtime.js';

export const groupsRouter = Router();
export const choicesRouter = Router();

// Exported for tests. Pure.
export function validateOptionGroupPayload(body) {
  const { name, minSelect, maxSelect, choices } = body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) return 'name must be 1–80 characters';
  if (!Number.isInteger(minSelect) || minSelect < 0) return 'minSelect must be a whole number ≥ 0';
  if (!Number.isInteger(maxSelect) || maxSelect < 1) return 'maxSelect must be a whole number ≥ 1';
  if (minSelect > maxSelect) return 'minSelect cannot be more than maxSelect';
  if (!Array.isArray(choices) || choices.length === 0) return 'a group needs at least one choice';
  if (maxSelect > choices.length) return 'maxSelect cannot be more than the number of choices';

  const names = new Set();
  let defaults = 0;
  for (const c of choices) {
    if (!c || typeof c.name !== 'string' || !c.name.trim() || c.name.trim().length > 80) {
      return 'each choice needs a name of 1–80 characters';
    }
    const key = c.name.trim().toLowerCase();
    if (names.has(key)) return `choice "${c.name.trim()}" appears twice`;
    names.add(key);
    if (!Number.isFinite(Number(c.priceDelta ?? 0))) return 'priceDelta must be a number';
    if (c.id != null && !(Number.isInteger(c.id) && c.id > 0)) return 'choice id must be a positive integer';
    if (c.inventoryItemId != null) {
      if (!Number.isInteger(c.inventoryItemId) || c.inventoryItemId < 1) return 'inventoryItemId must be a positive integer';
      if (!(Number(c.inventoryQty) > 0)) return 'inventoryQty must be more than 0 when stock is linked';
    }
    if (c.isDefault) defaults++;
  }
  if (defaults > maxSelect) return `at most ${maxSelect} default choice(s) allowed`;
  return null;
}

async function serializeAllGroups(db) {
  const { groups, attachments } = await loadOptionData(db);
  const stock = await loadStock(db);
  const [items] = await db.query('SELECT id, name FROM menu_item');
  const names = new Map(items.map((i) => [i.id, i.name]));
  const usedBy = new Map();
  for (const [menuItemId, groupIds] of attachments) {
    for (const gid of groupIds) {
      if (!usedBy.has(gid)) usedBy.set(gid, []);
      usedBy.get(gid).push({ id: menuItemId, name: names.get(menuItemId) });
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((g) => ({ ...serializeGroup(g, stock, true), sortOrder: g.sortOrder, usedBy: usedBy.get(g.id) || [] }));
}

async function findGroup(id) {
  return (await serializeAllGroups(pool)).find((g) => g.id === id) || null;
}

function sendDbError(res, err) {
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That name is already used' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'The linked stock item does not exist' });
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

// Upserts a group's choices: rows with an id are updated in place (ids stay
// stable), rows without one are inserted, and existing rows not sent are deleted.
async function writeChoices(conn, groupId, choices) {
  const [existing] = await conn.query('SELECT id FROM option_choice WHERE group_id = ?', [groupId]);
  const existingIds = new Set(existing.map((r) => r.id));
  for (const c of choices) {
    if (c.id != null && !existingIds.has(c.id)) return `choice ${c.id} does not belong to this group`;
  }
  const keep = new Set(choices.filter((c) => c.id != null).map((c) => c.id));
  const toDelete = [...existingIds].filter((id) => !keep.has(id));
  if (toDelete.length) await conn.query('DELETE FROM option_choice WHERE id IN (?)', [toDelete]);
  // Park kept names so swapping two names cannot trip UNIQUE(group_id, name).
  if (keep.size) {
    await conn.query("UPDATE option_choice SET name = CONCAT('~', id) WHERE id IN (?)", [[...keep]]);
  }

  for (const [i, c] of choices.entries()) {
    const linked = c.inventoryItemId != null;
    const values = [
      c.name.trim(), Number(c.priceDelta ?? 0), c.enabled !== false, Boolean(c.isDefault),
      linked ? c.inventoryItemId : null, linked ? Number(c.inventoryQty) : null, i,
    ];
    if (c.id != null) {
      await conn.query(
        `UPDATE option_choice SET name = ?, price_delta = ?, available = ?, is_default = ?,
           inventory_item_id = ?, inventory_qty = ?, sort_order = ? WHERE id = ?`,
        [...values, c.id]
      );
    } else {
      await conn.query(
        `INSERT INTO option_choice
           (name, price_delta, available, is_default, inventory_item_id, inventory_qty, sort_order, group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [...values, groupId]
      );
    }
  }
  return null;
}

// GET /api/option-groups — every group, every choice, and which items use it
groupsRouter.get('/', async (_req, res) => {
  try {
    res.json(await serializeAllGroups(pool));
  } catch (err) {
    sendDbError(res, err);
  }
});

// POST /api/option-groups
groupsRouter.post('/', async (req, res) => {
  const invalid = validateOptionGroupPayload(req.body);
  if (invalid) return res.status(400).json({ error: invalid });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, minSelect, maxSelect, sortOrder, choices } = req.body;
    const [r] = await conn.query(
      'INSERT INTO option_group (name, min_select, max_select, sort_order) VALUES (?, ?, ?, ?)',
      [name.trim(), minSelect, maxSelect, Number(sortOrder) || 0]
    );
    const choiceError = await writeChoices(conn, r.insertId, choices);
    if (choiceError) {
      await conn.rollback();
      return res.status(400).json({ error: choiceError });
    }
    await conn.commit();
    await emitMenuChanged();
    res.status(201).json(await findGroup(r.insertId));
  } catch (err) {
    await conn.rollback();
    sendDbError(res, err);
  } finally {
    conn.release();
  }
});

// PUT /api/option-groups/:id — replace the group's settings and choices
groupsRouter.put('/:id', async (req, res) => {
  const invalid = validateOptionGroupPayload(req.body);
  if (invalid) return res.status(400).json({ error: invalid });
  const groupId = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, minSelect, maxSelect, sortOrder, choices } = req.body;
    const [r] = await conn.query(
      'UPDATE option_group SET name = ?, min_select = ?, max_select = ?, sort_order = COALESCE(?, sort_order) WHERE id = ?',
      [name.trim(), minSelect, maxSelect, sortOrder ?? null, groupId]
    );
    if (r.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Option group not found' });
    }
    const choiceError = await writeChoices(conn, groupId, choices);
    if (choiceError) {
      await conn.rollback();
      return res.status(400).json({ error: choiceError });
    }
    await conn.commit();
    await emitMenuChanged();
    res.json(await findGroup(groupId));
  } catch (err) {
    await conn.rollback();
    sendDbError(res, err);
  } finally {
    conn.release();
  }
});

// DELETE /api/option-groups/:id — refused while any menu item uses the group
groupsRouter.delete('/:id', async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const [used] = await pool.query(
      `SELECT m.id, m.name FROM menu_item_option_group mog
       JOIN menu_item m ON m.id = mog.menu_item_id WHERE mog.group_id = ?`,
      [groupId]
    );
    if (used.length) {
      return res.status(409).json({
        error: `Used by ${used.map((u) => u.name).join(', ')}. Remove it from those items first.`,
        usedBy: used,
      });
    }
    await pool.query('DELETE FROM option_group WHERE id = ?', [groupId]);
    await emitMenuChanged();
    res.json({ ok: true });
  } catch (err) {
    sendDbError(res, err);
  }
});

// PATCH /api/option-choices/:id — the one-tap on/off switch
choicesRouter.patch('/:id', async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be true or false' });
  }
  try {
    const [r] = await pool.query('UPDATE option_choice SET available = ? WHERE id = ?', [req.body.enabled, Number(req.params.id)]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Choice not found' });
    await emitMenuChanged();
    res.json({ id: Number(req.params.id), enabled: req.body.enabled });
  } catch (err) {
    sendDbError(res, err);
  }
});
