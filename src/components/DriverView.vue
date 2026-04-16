<script setup>
import { ref, onUnmounted } from 'vue';
import { io } from 'socket.io-client';

// Steps: 'login' → 'select' → 'tracking'
const step = ref('login');
const driverName = ref('');
const driverPhone = ref('');
const deliveryOrders = ref([]);
const loadingOrders = ref(false);
const selectedOrder = ref(null);
const lastPosition = ref(null);
const errorMsg = ref('');

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const socket = io(apiUrl);

let watchId = null;
let locationInterval = null;

async function loadDeliveryOrders() {
  loadingOrders.value = true;
  errorMsg.value = '';
  try {
    const base = import.meta.env.VITE_API_URL || '';
    const res = await fetch(`${base}/api/orders`);
    const all = await res.json();
    deliveryOrders.value = all.filter((o) => o.orderType === 'delivery' && o.status === 'ready');
  } catch {
    errorMsg.value = 'Failed to load orders.';
  } finally {
    loadingOrders.value = false;
  }
}

function login() {
  if (!driverName.value.trim()) { errorMsg.value = 'Enter your name.'; return; }
  errorMsg.value = '';
  loadDeliveryOrders();
  step.value = 'select';
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
        orderId: selectedOrder.value.id,
        lat: lastPosition.value.lat,
        lng: lastPosition.value.lng,
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
  lastPosition.value = null;
  step.value = 'select';
  loadDeliveryOrders();
}

onUnmounted(() => {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  clearInterval(locationInterval);
  socket.disconnect();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-start justify-center p-6">
    <div class="bg-white rounded-2xl shadow-lg border w-full max-w-sm p-6 space-y-5 mt-8">

      <!-- Login step -->
      <div v-if="step === 'login'" class="space-y-4">
        <div class="text-center">
          <div class="text-4xl mb-2">🚗</div>
          <h1 class="text-2xl font-bold">Driver Portal</h1>
          <p class="text-sm text-gray-500 mt-1">Enter your info to start a delivery</p>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Your Name *</label>
          <input
            v-model="driverName"
            class="w-full border rounded-lg px-3 py-2"
            placeholder="John Smith"
            @keyup.enter="login"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Phone (optional)</label>
          <input
            v-model="driverPhone"
            class="w-full border rounded-lg px-3 py-2"
            placeholder="555-1234"
          />
        </div>

        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
        <button
          class="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold"
          @click="login"
        >
          View Ready Orders
        </button>
      </div>

      <!-- Order selection step -->
      <div v-if="step === 'select'" class="space-y-4">
        <div>
          <h1 class="text-xl font-bold">Ready for Delivery</h1>
          <p class="text-sm text-gray-500">Hi {{ driverName }} — select an order to deliver</p>
        </div>

        <div v-if="loadingOrders" class="text-center text-gray-400 py-8">
          Loading orders…
        </div>
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

        <div class="flex gap-2">
          <button class="flex-1 py-2 border rounded-lg text-sm text-gray-600" @click="step = 'login'">Back</button>
          <button class="flex-1 py-2 border rounded-lg text-sm text-blue-600" @click="loadDeliveryOrders">Refresh</button>
        </div>
      </div>

      <!-- Active tracking step -->
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
