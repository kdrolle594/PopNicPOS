<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { usePosStore } from '../store/usePosStore';
import { io } from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix broken default marker icons in Vite builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

const { state, addOrder, fetchMe, updateMe } = usePosStore();

const profileLoaded = ref(false);
const phoneInput = ref('');
const savingPhone = ref(false);
const placingOrder = ref(false);

onMounted(async () => {
  const me = await fetchMe();
  profileLoaded.value = true;
  if (me) {
    customerName.value = me.name || '';
    customerPhone.value = me.phone || '';
  }
});

async function savePhone() {
  if (!phoneInput.value.trim()) return;
  savingPhone.value = true;
  const updated = await updateMe({
    name: customerName.value,
    phone: phoneInput.value.trim(),
    email: undefined,
  });
  savingPhone.value = false;
  if (updated) {
    customerPhone.value = updated.phone || phoneInput.value.trim();
    phoneInput.value = '';
  } else {
    alert('Could not save your phone number. Please try again.');
  }
}

// ── Order placement state (unchanged) ─────────────────────────────────────────

const activeTab = ref('order');
const selectedCategory = ref('All');
const cart = ref([]);
const customizationOpen = ref(false);
const pendingMenuItem = ref(null);
const selectedPizzaSize = ref('medium');
const selectedPizzaStyle = ref('custom');
const selectedPizzaToppings = ref([]);
const selectedWingFlavor = ref('buffalo');
const selectedSodaFlavor = ref('coke cola');

const customerName = ref('');
const customerPhone = ref('');
const orderType = ref('delivery'); // 'delivery' | 'pickup'
const deliveryInstructions = ref('');
const deliveryLat = ref(null);
const deliveryLng = ref(null);
const gpsStatus = ref(''); // '', 'locating', 'ok', 'error'
const gpsError = ref('');

const trackOrderNumber = ref('');
const trackPhone = ref('');
const trackedOrder = ref(null);

const pizzaSizeOptions = [
  { value: 'personal pan', label: 'Personal Pan', priceDelta: -2 },
  { value: 'medium', label: 'Medium', priceDelta: 0 },
  { value: 'large', label: 'Large', priceDelta: 3 },
];

const pizzaToppingOptions = [
  { value: 'pepperoni', label: 'Pepperoni' },
  { value: 'ham', label: 'Ham' },
  { value: 'sausage', label: 'Sausage' },
  { value: 'bacon', label: 'Bacon' },
  { value: 'pineapple', label: 'Pineapple' },
  { value: 'mushrooms', label: 'Mushrooms' },
  { value: 'onions', label: 'Onions' },
  { value: 'bell peppers', label: 'Bell Peppers' },
  { value: 'black olives', label: 'Black Olives' },
  { value: 'tomatoes', label: 'Tomatoes' },
  { value: 'extra cheese', label: 'Extra Cheese' },
];

const pizzaPresetStyles = [
  { value: 'hawaiian', label: 'Hawaiian', toppings: ['ham', 'pineapple'] },
  { value: 'meat lovers', label: 'Meat Lovers', toppings: ['pepperoni', 'sausage', 'bacon', 'ham'] },
  { value: 'veggie', label: 'Veggie', toppings: ['mushrooms', 'onions', 'bell peppers', 'black olives', 'tomatoes'] },
];

const wingFlavorOptions = [
  { value: 'buffalo', label: 'Buffalo' },
  { value: 'honey mustard', label: 'Honey Mustard' },
  { value: 'original', label: 'Original' },
  { value: 'bbq', label: 'BBQ' },
  { value: 'sweet and spicy', label: 'Sweet and Spicy' },
];

const sodaFlavorOptions = [
  { value: 'root beer', label: 'Root Beer' },
  { value: 'sprite', label: 'Sprite' },
  { value: 'coke cola', label: 'Coke Cola' },
  { value: 'orange soda', label: 'Orange Soda' },
  { value: 'grape soda', label: 'Grape Soda' },
];

const categories = computed(() => ['All', ...new Set(state.menuItems.map((item) => item.category))]);

const availableMenuItems = computed(() => {
  const items = state.menuItems.filter((item) => item.available);
  if (selectedCategory.value === 'All') return items;
  return items.filter((item) => item.category === selectedCategory.value);
});

const cartTotal = computed(() => cart.value.reduce((sum, item) => sum + item.price * item.quantity, 0));

