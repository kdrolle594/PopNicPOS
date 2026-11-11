// One-time copy from the old Aiven MySQL database into Postgres (Supabase).
//
//   MYSQL_URI=...  (and MYSQL_CA)   the Aiven source, read only
//   DATABASE_URL=...                the Supabase target, schema already applied
//   node server/tools/copyFromMysql.js [--dry-run] [--with-orders]
//
// Copies staff, customers (with loyalty balances), menu, inventory, recipes and
// options, keeping every id. Old orders are left behind unless --with-orders is
// passed; order numbers still continue from the old highest number. The whole
// copy is one transaction, and it refuses to run if a target table has rows.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import pool from '../db.js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const WITH_ORDERS = args.has('--with-orders');

// Parents before children so foreign keys hold.
const TABLES = [
  'app_user', 'employee_profile', 'customer_profile',
  'inventory_item', 'menu_item', 'menu_item_inventory',
  'option_group', 'option_choice', 'menu_item_option_group',
  'audit_log',
  ...(WITH_ORDERS ? ['customer_order', 'order_item'] : []),
];
const BATCH = 200;

function mysqlSsl() {
  // A local test server (localhost) has no TLS; Aiven always does.
  if (/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.MYSQL_URI)) return undefined;
  const ca = process.env.MYSQL_CA;
  if (!ca) return { rejectUnauthorized: false };
  return { ca: ca.includes('-----BEGIN') ? ca : Buffer.from(ca, 'base64').toString('utf8'), rejectUnauthorized: true };
}

async function main() {
  if (!process.env.MYSQL_URI) throw new Error('Set MYSQL_URI to the Aiven connection string');
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the Supabase connection string');

  const src = await mysql.createConnection({ uri: process.env.MYSQL_URI, ssl: mysqlSsl(), timezone: 'Z' });
  const dst = await pool.getConnection();
  try {
    const [srcTables] = await src.query('SHOW TABLES');
    const present = new Set(srcTables.map((r) => Object.values(r)[0]));

    await dst.beginTransaction();
    for (const table of TABLES) {
      const [[{ n }]] = await dst.query(`SELECT COUNT(*) AS n FROM ${table}`);
      if (n > 0) throw new Error(`Target table ${table} already has ${n} rows. Copy into an empty database (run only node server/migrate.js first, not the seed).`);
    }

    for (const table of TABLES) {
      if (!present.has(table)) {
        console.log(`–  ${table}: not in the source database, skipped`);
        continue;
      }
      const [cols] = await dst.query(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ? ORDER BY ordinal_position`,
        [table]
      );
      const [srcCols] = await src.query(`SHOW COLUMNS FROM \`${table}\``);
      const srcNames = new Set(srcCols.map((c) => c.Field));
      const shared = cols.filter((c) => srcNames.has(c.column_name));
      const json = new Set(shared.filter((c) => c.data_type === 'jsonb').map((c) => c.column_name));
      const names = shared.map((c) => c.column_name);

      const [rows] = await src.query(`SELECT ${names.map((c) => `\`${c}\``).join(', ')} FROM \`${table}\``);
      console.log(`${DRY_RUN ? '…' : '✔'}  ${table}: ${rows.length} rows`);
      if (DRY_RUN || rows.length === 0) continue;

      for (let i = 0; i < rows.length; i += BATCH) {
        const values = rows.slice(i, i + BATCH).map((r) => names.map((c) => {
          const v = r[c];
          if (v == null) return null;
          if (json.has(c)) return typeof v === 'string' ? v : JSON.stringify(v);
          if (Buffer.isBuffer(v)) return v.toString('utf8');
          return v;
        }));
        await dst.query(`INSERT INTO ${table} (${names.join(', ')}) VALUES ? RETURNING 1`, [values]);
      }
    }

    // Identity columns continue after the copied ids.
    const [idTables] = await dst.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'id' AND table_name IN (?)`,
      [TABLES]
    );
    for (const { table_name: table } of idTables) {
      const [[seq]] = await dst.query("SELECT pg_get_serial_sequence(?, 'id') AS name", [table]);
      if (!seq?.name) continue;
      await dst.query(
        `SELECT setval(?, COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`,
        [seq.name]
      );
    }
    // Order numbers continue from the old highest number, orders copied or not.
    if (present.has('customer_order')) {
      const [[{ maxNo }]] = await src.query('SELECT COALESCE(MAX(order_number), 0) AS maxNo FROM customer_order');
      await dst.query("SELECT setval('customer_order_number_seq', ?, false)", [Number(maxNo) + 1]);
      console.log(`✔  Next order number: ${Number(maxNo) + 1}`);
    }

    if (DRY_RUN) {
      await dst.rollback();
      console.log('Dry run: nothing was written.');
    } else {
      await dst.commit();
      console.log('✔  Copy complete. Now run: node server/migrate.js && npm run seed:options');
    }
  } catch (err) {
    await dst.rollback();
    throw err;
  } finally {
    dst.release();
    await src.end();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Copy failed:', err.message);
  process.exitCode = 1;
});
