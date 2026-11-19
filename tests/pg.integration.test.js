// End-to-end API checks against a real Postgres. Runs only when
// TEST_DATABASE_URL points at a disposable database that already has the
// schema and seed (node server/migrate.js && node server/seed.js).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

// The JWT check trusts an x-test-user header ({ sub, email, email_verified }).
vi.mock('express-oauth2-jwt-bearer', () => ({
  auth: () => (req, res, next) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ error: 'no test user' });
    req.auth = { payload: JSON.parse(raw) };
    next();
  },
}));

describe.skipIf(!url)('API on Postgres', () => {
  let server, base, pool;
  const users = {};

  const call = async (who, method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(who ? { 'x-test-user': JSON.stringify(who) } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  async function staff(role) {
    const sub = `test|${role}-${Date.now()}`;
    const [r] = await pool.query(
      "INSERT INTO app_user (auth_uid, user_type, display_name, email) VALUES (?, 'employee', ?, ?)",
      [sub, `Test ${role}`, `${role}-${Date.now()}@test.local`]
    );
    await pool.query('INSERT INTO employee_profile (user_id, role) VALUES (?, ?)', [r.insertId, role]);
    return { sub, id: r.insertId };
  }

  beforeAll(async () => {
    pool = (await import('../server/db.js')).default;
    const app = (await import('../server/app.js')).default;
    server = app.listen(0);
    base = `http://localhost:${server.address().port}`;
    users.cashierA = await staff('cashier');
    users.cashierB = await staff('cashier');
    users.manager = await staff('manager');
    users.driver = await staff('driver');
    users.admin = await staff('admin');
    users.customer = { sub: `test|cust-${Date.now()}`, email: `cust-${Date.now()}@test.local`, email_verified: true };
  });

  afterAll(async () => {
    server?.close();
    await pool?.end();
  });

  it('serves the public menu with options', async () => {
    const { status, body } = await call(null, 'GET', '/api/menu-items');
    expect(status).toBe(200);
    const nachos = body.find((m) => m.name === 'Nachos');
    expect(nachos.optionGroups.map((g) => g.name)).toEqual(['Protein', 'Extras']);
    expect(typeof nachos.id).toBe('number');
  });

  it('auto-creates a customer on first login and returns the profile', async () => {
    const me = await call(users.customer, 'GET', '/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('customer');
    users.customer.id = me.body.id;
    const profile = await call(users.customer, 'GET', '/api/customers/me');
    expect(profile.body).toMatchObject({ points: 0, tier: 'bronze', history: [] });
  });

  it('runs the dual cashier flow and credits customer points', async () => {
    const menu = (await call(null, 'GET', '/api/menu-items')).body;
    const burger = menu.find((m) => m.name === 'Cheeseburger');
    const extras = burger.optionGroups.find((g) => g.name === 'Extras');
    const bacon = extras.choices.find((c) => c.name === 'Bacon');

    // Customer order: 4 burgers with bacon = 4 * (11.99 + 1.50) = 53.96 -> 5 points.
    const placed = await call(users.customer, 'POST', '/api/orders', {
      orderType: 'pickup',
      items: [{ menuItemId: burger.id, name: 'Cheeseburger', quantity: 4, choiceIds: [bacon.id] }],
    });
    expect(placed.status).toBe(201);
    expect(placed.body.total).toBeCloseTo(53.96);
    expect(placed.body.pointsEarned).toBe(5);
    expect(placed.body.orderNumber).toBeGreaterThan(0);

    // Cashier A sends an order unpaid; cashier B takes payment.
    const sent = await call(users.cashierA, 'POST', '/api/orders', {
      tableNumber: 3, items: [{ menuItemId: burger.id, name: 'Cheeseburger', quantity: 1, choiceIds: [] }],
    });
    expect(sent.status).toBe(201);
    expect(sent.body.orderNumber).toBe(placed.body.orderNumber + 1);
    const paid = await call(users.cashierB, 'PUT', `/api/orders/${sent.body.id}/payment`, { paymentMethod: 'card' });
    expect(paid.status).toBe(200);
    const again = await call(users.cashierA, 'PUT', `/api/orders/${sent.body.id}/payment`, { paymentMethod: 'cash' });
    expect(again.status).toBe(409);

    const list = (await call(users.manager, 'GET', '/api/orders')).body;
    const row = list.find((o) => o.id === sent.body.id);
    expect(row).toMatchObject({ createdByName: 'Test cashier', paidByName: 'Test cashier', paymentMethod: 'card' });
    expect(row.createdByUserId).toBe(users.cashierA.id);
    expect(row.paidByUserId).toBe(users.cashierB.id);

    // Completing the customer order credits points once.
    for (const status of ['preparing', 'ready', 'completed']) {
      expect((await call(users.manager, 'PUT', `/api/orders/${placed.body.id}/status`, { status })).status).toBe(200);
    }
    const profile = (await call(users.customer, 'GET', '/api/customers/me')).body;
    expect(profile.points).toBe(5);
    expect(profile.history[0]).toMatchObject({ pointsEarned: 5, credited: true });
  });

  it('claims a delivery and stores driver location with an upsert', async () => {
    const menu = (await call(null, 'GET', '/api/menu-items')).body;
    const soda = menu.find((m) => m.name === 'Soda');
    const order = await call(users.customer, 'POST', '/api/orders', {
      orderType: 'delivery', deliveryAddress: '1 Main St', deliveryLat: 40.7, deliveryLng: -74,
      items: [{ menuItemId: soda.id, name: 'Soda', quantity: 1, choiceIds: [soda.optionGroups[0].choices[0].id] }],
    });
    expect(order.status).toBe(201);
    await call(users.manager, 'PUT', `/api/orders/${order.body.id}/status`, { status: 'preparing' });
    await call(users.manager, 'PUT', `/api/orders/${order.body.id}/status`, { status: 'ready' });
    const drivers = await call(users.manager, 'GET', '/api/orders/drivers');
    expect(drivers.body.some((d) => d.id === users.driver.id)).toBe(true);
    expect((await call(users.driver, 'PUT', `/api/orders/${order.body.id}/driver`, {})).status).toBe(200);
    for (const lat of [40.71, 40.72]) {
      expect((await call(users.driver, 'POST', '/api/driver/location', { lat, lng: -74.01 })).status).toBe(200);
    }
    const [[loc]] = await pool.query('SELECT lat FROM driver_location WHERE driver_user_id = ?', [users.driver.id]);
    expect(Number(loc.lat)).toBeCloseTo(40.72);
  });

  it('rejects breakfast items outside 6-11 AM Eastern', async () => {
    const [r] = await pool.query(
      "INSERT INTO menu_item (name, category, price, cost) VALUES ('Test Breakfast', 'Breakfast', 5, 1)"
    );
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23',
    }).format(new Date()));
    const res = await call(users.cashierA, 'POST', '/api/orders', {
      items: [{ menuItemId: r.insertId, name: 'Test Breakfast', quantity: 1, choiceIds: [] }],
    });
    expect(res.status).toBe(hour >= 6 && hour < 11 ? 201 : 409);
    await pool.query('DELETE FROM order_item WHERE menu_item_id = ?', [r.insertId]);
    await pool.query('DELETE FROM menu_item WHERE id = ?', [r.insertId]);
  });

  it('manages users, inventory, menu items and option groups', async () => {
    const email = `new-${Date.now()}@test.local`;
    const created = await call(users.admin, 'POST', '/api/users', { name: 'New Cook', email, role: 'kitchen' });
    expect(created.status).toBe(201);
    const dup = await call(users.admin, 'POST', '/api/users', { name: 'Dup', email: email.toUpperCase(), role: 'kitchen' });
    expect(dup.status).toBe(409);
    expect((await call(users.admin, 'GET', '/api/users')).body.some((u) => u.email === email)).toBe(true);
    expect((await call(users.admin, 'PUT', `/api/users/${created.body.id}`, { role: 'cashier' })).status).toBe(200);
    expect((await call(users.admin, 'DELETE', `/api/users/${created.body.id}`)).status).toBeLessThan(300);

    const inv = await call(users.manager, 'POST', '/api/inventory-items', {
      name: `Test Stock ${Date.now()}`, quantity: 5, unit: 'lbs', reorderLevel: 1, costPerUnit: 2,
    });
    expect(inv.status).toBe(201);
    expect((await call(users.manager, 'PUT', `/api/inventory-items/${inv.body.id}`, { ...inv.body, quantity: 7 })).status).toBe(200);

    const item = await call(users.manager, 'POST', '/api/menu-items', {
      name: 'Test Taco', category: 'Mexican', price: 3.5, cost: 1, available: true, isCombo: false, pointsValue: 10,
      inventoryItems: [{ id: inv.body.id, quantity: 0.2 }],
    });
    expect(item.status).toBe(201);
    expect((await call(users.manager, 'PUT', `/api/menu-items/${item.body.id}`, { ...item.body, price: 4 })).status).toBe(200);

    const group = await call(users.manager, 'POST', '/api/option-groups', {
      name: `Test Salsa ${Date.now()}`, minSelect: 0, maxSelect: 1,
      choices: [{ name: 'Mild', priceDelta: 0 }, { name: 'Hot', priceDelta: 0.5, inventoryItemId: inv.body.id, inventoryQty: 0.1 }],
    });
    expect(group.status).toBe(201);
    const choiceId = group.body.choices[0].id;
    expect((await call(users.manager, 'PATCH', `/api/option-choices/${choiceId}`, { enabled: false })).status).toBe(200);
    const sameName = await call(users.manager, 'POST', '/api/option-groups', {
      name: group.body.name.toLowerCase(), minSelect: 0, maxSelect: 1, choices: [{ name: 'X', priceDelta: 0 }],
    });
    expect(sameName.status).toBe(409);

    expect((await call(users.manager, 'DELETE', `/api/menu-items/${item.body.id}`)).status).toBeLessThan(300);
    expect((await call(users.manager, 'DELETE', `/api/option-groups/${group.body.id}`)).status).toBeLessThan(300);
    expect((await call(users.manager, 'DELETE', `/api/inventory-items/${inv.body.id}`)).status).toBeLessThan(300);
  });

  it('lists loyalty customers for cashiers and updates points', async () => {
    const list = await call(users.cashierA, 'GET', '/api/customers');
    expect(list.status).toBe(200);
    const me = list.body.find((c) => c.id === users.customer.id);
    expect(me.points).toBe(5);
    const upd = await call(users.cashierA, 'PUT', `/api/customers/${me.id}`, { ...me, points: 300 });
    expect(upd.status).toBe(200);
    expect(upd.body.tier).toBe('silver');
  });
});
