import { auth } from 'express-oauth2-jwt-bearer';
import pool from '../db.js';

// ── JWT signature / audience / issuer check (Auth0) ───────────────────────────
export const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}/`,
});

// ── Load app user from DB after JWT is verified ───────────────────────────────
// req.auth.payload.sub  = Auth0 user ID (e.g. "auth0|abc123")
// req.auth.payload.email = email claim (must enable in Auth0 API settings)
//
// Behaviour:
//   sub found in DB         → attach req.user, continue
//   sub not found + email matches a pre-registered employee → link auth_uid, continue
//   sub not found + no email match → auto-create as customer
export async function loadUser(req, res, next) {
  const sub   = req.auth?.payload?.sub;
  const email = req.auth?.payload?.[`${process.env.AUTH0_AUDIENCE}/email`]
             || req.auth?.payload?.email
             || null;
  const name  = req.auth?.payload?.name || req.auth?.payload?.nickname || null;

  if (!sub) return res.status(401).json({ error: 'Missing sub claim' });

  try {
    // 1. Look up by auth_uid
    const [rows] = await pool.query(
      `SELECT u.id, u.user_type, u.display_name, u.email,
              ep.role
       FROM app_user u
       LEFT JOIN employee_profile ep ON ep.user_id = u.id
       WHERE u.auth_uid = ?`,
      [sub]
    );

    if (rows.length > 0) {
      const u = rows[0];
      req.user = {
        id:       u.id,
        userType: u.user_type,
        name:     u.display_name,
        email:    u.email,
        role:     u.role || u.user_type, // 'customer' has no employee_profile row
      };
      return next();
    }

    // 2. auth_uid not found — check for email match (pre-registered employee)
    if (email) {
      const [preRows] = await pool.query(
        `SELECT u.id, u.user_type, u.display_name, u.email,
                ep.role
         FROM app_user u
         LEFT JOIN employee_profile ep ON ep.user_id = u.id
         WHERE u.email = ? AND u.auth_uid IS NULL`,
        [email]
      );

      if (preRows.length > 0) {
        const u = preRows[0];
        // Link Auth0 sub to existing record
        await pool.query('UPDATE app_user SET auth_uid = ? WHERE id = ?', [sub, u.id]);
        req.user = {
          id:       u.id,
          userType: u.user_type,
          name:     u.display_name,
          email:    u.email,
          role:     u.role || u.user_type,
        };
        return next();
      }
    }

    // 3. Completely new user — auto-create as customer
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [userResult] = await conn.query(
        `INSERT INTO app_user (auth_uid, user_type, display_name, email)
         VALUES (?, 'customer', ?, ?)`,
        [sub, name || email || 'Customer', email]
      );
      const userId = userResult.insertId;

      await conn.query(
        `INSERT INTO customer_profile (user_id, loyalty_points, loyalty_tier, total_spent, orders_count)
         VALUES (?, 0, 'bronze', 0, 0)`,
        [userId]
      );

      await conn.commit();

      req.user = {
        id:       userId,
        userType: 'customer',
        name:     name || email || 'Customer',
        email,
        role:     'customer',
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── Role guard factory ─────────────────────────────────────────────────────────
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
