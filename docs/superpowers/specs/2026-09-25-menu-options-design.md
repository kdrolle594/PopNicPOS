# PopNic POS — Database-Driven Menu Options & Live Availability

**Status:** Approved design, ready for implementation planning
**Date:** 2026-09-25
**Branch:** `feat/storefront-redesign`
**Scope:** Move every item option (pizza sizes, toppings, wing flavors, soda flavors) out of hard-coded frontend/server lists into the database; let managers edit them; hide options and items that are switched off or out of stock; push availability changes to every open storefront and POS in realtime.

---

## 1. Goal

A customer or cashier only ever sees options that are actually available *right now*, and the list comes from the database — not from arrays copied into three source files.

- An option is available when a manager has it switched on **and** any stock it is linked to can cover one serving.
- A menu item is sold out when it is switched off, when any recipe ingredient cannot cover one serving, or when a required option group has no available choices.
- When any of that changes — a manager toggles something, stock is edited, an order consumes the last unit, a cancellation restocks — every open storefront and POS updates without a reload.

Custom pizzas remain: "Build Your Own Pizza" lets the customer pick toppings. Specialty pizzas (Hawaiian, Meat Lovers, Veggie) are separate menu items with **fixed** toppings — the customer picks a size only and cannot change their toppings. The server enforces this.

---

## 2. Non-goals

- **No per-choice images, no nested options** (half-and-half toppings, option-of-an-option).
- **No preset table / Style dropdown.** Specialty pizzas are menu items (§4.4).
- **No kitchen display changes.** It shows `line_name` + notes, which will already contain the chosen options.
- **No change to how `menu_item.available` is edited.** It stays the manual switch; sold-out is a separate computed flag.
- **No fix to the `orders` channel privacy issue in this change** (see §11 — separate follow-up).
- **No Pinia, no router, no new UI dependencies** — same constraints as the storefront redesign spec.

---

## 3. Current state (verified facts, 2026-09-25)

Trust these; re-read a file before editing it.

**Hard-coded option lists exist in three places:**
- `src/components/storefront/ItemCustomizeSheet.vue` — `pizzaSizeOptions` (personal pan −2, medium 0, large +3), `pizzaToppingOptions` (11), `pizzaPresetStyles` (hawaiian, meat lovers, veggie), `wingFlavorOptions` (5), `sodaFlavorOptions` (root beer, sprite, coke cola, orange soda, grape soda). Classifies items by name with `isPizzaItem` / `isWingsItem` / `isSodaItem`.
- `src/components/POSTerminal.vue` (585 lines) — the same lists and the same name-sniffing functions, duplicated.
- `src/components/storefront/MenuBrowser.vue` — `needsCustomization(item)` does the same name-sniffing.
- `server/routes/orders.js:22` — `PIZZA_SIZE_DELTAS`, "must stay in sync with POSTerminal.vue".

**Order creation (`POST /api/orders`, `server/routes/orders.js:83`)** runs in one transaction: validates lines, prices lines from `menu_item.price` (+ `PIZZA_SIZE_DELTAS` for pizza size only — nothing else is validated), inserts `customer_order`, inserts `order_item` rows, then deducts stock per `menu_item_inventory` recipe link with `SELECT … FOR UPDATE`, returning **409 `Insufficient inventory`** if short.
- **Bug:** `order_item.unit_price` is written as the base DB price, ignoring the size delta that *is* included in the order total. A large pizza's line shows the medium price.
- Line options are sent as `item.options` (`{ pizzaSize, pizzaStyle, pizzaToppings, wingFlavor, sodaFlavor }`) and stored verbatim as JSON in `order_item.customizations`. A client can send any flavor string.

**Cancellation (`PUT /api/orders/:id/status`, ~line 341)** restocks recipe ingredients (`quantity + quantity_used × qty`). Cancelled orders cannot be reactivated.

**Menu API (`server/routes/menu.js`)** — `GET /` is public (optional auth); `serializeMenuItem(item, links, isPrivileged)` is exported and pure; `cost` is manager/admin-only. `POST`/`PUT` validate with `validateMenuPayload`, and `PUT` replaces `menu_item_inventory` links in a transaction. Mutations require manager+ (policy in `server/app.js`).

**Inventory API (`server/routes/inventory.js`)** — `POST /`, `PUT /:id`, `DELETE /:id`; manager+.

