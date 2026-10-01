<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { usePosStore } from '../store/usePosStore';
import { subscribeOrders } from '../lib/realtime.js';
import { useToast } from '../lib/useToast.js';

const { state, updateOrderStatus, updateOrderDriver, fetchDrivers } = usePosStore();
const toast = useToast();

const activeOrders = computed(() =>
  state.orders
    .filter((order) => ['pending', 'preparing', 'ready'].includes(order.status))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
);

// Staff recovery for deliveries stuck on the road (e.g. the driver's phone died).
const onTheRoad = computed(() =>
  state.orders
    .filter((order) => order.status === 'out_for_delivery')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
);

function markDelivered(order) {
  if (!window.confirm(`Mark order #${order.orderNumber} as delivered?`)) return;
  updateOrderStatus(order.id, 'completed');
}

function cancelOnTheRoad(order) {
  if (!window.confirm(`Cancel order #${order.orderNumber}? It is already out for delivery.`)) return;
  updateOrderStatus(order.id, 'cancelled');
}

const counts = computed(() => ({
  pending: state.orders.filter((o) => o.status === 'pending').length,
  preparing: state.orders.filter((o) => o.status === 'preparing').length,
  ready: state.orders.filter((o) => o.status === 'ready').length,
}));

function getTimeSince(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
}

function nextStatus(status) {
  if (status === 'pending') return 'preparing';
  if (status === 'preparing') return 'ready';
  return 'completed';
}

function nextLabel(status) {
  if (status === 'pending') return 'Start Preparing';
  if (status === 'preparing') return 'Mark Ready';
  return 'Complete Order';
}

// Delivery orders are completed by the driver, not the kitchen.
function canAdvance(order) {
  return !(order.status === 'ready' && order.orderType === 'delivery');
}

// ── Driver assignment ──────────────────────────────────────────────────────────

const drivers = ref([]);
const selectedDriver = reactive({}); // orderId -> driver user id
const assigning = reactive({});

async function loadDrivers() {
  try {
    drivers.value = await fetchDrivers();
  } catch {
    // Keep the previous list so an assignment in progress isn't lost.
    toast.error('Could not load drivers');
  }
}

function driverLabel(d) {
  return `${d.name} (${d.activeStops} stop${d.activeStops === 1 ? '' : 's'})`;
}

async function assignDriver(order) {
  const driverUserId = Number(selectedDriver[order.id]);
  if (!driverUserId) return;
  assigning[order.id] = true;
  try {
    await updateOrderDriver(order.id, driverUserId);
    toast.success(`Order #${order.orderNumber} is on its way`);
  } catch (err) {
    toast.error(err.message || 'Could not assign driver');
  } finally {
    assigning[order.id] = false;
    loadDrivers();
  }
}

// ── Realtime (Ably) ──────────────────────────────────────────────────────────

