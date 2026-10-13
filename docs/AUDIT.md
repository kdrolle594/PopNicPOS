# Code audit — 2026-10-13

Scope: `server/`, `shared/`, auth/realtime wiring, dependencies. Tests: 181/181 pass. Build passes.

## Fixed in this branch

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| 1 | High | `server/routes/customers.js` PUT `/:id` | Cashier+ could edit **any** `app_user`, staff included. Changing an unlinked pre-registered manager/admin's email to an attacker address lets the attacker sign up with it and get linked to that role on login. | Update limited to `user_type = 'customer'`; 404 otherwise. |
| 2 | High | `server/routes/customers.js` DELETE `/:id` | Manager could delete any account, admins included. | Delete limited to `user_type = 'customer'`. |
| 3 | High (conditional) | `server/middleware/auth.js` | Staff promotion matched on the DB email, which customers can change via `PUT /api/customers/me`. Exploitable where `UNIQUE(email)` was not applied (migrate skips it when duplicates exist). | Promotion uses the verified token email. |
| 4 | Medium | `server/routes/orders.js` POST | Order-number retry was useless: plain `SELECT MAX` reads the transaction's REPEATABLE READ snapshot, so all 3 retries collide → 500 under concurrent orders. | Locking read (`FOR UPDATE`). |
| 5 | Low | `server/routes/orders.js` PUT `/:id/status` | Non-numeric id → 500. | 400 validation like the other routes. |
| 6 | High (deps) | `package.json` | `vercel` CLI in runtime deps pulled ~43 vulnerable packages; plus 10 runtime advisories (proxy-addr critical, mysql2, vue, qs, …). | `vercel` → devDependencies; `npm audit fix` (non-breaking). `npm audit --omit=dev`: 0. |

## Follow-ups (fixed in second commit)

| Problem | Fix |
|---|---|
| Existing customers couldn't be made staff (409 on `POST /api/users`). | `POST /api/users` promotes an existing customer account in place (keeps its Auth0 link, returns `promoted: true`); staff emails still 409. |
| `PUT /api/customers/me` changed email without verification. | Email is read-only there (400 if sent); it comes from Auth0. |
| `GET /api/orders` unbounded; drivers/kitchen saw every customer's details. | Scoped per role (`orderListScope` in `server/lib/orderRules.js`): customers own orders; drivers unclaimed ready deliveries + own stops; cashier/kitchen open orders + last day; manager/admin open orders + last year. New index `idx_customer_order_created_at` (run `node server/migrate.js`). |
| Cancel restocked using the current recipe. | Recipe is snapshotted into `order_item.customizations.recipe` at order time and used on cancel; older rows fall back to the current recipe. The snapshot is stripped from API responses. |
| Menu/inventory PUT wiped omitted fields (and menu PUT without `inventoryItems` deleted recipe links). | Omitted fields keep current values; recipe links only replaced when `inventoryItems` is sent; 404 for unknown ids. |
| `POST /api/users` early returns skipped `rollback()`. | Added. |
| `items: [null]` on `POST /api/orders` → 500. | 400 "Each item must be an object". |

## Bundle split

Staff views in `src/App.vue` are lazy-loaded (`defineAsyncComponent`). Main JS 808 kB → 395 kB; Chart.js (Analytics, 185 kB) and Leaflet (150 kB) load only when used.

## Still open

- Drivers still receive every `newOrder` on the Ably `orders` channel (full customer details). Fixing it needs a separate driver channel.

## Checked, no issue

JWT verification, role gating in `server/app.js`, customer order scoping, point-redemption and custom-line staff checks, server-side pricing, stock locking order, driver lock order, Ably capabilities (no browser publish, customers only own channel), menu cost hidden from public, `v-html` only on hardcoded SVG, parameterized SQL throughout.
