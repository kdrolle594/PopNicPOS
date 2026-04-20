import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/orders — list all orders with line items
router.get('/', async (_req, res) => {
  try {
    const [orders] = await pool.query('SELECT * FROM customer_order ORDER BY created_at DESC');
    const [items] = await pool.query('SELECT * FROM order_item ORDER BY id');

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
          options:
            typeof i.customizations === 'string'
              ? JSON.parse(i.customizations)
              : i.customizations || {},
        })),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders — place order (inserts header + lines, deducts inventory in a transaction)
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      orderNumber,
      orderType,
      status,
      total,
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

    // Insert order header
    const [orderResult] = await conn.query(
      `INSERT INTO customer_order
         (order_number, order_type, status, total, customer_name, customer_phone,
          table_number, delivery_address, delivery_lat, delivery_lng,
          notes, payment_method, points_earned, points_redeemed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        orderType || 'dine_in',
        status || 'pending',
        total,
        customerName || null,
        customerPhone || null,
        tableNumber || null,
        deliveryAddress || null,
        deliveryLat != null ? Number(deliveryLat) : null,
        deliveryLng != null ? Number(deliveryLng) : null,
        notes || null,
        paymentMethod || null,
        pointsEarned || 0,
        pointsRedeemed || 0,
      ]
    );
    const orderId = orderResult.insertId;

    // Insert order line items
    if (Array.isArray(items) && items.length) {
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
            item.price,
            item.paidWithPoints || false,
            item.notes || null,
            JSON.stringify(item.options || {}),
          ]
        );
      }
    }

    // Deduct inventory based on menu_item_inventory recipe links
    if (Array.isArray(items) && items.length) {
      for (const item of items) {
        if (!item.menuItemId) continue;
        const [recipeLinks] = await conn.query(
          'SELECT inventory_item_id, quantity_used FROM menu_item_inventory WHERE menu_item_id = ?',
          [item.menuItemId]
        );
        for (const link of recipeLinks) {
          await conn.query(
            `UPDATE inventory_item
             SET quantity = GREATEST(0, quantity - ?), last_updated = NOW()
             WHERE id = ?`,
            [Number(link.quantity_used) * item.quantity, link.inventory_item_id]
          );
        }
      }
    }

    await conn.commit();

    res.status(201).json({
      id: orderId,
      orderNumber,
      orderType: orderType || 'dine_in',
      status: status || 'pending',
      total: Number(total),
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      tableNumber: tableNumber || null,
      deliveryAddress: deliveryAddress || null,
      deliveryLat: deliveryLat != null ? Number(deliveryLat) : null,
      deliveryLng: deliveryLng != null ? Number(deliveryLng) : null,
      notes: notes || null,
      paymentMethod: paymentMethod || null,
      pointsEarned: pointsEarned || 0,
      pointsRedeemed: pointsRedeemed || 0,
      createdAt: new Date().toISOString(),
      completedAt: null,
      items: items || [],
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/orders/:id/status — update order status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const completedAt = status === 'completed' ? new Date() : null;

    await pool.query('UPDATE customer_order SET status = ?, completed_at = ? WHERE id = ?', [
      status,
      completedAt,
      req.params.id,
    ]);

    const { emitOrderStatusUpdated } = await import('../socket.js');
    emitOrderStatusUpdated(Number(req.params.id), status);

    res.json({ id: Number(req.params.id), status, completedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id/driver — assign driver to a delivery order
router.put('/:id/driver', async (req, res) => {
  try {
    const { driverName, driverPhone } = req.body;
    await pool.query(
      'UPDATE customer_order SET driver_name = ?, driver_phone = ? WHERE id = ?',
      [driverName || null, driverPhone || null, req.params.id]
    );
    const { emitOrderDriverAssigned } = await import('../socket.js');
    emitOrderDriverAssigned(Number(req.params.id), { driverName, driverPhone });
    res.json({ id: Number(req.params.id), driverName, driverPhone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
