# PopNicPOS - Project Overview

## About PopNicPOS

PopNicPOS is a full-stack, role-based Point of Sale (POS) system for food delivery operations. It enables management of orders, inventory, customer interactions, and driver deliveries through a web-based platform with real-time features.

## Tech Stack

### Frontend
- **Vue 3** — Modern JavaScript framework
- **Vite** — Lightning-fast build tool and dev server
- **Tailwind CSS** — Utility-first CSS framework
- **Leaflet** — Real-time map visualization for delivery tracking
- **Auth0 SPA SDK** — Client-side authentication

### Backend
- **Express 5** — Lightweight Node.js web framework
- **Socket.io** — Real-time bidirectional communication
- **MySQL2** — MySQL database driver
- **Express-OAuth2-JWT-Bearer** — JWT validation middleware

### Database
- **MySQL** — Hosted on Aiven
- Connection via `MYSQL_URI` environment variable

### Deployment
- **Frontend** — GitHub Pages (static hosting)
- **Backend** — Railway (serverless/container platform)
- **Auth** — Auth0 tenant for SPA + JWT validation

---

## Project Structure

```
PopNicPOS/
├── src/                          # Frontend (Vue 3 + Vite)
│   ├── App.vue                  # Root component, view router
│   ├── main.js                  # Entry point, Auth0 initialization
│   ├── components/              # Reusable UI components
│   ├── views/                   # Full-page views
│   │   ├── PosTerminal.vue      # Order creation (cashier, manager, admin)
│   │   ├── KitchenDisplay.vue   # Kitchen order queue
│   │   ├── CustomerView.vue     # Customer menu & ordering
│   │   ├── DriverView.vue       # Driver delivery portal
│   │   ├── UserManagement.vue   # User admin (admin only)
│   │   └── ...
│   └── store/                   # Pinia-like state management
│       ├── usePosStore.js       # POS state & API calls
│       └── useAuthStore.js      # Auth state & role management
│
├── server/                       # Backend (Express + Node.js)
│   ├── index.js                 # Express app setup & routes
│   ├── socket.js                # Socket.io real-time events
│   ├── migrate.js               # Database schema migrations
│   ├── middleware/
│   │   └── auth.js              # JWT validation & user loading
│   └── routes/                  # API endpoints
│       ├── auth.js              # Auth endpoints (/api/auth)
│       ├── menu-items.js        # Menu management
│       ├── inventory-items.js   # Inventory tracking
│       ├── orders.js            # Order creation & updates
│       ├── customers.js         # Customer profiles
│       └── users.js             # User management
│
├── package.json                 # Project dependencies & scripts
├── vite.config.js              # Vite configuration
├── CLAUDE.md                    # Developer guidance
└── README.md                    # Repository readme
```

---

## Core Commands

```bash
# Install all dependencies
npm install

# Run Vite frontend dev server (port 5173)
npm run dev

# Run Express backend server (port 3000)
npm run server

# Run both frontend and backend concurrently
npm start

# Seed the database with initial data
npm run seed

# Run idempotent database migrations
node server/migrate.js

# Build frontend for production
npm run build

# Deploy built frontend to GitHub Pages
npm run deploy
```

---

## Architecture Deep Dive

### Frontend Architecture

The frontend is a **single-page application (SPA)** built with Vue 3. Instead of using Vue Router, navigation is handled by a `viewMap` object in `App.vue`:
- Clicking navigation items sets a `currentView` ref
- The component corresponding to the current view is rendered dynamically
- Visible views are filtered by user role via `useAuthStore.allowedViews()`

#### State Management
Two singleton stores (manually managed, no Pinia):

**usePosStore.js**
- Manages reactive POS state (orders, menu items, inventory, etc.)
- Provides async methods that call the backend REST API
- Base URL configured via `VITE_API_URL` environment variable
- In dev: empty value = proxy to localhost:3000
- In prod: full URL to backend server

**useAuthStore.js**
- Wraps Auth0 SPA SDK (`@auth0/auth0-vue`)
- Initializes Auth0 in `src/main.js` with `domain`, `clientId`, `audience`
- `fetchRole()` method calls `/api/auth/me` with Auth0 access token
- Returns user profile: `{ id, userType, name, email, role }`
- Defines role-based access via constants:
  - `ROLE_DEFAULT_VIEW` — Default landing view per role
  - `ROLE_VIEWS` — Allowed views per role

#### Key Views by Role

| View | Component | Allowed Roles |
|------|-----------|---------------|
| **POS Terminal** | PosTerminal.vue | cashier, manager, admin |
| **Kitchen Display** | KitchenDisplay.vue | kitchen, cashier, manager, admin |
| **Customer View** | CustomerView.vue | customer |
| **Driver Portal** | DriverView.vue | driver |
| **User Management** | UserManagement.vue | admin |

### Backend Architecture

The backend is an **Express 5 REST API** with Socket.io for real-time updates.

