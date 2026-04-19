# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run frontend only (Vite dev server on port 5173)
npm run dev

# Run backend only (Express on port 3000)
npm run server

# Run both frontend and backend concurrently
npm start

# Seed the database
npm run seed

# Run idempotent schema migrations (see server/migrate.js)
node server/migrate.js

# Build for production
npm run build

# Deploy the built frontend to GitHub Pages
npm run deploy
```

## Architecture

**Split deployment**: frontend (GitHub Pages) + backend (Railway).

- Frontend: Vue 3 + Vite + Tailwind CSS — `src/`
- Backend: Express 5 + Socket.io + MySQL2 — `server/`
- Database: Aiven-hosted MySQL (connection via `MYSQL_URI`)
- Auth: Auth0 (SPA SDK on the frontend, JWT validation on the backend)

### Frontend

`src/App.vue` handles view routing via a `viewMap` object — there is no Vue Router. Clicking nav items sets a `currentView` ref that swaps which component is rendered. Which views are actually shown is filtered by the current user's role (see `useAuthStore.allowedViews()`).

Two singleton stores under `src/store/` (both manually managed — not Pinia):
- `usePosStore.js` — reactive POS state + async methods that call the backend REST API. Base URL via `VITE_API_URL` (empty = same-origin proxy in dev, full URL in prod).
- `useAuthStore.js` — wraps `@auth0/auth0-vue`. `fetchRole()` calls `/api/auth/me` with the Auth0 access token, which returns `{ id, userType, name, email, role }`. `ROLE_DEFAULT_VIEW` and `ROLE_VIEWS` constants define default landing view and allowed views per role.

Auth0 is initialized in `src/main.js` via `createAuth0({ domain, clientId, audience })`. After login, components fetch the backend-resolved role via `useAuthStore.fetchRole()` before gating navigation.

Key views and their roles:
- **POS Terminal** — order creation (cashier, manager, admin)
- **Kitchen Display** (`KitchenDisplay.vue`) — real-time order queue, status progression (pending → preparing → ready → completed), driver assignment (kitchen, cashier, manager, admin)
- **Customer View** (`CustomerView.vue`) — menu browsing, cart, order placement, delivery tracking with Leaflet map (customer)
- **Driver Portal** (`DriverView.vue`) — delivery order selection, GPS position broadcasting via Geolocation API (driver)
- **User Management** (`UserManagement.vue`) — admin only

### Backend

`server/index.js` initializes Express, verifies MySQL connection (but continues on failure), registers route modules, and sets up Socket.io via `server/socket.js`. A health check is exposed at `GET /api/health`.

Routes: `/api/auth`, `/api/menu-items`, `/api/inventory-items`, `/api/orders`, `/api/customers`, `/api/users`.

**Auth middleware** (`server/middleware/auth.js`) exposes three pieces:
- `jwtCheck` — `express-oauth2-jwt-bearer` verifying the Auth0 JWT (audience `AUTH0_AUDIENCE`, issuer `https://AUTH0_DOMAIN/`).
- `loadUser` — after JWT verify, resolves `req.user` from the DB. Matches first by `auth_uid` = Auth0 `sub`; falls back to email match against pre-registered employees (and links `auth_uid`); otherwise auto-creates an `app_user` + `customer_profile` row as a customer. Email is read from either the namespaced claim (`${AUTH0_AUDIENCE}/email`) or the standard `email` claim.
- `requireRole(...roles)` — 403 if `req.user.role` is not in the allowed list.

Route-level auth policy is set in `server/index.js` — e.g. `GET /api/menu-items` is public, mutations require manager+; `/api/orders` POST allows customers, other verbs allow all operational roles; `/api/inventory-items` and `/api/customers` require manager+.

`server/routes/orders.js` is the most complex route — order creation uses a MySQL transaction that inserts the order header, inserts line items, and deducts inventory using `menu_item_inventory` recipe links.

`server/socket.js` manages real-time events:
- Kitchen/customer/driver receive order updates via `emitNewOrder`, `emitOrderStatusUpdated`, `emitOrderDriverAssigned`
- Drivers join a `delivery-{orderId}` room and broadcast GPS coordinates; customers watch the same room

### Data model note

`app_user` is the core identity row. `employee_profile` (joined by `user_id`) holds the `role` enum for staff (cashier, kitchen, manager, admin, driver); customers have no employee_profile row and fall back to `user_type = 'customer'` as their role. When adding a new staff role, update both the enum (via a migration in `server/migrate.js`) and the `ROLE_*` maps in `useAuthStore.js`.

### Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `MYSQL_URI` | server | Aiven MySQL connection string |
| `PORT` | server | HTTP port (default 3000) |
| `FRONTEND_URL` | server | CORS allowlist in production |
| `AUTH0_DOMAIN` | server | Auth0 tenant domain (issuer) |
| `AUTH0_AUDIENCE` | server | Auth0 API identifier for JWT audience check |
| `VITE_API_URL` | frontend build | Backend base URL (empty = proxy) |
| `VITE_BASE_PATH` | frontend build | GitHub Pages base path |
| `VITE_AUTH0_DOMAIN` | frontend build | Auth0 tenant for SPA SDK |
| `VITE_AUTH0_CLIENT_ID` | frontend build | Auth0 SPA client ID |
| `VITE_AUTH0_AUDIENCE` | frontend build | Must match backend `AUTH0_AUDIENCE` |

In development the Vite dev server proxies `/api` → `http://localhost:3000`, so `VITE_API_URL` should be left empty locally.
