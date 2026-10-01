<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '../store/useAuthStore.js';
import { subscribeOrders } from '../lib/realtime.js';
import { useToast } from '../lib/useToast.js';
import { useLocationSharing } from '../lib/useLocationSharing.js';
import { haversineMeters, formatDistance, formatClock, secondsAgoText } from '../lib/delivery.js';
import DriverRouteMap from './driver/DriverRouteMap.vue';

const auth = useAuthStore();
const toast = useToast();
const me = computed(() => auth.state.appUser?.id ?? null);

const orders = ref([]);
const loading = ref(true);
const tab = ref('available'); // 'available' | 'route'
const busy = ref({}); // orderId -> true while a request is in flight
const route = ref({ stops: [], geometry: null, source: 'fallback' });
const now = ref(Date.now());
let tick = null;
let unsubscribe = null;

async function api(path, options = {}) {
  const base = import.meta.env.VITE_API_URL || '';
  const token = await auth.getToken();
  const res = await fetch(`${base}/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const available = computed(() =>
  orders.value.filter((o) =>
    o.orderType === 'delivery' && o.status === 'ready' && o.driverUserId == null && o.deliveryLat != null
  )
);

// Route from GET /api/orders, used until the first location response arrives.
function routeFromOrders() {
  const mine = orders.value
    .filter((o) => o.status === 'out_for_delivery' && o.driverUserId === me.value)
    .sort((a, b) => (a.queuePosition ?? Infinity) - (b.queuePosition ?? Infinity) || a.id - b.id);
  return mine.map((o, i) => ({
    orderId: o.id,
    orderNumber: o.orderNumber,
    position: i + 1,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    deliveryAddress: o.deliveryAddress,
    lat: o.deliveryLat,
    lng: o.deliveryLng,
    etaAt: o.etaAt,
  }));
}

async function loadOrders() {
  try {
    orders.value = await api('/orders');
    route.value = { ...route.value, stops: routeFromOrders() };
  } catch {
    toast.error('Could not load orders.');
  } finally {
    loading.value = false;
  }
}

function applyRoute(next) {
  if (next) route.value = next;
}

const hasStops = computed(() => route.value.stops.length > 0);

// ── Location sharing ─────────────────────────────────────────────────────────

const { fix, permission, error: gpsError, lastSentAt } = useLocationSharing(hasStops, async (position) => {
  applyRoute(await api('/driver/location', { method: 'POST', body: position }));
});

const canClaim = computed(() => permission.value === 'granted' && fix.value != null);

function distanceTo(order) {
  if (!fix.value) return null;
  return formatDistance(haversineMeters(fix.value, { lat: order.deliveryLat, lng: order.deliveryLng }));
}

// ── Actions ──────────────────────────────────────────────────────────────────

async function withBusy(orderId, fn) {
  busy.value = { ...busy.value, [orderId]: true };
  try { await fn(); } finally { busy.value = { ...busy.value, [orderId]: false }; }
}

async function addToRoute(order) {
  await withBusy(order.id, async () => {
    try {
      const claimed = await api(`/orders/${order.id}/driver`, { method: 'PUT', body: {} });
      applyRoute(claimed.route);
      orders.value = orders.value.map((o) => (o.id === order.id
        ? { ...o, status: 'out_for_delivery', driverUserId: me.value } : o));
    } catch (err) {
      if (err.status === 409) {
        orders.value = orders.value.filter((o) => o.id !== order.id);
        toast.info('Already taken');
      } else {
        toast.error(err.message || 'Could not add this order.');
      }
    }
  });
}

async function markDelivered(stop) {
  if (!window.confirm(`Mark order #${stop.orderNumber} as delivered?`)) return;
  await withBusy(stop.orderId, async () => {
    try {
      const res = await api(`/orders/${stop.orderId}/status`, { method: 'PUT', body: { status: 'completed' } });
      orders.value = orders.value.map((o) => (o.id === stop.orderId ? { ...o, status: 'completed' } : o));
      applyRoute(res.route ?? { ...route.value, stops: route.value.stops.filter((s) => s.orderId !== stop.orderId) });
      toast.success(`Order #${stop.orderNumber} delivered`);
    } catch (err) {
      toast.error(err.message || 'Could not mark delivered.');
    }
  });
}

async function release(stop) {
  if (!window.confirm(`Hand order #${stop.orderNumber} back? It returns to the available list.`)) return;
  await withBusy(stop.orderId, async () => {
    try {
      const res = await api(`/orders/${stop.orderId}/driver`, { method: 'DELETE' });
      orders.value = orders.value.map((o) => (o.id === stop.orderId
        ? { ...o, status: 'ready', driverUserId: null, driverName: null, driverPhone: null } : o));
      applyRoute(res.route);
    } catch (err) {
      toast.error(err.message || 'Could not release this order.');
    }
  });
}

function navigate(stop) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;
  window.open(url, '_blank', 'noopener');
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  tick = setInterval(() => { now.value = Date.now(); }, 1000);
  await loadOrders();
  if (hasStops.value) tab.value = 'route';
  unsubscribe = await subscribeOrders({
    newOrder: (order) => { orders.value = [...orders.value, order]; },
    orderStatusUpdated: ({ orderId, status }) => {
      orders.value = orders.value.map((o) => (o.id === orderId ? { ...o, status } : o));
    },
    orderDriverAssigned: ({ orderId, driverUserId, driverName, driverPhone }) => {
      orders.value = orders.value.map((o) => (o.id === orderId ? { ...o, driverUserId, driverName, driverPhone } : o));
    },
    // Someone else changed my route (staff assign/cancel): rebuild from the server.
    driverRouteUpdated: ({ driverUserId }) => {
      if (driverUserId === me.value) loadOrders();
    },
  });
});

