import * as Ably from 'ably';
import { useAuthStore } from '../store/useAuthStore.js';

let realtimeClient = null;
let clientPromise = null;

async function fetchTokenRequest() {
  const auth = useAuthStore();
  const token = await auth.getToken();
  const base = import.meta.env.VITE_API_URL || '';
  const res = await fetch(`${base}/api/realtime/token`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Realtime token request failed: ${res.status}`);
  return res.json();
}

function getClient() {
  if (realtimeClient) return Promise.resolve(realtimeClient);
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    realtimeClient = new Ably.Realtime({
      authCallback: async (_params, callback) => {
        try {
          callback(null, await fetchTokenRequest());
        } catch (err) {
          callback(err, null);
        }
      },
    });
    return realtimeClient;
  })();
  return clientPromise;
}

export async function subscribeOrders(handlers) {
  const client = await getClient();
  const channel = client.channels.get('orders');
  const bound = [];
  for (const [event, fn] of Object.entries(handlers)) {
    const listener = (msg) => fn(msg.data);
    channel.subscribe(event, listener);
    bound.push([event, listener]);
  }
  return () => {
    for (const [event, listener] of bound) channel.unsubscribe(event, listener);
  };
}

export async function subscribeDelivery(orderId, handlers) {
  const client = await getClient();
  const channel = client.channels.get(`delivery:${orderId}`);
  const bound = [];
  for (const [event, fn] of Object.entries(handlers)) {
    const listener = (msg) => fn(msg.data);
    channel.subscribe(event, listener);
    bound.push([event, listener]);
  }
  return () => {
    for (const [event, listener] of bound) channel.unsubscribe(event, listener);
    channel.detach();
  };
}

export async function publishDriverLocation(orderId, payload) {
  const client = await getClient();
  const channel = client.channels.get(`delivery:${orderId}`);
  return channel.publish('driverLocation', payload);
}
