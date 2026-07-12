import { Router } from 'express';
import pool from '../db.js';
import { emitNewOrder, emitOrderStatusUpdated, emitOrderDriverAssigned } from '../realtime.js';

const router = Router();

const STAFF_ROLES = new Set(['cashier', 'kitchen', 'manager', 'admin', 'driver']);
const DRIVER_ASSIGN_ROLES = new Set(['cashier', 'kitchen', 'manager', 'admin']);
const VALID_STATUSES = new Set(['pending', 'preparing', 'ready', 'completed', 'cancelled']);
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
// Must stay in sync with POSTerminal.vue pizzaSizeOptions priceDelta values
const PIZZA_SIZE_DELTAS = { 'personal pan': -2, medium: 0, large: 3 };

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

    // Compute server-authoritative total from DB prices
    const menuItemIds = [...new Set(items.filter((i) => i.menuItemId).map((i) => i.menuItemId))];
    let dbPriceMap = {};
    if (menuItemIds.length > 0) {
      const [menuRows] = await conn.query('SELECT id, price FROM menu_item WHERE id IN (?)', [menuItemIds]);
      dbPriceMap = Object.fromEntries(menuRows.map((r) => [r.id, Number(r.price)]));
    }

    let serverTotal = 0;
    for (const item of items) {
      if (item.paidWithPoints) continue;
      if (item.menuItemId) {
        if (dbPriceMap[item.menuItemId] == null) {
          await conn.rollback();
          return res.status(400).json({ error: `Unknown menu item id: ${item.menuItemId}` });
        }
        let price = dbPriceMap[item.menuItemId];
        if (item.options?.pizzaSize) price += PIZZA_SIZE_DELTAS[item.options.pizzaSize] ?? 0;
        serverTotal += price * item.quantity;
      } else {
        if (!isStaff) {
          await conn.rollback();
          return res.status(403).json({ error: 'Custom line items require a staff role' });
        }
        const customPrice = Number(item.price);
        if (!isFinite(customPrice) || customPrice < 0) {
          await conn.rollback();
          return res.status(400).json({ error: 'Invalid price on custom line item' });
        }
        serverTotal += customPrice * item.quantity;
      }
    }
    serverTotal = Math.round(serverTotal * 100) / 100;

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
          item.paidWithPoints ? 0 : (item.menuItemId ? dbPriceMap[item.menuItemId] : Number(item.price)),
          item.paidWithPoints || false,
          item.notes || null,
          JSON.stringify(item.options || {}),
        ]
      );
    }

    // Check and deduct inventory — lock rows first to prevent overselling
    for (const item of items) {
      if (!item.menuItemId) continue;
      const [recipeLinks] = await conn.query(
        'SELECT inventory_item_id, quantity_used FROM menu_item_inventory WHERE menu_item_id = ?',
        [item.menuItemId]
      );
      for (const link of recipeLinks) {
        const needed = Number(link.quantity_used) * item.quantity;
        const [[inv]] = await conn.query(
          'SELECT quantity FROM inventory_item WHERE id = ? FOR UPDATE',
          [link.inventory_item_id]
        );
        if (inv.quantity < needed) {
          await conn.rollback();
          return res.status(409).json({
            error: 'Insufficient inventory',
            inventoryItemId: link.inventory_item_id,
          });
        }
        await conn.query(
          'UPDATE inventory_item SET quantity = quantity - ?, last_updated = NOW() WHERE id = ?',
          [needed, link.inventory_item_id]
        );
      }
    }

    await conn.commit();

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
      items: items || [],
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

    const [[current]] = await conn.query(
      'SELECT status, customer_user_id FROM customer_order WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (!current) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }

    // Customers may only cancel their own orders
    if (req.user.role === 'customer') {
      if (current.customer_user_id !== req.user.id) {
        await conn.rollback();
        return res.status(403).json({ error: 'Cannot modify another customer\'s order' });
      }
      if (status !== 'cancelled') {
        await conn.rollback();
        return res.status(403).json({ error: 'Customers can only cancel orders' });
      }
    }

    // Cancelling restocks inventory; reactivating would not re-deduct it,
    // so a cancelled order is terminal.
    if (current.status === 'cancelled' && status !== 'cancelled') {
      await conn.rollback();
      return res.status(409).json({ error: 'Cancelled orders cannot be reactivated' });
    }

    const isCancelling = status === 'cancelled' && current.status !== 'cancelled';

    if (isCancelling) {
      const [orderItems] = await conn.query(
        'SELECT menu_item_id, quantity FROM order_item WHERE order_id = ?',
        [orderId]
      );
      for (const item of orderItems) {
        if (!item.menu_item_id) continue;
        const [recipeLinks] = await conn.query(
          'SELECT inventory_item_id, quantity_used FROM menu_item_inventory WHERE menu_item_id = ?',
          [item.menu_item_id]
        );
        for (const link of recipeLinks) {
          await conn.query(
            'UPDATE inventory_item SET quantity = quantity + ?, last_updated = NOW() WHERE id = ?',
            [Number(link.quantity_used) * item.quantity, link.inventory_item_id]
          );
        }
      }
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

    await conn.commit();

    emitOrderStatusUpdated(orderId, status);
    res.json({ id: orderId, status, completedAt: completedAt ?? null });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// PUT /api/orders/:id/driver — assign driver to a delivery order
router.put('/:id/driver', async (req, res) => {
  if (!DRIVER_ASSIGN_ROLES.has(req.user?.role)) {
    return res.status(403).json({ error: 'Driver assignment requires cashier, kitchen, manager, or admin role' });
  }
  try {
    const { driverName, driverPhone } = req.body;
    if ((driverName != null && typeof driverName !== 'string') ||
        (driverPhone != null && typeof driverPhone !== 'string') ||
        (driverName || '').length > 100 || (driverPhone || '').length > 30) {
      return res.status(400).json({ error: 'Invalid driver name or phone' });
    }
    await pool.query(
      'UPDATE customer_order SET driver_name = ?, driver_phone = ? WHERE id = ?',
      [driverName || null, driverPhone || null, req.params.id]
    );
    emitOrderDriverAssigned(Number(req.params.id), { driverName, driverPhone });
    res.json({ id: Number(req.params.id), driverName, driverPhone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
