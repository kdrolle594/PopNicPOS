<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import UiModal from '../ui/UiModal.vue';
import { stopsBeforeText, lastUpdatedText } from '../../lib/delivery.js';

const props = defineProps({
  orderId:     { type: Number, required: true },
  open:        { type: Boolean, required: true },
  customerLat: { type: Number, default: null },
  customerLng: { type: Number, default: null },
  update:      { type: Object, default: null }, // latest deliveryUpdate + receivedAt
});
const emit = defineEmits(['close']);

let L = null;
let leafletMap = null;
let driverMarker = null;
let customerMarker = null;
let routeLine = null;
let fitted = false;

const mapContainer = ref(null);
const now = ref(Date.now());
let tick = null;

const caption = computed(() => {
  const u = props.update;
  if (!u || !u.driver) return "Waiting for your driver's location…";
  if (u.position > 1) return `${stopsBeforeText(u.position)}. Your route appears when you're next.`;
  return 'Your driver is on the way to you.';
});
const staleText = computed(() => lastUpdatedText(props.update?.receivedAt ?? null, now.value));

function icon(html, size) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(1px 1px 2px rgba(0,0,0,0.4))" aria-hidden="true">${html}</div>`,
    iconAnchor: [size / 2, size / 2],
  });
}

function initMap() {
  if (!L || !mapContainer.value) return;
  destroyMap();
  const home = props.customerLat != null ? [props.customerLat, props.customerLng] : [39.8283, -98.5795];
  leafletMap = L.map(mapContainer.value).setView(home, props.customerLat != null ? 14 : 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(leafletMap);
  if (props.customerLat != null) {
    customerMarker = L.marker(home, { icon: icon('&#x1F3E0;', 26) }).addTo(leafletMap).bindPopup('Your delivery address');
  }
  render();
}

function render() {
  if (!leafletMap) return;
  const u = props.update;
  if (u?.driver) {
    const at = [u.driver.lat, u.driver.lng];
    if (!driverMarker) driverMarker = L.marker(at, { icon: icon('&#x1F697;', 28) }).addTo(leafletMap).bindPopup('Your driver');
    else driverMarker.setLatLng(at);
  }
  if (routeLine) { routeLine.remove(); routeLine = null; }
  if (u?.route?.length) {
    routeLine = L.polyline(u.route, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(leafletMap);
  }
  if (!fitted && driverMarker && customerMarker) {
    leafletMap.fitBounds([driverMarker.getLatLng(), customerMarker.getLatLng()], { padding: [40, 40] });
    fitted = true;
  }
}

function destroyMap() {
  if (leafletMap) leafletMap.remove();
  leafletMap = null; driverMarker = null; customerMarker = null; routeLine = null; fitted = false;
}

async function openMap() {
  await new Promise((r) => setTimeout(r, 50)); // modal must be visible before Leaflet measures it
  initMap();
}

onMounted(async () => {
  const [leafletMod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
  L = leafletMod.default;
  tick = setInterval(() => { now.value = Date.now(); }, 15_000);
  if (props.open) openMap();
});

onUnmounted(() => {
  clearInterval(tick);
  destroyMap();
});

watch(() => [props.open, props.orderId], ([isOpen]) => {
  if (!L) return;
  if (isOpen) openMap();
  else destroyMap();
});

watch(() => props.update, render);
</script>

<template>
  <UiModal :open="open" title="Track Your Delivery" :sheet="true" @close="emit('close')">
    <div class="delivery-map__body">
      <p class="delivery-map__hint" aria-live="polite">{{ caption }}</p>
      <p v-if="staleText" class="delivery-map__stale">{{ staleText }}</p>
      <div class="delivery-map__container" ref="mapContainer" />
    </div>
  </UiModal>
</template>

<style scoped>
.delivery-map__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.delivery-map__hint {
  font-size: var(--text-sm);
  color: var(--ink-muted);
  margin: 0;
}

.delivery-map__stale {
  font-size: var(--text-caption);
  color: var(--warning, var(--ink-muted));
  margin: 0;
}

.delivery-map__container {
  width: 100%;
  height: 340px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface-sunken);
}
</style>