function isPizzaItem(menuItem) {
  const name = (menuItem.name || '').toLowerCase();
  const category = (menuItem.category || '').toLowerCase();
  return name.includes('pizza') || category.includes('pizza');
}

function isWingsItem(menuItem) {
  return (menuItem.name || '').toLowerCase().includes('wings');
}

function isSodaItem(menuItem) {
  const name = (menuItem.name || '').toLowerCase();
  return name.includes('soda') || name.includes('cola') || name.includes('coke') || name.includes('sprite') || name.includes('root beer');
}

function optionSignature(options = {}) {
  return JSON.stringify({
    pizzaSize: options.pizzaSize || null,
    pizzaStyle: options.pizzaStyle || null,
    pizzaToppings: (options.pizzaToppings || []).slice().sort(),
    wingFlavor: options.wingFlavor || null,
    sodaFlavor: options.sodaFlavor || null,
  });
}

function calculateCustomPrice(menuItem, options = {}) {
  let price = Number(menuItem.price || 0);
  if (options.pizzaSize) {
    const sizeOption = pizzaSizeOptions.find((s) => s.value === options.pizzaSize);
    price += sizeOption?.priceDelta || 0;
  }
  return Math.max(0, Number(price.toFixed(2)));
}

function formatToppingLabel(value) {
  return value.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function buildDisplayName(menuItem, options = {}) {
  const details = [];
  if (options.pizzaSize) details.push(options.pizzaSize);
  if (options.pizzaStyle && options.pizzaStyle !== 'custom') details.push(options.pizzaStyle);
  if (options.pizzaToppings?.length) details.push(`${options.pizzaToppings.length} toppings`);
  if (options.wingFlavor) details.push(options.wingFlavor);
  if (options.sodaFlavor) details.push(options.sodaFlavor);
  return details.length ? `${menuItem.name} (${details.join(', ')})` : menuItem.name;
}

function applyPizzaPreset(styleValue) {
  if (styleValue === 'custom') { selectedPizzaStyle.value = 'custom'; return; }
  const preset = pizzaPresetStyles.find((style) => style.value === styleValue);
  if (!preset) return;
  selectedPizzaStyle.value = preset.value;
  selectedPizzaToppings.value = [...preset.toppings];
}

function togglePizzaTopping(toppingValue) {
  if (selectedPizzaToppings.value.includes(toppingValue)) {
    selectedPizzaToppings.value = selectedPizzaToppings.value.filter((v) => v !== toppingValue);
  } else {
    selectedPizzaToppings.value = [...selectedPizzaToppings.value, toppingValue];
  }
  selectedPizzaStyle.value = 'custom';
}

function addConfiguredToCart(menuItem, options = {}) {
  const signature = optionSignature(options);
  const existing = cart.value.find(
    (item) => item.menuItemId === menuItem.id && optionSignature(item.options) === signature
  );
  if (existing) { existing.quantity += 1; cart.value = [...cart.value]; return; }
  cart.value = [
    ...cart.value,
    {
      menuItemId: menuItem.id,
      name: buildDisplayName(menuItem, options),
      quantity: 1,
      price: calculateCustomPrice(menuItem, options),
      options,
      notes:
        options.pizzaSize || options.pizzaStyle || options.pizzaToppings?.length || options.wingFlavor || options.sodaFlavor
          ? [
              options.pizzaSize ? `Size: ${options.pizzaSize}` : null,
              options.pizzaStyle ? `Style: ${options.pizzaStyle}` : null,
              options.pizzaToppings?.length ? `Toppings: ${options.pizzaToppings.map(formatToppingLabel).join(', ')}` : null,
              options.wingFlavor ? `Wings Flavor: ${options.wingFlavor}` : null,
              options.sodaFlavor ? `Soda Flavor: ${options.sodaFlavor}` : null,
            ].filter(Boolean).join(' • ')
          : undefined,
    },
  ];
}

function addToCart(menuItem) {
  const needsPizzaCustomization = isPizzaItem(menuItem);
  const needsWingCustomization = isWingsItem(menuItem);
  const needsSodaCustomization = isSodaItem(menuItem);
  if (!needsPizzaCustomization && !needsWingCustomization && !needsSodaCustomization) {
    addConfiguredToCart(menuItem);
    return;
  }
  pendingMenuItem.value = menuItem;
  selectedPizzaSize.value = 'medium';
  selectedPizzaStyle.value = 'custom';
  selectedPizzaToppings.value = ['pepperoni'];
  selectedWingFlavor.value = 'buffalo';
  selectedSodaFlavor.value = 'coke cola';
  customizationOpen.value = true;
}

function confirmCustomization() {
  if (!pendingMenuItem.value) return;
  const options = {};
  if (isPizzaItem(pendingMenuItem.value)) {
    options.pizzaSize = selectedPizzaSize.value;
    options.pizzaStyle = selectedPizzaStyle.value;
    options.pizzaToppings = [...selectedPizzaToppings.value].sort();
  }
  if (isWingsItem(pendingMenuItem.value)) options.wingFlavor = selectedWingFlavor.value;
  if (isSodaItem(pendingMenuItem.value)) options.sodaFlavor = selectedSodaFlavor.value;
  addConfiguredToCart(pendingMenuItem.value, options);
  customizationOpen.value = false;
  pendingMenuItem.value = null;
}

function updateCartQuantity(cartItem, delta) {
  cart.value = cart.value
    .map((item) => {
      if (item.menuItemId !== cartItem.menuItemId || optionSignature(item.options) !== optionSignature(cartItem.options)) return item;
      return { ...item, quantity: Math.max(1, item.quantity + delta) };
    })
    .filter((item) => item.quantity > 0);
}

function removeFromCart(cartItem) {
  cart.value = cart.value.filter(
    (item) => !(item.menuItemId === cartItem.menuItemId && optionSignature(item.options) === optionSignature(cartItem.options))
  );
}

function captureCurrentLocation() {
  if (!('geolocation' in navigator)) {
    gpsStatus.value = 'error';
    gpsError.value = 'GPS is not available on this device.';
    return;
  }
  gpsStatus.value = 'locating';
  gpsError.value = '';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      deliveryLat.value = pos.coords.latitude;
      deliveryLng.value = pos.coords.longitude;
      gpsStatus.value = 'ok';
    },
    (err) => {
      gpsStatus.value = 'error';
      gpsError.value = err.message || 'Unable to get location. Please allow location access.';
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function clearGpsLocation() {
  deliveryLat.value = null;
  deliveryLng.value = null;
  gpsStatus.value = '';
  gpsError.value = '';
}

async function placeOrder() {
  if (placingOrder.value) return;
  if (!customerName.value || !customerPhone.value) {
    alert('Please save your phone number before placing an order.');
    return;
  }
  if (orderType.value === 'delivery' && (deliveryLat.value == null || deliveryLng.value == null)) {
    alert('Please share your GPS location so the driver can find you.');
    return;
  }
  if (!cart.value.length) {
    alert('Please add items to your cart first.');
    return;
  }

  const isDelivery = orderType.value === 'delivery';
  const gpsAddress = isDelivery
    ? `GPS: ${deliveryLat.value.toFixed(5)}, ${deliveryLng.value.toFixed(5)}`
    : null;

  placingOrder.value = true;
  let created;
  try {
    created = await addOrder({
      items: cart.value,
      total: cartTotal.value,
      status: 'pending',
      orderType: orderType.value,
      customerName: customerName.value,
      customerPhone: customerPhone.value,
      deliveryAddress: gpsAddress,
      deliveryLat: isDelivery ? deliveryLat.value : null,
      deliveryLng: isDelivery ? deliveryLng.value : null,
      notes: deliveryInstructions.value || undefined,
      createdAt: new Date().toISOString(),
      paymentMethod: 'digital',
    });
  } finally {
    placingOrder.value = false;
  }

  if (!created) {
    alert('Could not place your order. Please try again.');
    return;
  }

  cart.value = [];
  deliveryInstructions.value = '';
  clearGpsLocation();

  activeTab.value = 'track';
  trackOrderNumber.value = String(created.orderNumber);
  trackPhone.value = customerPhone.value;
  findOrder();
}

function findOrder() {
  const orderNumber = Number(trackOrderNumber.value);
  if (!orderNumber || !trackPhone.value) {
    alert('Enter order number and phone to track your order.');
    return;
  }
  const phone = String(trackPhone.value).trim();
  trackedOrder.value =
    [...state.orders].reverse().find(
      (order) =>
        (order.orderType === 'delivery' || order.orderType === 'pickup') &&
        order.orderNumber === orderNumber &&
        String(order.customerPhone || '').trim() === phone
    ) || null;

  if (!trackedOrder.value) {
    alert('No matching order found.');
  }
}

// ── Live tracker state ─────────────────────────────────────────────────────────

const mapContainer = ref(null);
const driverLocation = ref(null);
const customerLatLng = ref(null);
let leafletMap = null;
let driverMarker = null;
let customerMarker = null;
let trackerSocket = null;

const etaMap = computed(() => {
  if (trackedOrder.value?.orderType === 'pickup') {
    return {
      pending:   'Est. 20–30 min',
      preparing: 'Est. 10–20 min',
      ready:     'Ready for pickup',
      completed: 'Picked up',
      cancelled: 'Order cancelled',
    };
  }
  return {
    pending:   'Est. 45–55 min',
    preparing: 'Est. 30–40 min',
    ready:     'Est. 10–20 min',
    completed: 'Delivered',
    cancelled: 'Order cancelled',
  };
});

const timelineSteps = computed(() => {
  if (trackedOrder.value?.orderType === 'pickup') {
    return [
      { status: 'pending',   label: 'Order\nReceived' },
      { status: 'preparing', label: 'Preparing' },
      { status: 'ready',     label: 'Ready for\nPickup' },
      { status: 'completed', label: 'Picked Up' },
    ];
  }
  return [
    { status: 'pending',   label: 'Order\nReceived' },
    { status: 'preparing', label: 'Preparing' },
    { status: 'ready',     label: 'Out for\nDelivery' },
    { status: 'completed', label: 'Delivered' },
  ];
});

const statusOrder = { pending: 0, preparing: 1, ready: 2, completed: 3 };

function stepState(stepStatus) {
  const cur = statusOrder[trackedOrder.value?.status] ?? -1;
  const idx = statusOrder[stepStatus] ?? 0;
  if (idx < cur) return 'done';
  if (idx === cur) return 'active';
  return 'pending';
}

const timelineLineWidth = computed(() => {
  const widths = { pending: '0%', preparing: '33%', ready: '66%', completed: '100%' };
  return widths[trackedOrder.value?.status] || '0%';
});

const showMap = computed(() =>
  !!trackedOrder.value &&
  trackedOrder.value.orderType === 'delivery' &&
  (trackedOrder.value.status === 'ready' || !!driverLocation.value)
);

// ── Map functions ─────────────────────────────────────────────────────────────

function initMap() {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; driverMarker = null; customerMarker = null; }
  if (!mapContainer.value) return;
  leafletMap = L.map(mapContainer.value).setView([39.8283, -98.5795], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(leafletMap);
  placeCustomerMarker();
}

function placeCustomerMarker() {
  if (!leafletMap || !customerLatLng.value) return;
  const { lat, lng } = customerLatLng.value;
  if (customerMarker) customerMarker.remove();
  const homeIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(1px 1px 2px rgba(0,0,0,0.4))">🏠</div>',
    iconAnchor: [14, 28],
  });
  customerMarker = L.marker([lat, lng], { icon: homeIcon }).addTo(leafletMap).bindPopup('Your delivery address');
  leafletMap.setView([lat, lng], 14);
}

