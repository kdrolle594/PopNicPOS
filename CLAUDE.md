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

# Build for production
npm run build
```

## Architecture

**Split deployment**: frontend (GitHub Pages) + backend (Railway).

- Frontend: Vue 3 + Vite + Tailwind CSS — `src/`
- Backend: Express 5 + Socket.io + MySQL2 — `server/`
- Database: Aiven-hosted MySQL (connection via `MYSQL_URI`)

### Frontend

`src/App.vue` handles view routing via a `viewMap` object — there is no Vue Router. Clicking nav items sets a `currentView` ref that swaps which component is rendered.

Global state lives in `src/store/usePosStore.js` — a manually managed singleton (not Pinia). It exposes reactive state and async methods that call the backend REST API. The base URL is controlled by `VITE_API_URL` env variable (empty = same-origin proxy in dev, full URL in production).

Key views and their roles:
- **POS Terminal** — order creation
- **Kitchen Display** (`KitchenDisplay.vue`) — real-time order queue, status progression (pending → preparing → ready → completed), driver assignment
- **Customer View** (`CustomerView.vue`) — menu browsing, cart, order placement, delivery tracking with Leaflet map
- **Driver Portal** (`DriverView.vue`) — driver login, delivery order selection, GPS position broadcasting via Geolocation API

### Backend

`server/index.js` initializes Express, verifies MySQL connection, registers route modules, and sets up Socket.io via `server/socket.js`.

Routes: `/api/menu-items`, `/api/inventory-items`, `/api/orders`, `/api/customers`.

`server/routes/orders.js` is the most complex route — order creation uses a MySQL transaction that inserts the order header, inserts line items, and deducts inventory using `menu_item_inventory` recipe links.

`server/socket.js` manages real-time events:
- Kitchen/customer/driver receive order updates via `emitNewOrder`, `emitOrderStatusUpdated`, `emitOrderDriverAssigned`
- Drivers join a `delivery-{orderId}` room and broadcast GPS coordinates; customers watch the same room

### Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `MYSQL_URI` | server | Aiven MySQL connection string |
| `PORT` | server | HTTP port (default 3000) |
| `FRONTEND_URL` | server | CORS allowlist in production |
| `VITE_API_URL` | frontend build | Backend base URL (empty = proxy) |
| `VITE_BASE_PATH` | frontend build | GitHub Pages base path |

In development the Vite dev server proxies `/api` → `http://localhost:3000`, so `VITE_API_URL` should be left empty locally.