**Main Server (server/index.js)**
- Initializes Express
- Verifies MySQL connection (continues on failure)
- Registers all route modules
- Sets up Socket.io via `server/socket.js`
- Exposes health check at `GET /api/health`

#### Authentication Middleware (server/middleware/auth.js)

Three middleware components work together:

**1. jwtCheck**
- Uses `express-oauth2-jwt-bearer` to verify Auth0 JWT
- Validates audience matches `AUTH0_AUDIENCE`
- Validates issuer is `https://AUTH0_DOMAIN/`

**2. loadUser**
- After JWT verification, resolves request user from database
- Matching logic:
  1. Match by `auth_uid` = Auth0 `sub` (primary key)
  2. Fallback to email match against pre-registered employees
  3. If found: link `auth_uid` to existing employee
  4. If not found: auto-create `app_user` + `customer_profile` as new customer
- Reads email from Auth0 namespaced claim (`${AUTH0_AUDIENCE}/email`) or standard `email`
- Sets `req.user` for downstream routes

**3. requireRole(...roles)**
- Returns 403 Forbidden if user's role not in allowed list
- Used to gate operations by role

#### API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/health` | GET | None | Health check |
| `/api/auth/me` | GET | jwtCheck, loadUser | Get current user profile & role |
| `/api/menu-items` | GET | None | List menu items (public) |
| `/api/menu-items/*` | POST/PUT/DELETE | requireRole(manager+) | Menu management |
| `/api/inventory-items` | GET/POST/PUT/DELETE | requireRole(manager+) | Inventory management |
| `/api/orders` | POST | requireRole(customer, cashier, manager, admin) | Create order |
| `/api/orders` | GET/PUT/DELETE | requireRole(cashier, manager, admin, driver) | Access + update orders |
| `/api/customers` | GET/POST/PUT/DELETE | requireRole(manager+) | Customer management |
| `/api/users` | GET/POST/PUT/DELETE | requireRole(admin) | User management |

#### Complex Logic: Order Creation

`server/routes/orders.js` handles order creation with a **MySQL transaction**:

1. **Validate order** — Check customer exists, verify items exist
2. **Insert order header** — Create order record with total, status, timestamps
3. **Insert line items** — Create order_item rows for each menu item in cart
4. **Deduct inventory** — Use `menu_item_inventory` recipe links to deduct stock
5. **Commit transaction** — All-or-nothing atomicity
6. **Emit real-time update** — Broadcast to kitchen/customer/driver via Socket.io

Transaction rollback occurs if any step fails (e.g., insufficient inventory).

#### Real-Time Events (Socket.io)

`server/socket.js` manages bidirectional communication:

**Broadcast Events**
- `emitNewOrder()` — Notify kitchen that a new order arrived
- `emitOrderStatusUpdated()` — Kitchen progresses order (pending → preparing → ready → completed)
- `emitOrderDriverAssigned()` — Assign driver to delivery

**Driver Delivery Tracking**
- Drivers join `delivery-{orderId}` room
- Broadcast GPS coordinates from Geolocation API
- Customers watch same room for real-time position updates
- Leaflet map renders driver location

---

## Data Model

### Core Tables

**app_user** (Identity)
- `id` (PK)
- `auth_uid` (Auth0 `sub` claim, unique, nullable until first login)
- `email`
- `user_type` enum (customer, employee)
- `created_at`, `updated_at`

**employee_profile** (Staff Only)
- `user_id` (FK → app_user)
- `role` enum (cashier, kitchen, manager, admin, driver)
- `name`
- `phone_number`

**customer_profile** (Customers)
- `user_id` (FK → app_user)
- `phone_number`
- `address`
- `preferred_delivery_address`

**menu_item**
- `id` (PK)
- `name`
- `description`
- `price`
- `category`
- `available` boolean
- `created_at`, `updated_at`

**menu_item_inventory** (Stock Deduction Recipe)
- `menu_item_id` (FK)
- `inventory_item_id` (FK)
- `quantity_required` (how many units of inventory per menu item ordered)

**inventory_item**
- `id` (PK)
- `sku`
- `name`
- `quantity_on_hand`
- `unit` (e.g., kg, liters, units)
- `reorder_level`
- `last_restocked`

**order_header**
- `id` (PK)
- `customer_id` (FK → app_user)
- `status` enum (pending, preparing, ready, completed, cancelled)
- `total_amount`
- `delivery_address`
- `order_date`
- `estimated_ready_time`
- `completed_at` (nullable)

**order_item**
- `id` (PK)
- `order_id` (FK)
- `menu_item_id` (FK)
- `quantity`
- `unit_price`
- `subtotal`

**driver_delivery**
- `id` (PK)
- `order_id` (FK → order_header)
- `driver_id` (FK → app_user with role = driver)
- `status` enum (assigned, in_progress, delivered, failed)
- `pickup_time`
- `delivery_time`

### Role System

