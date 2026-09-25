// Pure option-selection rules shared by the storefront, the POS terminal and
// the order route (server/lib/orderOptions.js). No Vue, no DB.
//
// `item` is the GET /api/menu-items shape:
//   { id, name, price, soldOut?, optionGroups: [{ id, name, minSelect, maxSelect,
//     choices: [{ id, name, priceDelta, isDefault, available }] }] }
// A choice with available === false is not offered.

function groupsOf(item) {
  return Array.isArray(item?.optionGroups) ? item.optionGroups : [];
}

function isOffered(choice) {
  return choice.available !== false;
}

function findChoice(item, choiceId) {
  for (const group of groupsOf(item)) {
    const choice = group.choices.find((c) => c.id === choiceId);
    if (choice) return { group, choice };
  }
  return null;
}

export function needsCustomization(item) {
  return groupsOf(item).length > 0;
}

export function defaultSelection(item) {
  const ids = [];
  for (const group of groupsOf(item)) {
    const offered = group.choices.filter(isOffered);
    let picks = offered.filter((c) => c.isDefault).slice(0, group.maxSelect);
    if (picks.length < group.minSelect) {
      const extra = offered.filter((c) => !picks.includes(c)).slice(0, group.minSelect - picks.length);
      picks = [...picks, ...extra];
    }
    ids.push(...picks.map((c) => c.id));
  }
  return ids;
}

export function selectedChoices(item, choiceIds) {
  const wanted = new Set(choiceIds);
  const out = [];
  for (const group of groupsOf(item)) {
    for (const choice of group.choices) {
      if (wanted.has(choice.id)) out.push({ group, choice });
    }
  }
  return out;
}

export function validateSelection(item, choiceIds) {
  const errors = [];
  const ids = Array.isArray(choiceIds) ? choiceIds : [];
  if (item?.soldOut) errors.push({ groupId: null, message: `${item.name} is sold out` });
  if (new Set(ids).size !== ids.length) {
    errors.push({ groupId: null, message: 'The same option was selected twice' });
  }

  const counts = new Map();
  for (const id of new Set(ids)) {
    const hit = findChoice(item, id);
    if (!hit) {
      errors.push({ groupId: null, message: `${item.name} doesn't offer that option` });
      continue;
    }
    if (!isOffered(hit.choice)) {
      errors.push({ groupId: hit.group.id, message: `${hit.choice.name} is no longer available` });
    }
    counts.set(hit.group.id, (counts.get(hit.group.id) || 0) + 1);
  }

  for (const group of groupsOf(item)) {
    const n = counts.get(group.id) || 0;
    if (n < group.minSelect) {
      errors.push({
        groupId: group.id,
        message: group.minSelect === 1 ? `Choose a ${group.name}` : `Choose at least ${group.minSelect} ${group.name}`,
      });
    } else if (n > group.maxSelect) {
      errors.push({
        groupId: group.id,
        message: group.maxSelect === 1 ? `Choose only one ${group.name}` : `Choose at most ${group.maxSelect} ${group.name}`,
      });
    }
  }
  return { ok: errors.length === 0, errors };
}

export function linePrice(item, choiceIds) {
  const base = Number(item?.price || 0);
  const delta = selectedChoices(item, choiceIds)
    .reduce((sum, { choice }) => sum + Number(choice.priceDelta || 0), 0);
  return Math.max(0, Math.round((base + delta) * 100) / 100);
}

export function lineLabel(item, choiceIds) {
  const names = selectedChoices(item, choiceIds).map(({ choice }) => choice.name);
  return names.length ? `${item.name} (${names.join(', ')})` : item.name;
}

export function pruneSelection(item, choiceIds, previousItem = item) {
  const kept = [];
  const dropped = [];
  for (const id of choiceIds) {
    const hit = findChoice(item, id);
    if (hit && isOffered(hit.choice)) {
      kept.push(id);
    } else {
      dropped.push(findChoice(previousItem, id)?.choice.name || 'An option');
    }
  }
  return { choiceIds: kept, dropped };
}

export function toggleChoice(item, choiceIds, choiceId) {
  const hit = findChoice(item, choiceId);
  if (!hit || !isOffered(hit.choice)) return choiceIds;
  const { group } = hit;
  const inGroup = new Set(group.choices.map((c) => c.id));
  const isSelected = choiceIds.includes(choiceId);

  if (group.maxSelect === 1) {
    if (isSelected) return group.minSelect === 0 ? choiceIds.filter((id) => id !== choiceId) : choiceIds;
    return [...choiceIds.filter((id) => !inGroup.has(id)), choiceId];
  }
  if (isSelected) return choiceIds.filter((id) => id !== choiceId);
  const count = choiceIds.filter((id) => inGroup.has(id)).length;
  return count >= group.maxSelect ? choiceIds : [...choiceIds, choiceId];
}

export function groupHint(group) {
  if (group.maxSelect === 1) return group.minSelect === 1 ? 'Required' : 'Optional';
  if (group.minSelect > 0) return `Choose ${group.minSelect}–${group.maxSelect}`;
  return `Choose up to ${group.maxSelect}`;
}

export function formatPriceDelta(delta) {
  const n = Number(delta);
  return n > 0 ? `+$${n.toFixed(2)}` : `−$${Math.abs(n).toFixed(2)}`;
}

export function lineSignature(menuItemId, choiceIds = []) {
  const sorted = [...choiceIds].map(Number).sort((a, b) => a - b);
  return `${menuItemId}|${sorted.join(',')}`;
}