**Schema** — no `CREATE TABLE` DDL in the repo; tables pre-exist on Aiven. `server/migrate.js` holds idempotent migrations that probe `information_schema` before altering. `server/seed.js` (227 lines) **resets** data; seed has a menu item `Soda` (Beverages, $1.00) whose recipe uses inventory `Soda Cans` ×1. There are no per-flavor stock rows.

**Realtime** — `server/realtime.js` publishes via Ably REST (`publish(channel, event, data)`; silently no-ops without `ABLY_API_KEY`). `GET /api/realtime/token` (`server/routes/realtime.js`) is `jwtCheck, loadUser` — **guests cannot get a token**. Capabilities: drivers `delivery:*` publish+subscribe, everyone else subscribe-only on `delivery:*` and `orders`. Client: `src/lib/realtime.js` — `getClient()` with an `authCallback` that always calls `auth.getToken()`; exports `subscribeOrders`, `subscribeDelivery`.

**Cart (`src/store/useCartStore.js`)** — sessionStorage key `popnic.cart.v1`. `optionSignature(options)` builds line identity from the five legacy option fields. `reconcileWithMenu(menuItems)` **removes** lines whose item is missing or `available === false` and returns `{ removed }`; `MenuBrowser.vue` and `CheckoutPanel.vue` call it and toast the removed names.

**Store** — `usePosStore.loadPublic()` fetches `/menu-items` only; `loadAll()` fetches everything for staff.

**Tests** — vitest, node environment (no jsdom, no Vue test utils). `tests/setup.js` stubs `sessionStorage`. Existing: `tests/menu.test.js`, `tests/useCartStore.test.js`. Run with `npm test`. Only pure functions and stores are testable — keep logic in plain modules.

**UI** — primitives in `src/components/ui/` (`UiButton`, `UiModal`, `UiChip`, `UiBadge`, `UiField`, `UiToast`, …), toasts via `useToast()` from `src/lib/useToast.js`. `MenuManagement.vue` is 338 lines.

---

## 4. Data model

Three new tables, created idempotently in `server/migrate.js` (`CREATE TABLE IF NOT EXISTS`). InnoDB, same charset as existing tables.

### 4.1 `option_group`
| column | type | notes |
|---|---|---|
| `id` | INT PK AUTO_INCREMENT | |
| `name` | VARCHAR(80) NOT NULL UNIQUE | "Pizza Size", "Toppings", "Wing Flavor", "Soda Flavor" |
| `min_select` | TINYINT UNSIGNED NOT NULL DEFAULT 0 | 1 = required |
| `max_select` | TINYINT UNSIGNED NOT NULL DEFAULT 1 | `max_select >= min_select`, `max_select >= 1` |
| `sort_order` | INT NOT NULL DEFAULT 0 | |

### 4.2 `option_choice`
| column | type | notes |
|---|---|---|
| `id` | INT PK AUTO_INCREMENT | |
| `group_id` | INT NOT NULL FK → `option_group.id` ON DELETE CASCADE | |
| `name` | VARCHAR(80) NOT NULL | unique per group |
| `price_delta` | DECIMAL(8,2) NOT NULL DEFAULT 0 | may be negative |
| `available` | BOOLEAN NOT NULL DEFAULT TRUE | manual switch |
| `is_default` | BOOLEAN NOT NULL DEFAULT FALSE | pre-selected when the picker opens |
| `inventory_item_id` | INT NULL FK → `inventory_item.id` ON DELETE SET NULL | optional stock link |
| `inventory_qty` | DECIMAL(10,3) NULL | required when `inventory_item_id` is set; > 0 |
| `sort_order` | INT NOT NULL DEFAULT 0 | |

### 4.3 `menu_item_option_group`
| column | type | notes |
|---|---|---|
| `menu_item_id` | INT NOT NULL FK → `menu_item.id` ON DELETE CASCADE | |
| `group_id` | INT NOT NULL FK → `option_group.id` ON DELETE RESTRICT | |
| `sort_order` | INT NOT NULL DEFAULT 0 | |
| PK (`menu_item_id`, `group_id`) | | |

Groups are shared: "Wing Flavor" is defined once and attached to every wings item.

### 4.4 Availability rules (single definition — server and client helper both implement exactly this)

- **Choice available** ⇔ `available = TRUE` **and** (`inventory_item_id IS NULL` **or** stock `quantity >= inventory_qty`).
- **Item sold out** ⇔ `menu_item.available = FALSE` **or** any recipe link has stock `quantity < quantity_used` **or** any attached group with `min_select > 0` has fewer than `min_select` available choices.