async function geocodeAddress(address) {
  if (!address) return;
  try {
    const encoded = encodeURIComponent(address);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data.length) {
      customerLatLng.value = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      if (leafletMap) placeCustomerMarker();
    }
  } catch (e) {
    console.warn('Geocode failed:', e);
  }
}

function updateDriverMarker(lat, lng, driverName) {
  if (!leafletMap) return;
  const carIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(1px 1px 2px rgba(0,0,0,0.4))">🚗</div>',
    iconAnchor: [14, 14],
  });
  if (!driverMarker) {
    driverMarker = L.marker([lat, lng], { icon: carIcon }).addTo(leafletMap).bindPopup(driverName || 'Driver');
  } else {
    driverMarker.setLatLng([lat, lng]);
    driverMarker.setPopupContent(driverName || 'Driver');
  }
  if (customerMarker) {
    leafletMap.fitBounds([[lat, lng], customerMarker.getLatLng()], { padding: [40, 40] });
  } else {
    leafletMap.panTo([lat, lng]);
  }
}

// ── Socket.IO tracker ─────────────────────────────────────────────────────────

function connectTrackerSocket(orderId) {
  if (trackerSocket) { trackerSocket.disconnect(); trackerSocket = null; }
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  trackerSocket = io(apiUrl);
  trackerSocket.emit('watchDelivery', { orderId });

  trackerSocket.on('driverLocation', ({ lat, lng, driverName }) => {
    driverLocation.value = { lat, lng };
    if (leafletMap) updateDriverMarker(lat, lng, driverName);
  });

  trackerSocket.on('orderStatusUpdated', ({ orderId: updatedId, status }) => {
    if (!trackedOrder.value || trackedOrder.value.id !== updatedId) return;
    trackedOrder.value = { ...trackedOrder.value, status };
  });

  trackerSocket.on('orderDriverAssigned', ({ orderId: updatedId, driverName, driverPhone }) => {
    if (!trackedOrder.value || trackedOrder.value.id !== updatedId) return;
    trackedOrder.value = { ...trackedOrder.value, driverName, driverPhone };
  });
}

