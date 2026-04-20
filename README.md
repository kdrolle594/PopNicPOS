# PopNic POS

All-in-one restaurant POS system with a customer ordering portal, kitchen display, and driver delivery tracking. Split deployment — frontend on GitHub Pages, backend on Railway, database on Aiven-hosted MySQL.

Live frontend: <https://kdrolle594.github.io/PopNicPOS>

## Tech Stack

- **Frontend**: Vue 3 (Composition API, no Vue Router), Vite 6, Tailwind CSS 4, Leaflet, Chart.js
- **Backend**: Express 5, Socket.io, MySQL2
- **Auth**: Auth0 — SPA SDK on the frontend, JWT validation (`express-oauth2-jwt-bearer`) on the backend
- **Runtime**: Node.js ≥ 20

## Architecture

- [src/](src/) — Vue 3 SPA. `src/App.vue` swaps views through a `viewMap` keyed off a `currentView` ref (no router). Role-based filtering is handled by [src/store/useAuthStore.js](src/store/useAuthStore.js).
- [src/store/](src/store/) — two manually managed singleton stores (not Pinia): `usePosStore` (REST calls to the backend) and `useAuthStore` (wraps `@auth0/auth0-vue`).
- [server/](server/) — Express app. [server/index.js](server/index.js) registers routes, verifies the MySQL connection, and boots Socket.io via [server/socket.js](server/socket.js).
- [server/middleware/auth.js](server/middleware/auth.js) — `jwtCheck` + `loadUser` + `requireRole(...)`. Users are matched by Auth0 `sub` (`auth_uid`), falling back to email match against pre-registered employees, otherwise auto-created as customers.
- [server/routes/](server/routes/) — REST modules for `auth`, `menu-items`, `inventory-items`, `orders`, `customers`, `users`.
- [server/migrate.js](server/migrate.js) — idempotent schema migrations.
- [database/](database/) — reference SQL for the initial schema.

### Real-time events

Socket.io rooms carry kitchen/customer/driver updates:

- `emitNewOrder`, `emitOrderStatusUpdated`, `emitOrderDriverAssigned` for order lifecycle
- `delivery-{orderId}` rooms for live driver GPS broadcast watched by customers

## Modules

- Dashboard
- POS Terminal — order creation
- Kitchen Display — real-time order queue with status progression (pending → preparing → ready → completed) and driver assignment
- Customer View — menu browsing, cart, delivery tracking on a Leaflet map
- Driver Portal — delivery selection and live GPS broadcast
- Inventory Management
- Menu Management
- Loyalty Program
- Analytics & Reports
- User Management (admin)

## Roles

`app_user` is the core identity row; staff get an `employee_profile` with a `role` enum, customers don't (so their role falls back to `user_type = 'customer'`).

| Role | Access |
|---|---|
| customer | Customer View |
| driver | Driver Portal |
| cashier | POS, Kitchen Display |
| kitchen | Kitchen Display |
| manager | Dashboard, POS, Kitchen, Inventory, Menu, Loyalty, Analytics |
| admin | Everything above + User Management |

When adding a new staff role, update both the enum (via a migration in [server/migrate.js](server/migrate.js)) and the `ROLE_*` maps in [src/store/useAuthStore.js](src/store/useAuthStore.js).

## Run Locally

1. Install dependencies (Node 20+):

   ```
   npm install
   ```

2. Create a `.env` at the repo root with `MYSQL_URI`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, and the `VITE_*` values (see the table below).

3. Apply schema and seed data (first run):

   ```
   node server/migrate.js
   npm run seed
   ```

4. Start frontend and backend together:

   ```
   npm start
   ```

   Or run them separately with `npm run dev` (Vite on 5173) and `npm run server` (Express on 3000). Vite proxies `/api` → `http://localhost:3000` in dev, so leave `VITE_API_URL` empty locally.

## Scripts

```bash
npm run dev          # Vite dev server (frontend only)
npm run server       # Express backend only
npm start            # Both concurrently
npm run seed         # Seed sample data
npm run build        # Production build → dist/
npm run deploy       # Publish dist/ to GitHub Pages
node server/migrate.js   # Idempotent schema migrations
```

## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `MYSQL_URI` | server | Aiven MySQL connection string |
| `PORT` | server | HTTP port (default 3000) |
| `FRONTEND_URL` | server | CORS allowlist in production |
| `AUTH0_DOMAIN` | server | Auth0 tenant domain (issuer) |
| `AUTH0_AUDIENCE` | server | Auth0 API identifier for JWT audience check |
| `VITE_API_URL` | frontend build | Backend base URL (empty = Vite proxy in dev) |
| `VITE_BASE_PATH` | frontend build | GitHub Pages base path |
| `VITE_AUTH0_DOMAIN` | frontend build | Auth0 tenant for SPA SDK |
| `VITE_AUTH0_CLIENT_ID` | frontend build | Auth0 SPA client ID |
| `VITE_AUTH0_AUDIENCE` | frontend build | Must match backend `AUTH0_AUDIENCE` |

## Deployment

- **Frontend → GitHub Pages** via `npm run deploy` (`gh-pages -d dist`). `VITE_BASE_PATH` must match the Pages subpath.
- **Backend → Railway** using Nixpacks ([nixpacks.toml](nixpacks.toml) forces the Node provider and runs `node server/index.js`). `npm ci --omit=dev` keeps the image lean.
- **Database → Aiven MySQL**, referenced via `MYSQL_URI`.

Health check: `GET /api/health`.