Roles control which API operations a user can perform:
- **customer** — Browse menu, place orders, track delivery
- **cashier** — Create orders for in-store customers, view kitchen display
- **kitchen** — View order queue, update order status, mark ready
- **manager** — All above + inventory/menu management + user admin
- **driver** — View assigned deliveries, broadcast GPS, mark complete
- **admin** — Full system access, user management

When adding a new role:
1. Add enum value to database via migration in `server/migrate.js`
2. Update `ROLE_VIEWS` and `ROLE_DEFAULT_VIEW` constants in `src/store/useAuthStore.js`
3. Update route permission checks in `server/index.js`

---

## Environment Variables

| Variable | Used By | Purpose | Example |
|----------|---------|---------|---------|
| `MYSQL_URI` | server | Aiven MySQL connection string | `mysql2://user:password@host:port/db` |
| `PORT` | server | HTTP port for Express | `3000` (default) |
| `FRONTEND_URL` | server | CORS allowlist in production | `https://kdrolle594.github.io/PopNicPOS` |
| `AUTH0_DOMAIN` | server | Auth0 tenant domain (JWT issuer) | `your-tenant.auth0.com` |
| `AUTH0_AUDIENCE` | server | Auth0 API identifier (JWT audience) | `https://api.popnic.local` |
| `VITE_API_URL` | frontend | Backend base URL | empty (dev proxy) or full URL (prod) |
| `VITE_BASE_PATH` | frontend | GitHub Pages base path | `/PopNicPOS` |
| `VITE_AUTH0_DOMAIN` | frontend | Auth0 SPA domain | `your-tenant.auth0.com` |
| `VITE_AUTH0_CLIENT_ID` | frontend | Auth0 SPA client ID | (generated by Auth0) |
| `VITE_AUTH0_AUDIENCE` | frontend | Must match backend `AUTH0_AUDIENCE` | `https://api.popnic.local` |

### Development Setup
In local development, `VITE_API_URL` should be **empty**. Vite automatically proxies `/api` requests to `http://localhost:3000`.

### Production Setup
When deploying to GitHub Pages + Railway:
- `VITE_API_URL` = full backend URL (e.g., `https://popnic-backend.railway.app`)
- `VITE_BASE_PATH` = `/PopNicPOS`
- `FRONTEND_URL` = GitHub Pages URL for CORS
- Backend variables remain the same (AUTH0_DOMAIN, MYSQL_URI, etc.)

---

## Development Workflow

### 1. Initial Setup
```bash
npm install
npm run seed           # Populate initial data
node server/migrate.js # Run migrations
```

### 2. Local Development
```bash
npm start              # Runs both frontend + backend
# Frontend: http://localhost:5173
# Backend: http://localhost:3000
```

### 3. Testing a Route
- Check JWT auth requirement + role gates in `server/index.js`
- Verify `loadUser` middleware loads correct user profile
- Test with `curl` + Auth0 token or API testing tool
- Monitor Socket.io events in browser DevTools

### 4. Database Changes
- Create migration in `server/migrate.js`
- Use `ALTER TABLE` / `CREATE TABLE` with idempotency checks
- Run: `node server/migrate.js`
- Test with `npm run seed` to repopulate

### 5. Deployment
**Frontend to GitHub Pages:**
```bash
npm run build
npm run deploy
```

**Backend to Railway:**
- Connect GitHub repo to Railway
- Set environment variables in Railway dashboard
- Railway auto-builds and deploys on push to `main`

---

## Key Features

✅ **Real-Time Order Management** — Orders appear instantly in kitchen via Socket.io  
✅ **Role-Based Access Control** — Six roles with granular permissions  
✅ **Inventory Deduction** — Orders automatically deduct stock based on recipes  
✅ **Live Delivery Tracking** — GPS-driven Leaflet map showing driver position  
✅ **Auth0 Integration** — Secure single sign-on with JWT validation  
✅ **Transaction Safety** — Order creation is atomic; no partial orders  
✅ **Mobile-Friendly UI** — Tailwind CSS responsive design  
✅ **Split Deployment** — Frontend on GitHub Pages, backend on Railway  

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "not a git repository" | Ensure you're in the project root: `d:\Dev Work\PopNicPOS` |
| MySQL connection fails | Verify `MYSQL_URI` is correct and Aiven database is running |
| Auth0 login fails | Check `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and `VITE_AUTH0_AUDIENCE` |
| Frontend can't reach API | In dev, Vite proxy routes `/api` to port 3000; ensure backend is running |
| Order creation fails | Check inventory levels; transaction rolls back if stock insufficient |
| Kitchen display stuck | Check Socket.io connection in browser DevTools; may need backend restart |

---

## Additional Resources

- **CLAUDE.md** — Developer quick-reference guide in this repo
- **Auth0 Docs** — https://auth0.com/docs
- **Vite Docs** — https://vitejs.dev
- **Vue 3 Docs** — https://vuejs.org
- **Express Docs** — https://expressjs.com
- **Socket.io Docs** — https://socket.io

