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
