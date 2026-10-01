import { Router } from 'express';
import pool from '../db.js';
import { parseLocation } from '../lib/orderRules.js';
import { recalculateDriverRoute } from '../lib/driverRoute.js';
import { emitRoutePublishes } from '../realtime.js';

const router = Router();

// POST /api/driver/location — the driver portal posts { lat, lng } every 10 s.
// Stores the position, re-plans the route when stale, and returns the route.
router.post('/location', async (req, res) => {
  const loc = parseLocation(req.body);
  if (!loc.ok) return res.status(loc.code).json({ error: loc.error });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const now = new Date();
    await conn.query(
      `INSERT INTO driver_location (driver_user_id, lat, lng, updated_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng), updated_at = VALUES(updated_at)`,
      [req.user.id, loc.lat, loc.lng, now]
    );
    const { route, publishes } = await recalculateDriverRoute(conn, req.user.id, { now });
    await conn.commit();
    await emitRoutePublishes(publishes);
    res.json(route);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

export default router;