// ── Watchers ──────────────────────────────────────────────────────────────────

// When a new order is being tracked — connect socket and resolve customer location
watch(trackedOrder, (newOrder, oldOrder) => {
  if (!newOrder || newOrder.orderType !== 'delivery') return;
  const isNewOrder = !oldOrder || oldOrder.id !== newOrder.id;
  if (isNewOrder) {
    connectTrackerSocket(newOrder.id);
    driverLocation.value = null;
    if (newOrder.deliveryLat != null && newOrder.deliveryLng != null) {
      customerLatLng.value = { lat: Number(newOrder.deliveryLat), lng: Number(newOrder.deliveryLng) };
      if (leafletMap) placeCustomerMarker();
    } else {
      customerLatLng.value = null;
      geocodeAddress(newOrder.deliveryAddress);
    }
  }
});

// When the map should become visible — initialize it
watch(showMap, async (visible) => {
  if (!visible) return;
  await nextTick();
  if (!leafletMap && mapContainer.value) {
    initMap();
  }
});

// When driver location arrives and map is visible — update marker
watch(driverLocation, async (loc) => {
  if (!loc) return;
  await nextTick();
  if (!leafletMap && mapContainer.value) initMap();
  if (leafletMap) updateDriverMarker(loc.lat, loc.lng, trackedOrder.value?.driverName);
});