onUnmounted(() => {
  clearInterval(tick);
  if (unsubscribe) unsubscribe();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-start justify-center p-4 sm:p-6">
    <div class="bg-white rounded-2xl shadow-lg border w-full max-w-md p-5 space-y-4 mt-4">
      <h1 class="text-xl font-bold">Deliveries</h1>

      <!-- Location banner -->
      <div
        v-if="permission === 'denied' || permission === 'unsupported'"
        class="rounded-xl p-3 text-sm bg-orange-50 border border-orange-200 text-orange-800"
        role="alert"
      >
        Location access is off. Turn on location for this site in your browser settings and reload.
        You need it to add orders to your route.
      </div>

      <!-- Tabs -->
      <div class="grid grid-cols-2 gap-2" role="tablist">
        <button
          role="tab"
          :aria-selected="tab === 'available'"
          class="py-2 rounded-lg text-sm font-medium border"
          :class="tab === 'available' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-700'"
          @click="tab = 'available'"
        >
          Available ({{ available.length }})
        </button>
        <button
          role="tab"
          :aria-selected="tab === 'route'"
          class="py-2 rounded-lg text-sm font-medium border"
          :class="tab === 'route' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-700'"
          @click="tab = 'route'"
        >
          My route ({{ route.stops.length }})
        </button>
      </div>

      <div v-if="loading" class="text-center text-gray-400 py-8">Loading orders…</div>

      <!-- Available -->
      <div v-else-if="tab === 'available'" class="space-y-3">
        <p v-if="!available.length" class="text-center text-gray-400 py-8">No orders ready for delivery.</p>
        <div v-for="order in available" :key="order.id" class="border rounded-xl p-4 space-y-2">
          <div class="flex items-center justify-between">
            <p class="font-semibold">Order #{{ order.orderNumber }}</p>
            <span v-if="distanceTo(order)" class="text-xs text-gray-500">{{ distanceTo(order) }}</span>
          </div>
          <p class="text-sm text-gray-600">{{ order.items?.length || 0 }} item{{ order.items?.length === 1 ? '' : 's' }}</p>
          <p class="text-sm text-gray-500">{{ order.deliveryAddress || 'No address notes' }}</p>
          <button
            class="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            :disabled="!canClaim || busy[order.id]"
            @click="addToRoute(order)"
          >
            {{ busy[order.id] ? 'Adding…' : 'Add to route' }}
          </button>
        </div>
      </div>

      <!-- My route -->
      <div v-else class="space-y-3">
        <p v-if="!route.stops.length" class="text-center text-gray-400 py-8">
          Your route is empty. Add orders from the Available tab.
        </p>
        <template v-else>
          <DriverRouteMap :driver="fix" :stops="route.stops" :geometry="route.geometry" />

          <div
            class="rounded-xl p-2 text-xs"
            :class="gpsError ? 'bg-orange-50 border border-orange-200 text-orange-700' : 'bg-green-50 border border-green-200 text-green-700'"
            aria-live="polite"
          >
            <template v-if="gpsError">GPS problem: {{ gpsError }}</template>
            <template v-else>Sharing location · {{ secondsAgoText(lastSentAt, now) }}</template>
            <span v-if="lastSentAt != null && route.source === 'fallback'" class="block text-gray-500">Road routing unavailable — ETAs are estimates.</span>
          </div>

          <div v-for="stop in route.stops" :key="stop.orderId" class="border rounded-xl p-4 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                  {{ stop.position }}
                </span>
                <div>
                  <p class="font-semibold">{{ stop.customerName || 'Customer' }}</p>
                  <p class="text-xs text-gray-500">Order #{{ stop.orderNumber }} · ETA {{ formatClock(stop.etaAt) }}</p>
                </div>
              </div>
              <details class="relative">
                <summary class="cursor-pointer text-gray-500 px-2" aria-label="More actions">⋯</summary>
                <button
                  class="absolute right-0 mt-1 whitespace-nowrap bg-white border rounded-lg shadow px-3 py-2 text-sm text-red-600"
                  :disabled="busy[stop.orderId]"
                  @click="release(stop)"
                >
                  Release order
                </button>
              </details>
            </div>
            <p class="text-sm text-gray-600">{{ stop.deliveryAddress || 'No address notes' }}</p>
            <a v-if="stop.customerPhone" :href="`tel:${stop.customerPhone}`" class="text-sm text-blue-600">
              📞 {{ stop.customerPhone }}
            </a>
            <div class="grid grid-cols-2 gap-2">
              <button class="py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium" @click="navigate(stop)">
                Navigate
              </button>
              <button
                class="py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50"
                :disabled="busy[stop.orderId]"
                @click="markDelivered(stop)"
              >
                Delivered
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
