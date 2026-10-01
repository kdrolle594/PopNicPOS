import Ably from 'ably';

let restClient = null;

function client() {
  if (restClient) return restClient;
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  restClient = new Ably.Rest({ key });
  return restClient;
}

async function publish(channel, event, data) {
  const c = client();
  if (!c) return;
  try {
    await c.channels.get(channel).publish(event, data);
  } catch (err) {
    console.warn(`Ably publish failed (${channel}/${event}):`, err.message);
  }
}

export function emitNewOrder(order) {
  return publish('orders', 'newOrder', order);
}

// Staff get every status change; the order's own customer (if it belongs to an
// account) gets it on their private channel.
export async function emitOrderStatusUpdated(orderId, status, customerUserId = null) {
  await publish('orders', 'orderStatusUpdated', { orderId, status });
  if (customerUserId != null) {
    await publish(`customer:${customerUserId}`, 'orderStatusUpdated', { orderId, status });
  }
}

// The customer copy leaves out the driver's user id.
export async function emitOrderDriverAssigned(orderId, driver, customerUserId = null) {
  const { driverUserId = null, driverName = null, driverPhone = null } = driver;
  await publish('orders', 'orderDriverAssigned', { orderId, driverUserId, driverName, driverPhone });
  if (customerUserId != null) {
    await publish(`customer:${customerUserId}`, 'orderDriverAssigned', { orderId, driverName, driverPhone });
  }
}

// Clients refetch GET /api/menu-items on this event, so the payload is empty.
export function emitMenuChanged() {
  return publish('menu', 'menuChanged', {});
}

// Sends the messages built by server/lib/driverRoute.js buildPublishes().
export async function emitRoutePublishes(publishes) {
  await Promise.all(publishes.map((p) => publish(p.channel, p.event, p.data)));
}

// Channel rights per caller. Nobody publishes from a browser; customers only
// see their own private channel.
export function capabilityFor(user) {
  if (!user) return { menu: ['subscribe'] };
  if (user.role === 'customer') {
    return { menu: ['subscribe'], [`customer:${user.id}`]: ['subscribe'] };
  }
  return { menu: ['subscribe'], orders: ['subscribe'] };
}

export function createTokenRequest({ clientId, capability }) {
  const c = client();
  if (!c) throw new Error('ABLY_API_KEY not configured');
  return c.auth.createTokenRequest({ clientId, capability });
}
