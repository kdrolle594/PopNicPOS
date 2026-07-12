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
  const payload = req.auth?.payload || {};
  const sub   = payload.sub;
  const email = payload[`${process.env.AUTH0_AUDIENCE}/email`]
             || payload.email
             || null;
  // Only a verified email may be used to claim a pre-registered employee row —
  // otherwise anyone who signs up with a staff member's address inherits their role.
  const emailVerified = payload[`${process.env.AUTH0_AUDIENCE}/email_verified`]
                     ?? payload.email_verified
                     ?? false;
  const name  = payload.name || payload.nickname || null;

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
        if (emailVerified !== true) {
          return res.status(403).json({
            error: 'This email is registered to a staff account. Verify your email address, then sign in again.',
          });
        }
        // Link Auth0 sub to existing record. Guard on auth_uid IS NULL so two
        // concurrent logins can't both claim the row.
        const [linkResult] = await pool.query(
          'UPDATE app_user SET auth_uid = ? WHERE id = ? AND auth_uid IS NULL',
          [sub, u.id]
        );
        if (linkResult.affectedRows === 0) {
          return res.status(409).json({ error: 'Account link conflict — sign in again.' });
        }
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

    // 3. Completely new user — auto-create as customer.
    // The app_user + customer_profile rows created here ARE the loyalty customer record;
    // staff search via /api/customers will surface them. No separate "create loyalty customer" path needed.
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
      // Two concurrent first requests can race the auto-create; the loser
      // hits the UNIQUE(auth_uid) key — recover by reading the winner's row.
      if (err.code === 'ER_DUP_ENTRY') {
        const [retryRows] = await pool.query(
          `SELECT u.id, u.user_type, u.display_name, u.email, ep.role
           FROM app_user u
           LEFT JOIN employee_profile ep ON ep.user_id = u.id
           WHERE u.auth_uid = ?`,
          [sub]
        );
        if (retryRows.length > 0) {
          const u = retryRows[0];
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
      throw err;
    } finally {
      conn.release();
    }

    return next();
  } catch (err) {
    console.error('loadUser failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
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
