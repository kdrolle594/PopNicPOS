# PopNic POS

All-in-one restaurant POS system with a customer ordering portal, kitchen display, and driver delivery tracking. Frontend deploys to GitHub Pages; backend runs on Railway against an Aiven-hosted MySQL database.

## Tech Stack

- **Frontend**: Vue 3 (Composition API), Vite, Tailwind CSS, Leaflet, Chart.js
- **Backend**: Express 5, Socket.io, MySQL2
- **Auth**: Auth0 (SPA SDK on the frontend, JWT validation on the backend)

## Modules

- Dashboard
- POS Terminal
- Kitchen Display — real-time order queue with status progression and driver assignment
- Customer View — menu browsing, cart, delivery tracking on a Leaflet map
- Driver Portal — delivery selection and live GPS broadcast
- Inventory Management
- Menu Management
- Loyalty Program
- Analytics & Reports
- User Management (admin)

## Roles

| Role | Access |
|---|---|
| customer | Customer View |
| driver | Driver Portal |
| cashier | POS, Kitchen Display |
| kitchen | Kitchen Display |
| manager | Dashboard, POS, Kitchen, Inventory, Menu, Loyalty, Analytics |
| admin | Everything above + User Management |

## Run Locally

1. Install dependencies:

   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in values (MySQL URI, Auth0 domain/audience/client ID).

3. Seed the database (first run only):

   ```
   npm run seed
   ```

4. Start frontend and backend together:

   ```
   npm start
   ```

   Or run them separately with `npm run dev` (Vite on 5173) and `npm run server` (Express on 3000). Vite proxies `/api` → `http://localhost:3000` in dev.

## Other Commands

```bash
npm run build                # Production build to dist/
npm run deploy               # Publish dist/ to GitHub Pages
node server/migrate.js       # Run idempotent schema migrations
```

## Environment Variables

See `.env.example` for the full list. Backend needs `MYSQL_URI`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, and (in production) `FRONTEND_URL` for CORS. Frontend build needs `VITE_API_URL`, `VITE_BASE_PATH`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`.
