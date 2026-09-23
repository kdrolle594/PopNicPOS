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
// Moves a pre-registered employee_profile (auth_uid IS NULL, matched by email)
// onto an existing app_user row that was auto-created as a customer, then removes
// the now-redundant placeholder row. Returns the granted { role, display_name,
// phone } or null when there is nothing to promote.
//
// Callers MUST have verified the email claim first — this grants a staff role.
async function promotePreRegisteredEmployee(userId, email) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the placeholder so two concurrent logins can't both consume it.
    const [placeholders] = await conn.query(
      `SELECT u.id, u.display_name, u.phone, ep.role
       FROM app_user u
       JOIN employee_profile ep ON ep.user_id = u.id
       WHERE u.email = ? AND u.auth_uid IS NULL AND u.id <> ?
       ORDER BY u.id
       LIMIT 1
       FOR UPDATE`,
      [email, userId]
    );

    if (placeholders.length === 0) {
      await conn.rollback();
      return null;
    }

    const p = placeholders[0];

    await conn.query(
      `UPDATE app_user
         SET user_type = 'employee',
             phone = COALESCE(phone, ?)
       WHERE id = ?`,
      [p.phone || null, userId]
    );

    // Drop the placeholder first so its employee_profile row (ON DELETE CASCADE)
    // cannot collide with the one we are about to insert.
    await conn.query('DELETE FROM app_user WHERE id = ?', [p.id]);

    await conn.query(
      `INSERT INTO employee_profile (user_id, role) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [userId, p.role]
    );

    await conn.commit();
    console.log(`Promoted user ${userId} (${email}) to employee role '${p.role}'`);
    return { role: p.role, display_name: p.display_name, phone: p.phone };
  } catch (err) {
    await conn.rollback();
    console.error('promotePreRegisteredEmployee failed:', err);
    return null;
  } finally {
    conn.release();
  }
}

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
      `SELECT u.id, u.user_type, u.display_name, u.email, u.phone,
              ep.role
       FROM app_user u
       LEFT JOIN employee_profile ep ON ep.user_id = u.id
       WHERE u.auth_uid = ?`,
      [sub]
    );

    if (rows.length > 0) {
      const u = rows[0];

      // A user who signed in BEFORE an admin pre-registered them was auto-created
      // as a customer (step 3). Because auth_uid matching happens first, they would
      // otherwise be stuck on the customer role forever while the admin's
      // pre-registered employee row sits orphaned. Reconcile that here.
      if (!u.role && u.user_type === 'customer' && u.email && emailVerified === true) {
        const promoted = await promotePreRegisteredEmployee(u.id, u.email);
        if (promoted) {
          req.user = {
            id:       u.id,
            userType: 'employee',
            name:     promoted.display_name || u.display_name,
            email:    u.email,
            phone:    promoted.phone || u.phone || null,
            role:     promoted.role,
          };
          return next();
        }
      }

      req.user = {
        id:       u.id,
        userType: u.user_type,
        name:     u.display_name,
        email:    u.email,
        phone:    u.phone || null,
        role:     u.role || u.user_type, // 'customer' has no employee_profile row
      };
      return next();
    }

    // 2. auth_uid not found — check for email match (pre-registered employee)
    if (email) {
      const [preRows] = await pool.query(
        `SELECT u.id, u.user_type, u.display_name, u.email, u.phone,
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
          phone:    u.phone || null,
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
        phone:    null,
        role:     'customer',
      };
    } catch (err) {
      await conn.rollback();
      // Two concurrent first requests can race the auto-create; the loser
      // hits the UNIQUE(auth_uid) key — recover by reading the winner's row.
      if (err.code === 'ER_DUP_ENTRY') {
        const [retryRows] = await pool.query(
          `SELECT u.id, u.user_type, u.display_name, u.email, u.phone, ep.role
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
            phone:    u.phone || null,
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
