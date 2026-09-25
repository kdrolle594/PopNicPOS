# Database-Driven Menu Options & Live Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every item option (pizza size, toppings, wing and soda flavors) comes from the database, is hidden when switched off or out of stock, is validated and priced by the server, and availability changes reach every open storefront and POS live.

**Architecture:** Three new tables (`option_group`, `option_choice`, `menu_item_option_group`). One pure module, `shared/menuOptions.js`, holds selection rules and is imported by the storefront, the POS **and** the order route so they cannot drift. Pure server modules (`server/lib/availability.js`, `server/lib/orderOptions.js`) hold availability and order-line rules; `server/lib/optionData.js` is the only option module that touches the DB. The server publishes an empty `menuChanged` event on a new Ably `menu` channel; clients refetch `GET /api/menu-items`.

**Tech Stack:** Vue 3 `<script setup>`, Vite 6, Tailwind v4 + CSS tokens, Express 5, mysql2/promise, Ably, vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-09-25-menu-options-design.md` — read §3 (verified facts) and §4.4 (availability rules) before starting any task.

## Global Constraints

- No new npm dependencies. No Pinia, no Vue Router, no jsdom / Vue test utils.
- Tests run in vitest's **node** environment (`npm test`). Only pure modules and stores are unit-tested; components are verified manually.
- ESM everywhere (`"type": "module"`). Server imports use explicit `.js` extensions.
- Stores stay hand-rolled singletons (`usePosStore`, `useCartStore` pattern).
- Option management endpoints are manager/admin only; `GET /api/menu-items` stays public.
- Money is rounded to cents (`Math.round(x * 100) / 100`) and a line price is floored at 0.
- **Every `emitMenuChanged()` call is `await`ed before the response is sent** — the backend runs on Vercel, where work left running after the response can be frozen.
- Stock rows are locked in ascending id order (`ORDER BY id … FOR UPDATE`) to avoid deadlocks.
- A stock id missing from the stock map (row deleted) never blocks availability and is never deducted.
- Commit after every task with the message given; end every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deviations from the spec (decided while planning — follow these)

1. The shared selection module lives at **`shared/menuOptions.js`** (repo root), not `src/lib/menuOptions.js`, because the order route imports it too. Vite and Vercel's file tracing both resolve it.
2. Instead of `resetRealtime()`, the client exposes **`refreshRealtimeAuth()`**, which calls Ably's `auth.authorize()` to fetch an upgraded token without dropping existing channel subscriptions.
3. `GET /api/menu-items` uses six queries (items, recipe links, stock, groups, choices, attachments) — still constant, never per-item.
4. `validateOptionGroupPayload` allows up to `maxSelect` default choices (the spec's "one default when maxSelect is 1" is the same rule for single-choice groups).
5. `lineSignature` lives in `shared/menuOptions.js` (the POS needs it too) and replaces the cart's `optionSignature`.

## Review Focus

1. **Two cart lines competing for the last unit** (e.g. two separate "Soda (Sprite)" lines, 1 Sprite in stock) — must 409, not oversell. Pinned by `totalStockNeeds` / `findShortfall` tests in Task 2.
2. **Choice ids arriving as strings** from JSON bodies or old clients (`"12"`) — must resolve like numbers. Pinned in Task 8.
3. **A linked stock row deleted** — the choice/item must stay orderable and the order must not crash. Pinned in Task 2 (`isChoiceAvailable`, `findShortfall`).
4. **Cent rounding with negative deltas** (Personal Pan −2.00 on a $1.50 item, deltas like 0.1 + 0.2) — floor at 0, exact cents. Pinned in Task 1.
5. **A guest on the storefront** must get a realtime token that can only subscribe to `menu`. Pinned by `capabilityFor(null)` test in Task 5.

Also check by hand (not unit-testable here): CORS must allow `PATCH` (Task 7, Step 6), and realtime publishes must be awaited (Global Constraints).

## Before Task 1

The working tree may contain an uncommitted one-line change in `src/components/storefront/MenuBrowser.vue` (`@add="onCustomize"`). Leave it; Task 12 rewrites that file and commits it.

## File map

| File | Status | Responsibility |
|---|---|---|
| `shared/menuOptions.js` | create | Pure selection rules: defaults, validation, price, label, toggle, signature |
| `server/lib/availability.js` | create | Pure availability + stock math (§4.4), threshold crossing |
| `server/lib/optionData.js` | create | DB loaders + row mappers for options, stock, thresholds |
| `server/lib/orderOptions.js` | create | Pure order-line resolution (validate, price, label, snapshot, stock needs) |
| `server/seedOptions.js` | create | Non-destructive option/specialty-pizza seed |
| `server/routes/optionGroups.js` | create | Option group CRUD + choice toggle |
| `server/migrate.js` | modify | Create the three tables |
| `server/seed.js` | modify | Call `seedOptions` after the reset seed |
| `server/realtime.js` | modify | `emitMenuChanged`, `capabilityFor` |
| `server/routes/realtime.js` | modify | Token route with optional auth |
| `server/routes/menu.js` | modify | Serialize options/soldOut; `optionGroupIds` on write; emit |
| `server/routes/inventory.js` | modify | Emit on writes |
| `server/routes/orders.js` | modify | Choice validation, pricing, stock, cancellation restock, emit |
| `server/app.js` | modify | Mount option routes; CORS `PATCH` |
| `src/lib/realtime.js` | modify | Guest tokens, `subscribeMenu`, `refreshRealtimeAuth` |
| `src/store/usePosStore.js` | modify | `refreshMenu`, option-group methods, `orderError` |
| `src/store/useCartStore.js` | modify | `choiceIds` lines, v2 storage, reconcile |
| `src/App.vue` | modify | Upgrade realtime auth after login |
| `src/components/storefront/*` | modify | Sheet, browser, card, cart panel, checkout |
| `src/components/POSTerminal.vue` | modify | Group-driven modal, live refresh |
| `src/components/MenuManagement.vue` | modify | Options tab, item form checklist |
| `src/components/OptionGroupsEditor.vue` | create | Group list + editor |
| `package.json` | modify | `seed:options` script |
| `CLAUDE.md` | modify | Document the new pieces |
| `tests/*.test.js` | create/modify | See each task |

---

### Task 1: Shared option logic

**Files:**
- Create: `shared/menuOptions.js`
- Test: `tests/menuOptions.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (all pure; `item` is the `GET /api/menu-items` shape `{ id, name, price, soldOut?, optionGroups: [{ id, name, minSelect, maxSelect, choices: [{ id, name, priceDelta, isDefault, available }] }] }`; a choice with `available === false` counts as not offered):
  - `needsCustomization(item) → boolean`
  - `defaultSelection(item) → number[]`
  - `selectedChoices(item, choiceIds) → Array<{ group, choice }>` in group order, then choice order
  - `validateSelection(item, choiceIds) → { ok: boolean, errors: Array<{ groupId: number|null, message: string }> }`
  - `linePrice(item, choiceIds) → number`
  - `lineLabel(item, choiceIds) → string` — `"Soda (Sprite)"`, or the bare name with no choices
  - `pruneSelection(item, choiceIds, previousItem = item) → { choiceIds: number[], dropped: string[] }`
  - `toggleChoice(item, choiceIds, choiceId) → number[]`
  - `groupHint(group) → string`
  - `formatPriceDelta(delta) → string` — `"+$3.00"` / `"−$2.00"`
  - `lineSignature(menuItemId, choiceIds) → string` — `"5|11,12"` (ids sorted numerically)

- [ ] **Step 1: Write the failing tests**

Create `tests/menuOptions.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  needsCustomization, defaultSelection, selectedChoices, validateSelection,
  linePrice, lineLabel, pruneSelection, toggleChoice, groupHint,
  formatPriceDelta, lineSignature,
} from '../shared/menuOptions.js';

const SIZE = {
  id: 1, name: 'Pizza Size', minSelect: 1, maxSelect: 1,
  choices: [
    { id: 11, name: 'Personal Pan', priceDelta: -2, isDefault: false, available: true },
    { id: 12, name: 'Medium', priceDelta: 0, isDefault: true, available: true },
    { id: 13, name: 'Large', priceDelta: 3, isDefault: false, available: true },
  ],
};
const TOPPINGS = {
  id: 2, name: 'Toppings', minSelect: 0, maxSelect: 2,
  choices: [
    { id: 21, name: 'Pepperoni', priceDelta: 0.1, isDefault: false, available: true },
    { id: 22, name: 'Ham', priceDelta: 0.2, isDefault: false, available: true },
    { id: 23, name: 'Bacon', priceDelta: 0, isDefault: false, available: false },
  ],
};
const SODA_FLAVOR = {
  id: 3, name: 'Soda Flavor', minSelect: 1, maxSelect: 1,
  choices: [
    { id: 31, name: 'Coke', priceDelta: 0, isDefault: false, available: false },
    { id: 32, name: 'Sprite', priceDelta: 0, isDefault: false, available: true },
  ],
};
const PIZZA = { id: 5, name: 'Pizza', price: 14.99, optionGroups: [SIZE, TOPPINGS] };
const SODA = { id: 6, name: 'Soda', price: 1, optionGroups: [SODA_FLAVOR] };
const COFFEE = { id: 7, name: 'Coffee', price: 3.49, optionGroups: [] };

describe('needsCustomization', () => {
  it('is true only when the item has option groups', () => {
    expect(needsCustomization(PIZZA)).toBe(true);
    expect(needsCustomization(COFFEE)).toBe(false);
    expect(needsCustomization({ id: 1, name: 'Old' })).toBe(false);
  });
});

describe('defaultSelection', () => {
  it('uses default choices', () => {
    expect(defaultSelection(PIZZA)).toEqual([12]);
  });
  it('falls back to the first offered choice for a required group with no usable default', () => {
    expect(defaultSelection(SODA)).toEqual([32]);
  });
  it('returns nothing for an item without groups', () => {
    expect(defaultSelection(COFFEE)).toEqual([]);
  });
});

describe('validateSelection', () => {
  it('accepts a valid selection', () => {
    expect(validateSelection(PIZZA, [13, 21, 22])).toEqual({ ok: true, errors: [] });
  });
  it('requires a choice in a required single group', () => {
    const r = validateSelection(SODA, []);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([{ groupId: 3, message: 'Choose a Soda Flavor' }]);
  });
  it('rejects more than maxSelect', () => {
    const r = validateSelection(PIZZA, [12, 21, 22, 13]);
    expect(r.errors.map((e) => e.message)).toContain('Choose only one Pizza Size');
  });
  it('rejects an unavailable choice by name', () => {
    const r = validateSelection(SODA, [31]);
    expect(r.errors[0].message).toBe('Coke is no longer available');
  });
  it('rejects a choice the item does not offer', () => {
    const r = validateSelection(SODA, [21]);
    expect(r.errors[0].message).toBe("Soda doesn't offer that option");
  });
  it('rejects duplicates', () => {
    const r = validateSelection(PIZZA, [12, 21, 21]);
    expect(r.errors.map((e) => e.message)).toContain('The same option was selected twice');
  });
  it('rejects a sold-out item', () => {
    const r = validateSelection({ ...COFFEE, soldOut: true }, []);
    expect(r.errors[0].message).toBe('Coffee is sold out');
  });
});

describe('price and label', () => {
  it('adds deltas and rounds to cents', () => {
    expect(linePrice(PIZZA, [13, 21, 22])).toBe(18.29);
  });
  it('floors at zero with a negative delta', () => {
    expect(linePrice({ ...PIZZA, price: 1.5 }, [11])).toBe(0);
  });
  it('labels in group then choice order', () => {
    expect(lineLabel(PIZZA, [22, 13, 21])).toBe('Pizza (Large, Pepperoni, Ham)');
    expect(lineLabel(COFFEE, [])).toBe('Coffee');
  });
  it('selectedChoices keeps menu order', () => {
    expect(selectedChoices(PIZZA, [22, 12]).map(({ choice }) => choice.id)).toEqual([12, 22]);
  });
});

describe('pruneSelection', () => {
  it('drops choices that vanished and names them from the previous item', () => {
    const next = { ...SODA, optionGroups: [{ ...SODA_FLAVOR, choices: [SODA_FLAVOR.choices[0]] }] };
    expect(pruneSelection(next, [32], SODA)).toEqual({ choiceIds: [], dropped: ['Sprite'] });
  });
  it('keeps everything still offered', () => {
    expect(pruneSelection(PIZZA, [12, 21])).toEqual({ choiceIds: [12, 21], dropped: [] });
  });
});

describe('toggleChoice', () => {
  it('replaces the pick in a single group', () => {
    expect(toggleChoice(PIZZA, [12, 21], 13)).toEqual([21, 13]);
  });
  it('does not clear a required single choice', () => {
    expect(toggleChoice(PIZZA, [12], 12)).toEqual([12]);
  });
  it('adds and removes in a multi group up to the max', () => {
    expect(toggleChoice(PIZZA, [12], 21)).toEqual([12, 21]);
    expect(toggleChoice(PIZZA, [12, 21, 22], 21)).toEqual([12, 22]);
    expect(toggleChoice(PIZZA, [12, 21, 22], 23)).toEqual([12, 21, 22]);
  });
});

describe('display helpers', () => {
  it('groupHint describes the rule', () => {
    expect(groupHint(SIZE)).toBe('Required');
    expect(groupHint(TOPPINGS)).toBe('Choose up to 2');
    expect(groupHint({ minSelect: 1, maxSelect: 3 })).toBe('Choose 1–3');
    expect(groupHint({ minSelect: 0, maxSelect: 1 })).toBe('Optional');
  });
  it('formatPriceDelta signs the amount', () => {
    expect(formatPriceDelta(3)).toBe('+$3.00');
    expect(formatPriceDelta(-2)).toBe('−$2.00');
  });
  it('lineSignature ignores choice order and type', () => {
    expect(lineSignature(5, [22, '12'])).toBe(lineSignature(5, [12, 22]));
    expect(lineSignature(5, [])).toBe('5|');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/menuOptions.test.js`
Expected: FAIL — `Failed to load url ../shared/menuOptions.js` (file does not exist).

- [ ] **Step 3: Write the implementation**

Create `shared/menuOptions.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/menuOptions.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add shared/menuOptions.js tests/menuOptions.test.js
git commit -m "feat(options): shared selection rules for menu options"
```

---

### Task 2: Server availability and stock math

**Files:**
- Create: `server/lib/availability.js`
- Test: `tests/availability.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (pure; `stock` is `Map<inventoryItemId:number, quantity:number>`; a server-side choice is `{ id, groupId, name, priceDelta, enabled, isDefault, inventoryItemId|null, inventoryQty|null, sortOrder }`; a server-side group is `{ id, name, minSelect, maxSelect, sortOrder, choices }`):
  - `isChoiceAvailable(choice, stock) → boolean`
  - `isItemSoldOut({ available, recipe: [{ inventoryItemId, quantity }], groups }, stock) → boolean`
  - `crossesThreshold(changes: Map<id, { before, after }>, thresholds: Map<id, number[]>) → boolean`
  - `totalStockNeeds(lines: Array<{ stockPerUnit: Map<id, qty>, quantity }>) → Map<id, qty>`
  - `findShortfall(needs: Map<id, qty>, stock) → number | null` — first short inventory id, ignoring ids missing from `stock`

- [ ] **Step 1: Write the failing tests**

Create `tests/availability.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  isChoiceAvailable, isItemSoldOut, crossesThreshold, totalStockNeeds, findShortfall,
} from '../server/lib/availability.js';

const choice = (over = {}) => ({
  id: 1, groupId: 1, name: 'Sprite', priceDelta: 0, enabled: true, isDefault: false,
  inventoryItemId: null, inventoryQty: null, sortOrder: 0, ...over,
});

describe('isChoiceAvailable', () => {
  it('is off when the switch is off', () => {
    expect(isChoiceAvailable(choice({ enabled: false }), new Map())).toBe(false);
  });
  it('needs enough linked stock for one serving', () => {
    const c = choice({ inventoryItemId: 50, inventoryQty: 1 });
    expect(isChoiceAvailable(c, new Map([[50, 1]]))).toBe(true);
    expect(isChoiceAvailable(c, new Map([[50, 0.5]]))).toBe(false);
  });
  it('treats a missing stock row as unknown, not empty', () => {
    const c = choice({ inventoryItemId: 50, inventoryQty: 1 });
    expect(isChoiceAvailable(c, new Map())).toBe(true);
  });
});

describe('isItemSoldOut', () => {
  const required = { id: 1, name: 'Soda Flavor', minSelect: 1, maxSelect: 1, sortOrder: 0, choices: [choice()] };

  it('is sold out when switched off', () => {
    expect(isItemSoldOut({ available: false, recipe: [], groups: [] }, new Map())).toBe(true);
  });
  it('is sold out when a recipe ingredient is short', () => {
    const recipe = [{ inventoryItemId: 60, quantity: 1 }];
    expect(isItemSoldOut({ available: true, recipe, groups: [] }, new Map([[60, 0]]))).toBe(true);
    expect(isItemSoldOut({ available: true, recipe, groups: [] }, new Map([[60, 3]]))).toBe(false);
  });
  it('is sold out when a required group has no available choice', () => {
    const empty = { ...required, choices: [choice({ enabled: false })] };
    expect(isItemSoldOut({ available: true, recipe: [], groups: [empty] }, new Map())).toBe(true);
    expect(isItemSoldOut({ available: true, recipe: [], groups: [required] }, new Map())).toBe(false);
  });
  it('ignores optional groups with nothing available', () => {
    const optional = { ...required, minSelect: 0, choices: [choice({ enabled: false })] };
    expect(isItemSoldOut({ available: true, recipe: [], groups: [optional] }, new Map())).toBe(false);
  });
});

describe('crossesThreshold', () => {
  const thresholds = new Map([[50, [1, 0.5]]]);
  it('detects a drop below a threshold', () => {
    expect(crossesThreshold(new Map([[50, { before: 1, after: 0 }]]), thresholds)).toBe(true);
  });
  it('detects a restock above a threshold', () => {
    expect(crossesThreshold(new Map([[50, { before: 0, after: 2 }]]), thresholds)).toBe(true);
  });
  it('ignores changes that stay on one side', () => {
    expect(crossesThreshold(new Map([[50, { before: 10, after: 9 }]]), thresholds)).toBe(false);
  });
  it('ignores stock with no thresholds', () => {
    expect(crossesThreshold(new Map([[99, { before: 1, after: 0 }]]), thresholds)).toBe(false);
  });
});

describe('totalStockNeeds / findShortfall', () => {
  it('adds needs across lines so two lines cannot share the last unit', () => {
    const needs = totalStockNeeds([
      { stockPerUnit: new Map([[50, 1]]), quantity: 1 },
      { stockPerUnit: new Map([[50, 1], [60, 0.5]]), quantity: 2 },
    ]);
    expect(needs).toEqual(new Map([[50, 3], [60, 1]]));
    expect(findShortfall(needs, new Map([[50, 2], [60, 5]]))).toBe(50);
    expect(findShortfall(needs, new Map([[50, 3], [60, 1]]))).toBeNull();
  });
  it('never reports a deleted stock row as short', () => {
    expect(findShortfall(new Map([[77, 5]]), new Map())).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/availability.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/lib/availability.js`:

```js
// Availability rules (spec §4.4) and stock arithmetic. Pure.
// `stock` is a Map<inventoryItemId, quantity>. A stock id missing from the map
// (e.g. the row was deleted) counts as unknown: it never blocks and is never short.

function hasStock(stock, inventoryItemId, needed) {
  if (inventoryItemId == null) return true;
  const qty = stock.get(inventoryItemId);
  return qty === undefined || qty >= needed;
}

export function isChoiceAvailable(choice, stock) {
  return Boolean(choice.enabled) && hasStock(stock, choice.inventoryItemId, choice.inventoryQty);
}

export function isItemSoldOut({ available, recipe, groups }, stock) {
  if (!available) return true;
  for (const link of recipe) {
    if (!hasStock(stock, link.inventoryItemId, link.quantity)) return true;
  }
  for (const group of groups) {
    if (group.minSelect === 0) continue;
    const offered = group.choices.filter((c) => isChoiceAvailable(c, stock)).length;
    if (offered < group.minSelect) return true;
  }
  return false;
}

export function crossesThreshold(changes, thresholds) {
  for (const [id, { before, after }] of changes) {
    for (const t of thresholds.get(id) || []) {
      if ((before >= t) !== (after >= t)) return true;
    }
  }
  return false;
}

export function totalStockNeeds(lines) {
  const needs = new Map();
  for (const { stockPerUnit, quantity } of lines) {
    for (const [id, perUnit] of stockPerUnit) {
      needs.set(id, (needs.get(id) || 0) + perUnit * quantity);
    }
  }
  return needs;
}

export function findShortfall(needs, stock) {
  for (const [id, needed] of needs) {
    if (!stock.has(id)) continue;
    if (stock.get(id) < needed) return id;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/availability.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/availability.js tests/availability.test.js
git commit -m "feat(options): availability rules and stock math"
```

---

### Task 3: Schema migration and option data loaders

**Files:**
- Modify: `server/migrate.js` (add step 7 before the final `console.log('✔  Migration complete');`)
- Create: `server/lib/optionData.js`
- Test: `tests/optionData.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mapChoiceRow(row) → choice` (server shape from Task 2)
  - `assembleGroups(groupRows, choiceRows) → Map<groupId, group>` (choices sorted by `sortOrder`, then id)
  - `groupAttachments(rows) → Map<menuItemId, groupId[]>` (ordered by `sort_order`, then group id)
  - `groupsForItem(menuItemId, optionData) → group[]`
  - `async loadOptionData(db) → { groups: Map, attachments: Map }`
  - `async loadStock(db, ids = null, { forUpdate = false } = {}) → Map<id, qty>` (ids `null` = all rows)
  - `async loadThresholds(db, ids) → Map<id, number[]>`

- [ ] **Step 1: Write the failing tests**

Create `tests/optionData.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mapChoiceRow, assembleGroups, groupAttachments, groupsForItem } from '../server/lib/optionData.js';

const CHOICE_ROW = {
  id: 12, group_id: 1, name: 'Sprite', price_delta: '0.50', available: 1, is_default: 0,
  inventory_item_id: 50, inventory_qty: '1.000', sort_order: 1,
};

describe('mapChoiceRow', () => {
  it('converts DB types', () => {
    expect(mapChoiceRow(CHOICE_ROW)).toEqual({
      id: 12, groupId: 1, name: 'Sprite', priceDelta: 0.5, enabled: true, isDefault: false,
      inventoryItemId: 50, inventoryQty: 1, sortOrder: 1,
    });
  });
  it('keeps an unlinked choice null', () => {
    const c = mapChoiceRow({ ...CHOICE_ROW, inventory_item_id: null, inventory_qty: null });
    expect(c.inventoryItemId).toBeNull();
    expect(c.inventoryQty).toBeNull();
  });
});

describe('assembleGroups', () => {
  it('nests and orders choices', () => {
    const groups = assembleGroups(
      [{ id: 1, name: 'Soda Flavor', min_select: 1, max_select: 1, sort_order: 0 }],
      [CHOICE_ROW, { ...CHOICE_ROW, id: 11, name: 'Coke', sort_order: 0 }],
    );
    const g = groups.get(1);
    expect(g).toMatchObject({ id: 1, name: 'Soda Flavor', minSelect: 1, maxSelect: 1 });
    expect(g.choices.map((c) => c.name)).toEqual(['Coke', 'Sprite']);
  });
  it('ignores choices of unknown groups', () => {
    expect(assembleGroups([], [CHOICE_ROW]).size).toBe(0);
  });
});

describe('groupAttachments / groupsForItem', () => {
  it('orders an item\'s groups by sort_order', () => {
    const attachments = groupAttachments([
      { menu_item_id: 5, group_id: 2, sort_order: 1 },
      { menu_item_id: 5, group_id: 1, sort_order: 0 },
      { menu_item_id: 6, group_id: 3, sort_order: 0 },
    ]);
    expect(attachments.get(5)).toEqual([1, 2]);
    const groups = new Map([[1, { id: 1 }], [2, { id: 2 }]]);
    expect(groupsForItem(5, { groups, attachments }).map((g) => g.id)).toEqual([1, 2]);
    expect(groupsForItem(6, { groups, attachments })).toEqual([]);
    expect(groupsForItem(9, { groups, attachments })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/optionData.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `server/lib/optionData.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/optionData.test.js`
Expected: PASS.

- [ ] **Step 5: Add the migration**

In `server/migrate.js`, insert this block immediately before `console.log('✔  Migration complete');`:

```js
    // 7. Option groups, choices and menu item attachments.
    // FK columns must match the existing id column types exactly, so read them.
    async function idColumnType(table) {
      const [[col]] = await conn.query(
        `SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'id'`,
        [table]
      );
      if (!col) throw new Error(`${table}.id not found`);
      return col.type;
    }
    const menuIdType = await idColumnType('menu_item');
    const inventoryIdType = await idColumnType('inventory_item');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS option_group (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        min_select TINYINT UNSIGNED NOT NULL DEFAULT 0,
        max_select TINYINT UNSIGNED NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_option_group_name (name)
      ) ENGINE=InnoDB
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS option_choice (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL,
        name VARCHAR(80) NOT NULL,
        price_delta DECIMAL(8,2) NOT NULL DEFAULT 0,
        available BOOLEAN NOT NULL DEFAULT TRUE,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        inventory_item_id ${inventoryIdType} NULL,
        inventory_qty DECIMAL(10,3) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_option_choice_group_name (group_id, name),
        CONSTRAINT fk_option_choice_group FOREIGN KEY (group_id)
          REFERENCES option_group(id) ON DELETE CASCADE,
        CONSTRAINT fk_option_choice_inventory FOREIGN KEY (inventory_item_id)
          REFERENCES inventory_item(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS menu_item_option_group (
        menu_item_id ${menuIdType} NOT NULL,
        group_id INT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        PRIMARY KEY (menu_item_id, group_id),
        CONSTRAINT fk_mog_menu_item FOREIGN KEY (menu_item_id)
          REFERENCES menu_item(id) ON DELETE CASCADE,
        CONSTRAINT fk_mog_group FOREIGN KEY (group_id)
          REFERENCES option_group(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
    console.log('✔  Option tables ready');
```

- [ ] **Step 6: Run the migration locally twice**

Run: `node server/migrate.js` then run it again.
Expected: both runs end with `✔  Option tables ready` and `✔  Migration complete`, no errors. If there is no reachable local database, report that and continue; the operator runs it at rollout.

- [ ] **Step 7: Commit**

```bash
git add server/lib/optionData.js server/migrate.js tests/optionData.test.js
git commit -m "feat(options): option tables and data loaders"
```

---

### Task 4: Non-destructive option seed

**Files:**
- Create: `server/seedOptions.js`
- Modify: `server/seed.js` (import + one call), `package.json` (script)
- Test: `tests/seedOptions.test.js`

**Interfaces:**
- Consumes: tables from Task 3.
- Produces: `OPTION_GROUPS`, `SPECIALTY_PIZZAS`, `planAttachments(menuItems, attachedItemIds: Set) → Array<{ menuItemId, groups: string[] }>`, `async seedOptions(db, log = console.log)`; npm script `seed:options`.

- [ ] **Step 1: Write the failing test**

Create `tests/seedOptions.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { planAttachments, OPTION_GROUPS } from '../server/seedOptions.js';

const ITEMS = [
  { id: 1, name: 'Pizza' },
  { id: 2, name: 'Hawaiian Pizza' },
  { id: 3, name: 'Chicken Wings' },
  { id: 4, name: 'Soda' },
  { id: 5, name: 'Soda Bread' },
  { id: 6, name: 'Coffee' },
];

describe('planAttachments', () => {
  it('attaches the right groups by name', () => {
    expect(planAttachments(ITEMS, new Set())).toEqual([
      { menuItemId: 1, groups: ['Pizza Size', 'Toppings'] },
      { menuItemId: 2, groups: ['Pizza Size'] },
      { menuItemId: 3, groups: ['Wing Flavor'] },
      { menuItemId: 4, groups: ['Soda Flavor'] },
    ]);
  });
  it('skips items that already have groups', () => {
    expect(planAttachments(ITEMS, new Set([1, 2, 3, 4]))).toEqual([]);
  });
  it('only plans groups that the seed defines', () => {
    const names = new Set(OPTION_GROUPS.map((g) => g.name));
    for (const { groups } of planAttachments(ITEMS, new Set())) {
      for (const g of groups) expect(names.has(g)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/seedOptions.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `server/seedOptions.js`**

```js
// Non-destructive option seed: inserts missing option groups/choices, the three
// specialty pizzas, and default attachments. Never updates or deletes rows, and
// skips any menu item that already has a group attached, so it is safe on the
// live database. Run with `npm run seed:options` after `node server/migrate.js`.
import { pathToFileURL } from 'node:url';

export const OPTION_GROUPS = [
  {
    name: 'Pizza Size', minSelect: 1, maxSelect: 1,
    choices: [
      { name: 'Personal Pan', priceDelta: -2 },
      { name: 'Medium', priceDelta: 0, isDefault: true },
      { name: 'Large', priceDelta: 3 },
    ],
  },
  {
    name: 'Toppings', minSelect: 0, maxSelect: 11,
    choices: [
      'Pepperoni', 'Ham', 'Sausage', 'Bacon', 'Pineapple', 'Mushrooms',
      'Onions', 'Bell Peppers', 'Black Olives', 'Tomatoes', 'Extra Cheese',
    ].map((name) => ({ name, priceDelta: 0 })),
  },
  {
    name: 'Wing Flavor', minSelect: 1, maxSelect: 1,
    choices: [
      { name: 'Buffalo', isDefault: true }, { name: 'Honey Mustard' }, { name: 'Original' },
      { name: 'BBQ' }, { name: 'Sweet and Spicy' },
    ],
  },
  {
    name: 'Soda Flavor', minSelect: 1, maxSelect: 1,
    choices: [
      { name: 'Coke', isDefault: true }, { name: 'Sprite' }, { name: 'Root Beer' },
      { name: 'Orange Soda' }, { name: 'Grape Soda' },
    ],
  },
];

export const SPECIALTY_PIZZAS = [
  { name: 'Hawaiian Pizza', description: 'Ham and pineapple.' },
  { name: 'Meat Lovers Pizza', description: 'Pepperoni, sausage, bacon and ham.' },
  { name: 'Veggie Pizza', description: 'Mushrooms, onions, bell peppers, black olives and tomatoes.' },
];

const SPECIALTY_NAMES = new Set(SPECIALTY_PIZZAS.map((p) => p.name.toLowerCase()));

export function planAttachments(menuItems, attachedItemIds) {
  const plan = [];
  for (const item of menuItems) {
    if (attachedItemIds.has(item.id)) continue;
    const name = item.name.toLowerCase();
    if (SPECIALTY_NAMES.has(name)) plan.push({ menuItemId: item.id, groups: ['Pizza Size'] });
    else if (name.includes('pizza')) plan.push({ menuItemId: item.id, groups: ['Pizza Size', 'Toppings'] });
    else if (name.includes('wings')) plan.push({ menuItemId: item.id, groups: ['Wing Flavor'] });
    else if (name === 'soda') plan.push({ menuItemId: item.id, groups: ['Soda Flavor'] });
  }
  return plan;
}

export async function seedOptions(db, log = console.log) {
  // 1. Groups and choices
  for (const [groupIndex, group] of OPTION_GROUPS.entries()) {
    const [[existingGroup]] = await db.query('SELECT id FROM option_group WHERE name = ?', [group.name]);
    let groupId = existingGroup?.id;
    if (!groupId) {
      const [r] = await db.query(
        'INSERT INTO option_group (name, min_select, max_select, sort_order) VALUES (?, ?, ?, ?)',
        [group.name, group.minSelect, group.maxSelect, groupIndex]
      );
      groupId = r.insertId;
      log(`✔  Created option group ${group.name}`);
    }
    for (const [choiceIndex, choice] of group.choices.entries()) {
      const [[existingChoice]] = await db.query(
        'SELECT id FROM option_choice WHERE group_id = ? AND name = ?',
        [groupId, choice.name]
      );
      if (existingChoice) continue;
      await db.query(
        'INSERT INTO option_choice (group_id, name, price_delta, is_default, sort_order) VALUES (?, ?, ?, ?, ?)',
        [groupId, choice.name, choice.priceDelta ?? 0, Boolean(choice.isDefault), choiceIndex]
      );
      log(`✔  Added ${choice.name} to ${group.name}`);
    }
  }

  // 2. Specialty pizzas, priced like the build-your-own pizza (managers adjust)
  const [menuRows] = await db.query('SELECT id, name, category, price, cost, points_value FROM menu_item');
  const base = menuRows.find(
    (m) => m.name.toLowerCase().includes('pizza') && !SPECIALTY_NAMES.has(m.name.toLowerCase())
  );
  if (!base) {
    log('⚠  No build-your-own pizza item found — skipping specialty pizzas');
  } else {
    for (const pizza of SPECIALTY_PIZZAS) {
      if (menuRows.some((m) => m.name.toLowerCase() === pizza.name.toLowerCase())) continue;
      await db.query(
        `INSERT INTO menu_item (name, category, price, cost, points_value, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [pizza.name, base.category, base.price, base.cost, base.points_value, pizza.description]
      );
      log(`✔  Created ${pizza.name} at ${base.price} — adjust its price and recipe in Menu Management`);
    }
  }

  // 3. Attachments for items that have none yet
  const [items] = await db.query('SELECT id, name FROM menu_item');
  const [attached] = await db.query('SELECT DISTINCT menu_item_id FROM menu_item_option_group');
  const [groups] = await db.query('SELECT id, name FROM option_group');
  const groupIds = new Map(groups.map((g) => [g.name, g.id]));
  const plan = planAttachments(items, new Set(attached.map((r) => r.menu_item_id)));
  for (const { menuItemId, groups: names } of plan) {
    const values = names.map((name, i) => [menuItemId, groupIds.get(name), i]);
    await db.query('INSERT INTO menu_item_option_group (menu_item_id, group_id, sort_order) VALUES ?', [values]);
    log(`✔  Attached ${names.join(' + ')} to ${items.find((i) => i.id === menuItemId).name}`);
  }
  log('✔  Option seed complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: pool } = await import('./db.js');
  seedOptions(pool)
    .then(() => pool.end())
    .catch((err) => {
      console.error('Option seed failed:', err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/seedOptions.test.js`
Expected: PASS.

- [ ] **Step 5: Wire it into the reset seed and npm scripts**

In `server/seed.js`, add the import after the existing imports at the top:

```js
import { seedOptions } from './seedOptions.js';
```

and, inside `seed()`, immediately after `console.log(\`✔  Inserted ${linkCount} recipe links\`);`, add:

```js
  // 4) Option groups, specialty pizzas and attachments
  await seedOptions(pool);
```

In `package.json` `"scripts"`, add after `"seed"`:

```json
    "seed:options": "node server/seedOptions.js",
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/seedOptions.js server/seed.js package.json tests/seedOptions.test.js
git commit -m "feat(options): non-destructive option seed with specialty pizzas"
```

---

### Task 5: Realtime server primitives

**Files:**
- Modify: `server/realtime.js`, `server/routes/realtime.js`, `server/routes/menu.js` (emit only), `server/routes/inventory.js` (emit only)
- Test: `tests/realtimeCapability.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `emitMenuChanged(): Promise<void>` (never throws), `capabilityFor(user|undefined) → Ably capability object`. Token endpoint accepts guests.

- [ ] **Step 1: Write the failing test**

Create `tests/realtimeCapability.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { capabilityFor } from '../server/realtime.js';

describe('capabilityFor', () => {
  it('lets a guest subscribe to menu only', () => {
    expect(capabilityFor(undefined)).toEqual({ menu: ['subscribe'] });
    expect(capabilityFor(null)).toEqual({ menu: ['subscribe'] });
  });
  it('keeps existing rights for signed-in users and adds menu', () => {
    expect(capabilityFor({ role: 'customer' })).toEqual({
      menu: ['subscribe'], orders: ['subscribe'], 'delivery:*': ['subscribe'],
    });
  });
  it('lets drivers publish delivery positions', () => {
    expect(capabilityFor({ role: 'driver' })['delivery:*']).toEqual(['publish', 'subscribe']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/realtimeCapability.test.js`
Expected: FAIL — `capabilityFor` is not exported.

- [ ] **Step 3: Implement in `server/realtime.js`**

Append after `emitOrderDriverAssigned`:

```js
// Clients refetch GET /api/menu-items on this event, so the payload is empty.
export function emitMenuChanged() {
  return publish('menu', 'menuChanged', {});
}

// Channel rights per caller. Guests may only watch menu availability.
export function capabilityFor(user) {
  if (!user) return { menu: ['subscribe'] };
  return {
    menu: ['subscribe'],
    orders: ['subscribe'],
    'delivery:*': user.role === 'driver' ? ['publish', 'subscribe'] : ['subscribe'],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/realtimeCapability.test.js`
Expected: PASS.

- [ ] **Step 5: Open the token route to guests**

Replace the whole of `server/routes/realtime.js` with:

```js
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { optionalAuth } from '../middleware/auth.js';
import { createTokenRequest, capabilityFor } from '../realtime.js';

const router = Router();

// GET /api/realtime/token — issue a short-lived Ably token request. Guests get
// a subscribe-only token for the menu channel; signed-in users get their role's
// rights (see capabilityFor).
router.get('/token', optionalAuth, async (req, res) => {
  try {
    const clientId = req.user ? String(req.user.id) : `guest-${randomUUID()}`;
    const tokenRequest = await createTokenRequest({ clientId, capability: capabilityFor(req.user) });
    res.json(tokenRequest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

- [ ] **Step 6: Publish after menu and inventory writes**

In `server/routes/menu.js` add `import { emitMenuChanged } from '../realtime.js';` below the `pool` import. Then:
- In `POST /`, directly after `await conn.commit();`, add `await emitMenuChanged();`
- In `PUT /:id`, directly after `await conn.commit();`, add `await emitMenuChanged();`
- In `DELETE /:id`, directly after the `DELETE FROM menu_item` query, add `await emitMenuChanged();`

In `server/routes/inventory.js` add `import { emitMenuChanged } from '../realtime.js';` below the `pool` import, and add `await emitMenuChanged();` directly after the write query in each of `POST /`, `PUT /:id` and `DELETE /:id`, before the response is sent.

- [ ] **Step 7: Run the suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add server/realtime.js server/routes/realtime.js server/routes/menu.js server/routes/inventory.js tests/realtimeCapability.test.js
git commit -m "feat(realtime): menu channel, guest tokens, publish on menu and stock edits"
```

---

### Task 6: Menu read and write API

**Files:**
- Modify: `server/routes/menu.js`
- Test: `tests/menu.test.js` (extend)

**Interfaces:**
- Consumes: `isChoiceAvailable`, `isItemSoldOut` (Task 2); `loadOptionData`, `loadStock`, `groupsForItem` (Task 3); `emitMenuChanged` (Task 5).
- Produces:
  - `serializeMenuItem(item, links, isPrivileged, { groups = [], stock = new Map() } = {})` — adds `soldOut`, `optionGroupIds`, `optionGroups`.
  - `serializeGroup(group, stock, isPrivileged) → { id, name, minSelect, maxSelect, choices }`; privileged choices also carry `enabled`, `inventoryItemId`, `inventoryQty`.
  - `validateMenuPayload` also checks `optionGroupIds`.
  - `POST`/`PUT /api/menu-items` accept `optionGroupIds` and respond with the fully serialized item.

- [ ] **Step 1: Write the failing tests**

Append to `tests/menu.test.js`:

```js
import { serializeGroup } from '../server/routes/menu.js';

const SIZE_GROUP = {
  id: 10, name: 'Pizza Size', minSelect: 1, maxSelect: 1, sortOrder: 0,
  choices: [
    { id: 100, groupId: 10, name: 'Medium', priceDelta: 0, enabled: true, isDefault: true, inventoryItemId: null, inventoryQty: null, sortOrder: 0 },
    { id: 101, groupId: 10, name: 'Large', priceDelta: 3, enabled: false, isDefault: false, inventoryItemId: null, inventoryQty: null, sortOrder: 1 },
  ],
};

describe('serializeMenuItem — options', () => {
  it('has no options and is not sold out by default', () => {
    const out = serializeMenuItem(ROW, [], false);
    expect(out.optionGroups).toEqual([]);
    expect(out.optionGroupIds).toEqual([]);
    expect(out.soldOut).toBe(false);
  });

  it('shows customers only available choices without stock fields', () => {
    const out = serializeMenuItem(ROW, [], false, { groups: [SIZE_GROUP] });
    expect(out.optionGroupIds).toEqual([10]);
    expect(out.optionGroups[0].choices).toEqual([
      { id: 100, name: 'Medium', priceDelta: 0, isDefault: true, available: true },
    ]);
  });

  it('shows managers every choice with raw switch and stock link', () => {
    const out = serializeMenuItem(ROW, [], true, { groups: [SIZE_GROUP] });
    expect(out.optionGroups[0].choices).toHaveLength(2);
    expect(out.optionGroups[0].choices[1]).toEqual({
      id: 101, name: 'Large', priceDelta: 3, isDefault: false, available: false,
      enabled: false, inventoryItemId: null, inventoryQty: null,
    });
  });

  it('is sold out when a recipe ingredient is short', () => {
    const links = [{ menu_item_id: 1, inventory_item_id: 7, quantity_used: '2' }];
    const out = serializeMenuItem(ROW, links, false, { stock: new Map([[7, 1]]) });
    expect(out.soldOut).toBe(true);
    expect(out.available).toBe(true);
  });

  it('serializeGroup keeps group limits', () => {
    expect(serializeGroup(SIZE_GROUP, new Map(), false)).toMatchObject({ id: 10, minSelect: 1, maxSelect: 1 });
  });
});

describe('validateMenuPayload — optionGroupIds', () => {
  const base = { name: 'X', price: 5 };
  it('accepts a list of ids', () => {
    expect(validateMenuPayload({ ...base, optionGroupIds: [1, 2] })).toBeNull();
  });
  it('rejects non-integer ids', () => {
    expect(validateMenuPayload({ ...base, optionGroupIds: ['a'] })).toBe('optionGroupIds must be an array of group ids');
  });
  it('rejects repeats', () => {
    expect(validateMenuPayload({ ...base, optionGroupIds: [1, 1] })).toBe('optionGroupIds must not repeat');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/menu.test.js`
Expected: FAIL — `serializeGroup` is not exported; `optionGroups` undefined.

- [ ] **Step 3: Implement serialization and validation**

In `server/routes/menu.js`, add imports below the existing ones:

```js
import { isChoiceAvailable, isItemSoldOut } from '../lib/availability.js';
import { loadOptionData, loadStock, groupsForItem } from '../lib/optionData.js';
```

In `validateMenuPayload`, add `optionGroupIds` to the destructured parameter and add before `return null;`:

```js
  if (optionGroupIds != null) {
    if (!Array.isArray(optionGroupIds) || !optionGroupIds.every((id) => Number.isInteger(id) && id > 0)) {
      return 'optionGroupIds must be an array of group ids';
    }
    if (new Set(optionGroupIds).size !== optionGroupIds.length) return 'optionGroupIds must not repeat';
  }
```

Replace `serializeMenuItem` with:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/menu.test.js`
Expected: PASS (old and new tests).

- [ ] **Step 5: Load options in GET and handle `optionGroupIds` in POST/PUT**

Replace the body of the `try` in `GET /` with:

```js
    const [items] = await pool.query('SELECT * FROM menu_item ORDER BY id');
    const [links] = await pool.query('SELECT * FROM menu_item_inventory');
    const optionData = await loadOptionData(pool);
    const stock = await loadStock(pool);

    const isPrivileged = !!req.user && ['manager', 'admin'].includes(req.user.role);
    const result = items.map((item) =>
      serializeMenuItem(item, links, isPrivileged, { groups: groupsForItem(item.id, optionData), stock })
    );

    res.json(result);
```

Add these helpers above `// POST /api/menu-items`:

```js
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
```

In `POST /`: add `optionGroupIds` to the destructured `req.body`. After the recipe-links insert block and before `await conn.commit();`, add:

```js
    if (Array.isArray(optionGroupIds) && !(await replaceOptionGroups(conn, menuId, optionGroupIds))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Unknown option group id' });
    }
```

Replace the `res.status(201).json({ ... })` object with `res.status(201).json(await loadSerializedItem(pool, menuId));` (keep the `await emitMenuChanged();` from Task 5 right after `commit`).

In `PUT /:id`: add `optionGroupIds` to the destructured body. After the recipe-links replacement and before `await conn.commit();`, add:

```js
    // Absent → keep the current attachments (older clients do not send it).
    if (Array.isArray(optionGroupIds) && !(await replaceOptionGroups(conn, Number(req.params.id), optionGroupIds))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Unknown option group id' });
    }
```

Replace the `res.json({ ... })` object with `res.json(await loadSerializedItem(pool, Number(req.params.id)));`.

- [ ] **Step 6: Run the suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add server/routes/menu.js tests/menu.test.js
git commit -m "feat(menu): serve option groups and sold-out state, attach groups to items"
```

---

### Task 7: Option management API

**Files:**
- Create: `server/routes/optionGroups.js`
- Modify: `server/app.js`
- Test: `tests/optionGroups.test.js`

**Interfaces:**
- Consumes: `loadOptionData`, `loadStock` (Task 3); `serializeGroup` (Task 6); `emitMenuChanged` (Task 5).
- Produces: `validateOptionGroupPayload(body) → string|null`; routers `groupsRouter` (`/api/option-groups`: GET, POST, PUT `/:id`, DELETE `/:id`) and `choicesRouter` (`/api/option-choices`: PATCH `/:id` with `{ enabled }`). GET and write responses use `{ ...serializeGroup(g, stock, true), sortOrder, usedBy: [{ id, name }] }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/optionGroups.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { validateOptionGroupPayload } from '../server/routes/optionGroups.js';

const valid = () => ({
  name: 'Soda Flavor', minSelect: 1, maxSelect: 1,
  choices: [{ name: 'Coke', isDefault: true }, { name: 'Sprite', inventoryItemId: 5, inventoryQty: 1 }],
});

describe('validateOptionGroupPayload', () => {
  it('accepts a valid group', () => {
    expect(validateOptionGroupPayload(valid())).toBeNull();
  });
  it('requires a name', () => {
    expect(validateOptionGroupPayload({ ...valid(), name: '  ' })).toBe('name must be 1–80 characters');
  });
  it('checks min/max', () => {
    expect(validateOptionGroupPayload({ ...valid(), minSelect: 2, maxSelect: 1 })).toBe('minSelect cannot be more than maxSelect');
    expect(validateOptionGroupPayload({ ...valid(), maxSelect: 0 })).toBe('maxSelect must be a whole number ≥ 1');
    expect(validateOptionGroupPayload({ ...valid(), minSelect: 0, maxSelect: 3 })).toBe('maxSelect cannot be more than the number of choices');
  });
  it('needs at least one choice', () => {
    expect(validateOptionGroupPayload({ ...valid(), choices: [] })).toBe('a group needs at least one choice');
  });
  it('rejects duplicate choice names regardless of case', () => {
    const body = { ...valid(), choices: [{ name: 'Coke' }, { name: 'coke' }] };
    expect(validateOptionGroupPayload(body)).toBe('choice "coke" appears twice');
  });
  it('needs a positive quantity when stock is linked', () => {
    const body = { ...valid(), choices: [{ name: 'Sprite', inventoryItemId: 5, inventoryQty: 0 }] };
    expect(validateOptionGroupPayload(body)).toBe('inventoryQty must be more than 0 when stock is linked');
  });
  it('limits defaults to maxSelect', () => {
    const body = { ...valid(), choices: [{ name: 'A', isDefault: true }, { name: 'B', isDefault: true }] };
    expect(validateOptionGroupPayload(body)).toBe('at most 1 default choice(s) allowed');
  });
  it('rejects a non-numeric price delta', () => {
    const body = { ...valid(), choices: [{ name: 'A', priceDelta: 'abc' }] };
    expect(validateOptionGroupPayload(body)).toBe('priceDelta must be a number');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/optionGroups.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `server/routes/optionGroups.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/optionGroups.test.js`
Expected: PASS.

- [ ] **Step 5: Mount the routes and allow PATCH**

In `server/app.js`:
- Add the import below `import usersRoutes ...`:

```js
import { groupsRouter as optionGroupRoutes, choicesRouter as optionChoiceRoutes } from './routes/optionGroups.js';
```

- Change the CORS `methods` line to:

```js
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
```

- Add below the `app.use('/api/menu-items', menuRoutes);` line:

```js
const optionAuth = [jwtCheck, loadUser, requireRole('manager', 'admin')];
app.use('/api/option-groups', ...optionAuth, optionGroupRoutes);
app.use('/api/option-choices', ...optionAuth, optionChoiceRoutes);
```

- [ ] **Step 6: Check the CORS preflight by hand**

Start the backend (`npm run server`) and run:

```bash
curl -s -o /dev/null -D - -X OPTIONS http://localhost:3000/api/option-choices/1 \
  -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: PATCH"
```

Expected: the `Access-Control-Allow-Methods` header includes `PATCH`. Stop the server.

- [ ] **Step 7: Run the suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add server/routes/optionGroups.js server/app.js tests/optionGroups.test.js
git commit -m "feat(options): manager API for option groups and choice switches"
```

---

### Task 8: Order line resolution

**Files:**
- Create: `server/lib/orderOptions.js`
- Test: `tests/orderOptions.test.js`

**Interfaces:**
- Consumes: `validateSelection`, `selectedChoices`, `linePrice`, `lineLabel` (Task 1); `isChoiceAvailable`, `isItemSoldOut` (Task 2).
- Produces:
  - `class OrderLineError extends Error`
  - `resolveLine({ menuItem: { id, name, price, available, recipe }, groups, choiceIds, stock }) → { unitPrice, label, snapshot: { choices: [{ id, group, name, priceDelta, inventoryItemId, inventoryQty }] }, stockPerUnit: Map }` — throws `OrderLineError` with a customer-readable message.
  - `snapshotStock(customizations) → Array<{ inventoryItemId, inventoryQty }>`

- [ ] **Step 1: Write the failing tests**

Create `tests/orderOptions.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveLine, snapshotStock, OrderLineError } from '../server/lib/orderOptions.js';

const choice = (over) => ({
  groupId: 1, priceDelta: 0, enabled: true, isDefault: false,
  inventoryItemId: null, inventoryQty: null, sortOrder: 0, ...over,
});
const SODA_FLAVOR = {
  id: 1, name: 'Soda Flavor', minSelect: 1, maxSelect: 1, sortOrder: 0,
  choices: [
    choice({ id: 11, name: 'Coke', isDefault: true }),
    choice({ id: 12, name: 'Sprite', inventoryItemId: 50, inventoryQty: 1, sortOrder: 1 }),
    choice({ id: 13, name: 'Root Beer', enabled: false, sortOrder: 2 }),
  ],
};
const SIZE = {
  id: 2, name: 'Pizza Size', minSelect: 1, maxSelect: 1, sortOrder: 0,
  choices: [choice({ id: 21, groupId: 2, name: 'Large', priceDelta: 3 })],
};
const SODA = { id: 5, name: 'Soda', price: 1, available: true, recipe: [{ inventoryItemId: 60, quantity: 1 }] };
const HAWAIIAN = { id: 6, name: 'Hawaiian Pizza', price: 14.99, available: true, recipe: [] };
const STOCK = new Map([[50, 1], [60, 10]]);

function reason(fn) {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(OrderLineError); return e.message; }
  throw new Error('expected an OrderLineError');
}

describe('resolveLine', () => {
  it('prices, labels and snapshots a valid line', () => {
    const r = resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: [12], stock: STOCK });
    expect(r.unitPrice).toBe(1);
    expect(r.label).toBe('Soda (Sprite)');
    expect(r.stockPerUnit).toEqual(new Map([[60, 1], [50, 1]]));
    expect(r.snapshot).toEqual({
      choices: [{ id: 12, group: 'Soda Flavor', name: 'Sprite', priceDelta: 0, inventoryItemId: 50, inventoryQty: 1 }],
    });
  });

  it('accepts ids sent as strings', () => {
    const r = resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: ['12'], stock: STOCK });
    expect(r.label).toBe('Soda (Sprite)');
  });

  it('adds price deltas into the unit price', () => {
    const r = resolveLine({ menuItem: HAWAIIAN, groups: [SIZE], choiceIds: [21], stock: STOCK });
    expect(r.unitPrice).toBe(17.99);
  });

  it('rejects a switched-off choice', () => {
    expect(reason(() => resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: [13], stock: STOCK })))
      .toBe('Root Beer is no longer available');
  });

  it('rejects a choice whose stock ran out', () => {
    const stock = new Map([[50, 0], [60, 10]]);
    expect(reason(() => resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: [12], stock })))
      .toBe('Sprite is no longer available');
  });

  it('rejects a missing required choice', () => {
    expect(reason(() => resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: [], stock: STOCK })))
      .toBe('Choose a Soda Flavor');
  });

  it('rejects toppings on a specialty pizza', () => {
    expect(reason(() => resolveLine({ menuItem: HAWAIIAN, groups: [SIZE], choiceIds: [21, 11], stock: STOCK })))
      .toBe("Hawaiian Pizza doesn't offer that option");
  });

  it('rejects a sold-out item', () => {
    const stock = new Map([[50, 1], [60, 0]]);
    expect(reason(() => resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: [11], stock })))
      .toBe('Soda is sold out');
  });

  it('rejects a non-array choiceIds', () => {
    expect(reason(() => resolveLine({ menuItem: SODA, groups: [SODA_FLAVOR], choiceIds: 'x', stock: STOCK })))
      .toBe('choiceIds must be an array');
  });

  it('treats absent choiceIds as none', () => {
    const r = resolveLine({ menuItem: { ...SODA, recipe: [] }, groups: [], choiceIds: undefined, stock: STOCK });
    expect(r.label).toBe('Soda');
  });
});

describe('snapshotStock', () => {
  it('lists linked stock from a saved snapshot', () => {
    expect(snapshotStock({ choices: [
      { id: 12, inventoryItemId: 50, inventoryQty: 1 },
      { id: 11, inventoryItemId: null, inventoryQty: null },
    ] })).toEqual([{ inventoryItemId: 50, inventoryQty: 1 }]);
  });
  it('handles legacy customizations', () => {
    expect(snapshotStock({ pizzaSize: 'large' })).toEqual([]);
    expect(snapshotStock(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/orderOptions.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `server/lib/orderOptions.js`**

```js
// Resolves one order line against the database's option rules. Pure: the order
// route loads rows and locked stock, this module decides. Uses the same
// selection rules as the storefront and POS (shared/menuOptions.js).
import { validateSelection, selectedChoices, linePrice, lineLabel } from '../../shared/menuOptions.js';
import { isChoiceAvailable, isItemSoldOut } from './availability.js';

export class OrderLineError extends Error {}

export function resolveLine({ menuItem, groups, choiceIds, stock }) {
  if (choiceIds != null && !Array.isArray(choiceIds)) throw new OrderLineError('choiceIds must be an array');
  const ids = (choiceIds || []).map(Number);

  const view = {
    id: menuItem.id,
    name: menuItem.name,
    price: menuItem.price,
    soldOut: isItemSoldOut({ available: menuItem.available, recipe: menuItem.recipe, groups }, stock),
    optionGroups: groups.map((g) => ({
      ...g,
      choices: g.choices.map((c) => ({ ...c, available: isChoiceAvailable(c, stock) })),
    })),
  };

  const { ok, errors } = validateSelection(view, ids);
  if (!ok) throw new OrderLineError(errors[0].message);

  const picked = selectedChoices(view, ids);
  const stockPerUnit = new Map();
  const need = (id, qty) => {
    if (id != null) stockPerUnit.set(id, (stockPerUnit.get(id) || 0) + qty);
  };
  for (const link of menuItem.recipe) need(link.inventoryItemId, link.quantity);
  for (const { choice } of picked) need(choice.inventoryItemId, choice.inventoryQty);

  return {
    unitPrice: linePrice(view, ids),
    label: lineLabel(view, ids),
    snapshot: {
      choices: picked.map(({ group, choice }) => ({
        id: choice.id,
        group: group.name,
        name: choice.name,
        priceDelta: choice.priceDelta,
        inventoryItemId: choice.inventoryItemId,
        inventoryQty: choice.inventoryQty,
      })),
    },
    stockPerUnit,
  };
}

// Stock to put back when an order is cancelled. Legacy rows have no `choices`.
export function snapshotStock(customizations) {
  const choices = Array.isArray(customizations?.choices) ? customizations.choices : [];
  return choices
    .filter((c) => c.inventoryItemId != null && Number(c.inventoryQty) > 0)
    .map((c) => ({ inventoryItemId: c.inventoryItemId, inventoryQty: Number(c.inventoryQty) }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/orderOptions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/orderOptions.js tests/orderOptions.test.js
git commit -m "feat(orders): resolve order lines against option rules"
```

---

### Task 9: Order route integration

**Files:**
- Modify: `server/routes/orders.js`

**Interfaces:**
- Consumes: `resolveLine`, `OrderLineError`, `snapshotStock` (Task 8); `totalStockNeeds`, `findShortfall`, `crossesThreshold` (Task 2); `loadOptionData`, `loadStock`, `loadThresholds`, `groupsForItem` (Task 3); `emitMenuChanged` (Task 5).
- Produces: `POST /api/orders` reads `items[].choiceIds`; stores server label, true `unit_price`, choice snapshot; deducts recipe + choice stock; cancel restocks both; both publish `menuChanged` only when a threshold is crossed.

There is no DB test harness; this task is verified by the existing suite staying green plus the manual checks in Step 6.

- [ ] **Step 1: Imports and constants**

At the top of `server/routes/orders.js`, change the realtime import and add the new ones:

```js
import { emitNewOrder, emitOrderStatusUpdated, emitOrderDriverAssigned, emitMenuChanged } from '../realtime.js';
import { resolveLine, OrderLineError, snapshotStock } from '../lib/orderOptions.js';
import { totalStockNeeds, findShortfall, crossesThreshold } from '../lib/availability.js';
import { loadOptionData, loadStock, loadThresholds, groupsForItem } from '../lib/optionData.js';
```

Delete these two lines:

```js
// Must stay in sync with POSTerminal.vue pizzaSizeOptions priceDelta values
const PIZZA_SIZE_DELTAS = { 'personal pan': -2, medium: 0, large: 3 };
```

- [ ] **Step 2: Replace pricing in `POST /`**

Replace everything from the comment `// Compute server-authoritative total from DB prices` down to (and including) the line `serverTotal = Math.round(serverTotal * 100) / 100;` with:

```js
    // Load menu rows, recipes and options for every referenced item, then lock
    // every stock row those lines could touch (ascending id, avoids deadlocks).
    const menuItemIds = [...new Set(items.filter((i) => i.menuItemId).map((i) => Number(i.menuItemId)))];
    const menuMap = new Map();
    const recipeMap = new Map();
    let optionData = { groups: new Map(), attachments: new Map() };
    if (menuItemIds.length > 0) {
      const [menuRows] = await conn.query(
        'SELECT id, name, price, available FROM menu_item WHERE id IN (?)', [menuItemIds]
      );
      for (const r of menuRows) menuMap.set(r.id, r);
      const [recipeRows] = await conn.query(
        'SELECT menu_item_id, inventory_item_id, quantity_used FROM menu_item_inventory WHERE menu_item_id IN (?)',
        [menuItemIds]
      );
      for (const r of recipeRows) {
        if (!recipeMap.has(r.menu_item_id)) recipeMap.set(r.menu_item_id, []);
        recipeMap.get(r.menu_item_id).push({ inventoryItemId: r.inventory_item_id, quantity: Number(r.quantity_used) });
      }
      optionData = await loadOptionData(conn);
    }
    const stockIds = [];
    for (const id of menuItemIds) {
      for (const link of recipeMap.get(id) || []) stockIds.push(link.inventoryItemId);
      for (const group of groupsForItem(id, optionData)) {
        for (const c of group.choices) if (c.inventoryItemId != null) stockIds.push(c.inventoryItemId);
      }
    }
    const stock = await loadStock(conn, stockIds, { forUpdate: true });

    let serverTotal = 0;
    const stockLines = [];
    for (const item of items) {
      if (item.menuItemId) {
        const row = menuMap.get(Number(item.menuItemId));
        if (!row) {
          await conn.rollback();
          return res.status(400).json({ error: `Unknown menu item id: ${item.menuItemId}` });
        }
        let resolved;
        try {
          resolved = resolveLine({
            menuItem: {
              id: row.id, name: row.name, price: Number(row.price),
              available: Boolean(row.available), recipe: recipeMap.get(row.id) || [],
            },
            groups: groupsForItem(row.id, optionData),
            choiceIds: item.choiceIds,
            stock,
          });
        } catch (e) {
          if (!(e instanceof OrderLineError)) throw e;
          await conn.rollback();
          return res.status(400).json({ error: e.message });
        }
        item.menuItemId = row.id;
        item.name = resolved.label;
        item.unitPrice = item.paidWithPoints ? 0 : resolved.unitPrice;
        item.customizations = resolved.snapshot;
        stockLines.push({ stockPerUnit: resolved.stockPerUnit, quantity: item.quantity });
      } else {
        if (!isStaff) {
          await conn.rollback();
          return res.status(403).json({ error: 'Custom line items require a staff role' });
        }
        if (item.paidWithPoints) {
          item.unitPrice = 0;
        } else {
          const customPrice = Number(item.price);
          if (!isFinite(customPrice) || customPrice < 0) {
            await conn.rollback();
            return res.status(400).json({ error: 'Invalid price on custom line item' });
          }
          item.unitPrice = customPrice;
        }
        item.customizations = {};
      }
      serverTotal += item.unitPrice * item.quantity;
    }
    serverTotal = Math.round(serverTotal * 100) / 100;

    // Needs are summed across lines, so two lines cannot both take the last unit.
    const stockNeeds = totalStockNeeds(stockLines);
    const shortId = findShortfall(stockNeeds, stock);
    if (shortId != null) {
      await conn.rollback();
      return res.status(409).json({ error: 'Insufficient inventory', inventoryItemId: shortId });
    }
```

- [ ] **Step 3: Insert lines with the resolved values**

In the `// Insert order line items` loop, change the values array to:

```js
        [
          orderId,
          item.menuItemId || null,
          item.name,
          item.quantity,
          item.unitPrice,
          item.paidWithPoints || false,
          item.notes || null,
          JSON.stringify(item.customizations || {}),
        ]
```

- [ ] **Step 4: Replace stock deduction and publish**

Replace the whole `// Check and deduct inventory — lock rows first to prevent overselling` loop (through its closing brace) and the following `await conn.commit();` with:

```js
    // Deduct stock (rows already locked above) and note what changed.
    const stockChanges = new Map();
    for (const [invId, needed] of stockNeeds) {
      if (!stock.has(invId)) continue; // row deleted — nothing to deduct
      await conn.query(
        'UPDATE inventory_item SET quantity = quantity - ?, last_updated = NOW() WHERE id = ?',
        [needed, invId]
      );
      const before = stock.get(invId);
      stockChanges.set(invId, { before, after: before - needed });
    }
    const thresholds = await loadThresholds(conn, [...stockChanges.keys()]);

    await conn.commit();
    if (crossesThreshold(stockChanges, thresholds)) await emitMenuChanged();
```

In `responseOrder`, replace `items: items || [],` with:

```js
      items: items.map((i) => ({
        menuItemId: i.menuItemId || null,
        name: i.name,
        quantity: i.quantity,
        price: i.unitPrice,
        paidWithPoints: Boolean(i.paidWithPoints),
        notes: i.notes || null,
        options: i.customizations || {},
      })),
```

- [ ] **Step 5: Restock choices on cancel**

In `PUT /:id/status`, replace the whole `if (isCancelling) { ... }` block with:

```js
    const stockChanges = new Map();
    let thresholds = new Map();
    if (isCancelling) {
      const [orderItems] = await conn.query(
        'SELECT menu_item_id, quantity, customizations FROM order_item WHERE order_id = ?',
        [orderId]
      );
      const restock = new Map();
      const add = (id, qty) => restock.set(id, (restock.get(id) || 0) + qty);
      for (const item of orderItems) {
        if (item.menu_item_id) {
          const [recipeLinks] = await conn.query(
            'SELECT inventory_item_id, quantity_used FROM menu_item_inventory WHERE menu_item_id = ?',
            [item.menu_item_id]
          );
          for (const link of recipeLinks) add(link.inventory_item_id, Number(link.quantity_used) * item.quantity);
        }
        for (const s of snapshotStock(parseCustomizations(item.customizations))) {
          add(s.inventoryItemId, s.inventoryQty * item.quantity);
        }
      }
      const before = await loadStock(conn, [...restock.keys()], { forUpdate: true });
      for (const [invId, qty] of restock) {
        if (!before.has(invId)) continue;
        await conn.query(
          'UPDATE inventory_item SET quantity = quantity + ?, last_updated = NOW() WHERE id = ?',
          [qty, invId]
        );
        stockChanges.set(invId, { before: before.get(invId), after: before.get(invId) + qty });
      }
      thresholds = await loadThresholds(conn, [...stockChanges.keys()]);
    }
```

Then directly after that handler's `await conn.commit();` add:

```js
    if (crossesThreshold(stockChanges, thresholds)) await emitMenuChanged();
```

- [ ] **Step 6: Verify**

Run: `npm test`
Expected: PASS.

With a local database (`node server/migrate.js`, `npm run seed:options`, `npm start`), sign in as a manager and use the POS or `curl` with a token to check:
1. An order for Soda with `choiceIds: [<Sprite id>]` succeeds; its `order_item` row has `line_name = 'Soda (Sprite)'` and a `customizations` snapshot.
2. A Large pizza line stores `unit_price` = base + 3.00.
3. An order with a topping id on Hawaiian Pizza gets 400 `Hawaiian Pizza doesn't offer that option`.
4. Cancelling the Soda order puts the Soda Cans stock back.

If there is no local database, say so in the task report.

- [ ] **Step 7: Commit**

```bash
git add server/routes/orders.js
git commit -m "feat(orders): validate and price options from the database, fix line unit price"
```

---

### Task 10: Client realtime and store

**Files:**
- Modify: `src/lib/realtime.js`, `src/store/usePosStore.js`, `src/App.vue`
- Test: `tests/usePosStore.test.js`

**Interfaces:**
- Consumes: realtime token route (Task 5), option API (Task 7).
- Produces:
  - `subscribeMenu(onChange: () => void) → Promise<unsubscribe>`
  - `refreshRealtimeAuth() → Promise<void>`
  - `usePosStore()` gains: `state.optionGroups: []`, `state.orderError: ''`, `refreshMenu() → Promise<void>` (coalesces calls within 300 ms), `loadOptionGroups()`, `saveOptionGroup(group)`, `deleteOptionGroup(id)`, `setChoiceEnabled(choiceId, enabled)` — **these four throw** on failure with the server's message.

- [ ] **Step 1: Write the failing test**

Create `tests/usePosStore.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function freshStore() {
  vi.resetModules();
  const mod = await import('../src/store/usePosStore.js');
  return mod.usePosStore();
}

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => [{ id: 1, name: 'Soda' }] }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('refreshMenu', () => {
  it('coalesces bursts of refreshes into one request', async () => {
    const store = await freshStore();
    const done = Promise.all([store.refreshMenu(), store.refreshMenu(), store.refreshMenu()]);
    await vi.advanceTimersByTimeAsync(300);
    await done;
    const menuCalls = globalThis.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/menu-items'));
    expect(menuCalls).toHaveLength(1);
    expect(store.state.menuItems).toEqual([{ id: 1, name: 'Soda' }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/usePosStore.test.js`
Expected: FAIL — `store.refreshMenu is not a function`.

- [ ] **Step 3: Add store methods**

In `src/store/usePosStore.js`:

Add to the `reactive({ ... })` state:

```js
    optionGroups: [],
    orderError: '',
```

Add after `loadAll()`:

```js
  // ── Live menu refresh ──────────────────────────────────────────────────────
  // Several menuChanged events close together trigger one request.

  let refreshTimer = null;
  let refreshWaiters = [];

  function refreshMenu() {
    return new Promise((resolve) => {
      refreshWaiters.push(resolve);
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        const waiters = refreshWaiters;
        refreshWaiters = [];
        try {
          state.menuItems = await api('/menu-items');
        } catch (err) {
          console.error('Failed to refresh menu:', err);
        }
        waiters.forEach((done) => done());
      }, 300);
    });
  }

  // ── Option groups (manager) ────────────────────────────────────────────────
  // These throw so the editor can show the server's message.

  async function loadOptionGroups() {
    state.optionGroups = await api('/option-groups');
  }

  async function saveOptionGroup(group) {
    const saved = group.id
      ? await api(`/option-groups/${group.id}`, { method: 'PUT', body: group })
      : await api('/option-groups', { method: 'POST', body: group });
    await loadOptionGroups();
    return saved;
  }

  async function deleteOptionGroup(id) {
    await api(`/option-groups/${id}`, { method: 'DELETE' });
    state.optionGroups = state.optionGroups.filter((g) => g.id !== id);
  }

  async function setChoiceEnabled(choiceId, enabled) {
    await api(`/option-choices/${choiceId}`, { method: 'PATCH', body: { enabled } });
    await loadOptionGroups();
  }
```

In `addOrder`, set and clear the error message:

```js
  async function addOrder(order) {
    state.orderError = '';
    try {
      const created = await api('/orders', { method: 'POST', body: order });
      state.orders = [...state.orders, created];
      // Re-fetch inventory — tolerated failure (customer role is 403 here)
      try {
        state.inventoryItems = await api('/inventory-items');
      } catch {}
      return created;
    } catch (err) {
      console.error('Failed to place order:', err);
      state.orderError = err.message;
      return null;
    }
  }
```

Add to the `storeInstance = { ... }` object: `refreshMenu, loadOptionGroups, saveOptionGroup, deleteOptionGroup, setChoiceEnabled,`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/usePosStore.test.js`
Expected: PASS.

- [ ] **Step 5: Guest tokens and the menu subscription in `src/lib/realtime.js`**

Replace `fetchTokenRequest` with:

```js
async function fetchTokenRequest() {
  const auth = useAuthStore();
  const headers = {};
  // Guests get a subscribe-only menu token; signed-in users send their JWT.
  if (auth.isAuthenticated.value) headers.Authorization = `Bearer ${await auth.getToken()}`;
  const base = import.meta.env.VITE_API_URL || '';
  const res = await fetch(`${base}/api/realtime/token`, { headers });
  if (!res.ok) throw new Error(`Realtime token request failed: ${res.status}`);
  return res.json();
}
```

Append at the end of the file:

```js
export async function subscribeMenu(onChange) {
  const client = await getClient();
  const channel = client.channels.get('menu');
  const listener = () => onChange();
  channel.subscribe('menuChanged', listener);
  return () => channel.unsubscribe('menuChanged', listener);
}

// After login, fetch a token with the user's full rights without dropping
// existing channel subscriptions.
export async function refreshRealtimeAuth() {
  if (realtimeClient) await realtimeClient.auth.authorize();
}
```

- [ ] **Step 6: Upgrade realtime auth after login**

In `src/App.vue`, add `import { refreshRealtimeAuth } from './lib/realtime.js';` below the store imports. In the `auth0.isAuthenticated` watcher, directly after `await auth.fetchRole();`, add:

```js
      refreshRealtimeAuth().catch((err) => console.warn('Realtime auth refresh failed:', err));
```

- [ ] **Step 7: Run the suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/lib/realtime.js src/store/usePosStore.js src/App.vue tests/usePosStore.test.js
git commit -m "feat(realtime): menu subscription, guest tokens and coalesced menu refresh"
```

---

### Task 11: Cart store v2 and cart/checkout panels

**Files:**
- Modify: `src/store/useCartStore.js`, `src/components/storefront/CartPanel.vue`, `src/components/storefront/CheckoutPanel.vue`
- Test: `tests/useCartStore.test.js` (rewrite fixtures, add cases)

**Interfaces:**
- Consumes: `lineSignature` (Task 1), `refreshMenu` (Task 10).
- Produces: cart lines `{ menuItemId, name, price, choiceIds, notes, quantity }`; `addLine({ menuItemId, name, price, choiceIds = [], notes })`; `reconcileWithMenu(menuItems) → { removed: string[] }`; `consumeResetNotice() → boolean`. `optionSignature` is removed.

- [ ] **Step 1: Update and extend the tests**

In `tests/useCartStore.test.js`, replace the three fixtures with:

```js
const MARGHERITA = { menuItemId: 1, name: 'Margherita', price: 12, choiceIds: [] };
const PEPPERONI_L = { menuItemId: 2, name: 'Pepperoni', price: 15, choiceIds: [13] };
const PEPPERONI_M = { menuItemId: 2, name: 'Pepperoni', price: 12, choiceIds: [12] };
```

Replace the `'treats topping order as irrelevant'` test with:

```js
  it('treats choice order as irrelevant', async () => {
    const cart = await freshStore();
    cart.addLine({ ...MARGHERITA, choiceIds: [22, 21] });
    cart.addLine({ ...MARGHERITA, choiceIds: [21, 22] });
    expect(cart.state.items).toHaveLength(1);
  });
```

Append these cases:

```js
describe('reconcileWithMenu — options', () => {
  const menu = [
    { id: 1, name: 'Margherita', available: true, optionGroups: [] },
    { id: 2, name: 'Pepperoni', available: true, optionGroups: [
      { id: 1, choices: [{ id: 12, available: true }] },
    ] },
  ];

  it('drops a line whose choice is no longer offered', async () => {
    const cart = await freshStore();
    cart.addLine(PEPPERONI_M);
    cart.addLine(PEPPERONI_L);
    const { removed } = cart.reconcileWithMenu(menu);
    expect(cart.state.items.map((i) => i.choiceIds)).toEqual([[12]]);
    expect(removed).toEqual(['Pepperoni']);
  });

  it('drops a sold-out item', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    const { removed } = cart.reconcileWithMenu([{ ...menu[0], soldOut: true }]);
    expect(removed).toEqual(['Margherita']);
  });
});

describe('legacy cart', () => {
  it('drops a v1 cart once and reports it', async () => {
    sessionStorage.setItem('popnic.cart.v1', JSON.stringify({ items: [{ menuItemId: 1, options: {} }] }));
    const cart = await freshStore();
    expect(cart.state.items).toEqual([]);
    expect(sessionStorage.getItem('popnic.cart.v1')).toBeNull();
    expect(cart.consumeResetNotice()).toBe(true);
    expect(cart.consumeResetNotice()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/useCartStore.test.js`
Expected: FAIL — lines are merged by the old option signature; `consumeResetNotice` undefined.

- [ ] **Step 3: Implement in `src/store/useCartStore.js`**

- Add `import { lineSignature } from '../../shared/menuOptions.js';` below the vue import.
- Replace `const STORAGE_KEY = 'popnic.cart.v1';` and the `optionSignature` function with:

```js
const STORAGE_KEY = 'popnic.cart.v2';
// v1 lines stored hard-coded option fields; they cannot be priced any more.
const LEGACY_KEYS = ['popnic.cart.v1'];

function sig(line) {
  return lineSignature(line.menuItemId, line.choiceIds || []);
}

function dropLegacyCarts() {
  let dropped = false;
  for (const key of LEGACY_KEYS) {
    try {
      if (sessionStorage.getItem(key) != null) {
        sessionStorage.removeItem(key);
        dropped = true;
      }
    } catch {
      // Storage blocked — nothing to drop.
    }
  }
  return dropped;
}
```

- In `useCartStore()`, directly after `if (storeInstance) return storeInstance;`, add:

```js
  let resetNotice = dropLegacyCarts();
```

- Replace `addLine`, `setQuantity`, `removeLine` with:

```js
  function addLine({ menuItemId, name, price, choiceIds = [], notes }) {
    const line = { menuItemId, name, price, choiceIds: [...choiceIds], notes, quantity: 1 };
    const existing = state.items.find((i) => sig(i) === sig(line));
    if (existing) {
      existing.quantity += 1;
      return;
    }
    state.items.push(line);
  }

  function setQuantity(line, quantity) {
    if (quantity <= 0) return removeLine(line);
    const target = state.items.find((i) => sig(i) === sig(line));
    if (target) target.quantity = quantity;
  }

  function removeLine(line) {
    state.items = state.items.filter((i) => sig(i) !== sig(line));
  }
```

- Replace `reconcileWithMenu` with:

```js
  function reconcileWithMenu(menuItems) {
    const live = new Map(menuItems.map((m) => [m.id, m]));
    const removed = [];
    state.items = state.items.filter((line) => {
      const match = live.get(line.menuItemId);
      const offered = new Set(
        (match?.optionGroups || []).flatMap((g) => g.choices.filter((c) => c.available !== false).map((c) => c.id))
      );
      const ok = Boolean(match) && match.available !== false && !match.soldOut
        && (line.choiceIds || []).every((id) => offered.has(id));
      if (!ok) removed.push(line.name);
      return ok;
    });
    return { removed };
  }

  function consumeResetNotice() {
    const was = resetNotice;
    resetNotice = false;
    return was;
  }
```

- Add `consumeResetNotice` to the returned `storeInstance` object.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/useCartStore.test.js`
Expected: PASS.

- [ ] **Step 5: Update the panels**

`src/components/storefront/CartPanel.vue`: add `import { lineSignature } from '../../../shared/menuOptions.js';` and replace `lineKey` with:

```js
function lineKey(line) {
  return lineSignature(line.menuItemId, line.choiceIds || []);
}
```

`src/components/storefront/CheckoutPanel.vue`:
- Add `import { lineSignature } from '../../../shared/menuOptions.js';` and replace `lineKey` the same way as in CartPanel.
- In `submit()`, replace `options: line.options || {},` with `choiceIds: line.choiceIds || [],`.
- Replace the `if (!res.ok) { ... }` block with:

```js
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      // Something sold out or changed since the menu loaded — resync the cart.
      if (res.status === 400 || res.status === 409) await syncMenuAfterRejection();
      throw new Error(data.error || res.statusText);
    }
```

- Add above `// ── Back`:

```js
async function syncMenuAfterRejection() {
  await pos.refreshMenu();
  const { removed } = cart.reconcileWithMenu(pos.state.menuItems);
  if (removed.length) toast.info(`Removed from your cart: ${removed.join(', ')}.`);
}
```

- [ ] **Step 6: Run the suite and build, then commit**

Run: `npm test` then `npm run build`
Expected: both succeed.

```bash
git add src/store/useCartStore.js src/components/storefront/CartPanel.vue src/components/storefront/CheckoutPanel.vue tests/useCartStore.test.js
git commit -m "feat(cart): choice-based cart lines, legacy cart reset, resync on rejected checkout"
```

---

### Task 12: Storefront pickers and live menu

**Files:**
- Modify: `src/components/storefront/ItemCustomizeSheet.vue` (script and template replaced; style trimmed and extended), `src/components/storefront/MenuBrowser.vue`, `src/components/storefront/MenuItemCard.vue`

**Interfaces:**
- Consumes: Task 1 helpers, `subscribeMenu` and `refreshMenu` (Task 10), cart API (Task 11).
- Produces: sheet emits `confirm` with `{ menuItemId, name, price, choiceIds }`.

Components have no unit tests (node environment); verification is `npm run build` plus the manual checks in Step 5.

- [ ] **Step 1: Replace the customize sheet's script and template**

Replace everything in `src/components/storefront/ItemCustomizeSheet.vue` above `<style scoped>` with:

```vue
<script setup>
import { ref, computed, watch } from 'vue';
import UiModal from '../ui/UiModal.vue';
import UiButton from '../ui/UiButton.vue';
import {
  defaultSelection, validateSelection, linePrice, lineLabel, pruneSelection,
  toggleChoice, groupHint, formatPriceDelta,
} from '../../../shared/menuOptions.js';

const props = defineProps({
  open: { type: Boolean, required: true },
  // Pass the live item from the store: it updates when the menu refreshes.
  item: { type: Object, default: null },
});

const emit = defineEmits(['close', 'confirm']);

const selected = ref([]);
const notice = ref('');

// Opening starts from the item's defaults.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.item) {
      selected.value = defaultSelection(props.item);
      notice.value = '';
    }
  },
  { immediate: true },
);

// A live refresh of the same item keeps the customer's picks, minus any
// choice that just became unavailable.
watch(
  () => props.item,
  (next, prev) => {
    if (!next || !prev || next.id !== prev.id) return;
    const { choiceIds, dropped } = pruneSelection(next, selected.value, prev);
    if (dropped.length) {
      selected.value = choiceIds;
      notice.value = `${dropped.join(', ')} just sold out.`;
    }
  },
);

const soldOut = computed(() => Boolean(props.item?.soldOut));
const validation = computed(() =>
  props.item ? validateSelection(props.item, selected.value) : { ok: false, errors: [] }
);
const price = computed(() => (props.item ? linePrice(props.item, selected.value) : 0));

function isSelected(choiceId) {
  return selected.value.includes(choiceId);
}

function pick(choiceId) {
  selected.value = toggleChoice(props.item, selected.value, choiceId);
}

function groupError(group) {
  return validation.value.errors.find((e) => e.groupId === group.id)?.message || '';
}

function handleConfirm() {
  if (!props.item || soldOut.value || !validation.value.ok) return;
  emit('confirm', {
    menuItemId: props.item.id,
    name: lineLabel(props.item, selected.value),
    price: price.value,
    choiceIds: [...selected.value],
  });
}
</script>

<template>
  <UiModal
    :open="open"
    :title="item ? `Customize ${item.name}` : ''"
    sheet
    @close="emit('close')"
  >
    <div v-if="item" class="cs">
      <p v-if="soldOut" class="cs__notice cs__notice--danger" role="alert">
        {{ item.name }} just sold out.
      </p>
      <p v-else-if="notice" class="cs__notice" role="status">{{ notice }}</p>

      <section v-for="group in item.optionGroups" :key="group.id" class="cs__section">
        <div class="cs__group-head">
          <p :id="`cs-group-${group.id}`" class="cs__label">{{ group.name }}</p>
          <span class="cs__hint">{{ groupHint(group) }}</span>
        </div>

        <div
          v-if="group.maxSelect === 1"
          class="cs__radio-group"
          role="radiogroup"
          :aria-labelledby="`cs-group-${group.id}`"
        >
          <label
            v-for="choice in group.choices"
            :key="choice.id"
            class="cs__radio-row"
            :class="{ 'cs__radio-row--active': isSelected(choice.id) }"
          >
            <span class="cs__radio-text">
              {{ choice.name }}
              <span v-if="choice.priceDelta" class="cs__price-delta">{{ formatPriceDelta(choice.priceDelta) }}</span>
            </span>
            <input
              type="radio"
              class="cs__radio-input"
              :name="`cs-group-${group.id}`"
              :checked="isSelected(choice.id)"
              @click.prevent="pick(choice.id)"
            />
          </label>
        </div>

        <div v-else class="cs__grid" role="group" :aria-labelledby="`cs-group-${group.id}`">
          <label
            v-for="choice in group.choices"
            :key="choice.id"
            class="cs__check-row"
            :class="{ 'cs__check-row--active': isSelected(choice.id) }"
          >
            <input
              type="checkbox"
              class="cs__check-input"
              :checked="isSelected(choice.id)"
              @click.prevent="pick(choice.id)"
            />
            {{ choice.name }}
            <span v-if="choice.priceDelta" class="cs__price-delta">{{ formatPriceDelta(choice.priceDelta) }}</span>
          </label>
        </div>

        <p v-if="groupError(group)" class="cs__error">{{ groupError(group) }}</p>
      </section>
    </div>

    <template #footer>
      <UiButton variant="secondary" @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" :disabled="soldOut || !validation.ok" @click="handleConfirm">
        Add to Cart — ${{ price.toFixed(2) }}
      </UiButton>
    </template>
  </UiModal>
</template>
```

- [ ] **Step 2: Trim and extend the sheet's styles**

In the same file's `<style scoped>`: delete the rule blocks for `.cs__preset-btn`, `.cs__preset-btn--active`, `.cs__preset-btn:not(.cs__preset-btn--active):hover`, `.cs__preset-btn:focus-visible`, `.cs__select` and `.cs__select:focus-visible` (no longer used). Append:

```css
.cs__group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.cs__hint {
  font-size: var(--text-caption);
  color: var(--ink-muted);
}

.cs__notice {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background: var(--surface-sunken);
  color: var(--ink);
  font-size: var(--text-sm);
}

.cs__notice--danger {
  border-color: var(--danger);
  color: var(--danger-ink);
}

.cs__error {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--danger-ink);
}
```

- [ ] **Step 3: Live menu and option-driven add in `MenuBrowser.vue`**

In `<script setup>`:
- Change the vue import to `import { ref, computed, onMounted, onUnmounted } from 'vue';` and add:

```js
import { subscribeMenu } from '../../lib/realtime.js';
import { needsCustomization } from '../../../shared/menuOptions.js';
```

- Replace `const sheetItem = ref(null);` with:

```js
const sheetItemId = ref(null);
// Read through the store so a live refresh updates the open sheet.
const sheetItem = computed(
  () => store.state.menuItems.find((i) => i.id === sheetItemId.value) || null
);
```

- Replace the whole `onMounted(...)` block with:

```js
function reconcileCart() {
  if (!cart.state.items.length) return;
  const { removed } = cart.reconcileWithMenu(store.state.menuItems);
  if (removed.length) {
    toast.info(
      `${removed.join(', ')} ${removed.length === 1 ? 'is' : 'are'} no longer available and ${removed.length === 1 ? 'was' : 'were'} removed from your cart.`,
    );
  }
}

async function onMenuChanged() {
  await store.refreshMenu();
  reconcileCart();
}

let unsubscribeMenu = null;
let disposed = false;

onMounted(async () => {
  if (cart.consumeResetNotice()) toast.info('Your cart was cleared because the menu changed.');
  if (!store.state.menuItems.length) {
    await store.loadPublic();
    reconcileCart();
  }
  try {
    const unsubscribe = await subscribeMenu(onMenuChanged);
    if (disposed) unsubscribe();
    else unsubscribeMenu = unsubscribe;
  } catch (err) {
    console.warn('Live menu updates unavailable:', err);
  }
});

onUnmounted(() => {
  disposed = true;
  if (unsubscribeMenu) unsubscribeMenu();
});
```

- Delete the local `needsCustomization` function (the `// ── Customization detection` section).
- Replace `onAdd`, `onCustomize`, `onSheetConfirm`, `onSheetClose` with:

```js
function onAdd(item) {
  cart.addLine({ menuItemId: item.id, name: item.name, price: Number(item.price), choiceIds: [] });
  toast.success(`${item.name} added to cart`);
}

function onCustomize(item) {
  if (item.soldOut) return;
  if (!needsCustomization(item)) {
    onAdd(item);
    return;
  }
  sheetItemId.value = item.id;
  sheetOpen.value = true;
}

function onSheetConfirm(payload) {
  cart.addLine(payload);
  toast.success(`${payload.name} added to cart`);
  sheetOpen.value = false;
  sheetItemId.value = null;
}

function onSheetClose() {
  sheetOpen.value = false;
}
```

In the template, keep `@add="onCustomize"` and `@customize="onCustomize"` on `MenuItemCard` (both paths go through the option check).

- [ ] **Step 4: Sold-out state on `MenuItemCard.vue`**

- Add `import UiBadge from '../ui/UiBadge.vue';` to the script.
- Change the root to:

```html
  <UiCard
    interactive
    :padded="false"
    :class="{ 'mic--sold-out': item.soldOut }"
    :aria-disabled="item.soldOut || undefined"
    @click="!item.soldOut && emit('customize', item)"
  >
```

- In the footer, add the badge before the price and disable the button:

```html
      <div class="mic__footer">
        <span class="mic__price">${{ Number(item.price).toFixed(2) }}</span>
        <UiBadge v-if="item.soldOut" tone="neutral">Sold out</UiBadge>
        <button
          v-else
          type="button"
          class="mic__add"
          :aria-label="`Add ${item.name} to cart`"
          @click.stop="emit('add', item)"
        >+</button>
      </div>
```

- Append to `<style scoped>`:

```css
.mic--sold-out {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 5: Build and check by hand**

Run: `npm run build`
Expected: succeeds.

With backend + frontend running (`npm start`) and the option seed applied:
1. As a guest, open the storefront; tap **+** on Soda → the flavor picker opens with Coke pre-selected; Add adds "Soda (Coke)".
2. Hawaiian Pizza shows only Pizza Size; Pizza (build-your-own) shows size + toppings; Large shows "+$3.00" and the button price updates.
3. In a second browser signed in as manager, switch Sprite off (Task 14 UI, or `PATCH /api/option-choices/:id`) → within a second Sprite disappears from the guest's open sheet with "Sprite just sold out."

If the realtime key is missing locally, note that step 3 could not be checked.

- [ ] **Step 6: Commit**

```bash
git add src/components/storefront/ItemCustomizeSheet.vue src/components/storefront/MenuBrowser.vue src/components/storefront/MenuItemCard.vue
git commit -m "feat(storefront): database-driven option pickers, sold-out cards, live menu"
```

---

### Task 13: POS terminal

**Files:**
- Modify: `src/components/POSTerminal.vue`

**Interfaces:**
- Consumes: Task 1 helpers, `subscribeMenu` (Task 10), `refreshMenu` + `state.orderError` (Task 10).
- Produces: POS order lines `{ menuItemId, name, quantity, price, paidWithPoints, choiceIds }`.

- [ ] **Step 1: Replace option state and helpers**

In `<script setup>`:
- Change the first import to `import { computed, ref, watch, onMounted, onUnmounted } from 'vue';` and add:

```js
import { subscribeMenu } from '../lib/realtime.js';
import {
  needsCustomization, defaultSelection, validateSelection, linePrice, lineLabel,
  pruneSelection, toggleChoice, groupHint, formatPriceDelta, lineSignature,
} from '../../shared/menuOptions.js';
```

- Change the store destructure to `const { state, addOrder, updateLoyaltyCustomer, getTier, refreshMenu } = usePosStore();`
- Delete: `pendingMenuItem`, `selectedPizzaSize`, `selectedPizzaStyle`, `selectedPizzaToppings`, `selectedWingFlavor`, `selectedSodaFlavor` refs; the arrays `pizzaSizeOptions`, `pizzaToppingOptions`, `pizzaPresetStyles`, `wingFlavorOptions`, `sodaFlavorOptions`; the functions `isPizzaItem`, `isWingsItem`, `isSodaItem`, `optionSignature`, `calculateCustomPrice`, `buildDisplayName`, `formatToppingLabel`, `applyPizzaPreset`, `togglePizzaTopping`.
- Add in their place:

```js
const pendingMenuItemId = ref(null);
// Read through the store so a live refresh updates the open modal.
const pendingMenuItem = computed(
  () => state.menuItems.find((i) => i.id === pendingMenuItemId.value) || null
);
const selectedChoiceIds = ref([]);
const customizeNotice = ref('');

const customizeValidation = computed(() =>
  pendingMenuItem.value ? validateSelection(pendingMenuItem.value, selectedChoiceIds.value) : { ok: false, errors: [] }
);

watch(pendingMenuItem, (next, prev) => {
  if (!next || !prev || next.id !== prev.id) return;
  const { choiceIds, dropped } = pruneSelection(next, selectedChoiceIds.value, prev);
  if (dropped.length) {
    selectedChoiceIds.value = choiceIds;
    customizeNotice.value = `${dropped.join(', ')} just sold out.`;
  }
});

function groupErrorFor(group) {
  return customizeValidation.value.errors.find((e) => e.groupId === group.id)?.message || '';
}

function pickChoice(choiceId) {
  selectedChoiceIds.value = toggleChoice(pendingMenuItem.value, selectedChoiceIds.value, choiceId);
}

function posLineKey(line) {
  return `${line.paidWithPoints ? 'pts' : 'cash'}|${lineSignature(line.menuItemId, line.choiceIds || [])}`;
}

let unsubscribeMenu = null;
let disposed = false;
onMounted(async () => {
  try {
    const unsubscribe = await subscribeMenu(() => refreshMenu());
    if (disposed) unsubscribe();
    else unsubscribeMenu = unsubscribe;
  } catch (err) {
    console.warn('Live menu updates unavailable:', err);
  }
});
onUnmounted(() => {
  disposed = true;
  if (unsubscribeMenu) unsubscribeMenu();
});
```

- [ ] **Step 2: Replace order-building functions**

Replace `addConfiguredToOrder`, `addToOrder`, `confirmCustomization`, `updateQuantity`, `removeItem` with:

```js
function addConfiguredToOrder(menuItem, usePoints = false, choiceIds = []) {
  if (!menuItem.available || menuItem.soldOut) return;

  if (usePoints) {
    if (!selectedCustomer.value) {
      alert('Select a loyalty customer first.');
      return;
    }
    if (!menuItem.pointsValue || selectedCustomer.value.points < menuItem.pointsValue) {
      alert('Not enough points for this item.');
      return;
    }
  }

  const line = {
    menuItemId: menuItem.id,
    name: lineLabel(menuItem, choiceIds),
    quantity: 1,
    price: usePoints ? 0 : linePrice(menuItem, choiceIds),
    paidWithPoints: usePoints,
    choiceIds: [...choiceIds],
  };
  const existing = currentOrder.value.find((item) => posLineKey(item) === posLineKey(line));
  if (existing) {
    existing.quantity += 1;
    currentOrder.value = [...currentOrder.value];
    return;
  }
  currentOrder.value = [...currentOrder.value, line];
}

function addToOrder(menuItem, usePoints = false) {
  if (!needsCustomization(menuItem)) {
    addConfiguredToOrder(menuItem, usePoints);
    return;
  }
  pendingMenuItemId.value = menuItem.id;
  pendingUsePoints.value = usePoints;
  selectedChoiceIds.value = defaultSelection(menuItem);
  customizeNotice.value = '';
  customizationOpen.value = true;
}

function confirmCustomization() {
  if (!pendingMenuItem.value || !customizeValidation.value.ok) return;
  addConfiguredToOrder(pendingMenuItem.value, pendingUsePoints.value, selectedChoiceIds.value);
  customizationOpen.value = false;
  pendingMenuItemId.value = null;
}

function updateQuantity(orderItem, delta) {
  const key = posLineKey(orderItem);
  currentOrder.value = currentOrder.value.map((item) =>
    posLineKey(item) === key ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
  );
}

function removeItem(orderItem) {
  const key = posLineKey(orderItem);
  currentOrder.value = currentOrder.value.filter((item) => posLineKey(item) !== key);
}
```

- [ ] **Step 3: Send choiceIds and surface server errors**

In `placeOrder`, change `items: currentOrder.value,` to:

```js
      items: currentOrder.value.map((line) => ({
        menuItemId: line.menuItemId,
        name: line.name,
        quantity: line.quantity,
        price: line.price,
        paidWithPoints: line.paidWithPoints,
        choiceIds: line.choiceIds || [],
      })),
```

and replace the failure branch with:

```js
  if (!created) {
    alert(state.orderError || 'Failed to place order. Please try again.');
    await refreshMenu();
    return;
  }
```

- [ ] **Step 4: Template changes**

- Menu grid "Add" button: change `:class` and `:disabled` to use `item.available && !item.soldOut`, and show the state:

```html
              <button
                class="flex-1 px-2 py-1 rounded border text-sm"
                :class="item.available && !item.soldOut ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'"
                :disabled="!item.available || item.soldOut"
                @click="addToOrder(item, false)"
              >
                {{ item.soldOut ? 'Sold out' : 'Add' }}
              </button>
```

  and add `:disabled="item.soldOut"` to the points button.
- Current-order list: change the `:key` to `posLineKey(item)`.
- Replace the whole contents of `<div class="flex-1 overflow-y-auto p-4 space-y-4">` in the customization modal with:

```html
          <p v-if="pendingMenuItem?.soldOut" class="text-sm rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2">
            {{ pendingMenuItem.name }} just sold out.
          </p>
          <p v-else-if="customizeNotice" class="text-sm rounded border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
            {{ customizeNotice }}
          </p>

          <div v-for="group in pendingMenuItem?.optionGroups || []" :key="group.id">
            <div class="flex items-baseline justify-between mb-2">
              <p class="text-sm font-medium">{{ group.name }}</p>
              <span class="text-xs text-gray-500">{{ groupHint(group) }}</span>
            </div>
            <div :class="group.maxSelect === 1 ? 'space-y-2' : 'grid grid-cols-2 gap-2'">
              <label
                v-for="choice in group.choices"
                :key="choice.id"
                class="flex items-center justify-between gap-2 border rounded px-3 py-2 text-sm cursor-pointer"
                :class="selectedChoiceIds.includes(choice.id) ? 'bg-blue-50 border-blue-300' : ''"
              >
                <span>{{ choice.name }}</span>
                <span class="flex items-center gap-2">
                  <span v-if="choice.priceDelta" class="text-xs text-gray-500">{{ formatPriceDelta(choice.priceDelta) }}</span>
                  <input
                    :type="group.maxSelect === 1 ? 'radio' : 'checkbox'"
                    :name="`pos-group-${group.id}`"
                    :checked="selectedChoiceIds.includes(choice.id)"
                    @click.prevent="pickChoice(choice.id)"
                  />
                </span>
              </label>
            </div>
            <p v-if="groupErrorFor(group)" class="text-xs text-red-600 mt-1">{{ groupErrorFor(group) }}</p>
          </div>
```

- Change the modal's confirm button to:

```html
          <button
            class="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
            :disabled="!customizeValidation.ok || pendingMenuItem?.soldOut"
            @click="confirmCustomization"
          >Add to Order</button>
```

- [ ] **Step 5: Build and check by hand**

Run: `npm run build`
Expected: succeeds, with no references left to the deleted names (search: `grep -n "isPizzaItem\|sodaFlavor\|pizzaSize" src/components/POSTerminal.vue` returns nothing).

Signed in as cashier: add a Soda (modal with flavors), a Large Build-Your-Own pizza with two toppings, and a Hawaiian (size only); place the order; the kitchen display shows each line's label, e.g. "Soda (Sprite)".

- [ ] **Step 6: Commit**

```bash
git add src/components/POSTerminal.vue
git commit -m "feat(pos): database-driven option pickers and live menu"
```

---

### Task 14: Menu Management — options tab and item attachments

**Files:**
- Create: `src/components/OptionGroupsEditor.vue`
- Modify: `src/components/MenuManagement.vue`

**Interfaces:**
- Consumes: `state.optionGroups`, `loadOptionGroups`, `saveOptionGroup`, `deleteOptionGroup`, `setChoiceEnabled`, `refreshMenu` (Task 10); `subscribeMenu` (Task 10); `optionGroupIds` on menu writes (Task 6).
- Produces: UI only.

- [ ] **Step 1: Create `src/components/OptionGroupsEditor.vue`**

```vue
<script setup>
import { reactive, ref, onMounted } from 'vue';
import { usePosStore } from '../store/usePosStore';

const { state, loadOptionGroups, saveOptionGroup, deleteOptionGroup, setChoiceEnabled } = usePosStore();

const modalOpen = ref(false);
const saving = ref(false);
const error = ref('');
const form = reactive({ id: null, name: '', minSelect: 1, maxSelect: 1, choices: [] });

onMounted(async () => {
  try {
    await loadOptionGroups();
  } catch (err) {
    error.value = err.message;
  }
});

function blankChoice() {
  return { id: null, name: '', priceDelta: 0, enabled: true, isDefault: false, inventoryItemId: null, inventoryQty: 1 };
}

function openCreate() {
  Object.assign(form, { id: null, name: '', minSelect: 1, maxSelect: 1, choices: [blankChoice()] });
  error.value = '';
  modalOpen.value = true;
}

function openEdit(group) {
  Object.assign(form, {
    id: group.id,
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    choices: group.choices.map((c) => ({
      id: c.id,
      name: c.name,
      priceDelta: c.priceDelta,
      enabled: c.enabled,
      isDefault: c.isDefault,
      inventoryItemId: c.inventoryItemId,
      inventoryQty: c.inventoryQty ?? 1,
    })),
  });
  error.value = '';
  modalOpen.value = true;
}

function addChoice() {
  form.choices.push(blankChoice());
}

function removeChoice(index) {
  form.choices.splice(index, 1);
}

function moveChoice(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= form.choices.length) return;
  const [row] = form.choices.splice(index, 1);
  form.choices.splice(target, 0, row);
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    await saveOptionGroup({
      id: form.id || undefined,
      name: form.name.trim(),
      minSelect: Number(form.minSelect),
      maxSelect: Number(form.maxSelect),
      choices: form.choices.map((c) => ({
        ...(c.id ? { id: c.id } : {}),
        name: c.name.trim(),
        priceDelta: Number(c.priceDelta) || 0,
        enabled: Boolean(c.enabled),
        isDefault: Boolean(c.isDefault),
        inventoryItemId: c.inventoryItemId ? Number(c.inventoryItemId) : null,
        inventoryQty: c.inventoryItemId ? Number(c.inventoryQty) : null,
      })),
    });
    modalOpen.value = false;
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function remove(group) {
  if (!confirm(`Delete the "${group.name}" option group?`)) return;
  try {
    await deleteOptionGroup(group.id);
  } catch (err) {
    alert(err.message);
  }
}

async function toggle(choice) {
  try {
    await setChoiceEnabled(choice.id, !choice.enabled);
  } catch (err) {
    alert(err.message);
  }
}

function stockName(id) {
  return state.inventoryItems.find((i) => i.id === id)?.name || 'stock';
}

function rule(group) {
  if (group.maxSelect === 1) return group.minSelect === 1 ? 'Pick 1 (required)' : 'Pick 1 (optional)';
  return `Pick ${group.minSelect}–${group.maxSelect}`;
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <p class="text-sm text-gray-500">Choices customers and cashiers pick from. Switch a choice off when you run out.</p>
      <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="openCreate">Add Option Group</button>
    </div>

    <p v-if="error && !modalOpen" class="text-sm text-red-600">{{ error }}</p>
    <p v-if="!state.optionGroups.length && !error" class="text-sm text-gray-500">No option groups yet.</p>

    <div v-for="group in state.optionGroups" :key="group.id" class="bg-white rounded-xl border p-4 space-y-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="font-semibold">{{ group.name }}</p>
          <p class="text-xs text-gray-500">
            {{ rule(group) }} ·
            <span v-if="group.usedBy.length">Used by {{ group.usedBy.map((u) => u.name).join(', ') }}</span>
            <span v-else>Not used by any menu item</span>
          </p>
        </div>
        <div class="flex gap-2">
          <button class="px-2 py-1 border rounded" @click="openEdit(group)">Edit</button>
          <button class="px-2 py-1 border border-red-300 text-red-600 rounded" @click="remove(group)">Delete</button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="choice in group.choices"
          :key="choice.id"
          class="px-2 py-1 rounded text-xs border"
          :class="choice.available ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-100 border-gray-200 text-gray-600'"
          :title="choice.enabled ? 'Click to switch off' : 'Click to switch on'"
          @click="toggle(choice)"
        >
          {{ choice.name }}
          <span v-if="!choice.enabled">· Off</span>
          <span v-else-if="!choice.available">· Out of {{ stockName(choice.inventoryItemId) }}</span>
        </button>
      </div>
    </div>

    <div v-if="modalOpen" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl border w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <h2 class="text-lg font-semibold p-4 border-b">{{ form.id ? 'Edit' : 'New' }} Option Group</h2>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div class="md:col-span-1">
              <label class="text-sm">Name</label>
              <input v-model="form.name" class="w-full border rounded px-3 py-2" placeholder="Soda Flavor" />
            </div>
            <div>
              <label class="text-sm">Must pick at least</label>
              <input v-model.number="form.minSelect" type="number" min="0" class="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label class="text-sm">Can pick at most</label>
              <input v-model.number="form.maxSelect" type="number" min="1" class="w-full border rounded px-3 py-2" />
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500">
                  <th class="py-1 pr-2">Choice</th>
                  <th class="py-1 pr-2">Price +/−</th>
                  <th class="py-1 pr-2">Default</th>
                  <th class="py-1 pr-2">On</th>
                  <th class="py-1 pr-2">Stock item</th>
                  <th class="py-1 pr-2">Qty</th>
                  <th class="py-1"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(choice, index) in form.choices" :key="choice.id ?? `new-${index}`" class="border-t">
                  <td class="py-1 pr-2"><input v-model="choice.name" class="w-full border rounded px-2 py-1" /></td>
                  <td class="py-1 pr-2"><input v-model.number="choice.priceDelta" type="number" step="0.01" class="w-24 border rounded px-2 py-1" /></td>
                  <td class="py-1 pr-2"><input v-model="choice.isDefault" type="checkbox" /></td>
                  <td class="py-1 pr-2"><input v-model="choice.enabled" type="checkbox" /></td>
                  <td class="py-1 pr-2">
                    <select v-model="choice.inventoryItemId" class="border rounded px-2 py-1 bg-white">
                      <option :value="null">Not linked</option>
                      <option v-for="inv in state.inventoryItems" :key="inv.id" :value="inv.id">{{ inv.name }}</option>
                    </select>
                  </td>
                  <td class="py-1 pr-2">
                    <input
                      v-model.number="choice.inventoryQty"
                      type="number"
                      min="0.001"
                      step="0.001"
                      class="w-20 border rounded px-2 py-1"
                      :disabled="!choice.inventoryItemId"
                    />
                  </td>
                  <td class="py-1 whitespace-nowrap">
                    <button class="px-1" aria-label="Move up" @click="moveChoice(index, -1)">↑</button>
                    <button class="px-1" aria-label="Move down" @click="moveChoice(index, 1)">↓</button>
                    <button class="px-1 text-red-600" aria-label="Remove choice" @click="removeChoice(index)">✕</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button class="px-3 py-1 border rounded text-sm" @click="addChoice">Add choice</button>

          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        </div>

        <div class="flex justify-end gap-2 p-4 border-t">
          <button class="px-3 py-2 border rounded" @click="modalOpen = false">Cancel</button>
          <button class="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-60" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Wire the tab and the item form in `MenuManagement.vue`**

In `<script setup>`:
- Change the first import to `import { computed, reactive, ref, onMounted, onUnmounted } from 'vue';` and add:

```js
import OptionGroupsEditor from './OptionGroupsEditor.vue';
import { subscribeMenu } from '../lib/realtime.js';
```

- Change the store destructure to:

```js
const { state, addMenuItem, updateMenuItem, deleteMenuItem, loadOptionGroups, refreshMenu } = usePosStore();
```

- Add `const activeTab = ref('items');`
- Add `optionGroupIds: [],` to the `form` reactive object; add `form.optionGroupIds = [];` in `resetForm()`; add `form.optionGroupIds = [...(item.optionGroupIds || [])];` in `openEdit(item)`.
- Add `optionGroupIds: [...form.optionGroupIds],` to the `payload` in `saveItem()`.
- Add:

```js
function toggleOptionGroup(groupId) {
  form.optionGroupIds = form.optionGroupIds.includes(groupId)
    ? form.optionGroupIds.filter((id) => id !== groupId)
    : [...form.optionGroupIds, groupId];
}

// Another manager's edits (or an order selling something out) show up live.
let unsubscribeMenu = null;
let disposed = false;
onMounted(async () => {
  loadOptionGroups().catch((err) => console.error('Failed to load option groups:', err));
  try {
    const unsubscribe = await subscribeMenu(() => {
      refreshMenu();
      loadOptionGroups().catch(() => {});
    });
    if (disposed) unsubscribe();
    else unsubscribeMenu = unsubscribe;
  } catch (err) {
    console.warn('Live menu updates unavailable:', err);
  }
});
onUnmounted(() => {
  disposed = true;
  if (unsubscribeMenu) unsubscribeMenu();
});
```

In the template:
- Directly under the header block (the `div` containing the "Add Menu Item" button), add the tab switcher:

```html
    <div class="flex gap-2 border-b">
      <button
        class="px-3 py-2 text-sm -mb-px border-b-2"
        :class="activeTab === 'items' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'"
        @click="activeTab = 'items'"
      >Menu Items</button>
      <button
        class="px-3 py-2 text-sm -mb-px border-b-2"
        :class="activeTab === 'options' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'"
        @click="activeTab = 'options'"
      >Options</button>
    </div>

    <OptionGroupsEditor v-if="activeTab === 'options'" />
```

- Wrap the stats grid and the items table (the `grid grid-cols-1 md:grid-cols-4` div and the `overflow-x-auto` table div) in `<template v-if="activeTab === 'items'"> … </template>`, and show the "Add Menu Item" button only on that tab (`v-if="activeTab === 'items'"`).
- In the table's availability cell, after the existing toggle button, add `<span v-if="item.soldOut && item.available" class="ml-2 text-xs text-red-600">Sold out</span>`.
- In the item modal, directly after the ingredients block (the `border rounded-lg p-3 space-y-3` div), add:

```html
        <div class="border rounded-lg p-3 space-y-2">
          <p class="text-sm font-medium">Options</p>
          <p class="text-xs text-gray-500">Pickers shown when this item is ordered, in the order you tick them.</p>
          <p v-if="!state.optionGroups.length" class="text-xs text-gray-500">No option groups yet — create them in the Options tab.</p>
          <label v-for="group in state.optionGroups" :key="group.id" class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              :checked="form.optionGroupIds.includes(group.id)"
              @change="toggleOptionGroup(group.id)"
            />
            {{ group.name }}
          </label>
        </div>
```

- [ ] **Step 3: Build and check by hand**

Run: `npm run build`
Expected: succeeds.

Signed in as manager:
1. Options tab lists Pizza Size, Toppings, Wing Flavor, Soda Flavor with "Used by …".
2. Click "Sprite" chip → it greys out "· Off"; click again → back on.
3. Edit Soda Flavor: link Sprite to a new "Sprite Cans" stock row (create it in Inventory first, quantity 1), save; place a Sprite order → the chip shows "· Out of Sprite Cans" without reloading.
4. Edit Hawaiian Pizza → Options checklist shows only Pizza Size ticked; save keeps it.
5. Deleting a group in use shows "Used by …" and does nothing.

- [ ] **Step 4: Commit**

```bash
git add src/components/OptionGroupsEditor.vue src/components/MenuManagement.vue
git commit -m "feat(menu-management): option group editor and item option attachments"
```

---

### Task 15: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

- Commands block: add after `npm run seed`:

```bash
# Add option groups, specialty pizzas and attachments without resetting data
npm run seed:options
```

- In "Backend", change the routes line to include option routes:

```
Routes: `/api/auth`, `/api/realtime`, `/api/menu-items`, `/api/option-groups`, `/api/option-choices`, `/api/inventory-items`, `/api/orders`, `/api/customers`, `/api/users`.
```

- Add to the auth-policy paragraph: "`/api/option-groups` and `/api/option-choices` are manager+."
- Replace the `server/routes/orders.js` paragraph's pricing sentence with: "Each menu-item line sends `choiceIds`; `server/lib/orderOptions.js` validates them against the item's attached option groups (shared rules in `shared/menuOptions.js`), prices the line (base + choice deltas, stored in `unit_price`), snapshots the choices into `customizations`, and stock for recipes and linked choices is deducted with rows locked. Cancelling restocks both."
- In the Realtime bullets, add: "`menu` channel: the server publishes an empty `menuChanged` after menu/option/inventory edits and when an order or cancellation moves stock across an availability threshold; clients refetch `GET /api/menu-items`." and change the token bullet to: "`GET /api/realtime/token` works for guests (subscribe-only on `menu`); drivers get publish rights on `delivery:*`, everyone else is subscribe-only."
- Add a "Menu options" note under "Data model note": "`option_group` / `option_choice` / `menu_item_option_group` hold item options. A choice is available when switched on and its linked stock covers `inventory_qty`; an item is `soldOut` when switched off, short on a recipe ingredient, or a required group has no available choice (`server/lib/availability.js`)."

- [ ] **Step 2: Full check**

Run: `npm test` then `npm run build`
Expected: all tests pass; build succeeds.

Run: `grep -rn "pizzaSize\|sodaFlavor\|wingFlavor\|PIZZA_SIZE_DELTAS\|optionSignature" src server shared`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): document database-driven menu options and live availability"
```

---

## Rollout (operator, after merge — not an implementation task)

1. `node server/migrate.js` against Aiven.
2. `npm run seed:options` against Aiven; read its printed attachments and specialty-pizza lines; adjust specialty prices and recipes in Menu Management.
3. Deploy the backend (Vercel), then immediately `npm run deploy` for the frontend. Between the two, pizza, wings and soda orders from the old frontend are rejected with a 400.