### 4.5 Seed data — `server/seedOptions.js` (new, non-destructive)

`npm run seed` resets data and must not be used on the live DB. A separate script `server/seedOptions.js` (npm script `seed:options`) inserts only what is missing (match by name; never updates or deletes existing rows):

| group | min/max | choices (price_delta; **default**) |
|---|---|---|
| Pizza Size | 1/1 | Personal Pan (−2.00), **Medium** (0), Large (+3.00) |
| Toppings | 0/11 | Pepperoni, Ham, Sausage, Bacon, Pineapple, Mushrooms, Onions, Bell Peppers, Black Olives, Tomatoes, Extra Cheese (all 0; none default) |
| Wing Flavor | 1/1 | **Buffalo**, Honey Mustard, Original, BBQ, Sweet and Spicy |
| Soda Flavor | 1/1 | **Coke**, Sprite, Root Beer, Orange Soda, Grape Soda |

Attachments (only for items that have no groups attached yet, so re-runs and manager edits are never overwritten):
- Items whose name contains "pizza" (case-insensitive), **excluding the three specialty names below** → Pizza Size + Toppings. In seed data this is the item named `Pizza`; it is the build-your-own pizza. The script does not rename it — a manager may rename it to "Build Your Own Pizza" in Menu Management.
- Items whose name contains "wings" (seed: `Chicken Wings`) → Wing Flavor.
- Items named exactly `Soda` (case-insensitive) → Soda Flavor.

The script prints every attachment and every created row so the operator can check them.

Specialty pizzas created if absent: **Hawaiian Pizza**, **Meat Lovers Pizza**, **Veggie Pizza** — category matching the existing pizza item, price = the existing pizza item's price (managers adjust), description listing the fixed toppings, attached to **Pizza Size only**. No recipe links are created by the script; managers add them.

Soda flavors are **not** stock-linked by the script (only a generic "Soda Cans" row exists). Managers add per-flavor stock rows and link them in the editor.

`server/seed.js` is updated to create the same data after its reset, reusing the functions from `seedOptions.js`.

---

## 5. API

### 5.1 `GET /api/menu-items` (public, optional auth — unchanged policy)

Each item gains:
```json
{
  "soldOut": false,
  "optionGroups": [
    { "id": 1, "name": "Pizza Size", "minSelect": 1, "maxSelect": 1,
      "choices": [ { "id": 1, "name": "Medium", "priceDelta": 0, "isDefault": true, "available": true } ] }
  ]
}
```
- Guests/customers/non-manager staff: `choices` contains **only available** choices; `available` is always true for them.
- Manager/admin (`isPrivileged`, same test as `cost`): all choices, `available` = computed availability, plus `enabled` (raw switch), `inventoryItemId`, `inventoryQty`.
- `available` on the item stays the raw manual switch. `soldOut` is computed per §4.4.
- Load in ≤ 5 queries total (items, recipe links, attachments, groups, choices joined with stock) — no per-item queries.

Extend the pure `serializeMenuItem` with the extra inputs rather than adding logic to the route.

### 5.2 Option management (manager/admin; register in `server/app.js` with the same guard as menu mutations)

New router `server/routes/optionGroups.js`, mounted at `/api/option-groups` and `/api/option-choices`:

- `GET /api/option-groups` — all groups with all choices (privileged shape) and `usedBy: [{ id, name }]`.
- `POST /api/option-groups` — `{ name, minSelect, maxSelect, sortOrder, choices: [{ name, priceDelta, enabled, isDefault, inventoryItemId, inventoryQty, sortOrder }] }`.
- `PUT /api/option-groups/:id` — same body. Choices with an `id` are updated in place; choices without an `id` are inserted; existing choices absent from the body are deleted. IDs of kept choices never change. One transaction.
- `DELETE /api/option-groups/:id` — 409 `{ error, usedBy }` if attached to any menu item.
- `PATCH /api/option-choices/:id` — `{ enabled }` only. The one-tap "out of Sprite" switch.

Validation (pure function `validateOptionGroupPayload`, exported for tests): name 1–80 chars; `0 <= minSelect <= maxSelect`, `maxSelect >= 1`, `maxSelect <= choices.length`; choice names unique within the group; `priceDelta` finite; `inventoryQty > 0` when `inventoryItemId` is set; for `maxSelect === 1` at most one `isDefault`.

