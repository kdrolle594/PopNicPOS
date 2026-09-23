import { Router } from 'express';
import pool from '../db.js';
import { jwtCheck, loadUser, requireRole } from '../middleware/auth.js';

const router = Router();

const adminOnly = [jwtCheck, loadUser, requireRole('admin')];
const VALID_ROLES = ['cashier', 'kitchen', 'driver', 'manager', 'admin'];

// GET /api/users — list all employees and drivers
router.get('/', ...adminOnly, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.display_name AS name, u.email, u.phone, u.is_active,
              ep.role
       FROM app_user u
       JOIN employee_profile ep ON ep.user_id = u.id
       WHERE u.user_type = 'employee'
       ORDER BY ep.role, u.display_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users — pre-register an employee account (admin-created, no password)
// Employee will link on first Auth0 login via email match
router.post('/', ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, email, role, phone } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'name, email, and role are required' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    if (phone != null && (typeof phone !== 'string' || phone.length > 50)) {
      return res.status(400).json({ error: 'Invalid phone' });
    }

    // Email is the key first-login linking matches on, so a second account with
    // the same address would leave one of them permanently unreachable.
    const [existing] = await conn.query(
      'SELECT id FROM app_user WHERE email = ? LIMIT 1',
      [email]
    );
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const [userResult] = await conn.query(
      `INSERT INTO app_user (auth_uid, user_type, display_name, email, phone)
       VALUES (NULL, 'employee', ?, ?, ?)`,
      [name, email, phone || null]
    );
    const userId = userResult.insertId;

    await conn.query(
      `INSERT INTO employee_profile (user_id, role) VALUES (?, ?)`,
      [userId, role]
    );

    await conn.commit();

    res.status(201).json({ id: userId, name, email, phone: phone || null, role, is_active: 1 });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// PUT /api/users/:id — update name, email, or role
router.put('/:id', ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, email, role, phone } = req.body;

    if (role && !VALID_ROLES.includes(role)) {
      await conn.rollback();
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    if (role && role !== 'admin' && Number(req.params.id) === req.user.id) {
      await conn.rollback();
      return res.status(400).json({ error: 'You cannot demote your own admin account' });
    }
    if (phone != null && (typeof phone !== 'string' || phone.length > 50)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Invalid phone' });
    }

    if (email) {
      const [clash] = await conn.query(
        'SELECT id FROM app_user WHERE email = ? AND id <> ? LIMIT 1',
        [email, req.params.id]
      );
      if (clash.length > 0) {
        await conn.rollback();
        return res.status(409).json({ error: 'Another account already uses that email' });
      }
    }

    if (name || email || phone != null) {
      await conn.query(
        `UPDATE app_user SET display_name = COALESCE(?, display_name),
                             email = COALESCE(?, email),
                             phone = COALESCE(?, phone)
         WHERE id = ? AND user_type = 'employee'`,
        [name || null, email || null, phone || null, req.params.id]
      );
    }

    if (role) {
      await conn.query(
        `UPDATE employee_profile SET role = ? WHERE user_id = ?`,
        [role, req.params.id]
      );
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// DELETE /api/users/:id — remove employee (cascades to employee_profile)
router.delete('/:id', ...adminOnly, async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    await pool.query(
      `DELETE FROM app_user WHERE id = ? AND user_type = 'employee'`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
