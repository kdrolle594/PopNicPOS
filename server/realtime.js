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

export function emitOrderStatusUpdated(orderId, status) {
  return publish('orders', 'orderStatusUpdated', { orderId, status });
}

export function emitOrderDriverAssigned(orderId, driver) {
  return publish('orders', 'orderDriverAssigned', { orderId, ...driver });
}

// Clients refetch GET /api/menu-items on this event, so the payload is empty.
export function emitMenuChanged() {
  return publish('menu', 'menuChanged', {});
}

// Channel rights per caller. Guests may only watch menu availability.
export function capabilityFor(user) {
  if (!user) return { menu: ['subscribe'] };
  return {
    menu: ['subscribe'],
    orders: ['subscribe'],
    'delivery:*': user.role === 'driver' ? ['publish', 'subscribe'] : ['subscribe'],
  };
}

export function createTokenRequest({ clientId, capability }) {
  const c = client();
  if (!c) throw new Error('ABLY_API_KEY not configured');
  return c.auth.createTokenRequest({ clientId, capability });
}
