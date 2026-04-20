<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useAuth0 } from '@auth0/auth0-vue';
import { io } from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

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

// ── Map state ─────────────────────────────────────────────────────────────────

const mapContainer = ref(null);
let leafletMap = null;
let customerMarker = null;
let driverMarker = null;

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
  destroyMap();
  selectedOrder.value = null;
  lastPosition.value  = null;
  step.value = 'select';
  loadDeliveryOrders();
}

// ── Map functions ─────────────────────────────────────────────────────────────

function openMapsNavigation() {
  const order = selectedOrder.value;
  if (!order) return;
  const hasGps = order.deliveryLat != null && order.deliveryLng != null;
  const dest = hasGps
    ? `${order.deliveryLat},${order.deliveryLng}`
    : encodeURIComponent(order.deliveryAddress || '');
  const url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  window.open(url, '_blank', 'noopener');
}

function initMap() {
  if (!mapContainer.value || leafletMap) return;
  const order = selectedOrder.value;
  const hasCustomerGps = order && order.deliveryLat != null && order.deliveryLng != null;
  const center = hasCustomerGps
    ? [Number(order.deliveryLat), Number(order.deliveryLng)]
    : [39.8283, -98.5795];
  const zoom = hasCustomerGps ? 15 : 5;

  leafletMap = L.map(mapContainer.value).setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(leafletMap);

  placeCustomerMarker();
  if (lastPosition.value) placeDriverMarker(lastPosition.value.lat, lastPosition.value.lng);
}

function placeCustomerMarker() {
  const order = selectedOrder.value;
  if (!leafletMap || !order || order.deliveryLat == null || order.deliveryLng == null) return;
  const lat = Number(order.deliveryLat);
  const lng = Number(order.deliveryLng);
  const homeIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(1px 1px 2px rgba(0,0,0,0.4))">🏠</div>',
    iconAnchor: [14, 28],
  });
  if (customerMarker) customerMarker.remove();
  customerMarker = L.marker([lat, lng], { icon: homeIcon })
    .addTo(leafletMap)
    .bindPopup(`${order.customerName || 'Customer'}<br/>${order.deliveryAddress || ''}`);
}

function placeDriverMarker(lat, lng) {
  if (!leafletMap) return;
  const carIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(1px 1px 2px rgba(0,0,0,0.4))">🚗</div>',
    iconAnchor: [14, 14],
  });
  if (!driverMarker) {
    driverMarker = L.marker([lat, lng], { icon: carIcon }).addTo(leafletMap).bindPopup('You');
  } else {
    driverMarker.setLatLng([lat, lng]);
  }
  if (customerMarker) {
    leafletMap.fitBounds([[lat, lng], customerMarker.getLatLng()], { padding: [40, 40] });
  } else {
    leafletMap.panTo([lat, lng]);
  }
}

function destroyMap() {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  customerMarker = null;
  driverMarker = null;
}

// Initialize map when entering tracking step
watch(step, async (s) => {
  if (s !== 'tracking') return;
  await nextTick();
  initMap();
});

// Move the driver marker when GPS updates
watch(lastPosition, async (pos) => {
  if (!pos || step.value !== 'tracking') return;
  if (!leafletMap) { await nextTick(); initMap(); }
  if (leafletMap) placeDriverMarker(pos.lat, pos.lng);
});

onMounted(loadDeliveryOrders);

onUnmounted(() => {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  clearInterval(locationInterval);
  destroyMap();
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
            <p v-if="order.deliveryLat != null && order.deliveryLng != null" class="text-xs text-green-700">
              GPS pin provided
            </p>
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
      <div v-if="step === 'tracking'" class="space-y-4 text-center">
        <div class="text-5xl animate-bounce">🚗</div>
        <div>
          <h1 class="text-xl font-bold">On Delivery</h1>
          <p class="text-sm text-gray-500">Order #{{ selectedOrder?.orderNumber }}</p>
        </div>

        <div class="bg-gray-50 border rounded-xl p-3 text-sm text-gray-700 text-left space-y-1">
          <p class="font-medium">Delivering to:</p>
          <p class="text-gray-600">{{ selectedOrder?.customerName }}</p>
          <p class="text-gray-600">{{ selectedOrder?.deliveryAddress }}</p>
          <p v-if="selectedOrder?.customerPhone" class="text-gray-500 text-xs">📞 {{ selectedOrder.customerPhone }}</p>
          <p
            v-if="selectedOrder?.deliveryLat != null && selectedOrder?.deliveryLng != null"
            class="text-green-700 text-xs"
          >
            📍 {{ Number(selectedOrder.deliveryLat).toFixed(5) }}, {{ Number(selectedOrder.deliveryLng).toFixed(5) }}
          </p>
          <p v-else class="text-orange-600 text-xs">No GPS pin — use address for navigation</p>
        </div>

        <!-- Map -->
        <div class="rounded-xl overflow-hidden border" style="height: 260px;">
          <div ref="mapContainer" style="height: 100%; width: 100%;" />
        </div>

        <button
          class="w-full py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium"
          @click="openMapsNavigation"
        >
          Open in Maps
        </button>

        <div
          class="rounded-xl p-3 text-sm space-y-1 text-left"
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
