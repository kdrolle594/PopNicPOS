import express from 'express';
import cors from 'cors';
import pool from './db.js';

import menuRoutes from './routes/menu.js';
import inventoryRoutes from './routes/inventory.js';
import orderRoutes from './routes/orders.js';
import customerRoutes from './routes/customers.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import { jwtCheck, loadUser, requireRole } from './middleware/auth.js';

// ── Verify DB connection on startup ────────────────────────────────────────────
try {
  const conn = await pool.getConnection();
  const host = process.env.MYSQL_URI
    ? new URL(process.env.MYSQL_URI).host
    : `${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT}`;
  console.log(`✔  Connected to MySQL at ${host}`);
  conn.release();
} catch (err) {
  console.warn('MySQL connection failed on startup:', err.message);
  console.warn('API server will still start; database routes may fail until DB is reachable.');
}

// ── Express app ────────────────────────────────────────────────────────────────
const app = express();
const allowedOrigin = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ status: 'ok', db: rows[0].ok === 1 });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── Auth routes (public + protected /me) ───────────────────────────────────────
app.use('/api/auth', authRoutes);

// ── Menu items — GET public, mutations require manager+ ───────────────────────
app.use('/api/menu-items', (req, res, next) => {
  if (req.method === 'GET') return next();
  jwtCheck(req, res, () => loadUser(req, res, () => requireRole('manager', 'admin')(req, res, next)));
});
app.use('/api/menu-items', menuRoutes);

// ── Orders — protected by role ─────────────────────────────────────────────────
app.use('/api/orders', jwtCheck, loadUser);
app.use('/api/orders', (req, res, next) => {
  if (req.method === 'POST') {
    return requireRole('customer', 'cashier', 'manager', 'admin')(req, res, next);
  }
  return requireRole('customer', 'cashier', 'kitchen', 'manager', 'admin', 'driver')(req, res, next);
});
app.use('/api/orders', orderRoutes);

// ── Inventory — manager+ only ─────────────────────────────────────────────────
app.use('/api/inventory-items', jwtCheck, loadUser, requireRole('manager', 'admin'), inventoryRoutes);

// ── Customers — manager+ only ─────────────────────────────────────────────────
app.use('/api/customers', jwtCheck, loadUser, requireRole('manager', 'admin'), customerRoutes);

// ── Users — admin only ────────────────────────────────────────────────────────
app.use('/api/users', usersRoutes);

// ── Start ──────────────────────────────────────────────────────────────────────
import { initSocket } from './socket.js';
import http from 'http';

const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer(app);
initSocket(server);
server.listen(PORT, () => {
  console.log(`✔  API server listening on http://localhost:${PORT}`);
});
