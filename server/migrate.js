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

    // 2. Ensure 'pickup' is an allowed value on customer_order.order_type (if enum)
    const [typeCols] = await conn.query(`
      SELECT DATA_TYPE, COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'customer_order'
        AND COLUMN_NAME  = 'order_type'
    `);
    if (typeCols.length === 0) {
      console.warn('customer_order.order_type column not found — skipping order_type migration');
    } else if (typeCols[0].DATA_TYPE === 'enum') {
      const t = typeCols[0].COLUMN_TYPE;
      if (t.includes("'pickup'")) {
        console.log('✔  customer_order.order_type already includes pickup — skipping');
      } else {
        // Preserve existing members and add 'pickup'
        const existing = Array.from(t.matchAll(/'([^']+)'/g)).map((m) => m[1]);
        const next = Array.from(new Set([...existing, 'pickup']));
        const enumList = next.map((v) => `'${v}'`).join(',');
        await conn.query(
          `ALTER TABLE customer_order MODIFY COLUMN order_type ENUM(${enumList}) NOT NULL DEFAULT 'dine_in'`
        );
        console.log('✔  Added pickup to customer_order.order_type enum');
      }
    }

    // 3. Add delivery GPS coordinates to customer_order
    const [latCols] = await conn.query(`
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'customer_order'
        AND COLUMN_NAME  = 'delivery_lat'
    `);
    if (latCols.length === 0) {
      await conn.query(
        `ALTER TABLE customer_order ADD COLUMN delivery_lat DECIMAL(10,7) NULL`
      );
      console.log('✔  Added delivery_lat to customer_order');
    } else {
      console.log('✔  customer_order.delivery_lat already exists — skipping');
    }

    const [lngCols] = await conn.query(`
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'customer_order'
        AND COLUMN_NAME  = 'delivery_lng'
    `);
    if (lngCols.length === 0) {
      await conn.query(
        `ALTER TABLE customer_order ADD COLUMN delivery_lng DECIMAL(10,7) NULL`
      );
      console.log('✔  Added delivery_lng to customer_order');
    } else {
      console.log('✔  customer_order.delivery_lng already exists — skipping');
    }

    // 4. app_user.auth_uid must be nullable — employee pre-registration
    // (POST /api/users) inserts NULL and first-login linking matches on
    // auth_uid IS NULL. The original schema declared it NOT NULL.
    const [uidCols] = await conn.query(`
      SELECT IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'app_user'
        AND COLUMN_NAME  = 'auth_uid'
    `);
    if (uidCols.length === 0) {
      console.warn('app_user.auth_uid column not found — skipping nullable migration');
    } else if (uidCols[0].IS_NULLABLE === 'YES') {
      console.log('✔  app_user.auth_uid already nullable — skipping');
    } else {
      await conn.query(`ALTER TABLE app_user MODIFY COLUMN auth_uid VARCHAR(255) NULL`);
      console.log('✔  Made app_user.auth_uid nullable (employee pre-registration)');
    }

    // 5. app_user.email must be unique — first-login linking matches on email, so
    // two rows sharing an address leave one of them permanently unreachable. This
    // is how a driver who signed in before being pre-registered ended up stuck on
    // the customer role with an orphaned employee row beside them.
    const [emailIdx] = await conn.query(`
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'app_user'
        AND INDEX_NAME   = 'uq_app_user_email'
    `);
    if (emailIdx.length > 0) {
      console.log('✔  app_user.email already unique — skipping');
    } else {
      const [dupes] = await conn.query(`
        SELECT email, COUNT(*) AS n, GROUP_CONCAT(id ORDER BY id) AS ids
        FROM app_user
        WHERE email IS NOT NULL
        GROUP BY email
        HAVING n > 1
      `);
      if (dupes.length > 0) {
        console.warn('⚠  Cannot add UNIQUE(email) — duplicate emails found. Resolve these first:');
        for (const d of dupes) {
          console.warn(`     ${d.email} → app_user ids ${d.ids}`);
        }
        console.warn('   Keep the row whose auth_uid is set (the account they actually sign in as),');
        console.warn('   move its employee_profile role across, then delete the auth_uid IS NULL row.');
      } else {
        await conn.query(
          'ALTER TABLE app_user ADD UNIQUE KEY uq_app_user_email (email)'
        );
        console.log('✔  Added UNIQUE(email) to app_user');
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
