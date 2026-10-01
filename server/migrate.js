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

    // 6. Add image_url + description to menu_item
    for (const [column, ddl] of [
      ['image_url',   'ALTER TABLE menu_item ADD COLUMN image_url VARCHAR(512) NULL'],
      ['description', 'ALTER TABLE menu_item ADD COLUMN description VARCHAR(280) NULL'],
    ]) {
      const [existing] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = 'menu_item'
           AND COLUMN_NAME  = ?`,
        [column]
      );
      if (existing.length === 0) {
        await conn.query(ddl);
        console.log(`✔  Added ${column} to menu_item`);
      } else {
        console.log(`✔  menu_item.${column} already exists — skipping`);
      }
    }

    // 7. Option groups, choices and menu item attachments.
    // FK columns must match the existing id column types exactly, so read them.
    async function idColumnType(table) {
      const [[col]] = await conn.query(
        `SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'id'`,
        [table]
      );
      if (!col) throw new Error(`${table}.id not found`);
      return col.type;
    }
    const menuIdType = await idColumnType('menu_item');
    const inventoryIdType = await idColumnType('inventory_item');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS option_group (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        min_select TINYINT UNSIGNED NOT NULL DEFAULT 0,
        max_select TINYINT UNSIGNED NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_option_group_name (name)
      ) ENGINE=InnoDB
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS option_choice (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL,
        name VARCHAR(80) NOT NULL,
        price_delta DECIMAL(8,2) NOT NULL DEFAULT 0,
        available BOOLEAN NOT NULL DEFAULT TRUE,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        inventory_item_id ${inventoryIdType} NULL,
        inventory_qty DECIMAL(10,3) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_option_choice_group_name (group_id, name),
        CONSTRAINT fk_option_choice_group FOREIGN KEY (group_id)
          REFERENCES option_group(id) ON DELETE CASCADE,
        CONSTRAINT fk_option_choice_inventory FOREIGN KEY (inventory_item_id)
          REFERENCES inventory_item(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS menu_item_option_group (
        menu_item_id ${menuIdType} NOT NULL,
        group_id INT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        PRIMARY KEY (menu_item_id, group_id),
        CONSTRAINT fk_mog_menu_item FOREIGN KEY (menu_item_id)
          REFERENCES menu_item(id) ON DELETE CASCADE,
        CONSTRAINT fk_mog_group FOREIGN KEY (group_id)
          REFERENCES option_group(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
    console.log('✔  Option tables ready');

    // 8. order_item.line_name must be wide enough for a fully customized
    // label, e.g. "Build Your Own Pizza (Large, Pepperoni, Ham, … Extra
    // Cheese)" (~140 chars).
    const [lineNameCols] = await conn.query(`
      SELECT CHARACTER_MAXIMUM_LENGTH, DATA_TYPE, IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'order_item'
        AND COLUMN_NAME  = 'line_name'
    `);
    if (lineNameCols.length === 0) {
      console.warn('order_item.line_name column not found — skipping line_name width migration');
    } else {
      const { CHARACTER_MAXIMUM_LENGTH: maxLen, DATA_TYPE: dataType, IS_NULLABLE: isNullable } = lineNameCols[0];
      const isCharType = dataType === 'varchar' || dataType === 'char';
      if (isCharType && maxLen != null && maxLen < 255) {
        const nullClause = isNullable === 'NO' ? 'NOT NULL' : 'NULL';
        await conn.query(`ALTER TABLE order_item MODIFY line_name VARCHAR(255) ${nullClause}`);
        console.log('✔  order_item.line_name is VARCHAR(255)');
      } else {
        console.log('✔  order_item.line_name is already VARCHAR(255) or wider — skipping');
      }
    }

    // 9. Multi-stop delivery: out_for_delivery status, driver identity,
    // queue position / ETA on the order, and one location row per active driver.
    const [statusCols] = await conn.query(`
      SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'customer_order'
        AND COLUMN_NAME  = 'status'
    `);
    if (statusCols.length === 0) {
      console.warn('customer_order.status column not found — skipping status enum migration');
    } else if (statusCols[0].COLUMN_TYPE.includes("'out_for_delivery'")) {
      console.log('✔  customer_order.status already includes out_for_delivery — skipping');
    } else {
      const existing = Array.from(statusCols[0].COLUMN_TYPE.matchAll(/'([^']+)'/g)).map((m) => m[1]);
      const ordered = ['pending', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
      const next = [...ordered, ...existing.filter((v) => !ordered.includes(v))];
      const enumList = next.map((v) => `'${v}'`).join(',');
      await conn.query(
        `ALTER TABLE customer_order MODIFY COLUMN status ENUM(${enumList}) NOT NULL DEFAULT 'pending'`
      );
      console.log('✔  Added out_for_delivery to customer_order.status enum');
    }

    const [idCol] = await conn.query(`
      SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND COLUMN_NAME = 'id'
    `);
    const userIdType = idCol[0].COLUMN_TYPE; // FK columns must match exactly, e.g. "bigint"

    // driver_name / driver_phone are used by the existing code but no earlier
    // step creates them (they were added to the shared DB by hand), so ensure them here.
    const orderColumns = [
      ['driver_name', 'VARCHAR(100) NULL'],
      ['driver_phone', 'VARCHAR(30) NULL'],
      ['driver_user_id', `${userIdType} NULL`],
      ['queue_position', 'SMALLINT NULL'],
      ['eta_at', 'DATETIME NULL'],
    ];
    for (const [column, definition] of orderColumns) {
      const [found] = await conn.query(`
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_order' AND COLUMN_NAME = ?
      `, [column]);
      if (found.length) {
        console.log(`✔  customer_order.${column} already exists — skipping`);
      } else {
        await conn.query(`ALTER TABLE customer_order ADD COLUMN ${column} ${definition}`);
        console.log(`✔  Added ${column} to customer_order`);
      }
    }

    const [driverFk] = await conn.query(`
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_order'
        AND CONSTRAINT_NAME = 'fk_customer_order_driver_user'
    `);
    if (driverFk.length) {
      console.log('✔  customer_order driver FK already exists — skipping');
    } else {
      await conn.query(`
        ALTER TABLE customer_order
          ADD CONSTRAINT fk_customer_order_driver_user
          FOREIGN KEY (driver_user_id) REFERENCES app_user(id) ON DELETE SET NULL
      `);
      console.log('✔  Added customer_order.driver_user_id FK');
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS driver_location (
        driver_user_id  ${userIdType} NOT NULL,
        lat             DECIMAL(10,7) NOT NULL,
        lng             DECIMAL(10,7) NOT NULL,
        updated_at      DATETIME      NOT NULL,
        route_calc_at   DATETIME      NULL,
        route_calc_lat  DECIMAL(10,7) NULL,
        route_calc_lng  DECIMAL(10,7) NULL,
        route_stop_ids  VARCHAR(512)  NULL,
        route_json      JSON          NULL,
        PRIMARY KEY (driver_user_id),
        CONSTRAINT fk_driver_location_user
          FOREIGN KEY (driver_user_id) REFERENCES app_user(id) ON DELETE CASCADE
      )
    `);
    console.log('✔  driver_location table ready');

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
