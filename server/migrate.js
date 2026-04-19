import pool from './db.js';

// ── Idempotent migrations ───────────────────────────────────────────────────────

async function run() {
  const conn = await pool.getConnection();
  try {
    // 1. Add 'driver' to employee_profile.role enum (safe to re-run)
    const [cols] = await conn.query(`
      SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'employee_profile'
        AND COLUMN_NAME  = 'role'
    `);

    if (cols.length === 0) {
      console.warn('employee_profile.role column not found — skipping enum migration');
    } else {
      const type = cols[0].COLUMN_TYPE; // e.g. "enum('cashier','kitchen','manager','admin')"
      if (type.includes("'driver'")) {
        console.log('✔  employee_profile.role already includes driver — skipping');
      } else {
        await conn.query(`
          ALTER TABLE employee_profile
            MODIFY COLUMN role ENUM('cashier','kitchen','manager','admin','driver') NOT NULL
        `);
        console.log('✔  Added driver to employee_profile.role enum');
      }
    }

    console.log('✔  Migration complete');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
