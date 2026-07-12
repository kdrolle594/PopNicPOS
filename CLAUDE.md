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

**Split deployment**: frontend (GitHub Pages) + backend (Vercel serverless functions).

- Frontend: Vue 3 + Vite + Tailwind CSS — `src/`
- Backend: Express 5 + MySQL2 — `server/` (Vercel entry point re-exports the app from `api/index.js`; `vercel.json` rewrites all paths to it)
- Realtime: Ably (server publishes via `server/realtime.js`; browser clients get scoped tokens from `GET /api/realtime/token`)
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

`server/app.js` builds the Express app (CORS, routes, auth policy); `server/index.js` is the local dev entry that verifies the MySQL connection (but continues on failure) and listens on `PORT`; `api/index.js` exports the same app for Vercel. A health check is exposed at `GET /api/health`.

Routes: `/api/auth`, `/api/realtime`, `/api/menu-items`, `/api/inventory-items`, `/api/orders`, `/api/customers`, `/api/users`.

**Auth middleware** (`server/middleware/auth.js`) exposes three pieces:
- `jwtCheck` — `express-oauth2-jwt-bearer` verifying the Auth0 JWT (audience `AUTH0_AUDIENCE`, issuer `https://AUTH0_DOMAIN/`).
- `loadUser` — after JWT verify, resolves `req.user` from the DB. Matches first by `auth_uid` = Auth0 `sub`; falls back to email match against pre-registered employees (links `auth_uid`, but only when the token's `email_verified` claim is true — unverified matches get a 403); otherwise auto-creates an `app_user` + `customer_profile` row as a customer. Email/email_verified are read from either the namespaced claims (`${AUTH0_AUDIENCE}/email`, `${AUTH0_AUDIENCE}/email_verified`) or the standard claims.
- `requireRole(...roles)` — 403 if `req.user.role` is not in the allowed list.

Route-level auth policy is set in `server/app.js` — e.g. `GET /api/menu-items` is public, mutations require manager+; `/api/orders` POST allows customers, other verbs allow all operational roles; `/api/inventory-items` requires manager+; `/api/customers` allows cashier+ (POS loyalty flow) except DELETE which is manager+, with `/me` open to any authenticated user.

`server/routes/orders.js` is the most complex route — order creation uses a MySQL transaction that inserts the order header, inserts line items, and deducts inventory using `menu_item_inventory` recipe links. Totals are computed server-side from DB prices; `paidWithPoints`, custom line items, and the `pointsEarned`/`pointsRedeemed` fields are staff-only (forced to 0/rejected for customers).

Realtime (`server/realtime.js` + `server/routes/realtime.js`, client in `src/lib/realtime.js`):
- Order events publish to the Ably `orders` channel: `newOrder`, `orderStatusUpdated`, `orderDriverAssigned`
- Drivers publish GPS to `delivery:{orderId}` channels; customers subscribe to the same channel
- `GET /api/realtime/token` issues Ably token requests — drivers get publish rights on `delivery:*`, everyone else is subscribe-only

### Data model note

`app_user` is the core identity row. `employee_profile` (joined by `user_id`) holds the `role` enum for staff (cashier, kitchen, manager, admin, driver); customers have no employee_profile row and fall back to `user_type = 'customer'` as their role. When adding a new staff role, update both the enum (via a migration in `server/migrate.js`) and the `ROLE_*` maps in `useAuthStore.js`.

### Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `MYSQL_URI` | server | Aiven MySQL connection string |
| `MYSQL_CA` | server | Aiven CA cert (PEM or base64 PEM). Without it, MySQL TLS verification is disabled (warning is logged) |
| `ABLY_API_KEY` | server | Ably realtime publishing + token issuing (realtime is silently disabled without it) |
| `PORT` | server | HTTP port (default 3000, local dev only) |
| `FRONTEND_URL` | server | CORS allowlist in production |
| `AUTH0_DOMAIN` | server | Auth0 tenant domain (issuer) |
| `AUTH0_AUDIENCE` | server | Auth0 API identifier for JWT audience check |
| `VITE_API_URL` | frontend build | Backend base URL (empty = proxy) |
| `VITE_BASE_PATH` | frontend build | GitHub Pages base path |
| `VITE_AUTH0_DOMAIN` | frontend build | Auth0 tenant for SPA SDK |
| `VITE_AUTH0_CLIENT_ID` | frontend build | Auth0 SPA client ID |
| `VITE_AUTH0_AUDIENCE` | frontend build | Must match backend `AUTH0_AUDIENCE` |

In development the Vite dev server proxies `/api` → `http://localhost:3000`, so `VITE_API_URL` should be left empty locally.