let unsubscribe;
onMounted(async () => {
  loadDrivers();
  unsubscribe = await subscribeOrders({
    newOrder: (order) => {
      state.orders.push(order);
    },
    orderStatusUpdated: ({ orderId, status }) => {
      const o = state.orders.find((o) => o.id === orderId);
      if (o) o.status = status;
    },
    orderDriverAssigned: ({ orderId, driverUserId, driverName, driverPhone }) => {
      const o = state.orders.find((o) => o.id === orderId);
      if (o) { o.driverUserId = driverUserId; o.driverName = driverName; o.driverPhone = driverPhone; }
      loadDrivers();
    },
    driverRouteUpdated: () => loadDrivers(),
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});
</script>

<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-3xl font-bold">Kitchen Display</h1>
      <p class="text-gray-500">Monitor and manage active orders</p>
    </div>

    <div v-if="!activeOrders.length" class="bg-white rounded-xl border p-12 text-center text-gray-500">
      No active orders.
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div
        v-for="order in activeOrders"
        :key="order.id"
        class="bg-white border-2 rounded-xl p-4"
        :class="{
          'border-orange-300': order.status === 'pending',
          'border-blue-300': order.status === 'preparing',
          'border-green-300': order.status === 'ready',
        }"
      >
        <div class="flex items-start justify-between mb-3">
          <div>
            <h2 class="font-semibold">Order #{{ order.orderNumber }}</h2>
            <p class="text-xs text-gray-500">{{ getTimeSince(order.createdAt) }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="order.orderType === 'delivery'" class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">Delivery</span>
            <span class="text-xs px-2 py-1 rounded-full bg-gray-100 uppercase">{{ order.status }}</span>
          </div>
        </div>

        <div class="text-sm mb-3">
          <span v-if="order.orderType === 'delivery'">
            To: <span class="font-semibold">{{ order.deliveryAddress || 'N/A' }}</span>
          </span>
          <span v-else>Table: <span class="font-semibold">{{ order.tableNumber || 'N/A' }}</span></span>
        </div>

        <div class="space-y-1 mb-3">
          <div v-for="(item, idx) in order.items" :key="idx" class="text-sm flex justify-between bg-gray-50 px-2 py-1 rounded">
            <span>{{ item.name }}</span>
            <span>x{{ item.quantity }}</span>
          </div>
        </div>

        <p v-if="order.notes" class="text-sm bg-yellow-50 border border-yellow-200 rounded p-2 mb-3">{{ order.notes }}</p>

        <div class="flex gap-2">
          <button
            v-if="canAdvance(order)"
            class="flex-1 px-3 py-2 rounded-lg border hover:bg-gray-50"
            @click="updateOrderStatus(order.id, nextStatus(order.status))"
          >
            {{ nextLabel(order.status) }}
          </button>
          <button
            v-if="order.status === 'pending' || (order.status === 'ready' && order.orderType === 'delivery')"
            class="px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
            @click="updateOrderStatus(order.id, 'cancelled')"
          >
            Cancel
          </button>
        </div>

        <!-- Driver assignment — delivery orders marked ready -->
        <div v-if="order.status === 'ready' && order.orderType === 'delivery'" class="mt-3 border-t pt-3 space-y-2">
          <p class="text-sm text-gray-500">Waiting for a driver</p>
          <div v-if="drivers.length" class="flex gap-2">
            <select
              v-model="selectedDriver[order.id]"
              class="flex-1 border rounded px-2 py-1 text-sm"
              :aria-label="`Driver for order ${order.orderNumber}`"
            >
              <option :value="undefined" disabled>Choose a driver</option>
              <option v-for="d in drivers" :key="d.id" :value="d.id">{{ driverLabel(d) }}</option>
            </select>
            <button
              class="px-3 py-1 rounded bg-green-600 text-white text-sm disabled:opacity-50"
              :disabled="!selectedDriver[order.id] || assigning[order.id]"
              @click="assignDriver(order)"
            >
              {{ assigning[order.id] ? 'Assigning…' : 'Assign' }}
            </button>
          </div>
          <p v-else class="text-xs text-gray-400">No active drivers. Add one in User Management.</p>
        </div>
      </div>
    </div>

    <!-- On the road — staff can complete or cancel a stuck delivery -->
    <div v-if="onTheRoad.length" class="space-y-3">
      <h2 class="text-xl font-semibold">On the road</h2>
      <div class="bg-white rounded-xl border divide-y">
        <div
          v-for="order in onTheRoad"
          :key="order.id"
          class="p-4 flex flex-col md:flex-row md:items-center gap-3"
        >
          <div class="flex-1 text-sm space-y-1">
            <p class="font-semibold">Order #{{ order.orderNumber }}<span v-if="order.customerName" class="font-normal text-gray-500"> · {{ order.customerName }}</span></p>
            <p class="text-gray-500">Driver: <span class="text-gray-800">{{ order.driverName || 'Unknown' }}</span></p>
            <p class="text-gray-500">{{ order.deliveryAddress || 'No address notes' }}</p>
          </div>
          <div class="flex gap-2">
            <button
              class="px-3 py-2 rounded-lg border hover:bg-gray-50"
              @click="markDelivered(order)"
            >
              Mark delivered
            </button>
            <button
              class="px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
              @click="cancelOnTheRoad(order)"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Pending</p>
        <p class="text-2xl font-bold text-orange-600">{{ counts.pending }}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Preparing</p>
        <p class="text-2xl font-bold text-blue-600">{{ counts.preparing }}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Ready</p>
        <p class="text-2xl font-bold text-green-600">{{ counts.ready }}</p>
      </div>
    </div>
  </div>
</template>