### 5.3 `PUT /api/menu-items/:id` and `POST /api/menu-items`

Accept `optionGroupIds: number[]` (optional). When present, replace the item's `menu_item_option_group` rows in the same transaction as the recipe links (same pattern). Validate that each id exists. Response includes `optionGroupIds`.

### 5.4 `POST /api/orders`

Each line with a `menuItemId` sends `choiceIds: number[]` (may be empty). The legacy `options` object is ignored.

Inside the existing transaction, per line (logic in a pure module `server/lib/orderOptions.js` fed with rows the route loads):
1. Load the item's attached groups and their choices, locking linked stock rows (`FOR UPDATE`) as recipe stock already is.
2. Reject **400** with a readable `error` if: a choice id is not in an attached group (e.g. toppings on Hawaiian Pizza); a choice is unavailable (`"Sprite is no longer available"`); a group's selection count is outside `[minSelect, maxSelect]` (`"Choose a Soda Flavor"`); a choice id repeats. Also reject 400 if the item itself is sold out (`"Hawaiian Pizza is sold out"`).
3. `unitPrice = menu_item.price + Σ priceDelta`, floored at 0, rounded to cents. Use it for the order total **and** write it to `order_item.unit_price` (fixes the §3 bug). Delete `PIZZA_SIZE_DELTAS`.
4. `order_item.customizations` = `{ "choices": [ { "id", "group", "name", "priceDelta", "inventoryItemId", "inventoryQty" } ] }` — a snapshot, so later edits to choices do not change history or restocking.
5. Deduct choice stock (`inventoryQty × quantity`) alongside recipe stock, same 409 behavior.
6. `line_name` = server-built label, e.g. `Soda (Sprite)`, `Build Your Own Pizza (Large, Pepperoni, Bacon)`. The client-sent name is ignored for menu-item lines.

Staff (POS) follow the same rules. Custom (non-menu) lines are unchanged.

### 5.5 Cancellation restock

When cancelling, also restock each line's `customizations.choices[].inventoryItemId` by `inventoryQty × quantity`. Old orders without `choices` restock recipe links only, as today.

---

## 6. Live availability

### 6.1 Server — `menu` channel

Add to `server/realtime.js`: `emitMenuChanged()` → `publish('menu', 'menuChanged', {})`. The payload is empty on purpose: clients refetch `GET /api/menu-items`, so the server's visibility rules stay the single source of truth.

Publish after commit on:
- `POST`/`PUT`/`DELETE /api/menu-items`
- any `/api/option-groups` or `/api/option-choices` mutation
- `POST`/`PUT`/`DELETE /api/inventory-items` (restocks bring items back)
- `POST /api/orders` and order cancellation — **only if** a stock change crossed a threshold.

Threshold crossing (pure function `crossesThreshold(before, after, thresholds)` in `server/lib/availability.js`): for each stock row the transaction changed, the thresholds are every `quantity_used` from recipe links and every `inventory_qty` from choice links that reference it. Publish if for any threshold `t`, `(before >= t) !== (after >= t)`. The route already holds the locked `before` quantities; collect them.

### 6.2 Realtime token for guests

`GET /api/realtime/token` switches from `jwtCheck, loadUser` to `optionalAuth` (existing middleware in `server/middleware/auth.js`):
- No user → `clientId: "guest-" + crypto.randomUUID()`, capability `{ menu: ['subscribe'] }` only.
- Authenticated → existing capability plus `menu: ['subscribe']`.

`src/lib/realtime.js`: `fetchTokenRequest` sends the Authorization header only when `auth.isAuthenticated` is true. Add `subscribeMenu(onChange)` following the `subscribeOrders` pattern. When a guest logs in, the Ably client must be recreated so the token upgrades (close the old client, clear `realtimeClient`/`clientPromise`); expose `resetRealtime()` and call it from the auth watcher in `App.vue`.

### 6.3 Client refresh

`usePosStore` gains `refreshMenu()`: refetch `/menu-items` into `state.menuItems`, coalescing calls within 300 ms into one request. `MenuBrowser.vue` and `POSTerminal.vue` call `subscribeMenu(refreshMenu)` on mount and unsubscribe on unmount. Realtime failures (no Ably key, network) are logged and ignored — the app still works on load-time data plus server validation.

