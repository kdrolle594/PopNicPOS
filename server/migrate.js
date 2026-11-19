import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pool from './db.js';
import { TOPPING_PRICES, SPECIALTY_PIZZAS } from './seedOptions.js';

// Postgres migrations. database/schema.sql is idempotent and holds the whole
// schema; one-time data changes run below and are recorded in
// app_data_migration so they never run twice.

const SCHEMA = fileURLToPath(new URL('../database/schema.sql', import.meta.url));

async function run() {
  const conn = await pool.getConnection();
  try {
    // The schema runs as one simple-protocol statement batch (no parameters).
    await conn.query(await readFile(SCHEMA, 'utf8'));
    console.log('✔  Schema ready');

    async function once(name, fn) {
      const [done] = await conn.query('SELECT 1 FROM app_data_migration WHERE name = ?', [name]);
      if (done.length) {
        console.log(`✔  ${name} already applied — skipping`);
        return;
      }
      await conn.beginTransaction();
      try {
        // A step returns false when its data isn't there yet (e.g. before the
        // seed); it is then not recorded and runs again next time.
        if ((await fn()) === false) {
          await conn.rollback();
          console.log(`…  ${name} has nothing to change yet — will retry on the next run`);
          return;
        }
        await conn.query('INSERT INTO app_data_migration (name) VALUES (?)', [name]);
        await conn.commit();
        console.log(`✔  Applied ${name}`);
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    }

    // Pizza toppings used to be free. Price the ones still at $0 and let
    // specialty pizzas add paid toppings too.
    await once('paid-pizza-toppings', async () => {
      const [[group]] = await conn.query("SELECT id FROM option_group WHERE name = 'Toppings'");
      if (!group) return false;
      for (const [name, price] of Object.entries(TOPPING_PRICES)) {
        await conn.query(
          'UPDATE option_choice SET price_delta = ? WHERE group_id = ? AND name = ? AND price_delta = 0',
          [price, group.id, name]
        );
      }
      const [pizzas] = await conn.query(
        `SELECT m.id FROM menu_item m
          WHERE m.name IN (?)
            AND NOT EXISTS (SELECT 1 FROM menu_item_option_group a
                             WHERE a.menu_item_id = m.id AND a.group_id = ?)`,
        [SPECIALTY_PIZZAS.map((p) => p.name), group.id]
      );
      for (const { id } of pizzas) {
        await conn.query(
          `INSERT INTO menu_item_option_group (menu_item_id, group_id, sort_order)
           SELECT ?, ?, COALESCE(MAX(sort_order), -1) + 1 FROM menu_item_option_group WHERE menu_item_id = ?`,
          [id, group.id, id]
        );
      }
    });

    console.log('✔  Migration complete');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
