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

## Not fixed — recommended follow-ups

- **Customer → staff promotion is effectively dead code.** With `UNIQUE(email)`, `POST /api/users` returns 409 for an existing customer's email, so an admin can't make an existing customer staff. Add an explicit "promote user" admin action.
- **`PUT /api/customers/me` sets email without verification.** Harmless after fix 3, but the stored email no longer proves anything. Consider making email read-only (sourced from Auth0).
- **`GET /api/orders` is unbounded.** Returns every order ever plus all line items; will slow down as history grows. Add a date window / pagination; kitchen and drivers only need active orders.
- **Drivers and kitchen get all orders' customer PII** (names, phones, addresses) via `GET /api/orders`. Scope drivers to ready/own deliveries.
- **Cancel restock uses the current recipe**, not the one at order time; recipe edits between order and cancel skew stock. Snapshot recipe quantities into `customizations` like choices.
- **PUT `/api/inventory-items/:id` and `/api/menu-items/:id` are full replaces**: omitted fields become NULL (e.g. `available`, `quantity`). Validate required fields or COALESCE.
- **`POST /api/users`** returns early on validation without `rollback()` (no writes happen, but the pattern is inconsistent).
- **POST `/api/orders` assumes each item is an object**; `items: [null]` → 500 instead of 400.
- Bundle size warning on build (>500 kB chunk) — consider splitting Chart.js/Analytics.

## Checked, no issue

JWT verification, role gating in `server/app.js`, customer order scoping, point-redemption and custom-line staff checks, server-side pricing, stock locking order, driver lock order, Ably capabilities (no browser publish, customers only own channel), menu cost hidden from public, `v-html` only on hardcoded SVG, parameterized SQL throughout.
