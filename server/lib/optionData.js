// The only option module that talks to MySQL: loads option groups, choices,
// attachments, stock and thresholds, and maps rows to the shapes used by
// server/lib/availability.js and server/lib/orderOptions.js.

export function mapChoiceRow(r) {
  return {
    id: r.id,
    groupId: r.group_id,
    name: r.name,
    priceDelta: Number(r.price_delta),
    enabled: Boolean(r.available),
    isDefault: Boolean(r.is_default),
    inventoryItemId: r.inventory_item_id ?? null,
    inventoryQty: r.inventory_qty != null ? Number(r.inventory_qty) : null,
    sortOrder: r.sort_order,
  };
}

export function assembleGroups(groupRows, choiceRows) {
  const groups = new Map(groupRows.map((g) => [g.id, {
    id: g.id,
    name: g.name,
    minSelect: Number(g.min_select),
    maxSelect: Number(g.max_select),
    sortOrder: g.sort_order,
    choices: [],
  }]));
  for (const row of choiceRows) groups.get(row.group_id)?.choices.push(mapChoiceRow(row));
  for (const g of groups.values()) g.choices.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  return groups;
}

export function groupAttachments(rows) {
  const out = new Map();
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.group_id - b.group_id);
  for (const r of sorted) {
    if (!out.has(r.menu_item_id)) out.set(r.menu_item_id, []);
    out.get(r.menu_item_id).push(r.group_id);
  }
  return out;
}

export function groupsForItem(menuItemId, optionData) {
  return (optionData.attachments.get(menuItemId) || [])
    .map((gid) => optionData.groups.get(gid))
    .filter(Boolean);
}

export async function loadOptionData(db) {
  const [groupRows] = await db.query('SELECT * FROM option_group ORDER BY sort_order, id');
  const [choiceRows] = await db.query('SELECT * FROM option_choice');
  const [attachRows] = await db.query('SELECT * FROM menu_item_option_group');
  return { groups: assembleGroups(groupRows, choiceRows), attachments: groupAttachments(attachRows) };
}

// ids null → every stock row. forUpdate locks rows in ascending id order.
export async function loadStock(db, ids = null, { forUpdate = false } = {}) {
  if (ids && ids.length === 0) return new Map();
  let rows;
  if (ids) {
    const sorted = [...new Set(ids)].sort((a, b) => a - b);
    [rows] = await db.query(
      `SELECT id, quantity FROM inventory_item WHERE id IN (?) ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`,
      [sorted]
    );
  } else {
    [rows] = await db.query('SELECT id, quantity FROM inventory_item');
  }
  return new Map(rows.map((r) => [r.id, Number(r.quantity)]));
}

// Every per-serving amount that makes something available or not, per stock row.
export async function loadThresholds(db, ids) {
  if (!ids.length) return new Map();
  const [rows] = await db.query(
    `SELECT inventory_item_id AS id, quantity_used AS t FROM menu_item_inventory WHERE inventory_item_id IN (?)
     UNION ALL
     SELECT inventory_item_id AS id, inventory_qty AS t FROM option_choice WHERE inventory_item_id IN (?)`,
    [ids, ids]
  );
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.id)) out.set(r.id, []);
    out.get(r.id).push(Number(r.t));
  }
  return out;
}