After each refresh:
- Menu cards re-render; `soldOut` items show a "Sold out" `UiBadge`, and card + "+" are disabled.
- The storefront runs `cart.reconcileWithMenu` and toasts removals (existing behavior, extended per §7.3).
- An open customize sheet re-reads its item from the store: a selected choice that disappeared is deselected with an inline note ("Sprite just sold out"); if the item became sold out, the sheet shows that and disables "Add to Cart".

### 6.4 Races

Two customers can still race for the last unit. §5.4 validation is authoritative; the loser's checkout receives the 400/409, `CheckoutPanel` shows the message, calls `refreshMenu()` and reconciles the cart.

---

## 7. Frontend

### 7.1 `src/lib/menuOptions.js` (new, pure — no Vue imports)

- `needsCustomization(item)` → `item.optionGroups?.length > 0`
- `defaultSelection(item)` → choice ids: each group's available `isDefault` choices; if a required group has none, its first available choice.
- `validateSelection(item, choiceIds)` → `{ ok, errors: [{ groupId, message }] }` — same rules as §5.4 step 2.
- `linePrice(item, choiceIds)`, `lineLabel(item, choiceIds)` — label format identical to §5.4 step 6.
- `pruneSelection(item, choiceIds)` → `{ choiceIds, dropped: [names] }` — removes ids no longer present.

Delete every `isPizzaItem` / `isWingsItem` / `isSodaItem` / `needsCustomization` / hard-coded option array from `ItemCustomizeSheet.vue`, `MenuBrowser.vue` and `POSTerminal.vue`.

### 7.2 Pickers

`ItemCustomizeSheet.vue` renders from `item.optionGroups`:
- `maxSelect === 1` → single-select chips (`UiChip`), radio semantics (`role="radiogroup"`).
- `maxSelect > 1` → checkboxes, helper text "Choose up to N" (and "at least N" when `minSelect > 0`); further boxes disabled at the max.
- Non-zero deltas shown beside the choice (`+$3.00` / `−$2.00`). "Add to Cart — $X.XX" uses `linePrice` and is disabled while `validateSelection` fails.
- Emits `{ menuItemId, name: lineLabel(...), price: linePrice(...), choiceIds }`.

`MenuBrowser.vue`: card tap and "+" both go through `onCustomize` (items with groups open the sheet; items without add directly). Sold-out cards are disabled.

`POSTerminal.vue`: its customize modal uses `menuOptions.js` and renders the same group-driven controls in its own existing styling. It sends `choiceIds` on each line.

### 7.3 Cart (`useCartStore.js`)

- Lines store `choiceIds` instead of `options`. `optionSignature` becomes `menuItemId + sorted choiceIds`.
- Bump `STORAGE_KEY` to `popnic.cart.v2`. On load, if `popnic.cart.v1` exists, drop it and set a flag the storefront reads to toast "Your cart was cleared because the menu changed."
- `reconcileWithMenu` also removes lines whose item is `soldOut` or whose `choiceIds` are no longer all present in the item's `optionGroups`. Keeps the `{ removed }` return shape.
- `CheckoutPanel.vue` sends `choiceIds` per line.

### 7.4 Menu Management

- New `src/components/OptionGroupsEditor.vue`, shown as an "Options" tab inside `MenuManagement.vue`:
  - Group list with name, min/max summary, "Used by …", and each choice with an inline on/off switch (`PATCH`).
  - Group editor (`UiModal`): name, min, max; a choices table with name, price delta, default, enabled, stock item (dropdown of inventory items, or "Not linked") + quantity; add/remove/reorder rows. Saves via `PUT`/`POST`.
  - Delete group, surfacing the 409 `usedBy` list.
- Menu item form: an "Options" checklist of groups (like the existing ingredients section), sent as `optionGroupIds`.
- `usePosStore` gains `loadOptionGroups`, `saveOptionGroup`, `deleteOptionGroup`, `setChoiceEnabled`, and passes `optionGroupIds` through menu item create/update.
- Menu Management also subscribes to `menuChanged` so a second manager's edits appear.

---

## 8. Error handling summary

| situation | response | client behavior |
|---|---|---|
| choice unavailable / not attached / count wrong / item sold out | 400 `{ error }` | toast the message, `refreshMenu()`, reconcile cart |
| stock short at deduction | 409 `Insufficient inventory` (existing) | same as above |
| delete group in use | 409 `{ error, usedBy }` | show which items use it |
| invalid group payload | 400 `{ error }` | show inline in editor |
| Ably unavailable | publish no-ops; subscribe fails silently | app works from load-time data + server validation |

