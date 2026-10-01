import { Router } from 'express';
import pool from '../db.js';
import {
  emitNewOrder, emitOrderStatusUpdated, emitOrderDriverAssigned, emitMenuChanged, emitRoutePublishes,
} from '../realtime.js';
import { resolveLine, OrderLineError, snapshotStock } from '../lib/orderOptions.js';
import { totalStockNeeds, findShortfall, crossesThreshold } from '../lib/availability.js';
import { loadOptionData, loadStock, loadThresholds, groupsForItem } from '../lib/optionData.js';

import {
  deliveryPinError, STAFF_ASSIGN_ROLES, canChangeStatus, canRelease, resolveClaim,
} from '../lib/orderRules.js';
// lockDriver lock order: app_user(driver) -> driver_location -> customer_order.
import { recalculateDriverRoute, lockDriver } from '../lib/driverRoute.js';

const router = Router();

const STAFF_ROLES = new Set(['cashier', 'kitchen', 'manager', 'admin', 'driver']);
const VALID_STATUSES = new Set(['pending', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']);
const VALID_ORDER_TYPES = new Set(['dine_in', 'pickup', 'delivery']);
const MAX_ITEM_QUANTITY = 100;

function parseCustomizations(raw) {
  if (raw == null) return {};
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// GET /api/orders — list all orders with line items
router.get('/', async (req, res) => {
  try {
    const isCustomer = req.user?.role === 'customer';
    const [orders] = isCustomer
      ? await pool.query(
          'SELECT * FROM customer_order WHERE customer_user_id = ? ORDER BY created_at DESC',
          [req.user.id]
        )
      : await pool.query('SELECT * FROM customer_order ORDER BY created_at DESC');

    let items = [];
    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      [items] = await pool.query('SELECT * FROM order_item WHERE order_id IN (?) ORDER BY id', [orderIds]);
    }

    // Customers see how many stops their driver is carrying, never whose.
    const stopCounts = new Map();
    if (isCustomer) {
      const driverIds = [...new Set(
        orders.filter((o) => o.status === 'out_for_delivery' && o.driver_user_id != null)
          .map((o) => o.driver_user_id)
      )];
      if (driverIds.length) {
        const [counts] = await pool.query(
          `SELECT driver_user_id, COUNT(*) AS n FROM customer_order
            WHERE status = 'out_for_delivery' AND driver_user_id IN (?)
            GROUP BY driver_user_id`,
          [driverIds]
        );
        for (const c of counts) stopCounts.set(c.driver_user_id, Number(c.n));
      }
    }

    const result = orders.map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      orderType: order.order_type,
      status: order.status,
      total: Number(order.total),
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      tableNumber: order.table_number,
      deliveryAddress: order.delivery_address,
      deliveryLat: order.delivery_lat != null ? Number(order.delivery_lat) : null,
      deliveryLng: order.delivery_lng != null ? Number(order.delivery_lng) : null,
      notes: order.notes,
      paymentMethod: order.payment_method,
      pointsEarned: order.points_earned,
      pointsRedeemed: order.points_redeemed,
      driverName: order.driver_name,
      driverPhone: order.driver_phone,
      ...(isCustomer
        ? { totalStops: order.driver_user_id != null ? stopCounts.get(order.driver_user_id) ?? null : null }
        : { driverUserId: order.driver_user_id ?? null }),
      queuePosition: order.queue_position ?? null,
      etaAt: order.eta_at ? new Date(order.eta_at).toISOString() : null,
      createdAt: order.created_at,
      completedAt: order.completed_at,
      items: items
        .filter((i) => i.order_id === order.id)
        .map((i) => ({
          menuItemId: i.menu_item_id,
          name: i.line_name,
          quantity: i.quantity,
          price: Number(i.unit_price),
          paidWithPoints: Boolean(i.paid_with_points),
          notes: i.notes,
          options: parseCustomizations(i.customizations),
        })),
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/orders/drivers — active driver accounts and how many stops each is carrying.
router.get('/drivers', async (req, res) => {
  if (!STAFF_ASSIGN_ROLES.has(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT u.id, COALESCE(NULLIF(u.display_name, ''), u.email) AS name, u.phone,
              (SELECT COUNT(*) FROM customer_order o
                WHERE o.driver_user_id = u.id AND o.status = 'out_for_delivery') AS activeStops
         FROM app_user u
         JOIN employee_profile ep ON ep.user_id = u.id
        WHERE ep.role = 'driver' AND u.is_active = 1
        ORDER BY name`
    );
    res.json(rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone || null, activeStops: Number(r.activeStops) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/orders — place order (inserts header + lines, deducts inventory in a transaction)
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      orderType,
      customerName,
      customerPhone,
      tableNumber,
      deliveryAddress,
      deliveryLat,
      deliveryLng,
      notes,
      paymentMethod,
      pointsEarned,
      pointsRedeemed,
      items,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'items must be a non-empty array' });
    }

    if (orderType != null && !VALID_ORDER_TYPES.has(orderType)) {
      await conn.rollback();
      return res.status(400).json({ error: `orderType must be one of: ${[...VALID_ORDER_TYPES].join(', ')}` });
    }

    const lat = deliveryLat != null ? Number(deliveryLat) : null;
    const lng = deliveryLng != null ? Number(deliveryLng) : null;
    if ((lat != null && (!isFinite(lat) || Math.abs(lat) > 90)) ||
        (lng != null && (!isFinite(lng) || Math.abs(lng) > 180))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Invalid delivery coordinates' });
    }

    const pinError = deliveryPinError(orderType, lat, lng);
    if (pinError) {
      await conn.rollback();
      return res.status(400).json({ error: pinError });
    }

    const isStaff = STAFF_ROLES.has(req.user?.role);

    // Normalize and validate every line item before touching the DB.
    for (const item of items) {
      item.quantity = Number(item.quantity ?? 1);
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ITEM_QUANTITY) {
        await conn.rollback();
        return res.status(400).json({ error: `Item quantity must be an integer between 1 and ${MAX_ITEM_QUANTITY}` });
      }
      if (typeof item.name !== 'string' || !item.name.trim()) {
        await conn.rollback();
        return res.status(400).json({ error: 'Each item requires a name' });
      }
      // Point-paid lines skip the cash total; only trusted staff (POS terminal)
      // may mark them — a customer could otherwise order everything for free.
      if (item.paidWithPoints && !isStaff) {
        await conn.rollback();
        return res.status(403).json({ error: 'Point redemption requires a staff role' });
      }
    }

    // Loyalty point fields are bookkeeping set by the POS terminal; never
    // accept them from customer-placed orders.
    const safePointsEarned   = isStaff ? Math.max(0, Number(pointsEarned)   || 0) : 0;
    const safePointsRedeemed = isStaff ? Math.max(0, Number(pointsRedeemed) || 0) : 0;

    // Load menu rows, recipes and options for every referenced item, then lock
    // every stock row those lines could touch (ascending id, avoids deadlocks).
    const menuItemIds = [...new Set(items.filter((i) => i.menuItemId).map((i) => Number(i.menuItemId)))];
    const menuMap = new Map();
    const recipeMap = new Map();
    let optionData = { groups: new Map(), attachments: new Map() };
    if (menuItemIds.length > 0) {
      const [menuRows] = await conn.query(
        'SELECT id, name, price, available FROM menu_item WHERE id IN (?)', [menuItemIds]
      );
      for (const r of menuRows) menuMap.set(r.id, r);
      const [recipeRows] = await conn.query(
        'SELECT menu_item_id, inventory_item_id, quantity_used FROM menu_item_inventory WHERE menu_item_id IN (?)',
        [menuItemIds]
      );
      for (const r of recipeRows) {
        if (!recipeMap.has(r.menu_item_id)) recipeMap.set(r.menu_item_id, []);
        recipeMap.get(r.menu_item_id).push({ inventoryItemId: r.inventory_item_id, quantity: Number(r.quantity_used) });
      }
      optionData = await loadOptionData(conn);
    }
    const stockIds = [];
    for (const id of menuItemIds) {
      for (const link of recipeMap.get(id) || []) stockIds.push(link.inventoryItemId);
      for (const group of groupsForItem(id, optionData)) {
        for (const c of group.choices) if (c.inventoryItemId != null) stockIds.push(c.inventoryItemId);
      }
    }
    const stock = await loadStock(conn, stockIds, { forUpdate: true });

    let serverTotal = 0;
    const stockLines = [];
    for (const item of items) {
      if (item.menuItemId) {
        const row = menuMap.get(Number(item.menuItemId));
        if (!row) {
          await conn.rollback();
          return res.status(400).json({ error: `Unknown menu item id: ${item.menuItemId}` });
        }
        let resolved;
        try {
          resolved = resolveLine({
            menuItem: {
              id: row.id, name: row.name, price: Number(row.price),
              available: Boolean(row.available), recipe: recipeMap.get(row.id) || [],
            },
            groups: groupsForItem(row.id, optionData),
            choiceIds: item.choiceIds,
            stock,
          });
        } catch (e) {
          if (!(e instanceof OrderLineError)) throw e;
          await conn.rollback();
          return res.status(400).json({ error: e.message });
        }
        item.menuItemId = row.id;
        // order_item.line_name is VARCHAR(255) (see server/migrate.js step 8);
        // a fully customized label can run long, so truncate defensively.
        item.name = resolved.label.slice(0, 255);
        item.unitPrice = item.paidWithPoints ? 0 : resolved.unitPrice;
        item.customizations = resolved.snapshot;
        stockLines.push({ stockPerUnit: resolved.stockPerUnit, quantity: item.quantity });
      } else {
        if (!isStaff) {
          await conn.rollback();
          return res.status(403).json({ error: 'Custom line items require a staff role' });
        }
        if (item.paidWithPoints) {
          item.unitPrice = 0;
        } else {
          const customPrice = Number(item.price);
          if (!isFinite(customPrice) || customPrice < 0) {
            await conn.rollback();
            return res.status(400).json({ error: 'Invalid price on custom line item' });
          }
          item.unitPrice = customPrice;
        }
        item.customizations = {};
      }
      serverTotal += item.unitPrice * item.quantity;
    }
    serverTotal = Math.round(serverTotal * 100) / 100;

    // Needs are summed across lines, so two lines cannot both take the last unit.
    const stockNeeds = totalStockNeeds(stockLines);
    const shortId = findShortfall(stockNeeds, stock);
    if (shortId != null) {
      await conn.rollback();
      return res.status(409).json({ error: 'Insufficient inventory', inventoryItemId: shortId });
    }

    // Server-authoritative order number with retry on UNIQUE collision
    let orderNumber, orderId;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [[{ next }]] = await conn.query(
          'SELECT COALESCE(MAX(order_number), 0) + 1 AS next FROM customer_order'
        );
        const [orderResult] = await conn.query(
          `INSERT INTO customer_order
             (order_number, order_type, status, total, customer_user_id, customer_name, customer_phone,
              table_number, delivery_address, delivery_lat, delivery_lng,
              notes, payment_method, points_earned, points_redeemed)
           VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            next,
            orderType || 'dine_in',
            serverTotal,
            req.user?.id || null,
            customerName || null,
            customerPhone || null,
            tableNumber || null,
            deliveryAddress || null,
            lat,
            lng,
            notes || null,
            paymentMethod || null,
            safePointsEarned,
            safePointsRedeemed,
          ]
        );
        orderNumber = next;
        orderId = orderResult.insertId;
        break;
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY' || attempt === 2) throw e;
      }
    }

    // Insert order line items
    for (const item of items) {
      await conn.query(
        `INSERT INTO order_item
           (order_id, menu_item_id, line_name, quantity, unit_price, paid_with_points, notes, customizations)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.menuItemId || null,
          item.name,
          item.quantity,
          item.unitPrice,
          item.paidWithPoints || false,
          item.notes || null,
          JSON.stringify(item.customizations || {}),
        ]
      );
    }

    // Deduct stock (rows already locked above) and note what changed.
    const stockChanges = new Map();
    for (const [invId, needed] of stockNeeds) {
      if (!stock.has(invId)) continue; // row deleted — nothing to deduct
      await conn.query(
        'UPDATE inventory_item SET quantity = quantity - ?, last_updated = NOW() WHERE id = ?',
        [needed, invId]
      );
      const before = stock.get(invId);
      stockChanges.set(invId, { before, after: before - needed });
    }
    const thresholds = await loadThresholds(conn, [...stockChanges.keys()]);

    await conn.commit();
    if (crossesThreshold(stockChanges, thresholds)) await emitMenuChanged();

    const responseOrder = {
      id: orderId,
      orderNumber,
      orderType: orderType || 'dine_in',
      status: 'pending',
      total: serverTotal,
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      tableNumber: tableNumber || null,
      deliveryAddress: deliveryAddress || null,
      deliveryLat: lat,
      deliveryLng: lng,
      notes: notes || null,
      paymentMethod: paymentMethod || null,
      pointsEarned: safePointsEarned,
      pointsRedeemed: safePointsRedeemed,
      createdAt: new Date().toISOString(),
      completedAt: null,
      items: items.map((i) => ({
        menuItemId: i.menuItemId || null,
        name: i.name,
        quantity: i.quantity,
        price: i.unitPrice,
        paidWithPoints: Boolean(i.paidWithPoints),
        notes: i.notes || null,
        options: i.customizations || {},
      })),
    };

    emitNewOrder(responseOrder);
    res.status(201).json(responseOrder);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// PUT /api/orders/:id/status — update order status
router.put('/:id/status', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { status } = req.body;
    const orderId = Number(req.params.id);

    if (!VALID_STATUSES.has(status)) {
      await conn.rollback();
      return res.status(400).json({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` });
    }

    // Learn the order's driver without a lock, lock that driver first, then the
    // order (lock-order rule), and bail out if the driver changed in between.
    const [[peek]] = await conn.query('SELECT driver_user_id FROM customer_order WHERE id = ?', [orderId]);
    if (!peek) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }
    if (peek.driver_user_id != null) await lockDriver(conn, peek.driver_user_id);

    const [[current]] = await conn.query(
      'SELECT status, customer_user_id, driver_user_id FROM customer_order WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (!current) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }
    if ((current.driver_user_id ?? null) !== (peek.driver_user_id ?? null)) {
      await conn.rollback();
      return res.status(409).json({ error: 'Order changed, try again' });
    }

    const verdict = canChangeStatus(
      req.user,
      { status: current.status, customerUserId: current.customer_user_id, driverUserId: current.driver_user_id },
      status
    );
    if (!verdict.ok) {
      await conn.rollback();
      return res.status(verdict.code).json({ error: verdict.error });
    }

    const isCancelling = status === 'cancelled' && current.status !== 'cancelled';

    const stockChanges = new Map();
    let thresholds = new Map();
    if (isCancelling) {
      const [orderItems] = await conn.query(
        'SELECT menu_item_id, quantity, customizations FROM order_item WHERE order_id = ?',
        [orderId]
      );
      const restock = new Map();
      const add = (id, qty) => restock.set(id, (restock.get(id) || 0) + qty);
      for (const item of orderItems) {
        if (item.menu_item_id) {
          const [recipeLinks] = await conn.query(
            'SELECT inventory_item_id, quantity_used FROM menu_item_inventory WHERE menu_item_id = ?',
            [item.menu_item_id]
          );
          for (const link of recipeLinks) add(link.inventory_item_id, Number(link.quantity_used) * item.quantity);
        }
        for (const s of snapshotStock(parseCustomizations(item.customizations))) {
          add(s.inventoryItemId, s.inventoryQty * item.quantity);
        }
      }
      const before = await loadStock(conn, [...restock.keys()], { forUpdate: true });
      for (const [invId, qty] of restock) {
        if (!before.has(invId)) continue;
        await conn.query(
          'UPDATE inventory_item SET quantity = quantity + ?, last_updated = NOW() WHERE id = ?',
          [qty, invId]
        );
        stockChanges.set(invId, { before: before.get(invId), after: before.get(invId) + qty });
      }
      thresholds = await loadThresholds(conn, [...stockChanges.keys()]);
    }

    // Only stamp completed_at when first transitioning to 'completed'
    let completedAt = undefined;
    if (status === 'completed' && current.status !== 'completed') {
      completedAt = new Date();
      await conn.query(
        'UPDATE customer_order SET status = ?, completed_at = ? WHERE id = ?',
        [status, completedAt, orderId]
      );
    } else {
      await conn.query('UPDATE customer_order SET status = ? WHERE id = ?', [status, orderId]);
    }

    // Leaving a route: clear this stop and re-plan the driver's remaining stops.
    let routeResult = null;
    if (current.status === 'out_for_delivery' && status !== 'out_for_delivery') {
      await conn.query('UPDATE customer_order SET queue_position = NULL, eta_at = NULL WHERE id = ?', [orderId]);
      routeResult = await recalculateDriverRoute(conn, current.driver_user_id, { force: true });
    }

    await conn.commit();
    if (crossesThreshold(stockChanges, thresholds)) await emitMenuChanged();

    await emitOrderStatusUpdated(orderId, status, current.customer_user_id);
    if (routeResult) await emitRoutePublishes(routeResult.publishes);
    res.json({
      id: orderId,
      status,
      completedAt: completedAt ?? null,
      route: routeResult && current.driver_user_id === req.user.id ? routeResult.route : null,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// PUT /api/orders/:id/driver — claim a ready delivery onto a driver's route.
// Drivers, managers and admins send {} to claim for themselves; cashier,
// kitchen, manager and admin send { driverUserId } to assign a driver.
router.put('/:id/driver', async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  const claim = resolveClaim(req.user, req.body);
  if (!claim.ok) return res.status(claim.code).json({ error: claim.error });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockDriver(conn, claim.driverUserId);

    const [[driver]] = await conn.query(
      `SELECT u.id, u.display_name, u.email, u.phone, u.is_active, ep.role
         FROM app_user u LEFT JOIN employee_profile ep ON ep.user_id = u.id
        WHERE u.id = ?`,
      [claim.driverUserId]
    );
    if (!claim.self && (!driver || !driver.is_active || driver.role !== 'driver')) {
      await conn.rollback();
      return res.status(400).json({ error: 'That user is not an active driver' });
    }
    const driverName = driver.display_name || driver.email;
    const driverPhone = driver.phone || null;

    const [result] = await conn.query(
      `UPDATE customer_order
          SET driver_user_id = ?, driver_name = ?, driver_phone = ?,
              status = 'out_for_delivery', queue_position = NULL, eta_at = NULL
        WHERE id = ? AND order_type = 'delivery' AND status = 'ready'
          AND delivery_lat IS NOT NULL AND delivery_lng IS NOT NULL AND driver_user_id IS NULL`,
      [claim.driverUserId, driverName, driverPhone, orderId]
    );
    if (result.affectedRows === 0) {
      const [[exists]] = await conn.query('SELECT id FROM customer_order WHERE id = ?', [orderId]);
      await conn.rollback();
      return exists
        ? res.status(409).json({ error: 'Already taken or not ready for delivery' })
        : res.status(404).json({ error: 'Order not found' });
    }

    const [[order]] = await conn.query('SELECT customer_user_id FROM customer_order WHERE id = ?', [orderId]);
    const { route, publishes } = await recalculateDriverRoute(conn, claim.driverUserId, { force: true });
    await conn.commit();

    await emitOrderStatusUpdated(orderId, 'out_for_delivery', order.customer_user_id);
    await emitOrderDriverAssigned(
      orderId, { driverUserId: claim.driverUserId, driverName, driverPhone }, order.customer_user_id
    );
    await emitRoutePublishes(publishes);
    res.json({
      id: orderId, status: 'out_for_delivery',
      driverUserId: claim.driverUserId, driverName, driverPhone, route,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// DELETE /api/orders/:id/driver — the assigned driver hands the order back.
router.delete('/:id/driver', async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockDriver(conn, req.user.id);
    const [[order]] = await conn.query(
      'SELECT status, driver_user_id, customer_user_id FROM customer_order WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }
    const verdict = canRelease(req.user, { status: order.status, driverUserId: order.driver_user_id });
    if (!verdict.ok) {
      await conn.rollback();
      return res.status(verdict.code).json({ error: verdict.error });
    }

    await conn.query(
      `UPDATE customer_order
          SET status = 'ready', driver_user_id = NULL, driver_name = NULL, driver_phone = NULL,
              queue_position = NULL, eta_at = NULL
        WHERE id = ?`,
      [orderId]
    );
    const { route, publishes } = await recalculateDriverRoute(conn, req.user.id, { force: true });
    await conn.commit();

    await emitOrderStatusUpdated(orderId, 'ready', order.customer_user_id);
    await emitOrderDriverAssigned(orderId, { driverUserId: null, driverName: null, driverPhone: null }, order.customer_user_id);
    await emitRoutePublishes(publishes);
    res.json({ id: orderId, status: 'ready', route });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

export default router;
