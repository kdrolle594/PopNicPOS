// Pure order permission rules. Routes translate { ok: false, code, error }
// straight into an HTTP response.

export const STAFF_ASSIGN_ROLES = new Set(['cashier', 'kitchen', 'manager', 'admin']);
export const SELF_DELIVER_ROLES = new Set(['driver', 'manager', 'admin']);

const OK = { ok: true };
const fail = (code, error) => ({ ok: false, code, error });

export function canChangeStatus(user, order, next) {
  if (next === 'out_for_delivery') {
    return fail(400, 'Orders go out for delivery when a driver claims them');
  }
  if (order.status === 'cancelled' && next !== 'cancelled') {
    return fail(409, 'Cancelled orders cannot be reactivated');
  }

  if (user.role === 'customer') {
    if (order.customerUserId !== user.id) return fail(403, "Cannot modify another customer's order");
    if (next !== 'cancelled') return fail(403, 'Customers can only cancel orders');
    if (order.status !== 'pending') return fail(409, 'This order can no longer be cancelled');
    return OK;
  }

  if (user.role === 'driver') {
    const ownDelivery = order.driverUserId === user.id && order.status === 'out_for_delivery';
    if (!ownDelivery || next !== 'completed') {
      return fail(403, 'Drivers can only mark their own deliveries as delivered');
    }
    return OK;
  }

  if (!STAFF_ASSIGN_ROLES.has(user.role)) return fail(403, 'Not allowed to change order status');

  if (order.status === 'out_for_delivery' && next !== 'completed' && next !== 'cancelled') {
    return fail(400, 'An order out for delivery can only be completed or cancelled');
  }
  return OK;
}

export function canRelease(user, order) {
  if (order.driverUserId !== user.id) return fail(403, 'Only the assigned driver can release this order');
  if (order.status !== 'out_for_delivery') return fail(409, 'This order is not out for delivery');
  return OK;
}

export function resolveClaim(user, body) {
  if (!STAFF_ASSIGN_ROLES.has(user.role) && !SELF_DELIVER_ROLES.has(user.role)) {
    return fail(403, 'Not allowed to assign drivers');
  }
  const target = body?.driverUserId;
  if (target == null) {
    if (!SELF_DELIVER_ROLES.has(user.role)) return fail(400, 'Choose a driver');
    return { ok: true, driverUserId: user.id, self: true };
  }
  if (!Number.isInteger(target) || target < 1) return fail(400, 'Invalid driverUserId');
  if (target === user.id && SELF_DELIVER_ROLES.has(user.role)) {
    return { ok: true, driverUserId: user.id, self: true };
  }
  if (user.role === 'driver') return fail(403, 'Drivers can only claim orders for themselves');
  return { ok: true, driverUserId: target, self: false };
}

export function parseLocation(body) {
  const lat = body?.lat;
  const lng = body?.lng;
  const valid =
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return valid ? { ok: true, lat, lng } : fail(400, 'lat and lng must be numbers within range');
}

export function deliveryPinError(orderType, lat, lng) {
  if (orderType !== 'delivery') return null;
  if (lat == null || lng == null) return 'Delivery orders need your location. Allow location access or choose pickup.';
  return null;
}
