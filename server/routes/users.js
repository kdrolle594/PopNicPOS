import { Router } from 'express';
import pool from '../db.js';
import { jwtCheck, loadUser, requireRole } from '../middleware/auth.js';

const router = Router();

const adminOnly = [jwtCheck, loadUser, requireRole('admin')];

// GET /api/users — list all employees and drivers
router.get('/', ...adminOnly, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.display_name AS name, u.email, u.is_active,
              ep.role
       FROM app_user u
       JOIN employee_profile ep ON ep.user_id = u.id
       WHERE u.user_type = 'employee'
       ORDER BY ep.role, u.display_name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — pre-register an employee account (admin-created, no password)
// Employee will link on first Auth0 login via email match
router.post('/', ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'name, email, and role are required' });
    }

    const validRoles = ['cashier', 'kitchen', 'driver', 'manager', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    }

    const [userResult] = await conn.query(
      `INSERT INTO app_user (auth_uid, user_type, display_name, email)
       VALUES (NULL, 'employee', ?, ?)`,
      [name, email]
    );
    const userId = userResult.insertId;

    await conn.query(
      `INSERT INTO employee_profile (user_id, role) VALUES (?, ?)`,
      [userId, role]
    );

    await conn.commit();

    res.status(201).json({ id: userId, name, email, role, is_active: 1 });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/users/:id — update name, email, or role
router.put('/:id', ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, email, role } = req.body;

    if (name || email) {
      await conn.query(
        `UPDATE app_user SET display_name = COALESCE(?, display_name),
                             email = COALESCE(?, email)
         WHERE id = ? AND user_type = 'employee'`,
        [name || null, email || null, req.params.id]
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
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE /api/users/:id — remove employee (cascades to employee_profile)
router.delete('/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM app_user WHERE id = ? AND user_type = 'employee'`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
