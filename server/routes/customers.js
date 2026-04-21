import { Router } from 'express';
import pool from '../db.js';

const router = Router();

function getTier(points) {
  if (points >= 1000) return 'platinum';
  if (points >= 500) return 'gold';
  if (points >= 250) return 'silver';
  return 'bronze';
}

// GET /api/customers/me — the authenticated customer's own profile
router.get('/me', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.display_name, u.phone, u.email,
              cp.loyalty_points, cp.loyalty_tier, cp.total_spent,
              cp.orders_count, cp.joined_date, cp.last_visit
       FROM app_user u
       JOIN customer_profile cp ON cp.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No customer profile for this user' });
    }
    const r = rows[0];
    res.json({
      id: r.id,
      name: r.display_name,
      phone: r.phone,
      email: r.email,
      points: r.loyalty_points,
      tier: r.loyalty_tier,
      totalSpent: Number(r.total_spent),
      ordersCount: r.orders_count,
      joinedDate: r.joined_date,
      lastVisit: r.last_visit,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customers/me — update self-editable fields only
router.put('/me', async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    await pool.query(
      `UPDATE app_user SET display_name = ?, phone = ?, email = ? WHERE id = ?`,
      [name, phone || null, email || null, req.user.id]
    );
    const [rows] = await pool.query(
      `SELECT u.id, u.display_name, u.phone, u.email,
              cp.loyalty_points, cp.loyalty_tier, cp.total_spent,
              cp.orders_count, cp.joined_date, cp.last_visit
       FROM app_user u
       JOIN customer_profile cp ON cp.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No customer profile for this user' });
    }
    const r = rows[0];
    res.json({
      id: r.id,
      name: r.display_name,
      phone: r.phone,
      email: r.email,
      points: r.loyalty_points,
      tier: r.loyalty_tier,
      totalSpent: Number(r.total_spent),
      ordersCount: r.orders_count,
      joinedDate: r.joined_date,
      lastVisit: r.last_visit,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers — list loyalty customers (app_user + customer_profile)
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.display_name, u.phone, u.email,
              cp.loyalty_points, cp.loyalty_tier, cp.total_spent,
              cp.orders_count, cp.joined_date, cp.last_visit
       FROM app_user u
       JOIN customer_profile cp ON cp.user_id = u.id
       WHERE u.user_type = 'customer'
       ORDER BY u.id`
    );

    const result = rows.map((r) => ({
      id: r.id,
      name: r.display_name,
      phone: r.phone,
      email: r.email,
      points: r.loyalty_points,
      tier: r.loyalty_tier,
      totalSpent: Number(r.total_spent),
      ordersCount: r.orders_count,
      joinedDate: r.joined_date,
      lastVisit: r.last_visit,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers — add loyalty customer
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, phone, email, points, totalSpent, ordersCount, joinedDate } = req.body;
    const tier = getTier(points || 0);
    const joinedAt = joinedDate ? new Date(joinedDate) : new Date();

    // Create app_user with a generated placeholder auth_uid
    const authUid = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const [userResult] = await conn.query(
      `INSERT INTO app_user (auth_uid, user_type, display_name, phone, email)
       VALUES (?, 'customer', ?, ?, ?)`,
      [authUid, name, phone, email || null]
    );
    const userId = userResult.insertId;

    await conn.query(
      `INSERT INTO customer_profile (user_id, loyalty_points, loyalty_tier, total_spent, orders_count, joined_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, points || 0, tier, totalSpent || 0, ordersCount || 0, joinedAt]
    );

    await conn.commit();

    res.status(201).json({
      id: userId,
      name,
      phone,
      email: email || null,
      points: points || 0,
      tier,
      totalSpent: totalSpent || 0,
      ordersCount: ordersCount || 0,
      joinedDate: joinedAt.toISOString(),
      lastVisit: null,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/customers/:id — update loyalty customer
router.put('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, phone, email, points, totalSpent, ordersCount, lastVisit } = req.body;
    const tier = getTier(points || 0);

    await conn.query('UPDATE app_user SET display_name=?, phone=?, email=? WHERE id=?', [
      name,
      phone,
      email || null,
      req.params.id,
    ]);

    await conn.query(
      `UPDATE customer_profile
       SET loyalty_points=?, loyalty_tier=?, total_spent=?, orders_count=?, last_visit=?
       WHERE user_id=?`,
      [points || 0, tier, totalSpent || 0, ordersCount || 0, lastVisit || null, req.params.id]
    );

    await conn.commit();

    res.json({
      id: Number(req.params.id),
      name,
      phone,
      email: email || null,
      points: points || 0,
      tier,
      totalSpent: totalSpent || 0,
      ordersCount: ordersCount || 0,
      lastVisit: lastVisit || null,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE /api/customers/:id — cascades to customer_profile
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM app_user WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