---

## 9. Testing

All vitest, node environment, pure modules only.

- `tests/menuOptions.test.js` — default selection (incl. required group with no default), validation (min, max, duplicates, unknown ids), price with negative deltas and floor at 0, label format, `pruneSelection`.
- `tests/orderOptions.test.js` — `server/lib/orderOptions.js`: rejects unattached choice (toppings on Hawaiian), unavailable choice, missing required choice, over-max, duplicates, sold-out item; computes unit price; builds the customizations snapshot and label.
- `tests/availability.test.js` — choice availability, item `soldOut` (switch off, recipe short, required group empty), `crossesThreshold` (down across, up across, no cross, multiple thresholds).
- `tests/menu.test.js` — extend `serializeMenuItem`: customers get only available choices and no stock fields; managers get all; `soldOut` present.
- `tests/optionGroups.test.js` — `validateOptionGroupPayload`.
- `tests/useCartStore.test.js` — choice-based signature (same choices in any order merge), v1 cart dropped with flag, reconcile removes sold-out lines and lines with vanished choices.
- Realtime token capability: extract `capabilityFor(user)` from `server/routes/realtime.js` and test guest / customer / driver.

**Manual verification before merge** (local DB: `node server/migrate.js`, `npm run seed`):
1. Storefront as guest: Soda opens a flavor picker (card tap and "+"); order Soda (Sprite) after login; `order_item` has the right label, price and snapshot.
2. Hawaiian Pizza shows only a size picker; Build Your Own shows sizes + toppings; Large line stores base + 3.00 in `unit_price`.
3. With the storefront open in a second browser: switch Sprite off in Menu Management → it disappears without reload; switch it on → returns.
4. Link Sprite to a stock row with quantity 1; order one → Sprite disappears live in the other browser; cancel that order → Sprite returns.
5. Set a recipe ingredient to 0 in Inventory → the item shows "Sold out" live; restock → it returns.
6. POS: same pickers, same rejections.

---

## 10. Rollout

1. `node server/migrate.js` against Aiven (idempotent).
2. `npm run seed:options` against Aiven; review its printed attachments.
3. Deploy the backend (Vercel).
4. Deploy the frontend immediately after (`npm run deploy`).

Between 3 and 4 the old frontend sends no `choiceIds`, so items with required groups (pizza, wings, soda) are rejected with a 400 until step 4 lands. Keep the gap to minutes.

---

## 11. Follow-up (separate change, not part of this work)

**`orders` channel privacy.** Every authenticated user, including customers, currently receives a subscribe token for the `orders` channel, whose `newOrder` payload includes other customers' names, phone numbers and delivery addresses. Fix separately: customers should not subscribe to `orders`; give them a per-customer channel or per-order status channel instead.

---

## 12. Work breakdown (for the implementation plan)

- **T1 — Schema & seed:** migrations for the three tables; `server/seedOptions.js` + `seed:options` script; `seed.js` reuse.
- **T2 — Availability & order rules (server, pure):** `server/lib/availability.js`, `server/lib/orderOptions.js` with tests.
- **T3 — Menu read API:** `serializeMenuItem` extension, `GET /api/menu-items` loading, tests.
- **T4 — Option management API:** `server/routes/optionGroups.js`, validation + tests, `optionGroupIds` on menu item create/update, app.js policy.
- **T5 — Order integration:** `POST /api/orders` uses T2; `unit_price` fix; choice stock deduction; cancellation restock.
- **T6 — Realtime:** `emitMenuChanged` + threshold publishing in orders/inventory/menu/options routes; guest token; `subscribeMenu`, `resetRealtime`; `refreshMenu` with coalescing.
- **T7 — Client helper & cart:** `src/lib/menuOptions.js`, cart v2 + reconcile, tests.
- **T8 — Storefront UI:** `ItemCustomizeSheet`, `MenuBrowser`, `MenuItemCard` sold-out state, `CheckoutPanel` choiceIds + race handling, live sheet updates.
- **T9 — POS terminal:** group-driven modal, `choiceIds`, live refresh.
- **T10 — Menu Management:** `OptionGroupsEditor.vue`, Options tab, item form checklist, store methods.

Order: T1 → T2 → (T3, T4, T5 in any order) → T6 → T7 → (T8, T9, T10).
