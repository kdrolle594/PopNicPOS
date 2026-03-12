# Phase 1 Schema Plan — PopNic POS

## Goal
Stand up a fresh MySQL database on **Aiven for MySQL**, managed via **MySQL Workbench**, to back the PopNic POS application.

## Infrastructure

| Component        | Detail                                      |
|------------------|---------------------------------------------|
| Database         | Aiven for MySQL (MySQL 8.0+)                |
| Client tool      | MySQL Workbench                             |
| Engine           | InnoDB (all tables)                         |
| Charset          | utf8mb4 / utf8mb4_unicode_ci                |
| SSL              | Required (Aiven default)                    |

## Schema overview

### Users & auth
| Table | Purpose |
|-------|---------|
| `app_user` | Central user record (customer or employee). `auth_uid` maps to your auth provider. |
| `employee_profile` | Role and location for employees (cashier, kitchen, manager, admin). |
| `customer_profile` | Loyalty points, tier, spend totals for customers. |

### Menu & inventory
| Table | Purpose |
|-------|---------|
| `menu_item` | Menu entries with price, cost, category, combo flag, points value. |
| `inventory_item` | Stock items with quantity, unit, reorder level, cost per unit. |
| `menu_item_inventory` | Many-to-many recipe link: how much inventory each menu item uses. |

### Orders
| Table | Purpose |
|-------|---------|
| `customer_order` | Order header — type, status, totals, customer info, payment. |
| `order_item` | Order lines — menu item reference, quantity, unit price, customizations. |

### Audit
| Table | Purpose |
|-------|---------|
| `audit_log` | Tracks employee actions with actor, action type, entity, and JSON payload. |

## Setup steps

1. **Create Aiven service** — provision a MySQL 8.0+ instance in the Aiven console.
2. **Connect from Workbench** — use host/port/user from Aiven; set SSL to "Require" with the downloaded CA cert; set Default Schema to your database name (usually `defaultdb`).
3. **Run schema script** — open `phase1_schema.sql` in Workbench and execute. All tables use `IF NOT EXISTS` so the script is safe to re-run.
4. **Wire up the app** — connect the frontend store to the database via a REST API or direct MySQL client (e.g. `mysql2` in Node.js).
5. **Seed initial data** — insert menu items, inventory, and an admin user through Workbench or an insert script.

## Access control

- Employee roles (cashier, kitchen, manager, admin) stored in `employee_profile.role`.
- Customer queries should be scoped to `customer_user_id = current_user_id`.
- Employee endpoints enforce role checks server-side.

## Key behaviours

- **Place order** — insert `customer_order` + `order_item` rows, then deduct inventory via `menu_item_inventory` quantities, all in a single transaction.
- **Loyalty** — `points_earned` / `points_redeemed` tracked per order; `customer_profile.loyalty_points` and `loyalty_tier` updated accordingly.
- **Audit trail** — write to `audit_log` on sensitive actions (void, refund, role change, etc.).

## Acceptance checks

- Place order decreases inventory quantities correctly.
- Delivery order includes `customer_phone` + `delivery_address`.
- Customer can view only their own orders.
- Manager/admin can access analytics and menu/inventory pages.
- Cashier/kitchen permissions are limited to allowed operations.
