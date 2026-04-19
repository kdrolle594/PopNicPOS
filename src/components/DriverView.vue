<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useAuth0 } from '@auth0/auth0-vue';
import { io } from 'socket.io-client';

const { user: auth0User } = useAuth0();

// Driver name comes from the authenticated user — no fake login step
const driverName = ref(auth0User.value?.name || auth0User.value?.email || 'Driver');

const deliveryOrders = ref([]);
const loadingOrders  = ref(false);
const selectedOrder  = ref(null);
const lastPosition   = ref(null);
const errorMsg       = ref('');
const step           = ref('select'); // 'select' | 'tracking'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const socket = io(apiUrl);

let watchId          = null;
let locationInterval = null;

async function loadDeliveryOrders() {
  loadingOrders.value = true;
  errorMsg.value = '';
  try {
    const base = import.meta.env.VITE_API_URL || '';
    // Token is attached by usePosStore's api() helper, but here we use fetch directly
    // Import auth store for the token
    const { useAuthStore } = await import('../store/useAuthStore.js');
    const auth = useAuthStore();
    const token = await auth.getToken();
    const res = await fetch(`${base}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const all = await res.json();
    deliveryOrders.value = all.filter((o) => o.orderType === 'delivery' && o.status === 'ready');
  } catch {
    errorMsg.value = 'Failed to load orders.';
  } finally {
    loadingOrders.value = false;
  }
}

function startDelivery(order) {
  selectedOrder.value = order;
  step.value = 'tracking';
  socket.emit('joinDeliveryRoom', { orderId: order.id });

  if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => { lastPosition.value = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      (err) => { errorMsg.value = `GPS error: ${err.message}`; },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  } else {
    errorMsg.value = 'GPS not available on this device.';
  }

  locationInterval = setInterval(() => {
    if (lastPosition.value && selectedOrder.value) {
      socket.emit('driverLocation', {
        orderId:    selectedOrder.value.id,
        lat:        lastPosition.value.lat,
        lng:        lastPosition.value.lng,
        driverName: driverName.value,
      });
    }
  }, 5000);
}

function endDelivery() {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  clearInterval(locationInterval); locationInterval = null;
  socket.emit('leaveDeliveryRoom', { orderId: selectedOrder.value?.id });
  selectedOrder.value = null;
  lastPosition.value  = null;
  step.value = 'select';
  loadDeliveryOrders();
}

onMounted(loadDeliveryOrders);

onUnmounted(() => {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  clearInterval(locationInterval);
  socket.disconnect();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-start justify-center p-6">
    <div class="bg-white rounded-2xl shadow-lg border w-full max-w-sm p-6 space-y-5 mt-8">

      <!-- Order selection -->
      <div v-if="step === 'select'" class="space-y-4">
        <div>
          <div class="text-4xl text-center mb-2">🚗</div>
          <h1 class="text-xl font-bold text-center">Ready for Delivery</h1>
          <p class="text-sm text-gray-500 text-center">Hi {{ driverName }} — select an order to deliver</p>
        </div>

        <div v-if="loadingOrders" class="text-center text-gray-400 py-8">Loading orders…</div>
        <div v-else-if="!deliveryOrders.length" class="text-center text-gray-400 py-8">
          No orders ready for delivery yet.
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="order in deliveryOrders"
            :key="order.id"
            class="border rounded-xl p-4 space-y-2"
          >
            <div class="flex items-center justify-between">
              <p class="font-semibold">Order #{{ order.orderNumber }}</p>
              <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">Ready</span>
            </div>
            <p class="text-sm text-gray-600">{{ order.customerName }}</p>
            <p class="text-sm text-gray-500">📍 {{ order.deliveryAddress }}</p>
            <button
              class="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium"
              @click="startDelivery(order)"
            >
              Start Delivery
            </button>
          </div>
        </div>

        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>

        <button class="w-full py-2 border rounded-lg text-sm text-blue-600" @click="loadDeliveryOrders">
          Refresh
        </button>
      </div>

      <!-- Active tracking -->
      <div v-if="step === 'tracking'" class="space-y-5 text-center">
        <div class="text-5xl animate-bounce">🚗</div>
        <div>
          <h1 class="text-xl font-bold">On Delivery</h1>
          <p class="text-sm text-gray-500">Order #{{ selectedOrder?.orderNumber }}</p>
        </div>

        <div class="bg-gray-50 border rounded-xl p-3 text-sm text-gray-700 text-left space-y-1">
          <p class="font-medium">Delivering to:</p>
          <p class="text-gray-600">{{ selectedOrder?.deliveryAddress }}</p>
        </div>

        <div
          class="rounded-xl p-3 text-sm space-y-1"
          :class="lastPosition ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'"
        >
          <p v-if="lastPosition" class="text-green-700 font-medium">GPS Active — Broadcasting location</p>
          <p v-else class="text-orange-600 font-medium">Acquiring GPS signal…</p>
          <p v-if="lastPosition" class="text-gray-500 text-xs">
            {{ lastPosition.lat.toFixed(5) }}, {{ lastPosition.lng.toFixed(5) }}
          </p>
        </div>

        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>

        <button
          class="w-full py-3 rounded-xl bg-red-600 text-white font-semibold"
          @click="endDelivery"
        >
          End Delivery
        </button>
      </div>

    </div>
  </div>
</template>