onUnmounted(() => {
  if (trackerSocket) { trackerSocket.disconnect(); trackerSocket = null; }
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
});
</script>

<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-3xl font-bold">Customer Orders</h1>
      <p class="text-gray-500">Place and track pickup or delivery orders</p>
    </div>

    <div class="flex gap-2">
      <button
        class="px-4 py-2 rounded border"
        :class="activeTab === 'order' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'"
        @click="activeTab = 'order'"
      >
        Place Order
      </button>
      <button
        class="px-4 py-2 rounded border"
        :class="activeTab === 'track' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'"
        @click="activeTab = 'track'"
      >
        Track Order
      </button>
    </div>

    <!-- ── Order placement (unchanged layout) ── -->
    <div v-if="activeTab === 'order'" class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div class="xl:col-span-2 bg-white border rounded-xl p-4 space-y-4">
        <h2 class="font-semibold">Menu</h2>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="category in categories"
            :key="category"
            class="px-3 py-1 rounded-full border text-sm"
            :class="selectedCategory === category ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'"
            @click="selectedCategory = category"
          >
            {{ category }}
          </button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div v-for="item in availableMenuItems" :key="item.id" class="border rounded-lg p-3 space-y-2">
            <p class="font-medium text-sm">{{ item.name }}</p>
            <p class="text-xs text-gray-500">{{ item.category }}</p>
            <p class="text-lg font-bold text-blue-600">${{ item.price.toFixed(2) }}</p>
            <button class="w-full px-2 py-1 rounded border text-sm hover:bg-gray-50" @click="addToCart(item)">Add</button>
          </div>
        </div>
      </div>

      <div class="bg-white border rounded-xl p-4 space-y-4">
        <h2 class="font-semibold">Order Details</h2>

        <div>
          <label class="block text-sm font-medium mb-1">Order Type *</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="px-3 py-2 rounded border text-sm"
              :class="orderType === 'pickup' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'"
              @click="orderType = 'pickup'"
            >🏬 Pickup</button>
            <button
              type="button"
              class="px-3 py-2 rounded border text-sm"
              :class="orderType === 'delivery' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'"
              @click="orderType = 'delivery'"
            >🚗 Delivery</button>
          </div>
        </div>

        <div class="space-y-3">
          <div v-if="profileLoaded && customerName" class="rounded-lg bg-gray-50 border p-3 text-sm">
            <p class="font-medium">{{ customerName }}</p>
            <p v-if="customerPhone" class="text-gray-600">{{ customerPhone }}</p>
          </div>

          <div v-if="profileLoaded && !customerPhone" class="border rounded-lg p-3 space-y-2 bg-amber-50 border-amber-200">
            <label class="block text-sm font-medium">Add a phone number for delivery</label>
            <div class="flex gap-2">
              <input
                :value="phoneInput"
                @input="phoneInput = $event.target.value.replace(/[^\d+]/g, '').slice(0, 16)"
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                class="flex-1 border rounded px-3 py-2"
                placeholder="Enter phone"
              />
              <button
                type="button"
                class="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
                :disabled="savingPhone || !phoneInput.trim()"
                @click="savePhone"
              >{{ savingPhone ? 'Saving…' : 'Save' }}</button>
            </div>
            <p class="text-xs text-gray-600">We'll only ask once.</p>
          </div>

          <template v-if="orderType === 'delivery'">
            <div class="border rounded-lg p-3 space-y-2 bg-gray-50">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-medium">Delivery Location *</p>
                <button
                  type="button"
                  class="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-60"
                  :disabled="gpsStatus === 'locating'"
                  @click="captureCurrentLocation"
                >
                  {{ gpsStatus === 'locating' ? 'Locating…' : (deliveryLat != null ? 'Update Location' : 'Use My Location') }}
                </button>
              </div>
              <p v-if="gpsStatus === 'ok' && deliveryLat != null" class="text-xs text-green-700">
                📍 Location captured ({{ deliveryLat.toFixed(5) }}, {{ deliveryLng.toFixed(5) }})
                <button type="button" class="ml-2 underline text-gray-500" @click="clearGpsLocation">clear</button>
              </p>
              <p v-else-if="gpsStatus === 'error'" class="text-xs text-red-600">{{ gpsError }}</p>
              <p v-else class="text-xs text-gray-500">Share your location so the driver can find you precisely.</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Apartment, unit, gate code, or other location details</label>
              <textarea v-model="deliveryInstructions" rows="2" class="w-full border rounded px-3 py-2" placeholder="e.g. Apt 3B, gate code #1234, leave at door" />
            </div>
          </template>

          <template v-else>
            <div>
              <label class="block text-sm font-medium mb-1">Pickup Notes</label>
              <textarea v-model="deliveryInstructions" rows="2" class="w-full border rounded px-3 py-2" placeholder="Anything we should know for pickup" />
            </div>
          </template>
        </div>
        <div class="border-t pt-3 space-y-2">
          <h3 class="font-medium">Cart</h3>
          <div class="space-y-2 max-h-56 overflow-y-auto">
            <div
              v-for="item in cart"
              :key="`${item.menuItemId}-${optionSignature(item.options)}`"
              class="border rounded p-2"
            >
              <div class="flex justify-between gap-2">
                <p class="text-sm font-medium">{{ item.name }}</p>
                <button class="text-xs text-red-600" @click="removeFromCart(item)">Remove</button>
              </div>
              <p class="text-xs text-gray-500">${{ item.price.toFixed(2) }}</p>
              <p v-if="item.notes" class="text-xs text-gray-500">{{ item.notes }}</p>
              <div class="flex items-center gap-2 mt-1">
                <button class="px-2 py-1 border rounded" @click="updateCartQuantity(item, -1)">-</button>
                <span class="text-sm">{{ item.quantity }}</span>
                <button class="px-2 py-1 border rounded" @click="updateCartQuantity(item, 1)">+</button>
              </div>
            </div>
            <p v-if="!cart.length" class="text-sm text-gray-500">No items in cart.</p>
          </div>
          <div class="rounded-lg bg-gray-50 border p-3 text-sm flex justify-between">
            <span>Total</span>
            <span class="font-semibold">${{ cartTotal.toFixed(2) }}</span>
          </div>
          <button
            class="w-full px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
            :disabled="placingOrder"
            @click="placeOrder"
          >
            {{ placingOrder ? 'Placing…' : (orderType === 'pickup' ? 'Place Pickup Order' : 'Place Delivery Order') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Tracker ── -->
    <div v-if="activeTab === 'track'" class="bg-white border rounded-xl p-4 space-y-5 max-w-2xl">
      <h2 class="font-semibold">Track Your Delivery</h2>

      <!-- Lookup form (shown when no order tracked) -->
      <div v-if="!trackedOrder" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">Order Number *</label>
            <input v-model="trackOrderNumber" type="number" min="1" class="w-full border rounded px-3 py-2" placeholder="e.g. 1042" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Phone Number *</label>
            <input
              :value="trackPhone"
              @input="trackPhone = $event.target.value.replace(/[^\d+]/g, '').slice(0, 16)"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              class="w-full border rounded px-3 py-2"
              placeholder="Same phone used on order"
            />
          </div>
        </div>
        <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="findOrder">Track Order</button>
      </div>

      <!-- Live tracker -->
      <div v-if="trackedOrder" class="space-y-5">
        <span
          class="inline-block text-xs px-2 py-1 rounded-full font-medium"
          :class="trackedOrder.orderType === 'pickup' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'"
        >
          {{ trackedOrder.orderType === 'pickup' ? '🏬 Pickup Order' : '🚗 Delivery Order' }}
        </span>

        <!-- Header -->
        <div class="flex items-start justify-between">
          <div>
            <p class="text-lg font-bold">Order #{{ trackedOrder.orderNumber }}</p>
            <p class="text-sm text-gray-500">{{ trackedOrder.customerName }}</p>
          </div>
          <button class="text-xs text-blue-600 underline" @click="trackedOrder = null">Track different order</button>
        </div>

        <!-- Step timeline -->
        <div class="relative flex items-start justify-between px-2">
          <!-- Connector line -->
          <div class="absolute top-4 left-4 right-4 h-1 bg-gray-200 z-0">
            <div
              class="h-full bg-blue-600 transition-all duration-700 ease-in-out"
              :style="{ width: timelineLineWidth }"
            />
          </div>

          <div
            v-for="step in timelineSteps"
            :key="step.status"
            class="relative z-10 flex flex-col items-center flex-1"
          >
            <!-- Circle -->
            <div
              class="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-500"
              :class="{
                'bg-blue-600 border-blue-600 text-white': stepState(step.status) === 'done',
                'bg-white border-blue-600 text-blue-600 ring-4 ring-blue-100 scale-110': stepState(step.status) === 'active',
                'bg-white border-gray-300': stepState(step.status) === 'pending',
              }"
            >
              <span v-if="stepState(step.status) === 'done'" class="text-sm">✓</span>
              <span v-else-if="stepState(step.status) === 'active'" class="w-2.5 h-2.5 bg-blue-600 rounded-full animate-pulse" />
              <span v-else class="w-2 h-2 bg-gray-300 rounded-full" />
            </div>

            <!-- Label -->
            <p
              class="mt-2 text-xs text-center leading-tight whitespace-pre-line"
              :class="stepState(step.status) === 'active' ? 'font-semibold text-blue-700' : 'text-gray-500'"
            >{{ step.label }}</p>

            <!-- ETA under active step -->
            <p v-if="stepState(step.status) === 'active'" class="mt-0.5 text-xs text-blue-500 text-center">
              {{ etaMap[trackedOrder.status] }}
            </p>
          </div>
        </div>

        <!-- Address / pickup summary -->
        <div v-if="trackedOrder.orderType === 'delivery'" class="text-sm bg-gray-50 border rounded-lg p-3">
          <p class="font-medium text-gray-700">Delivering to</p>
          <p class="text-gray-600">{{ trackedOrder.deliveryAddress || 'N/A' }}</p>
          <p v-if="trackedOrder.deliveryLat != null && trackedOrder.deliveryLng != null" class="text-xs text-gray-500 mt-1">
            📍 {{ Number(trackedOrder.deliveryLat).toFixed(5) }}, {{ Number(trackedOrder.deliveryLng).toFixed(5) }}
          </p>
        </div>
        <div v-else class="text-sm bg-gray-50 border rounded-lg p-3">
          <p class="font-medium text-gray-700">Pickup at the restaurant</p>
          <p class="text-gray-600">We'll let you know when your order is ready.</p>
        </div>

        <!-- Driver info (delivery only) -->
        <div v-if="trackedOrder.orderType === 'delivery' && trackedOrder.driverName" class="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <span class="text-2xl">🚗</span>
          <div>
            <p class="font-semibold text-blue-800">{{ trackedOrder.driverName }} is on the way!</p>
            <p v-if="trackedOrder.driverPhone" class="text-sm text-blue-600">{{ trackedOrder.driverPhone }}</p>
          </div>
        </div>
        <div v-else-if="trackedOrder.orderType === 'delivery' && trackedOrder.status === 'ready'" class="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg p-3">
          <span class="text-2xl">🛵</span>
          <p class="text-sm text-orange-700 font-medium">Assigning a driver to your order…</p>
        </div>

        <!-- Live map (delivery only) -->
        <div v-if="showMap" class="rounded-xl overflow-hidden border" style="height: 300px;">
          <div ref="mapContainer" style="height: 100%; width: 100%;" />
        </div>
        <div
          v-else-if="trackedOrder.orderType === 'delivery' && trackedOrder.status !== 'completed' && trackedOrder.status !== 'cancelled'"
          class="rounded-xl bg-gray-50 border flex items-center justify-center"
          style="height: 120px;"
        >
          <p class="text-sm text-gray-400">Live map appears when your driver is on the way</p>
        </div>

        <!-- Order summary -->
        <div class="border-t pt-4 space-y-2">
          <p class="text-sm font-medium">Order Summary</p>
          <div class="space-y-1">
            <div v-for="(item, index) in trackedOrder.items" :key="index" class="text-sm flex justify-between text-gray-700">
              <span>{{ item.name }} ×{{ item.quantity }}</span>
              <span>${{ (item.price * item.quantity).toFixed(2) }}</span>
            </div>
          </div>
          <div class="text-sm flex justify-between font-semibold border-t pt-2">
            <span>Total</span>
            <span>${{ trackedOrder.total.toFixed(2) }}</span>
          </div>
        </div>

      </div>
    </div>

    <!-- ── Customization modal (unchanged) ── -->
    <div v-if="customizationOpen" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl border w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <h2 class="text-lg font-semibold p-4 border-b">Customize {{ pendingMenuItem?.name }}</h2>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div v-if="pendingMenuItem && isPizzaItem(pendingMenuItem)">
          <label class="block text-sm font-medium mb-2">Pizza Size</label>
          <div class="space-y-2">
            <label v-for="size in pizzaSizeOptions" :key="size.value" class="flex items-center justify-between border rounded px-3 py-2 cursor-pointer">
              <span>{{ size.label }}</span>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500" v-if="size.priceDelta !== 0">
                  {{ size.priceDelta > 0 ? `+$${size.priceDelta.toFixed(2)}` : `-$${Math.abs(size.priceDelta).toFixed(2)}` }}
                </span>
                <input v-model="selectedPizzaSize" type="radio" :value="size.value" />
              </div>
            </label>
          </div>

          <label class="block text-sm font-medium mt-4 mb-2">Preset Style</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              class="px-3 py-2 border rounded text-sm"
              :class="selectedPizzaStyle === 'custom' ? 'bg-blue-50 border-blue-300 text-blue-700' : ''"
              @click="applyPizzaPreset('custom')"
            >Custom</button>
            <button
              v-for="style in pizzaPresetStyles"
              :key="style.value"
              class="px-3 py-2 border rounded text-sm"
              :class="selectedPizzaStyle === style.value ? 'bg-blue-50 border-blue-300 text-blue-700' : ''"
              @click="applyPizzaPreset(style.value)"
            >{{ style.label }}</button>
          </div>

          <label class="block text-sm font-medium mt-4 mb-2">Toppings</label>
          <div class="grid grid-cols-2 gap-2">
            <label v-for="topping in pizzaToppingOptions" :key="topping.value" class="flex items-center gap-2 border rounded px-3 py-2 text-sm cursor-pointer">
              <input type="checkbox" :checked="selectedPizzaToppings.includes(topping.value)" @change="togglePizzaTopping(topping.value)" />
              {{ topping.label }}
            </label>
          </div>
        </div>

        <div v-if="pendingMenuItem && isWingsItem(pendingMenuItem)">
          <label class="block text-sm font-medium mb-2">Wings Flavor</label>
          <select v-model="selectedWingFlavor" class="w-full border rounded px-3 py-2 bg-white">
            <option v-for="flavor in wingFlavorOptions" :key="flavor.value" :value="flavor.value">{{ flavor.label }}</option>
          </select>
        </div>

        <div v-if="pendingMenuItem && isSodaItem(pendingMenuItem)">
          <label class="block text-sm font-medium mb-2">Soda Flavor</label>
          <select v-model="selectedSodaFlavor" class="w-full border rounded px-3 py-2 bg-white">
            <option v-for="flavor in sodaFlavorOptions" :key="flavor.value" :value="flavor.value">{{ flavor.label }}</option>
          </select>
        </div>

        </div>

        <div class="flex justify-end gap-2 p-4 border-t">
          <button class="px-3 py-2 border rounded" @click="customizationOpen = false">Cancel</button>
          <button class="px-3 py-2 bg-blue-600 text-white rounded" @click="confirmCustomization">Add to Cart</button>
        </div>
      </div>
    </div>
  </div>
</template>
