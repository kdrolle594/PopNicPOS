import express from 'express';
import cors from 'cors';
import pool from './db.js';

import menuRoutes from './routes/menu.js';
import inventoryRoutes from './routes/inventory.js';
import orderRoutes from './routes/orders.js';
import customerRoutes from './routes/customers.js';
import authRoutes from './routes/auth.js';
import realtimeRoutes from './routes/realtime.js';
import usersRoutes from './routes/users.js';
import { jwtCheck, loadUser, requireRole } from './middleware/auth.js';

const app = express();

const frontendUrl = process.env.FRONTEND_URL;
const corsOrigin = frontendUrl
  ? frontendUrl.split(',').map((s) => s.trim())
  : true;
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ status: 'ok', db: rows[0].ok === 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Health check failed' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/realtime', realtimeRoutes);

const menuWriteAuth = [jwtCheck, loadUser, requireRole('manager', 'admin')];
app.use('/api/menu-items', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  let i = 0;
  const run = (err) => { if (err) return next(err); if (i < menuWriteAuth.length) menuWriteAuth[i++](req, res, run); else next(); };
  run();
});
app.use('/api/menu-items', menuRoutes);

app.use('/api/orders', jwtCheck, loadUser);
app.use('/api/orders', (req, res, next) => {
  if (req.method === 'POST') {
    return requireRole('customer', 'cashier', 'manager', 'admin')(req, res, next);
  }
  return requireRole('customer', 'cashier', 'kitchen', 'manager', 'admin', 'driver')(req, res, next);
});
app.use('/api/orders', orderRoutes);

app.use('/api/inventory-items', jwtCheck, loadUser, requireRole('manager', 'admin'), inventoryRoutes);

app.use('/api/customers', jwtCheck, loadUser);
app.use('/api/customers', (req, res, next) => {
  if (req.path === '/me') return next();
  // Cashiers need the loyalty customer list + point updates at the POS;
  // destructive deletes stay manager+.
  if (req.method === 'DELETE') return requireRole('manager', 'admin')(req, res, next);
  return requireRole('cashier', 'manager', 'admin')(req, res, next);
});
app.use('/api/customers', customerRoutes);

app.use('/api/users', usersRoutes);

export default app;
