import { getTier } from '../../shared/loyalty.js';

// Credit a completed order to its customer's loyalty profile, once.
// Runs inside the caller's transaction. Orders whose user has no
// customer_profile (staff-placed POS orders) are only marked credited:
// the POS updates the chosen loyalty customer itself.
export async function creditLoyalty(conn, orderId) {
  const [[order]] = await conn.query(
    `SELECT customer_user_id, total, points_earned, points_credited
       FROM customer_order WHERE id = ? FOR UPDATE`,
    [orderId]
  );
  if (!order || order.points_credited) return null;
  await conn.query('UPDATE customer_order SET points_credited = TRUE WHERE id = ?', [orderId]);
  if (order.customer_user_id == null) return null;

  const [[profile]] = await conn.query(
    'SELECT loyalty_points FROM customer_profile WHERE user_id = ? FOR UPDATE',
    [order.customer_user_id]
  );
  if (!profile) return null;

  const points = Number(profile.loyalty_points) + Number(order.points_earned || 0);
  await conn.query(
    `UPDATE customer_profile
        SET loyalty_points = ?, loyalty_tier = ?,
            total_spent = total_spent + ?, orders_count = orders_count + 1,
            last_visit = CURRENT_TIMESTAMP
      WHERE user_id = ?`,
    [points, getTier(points), Number(order.total), order.customer_user_id]
  );
  return { userId: order.customer_user_id, points };
}
