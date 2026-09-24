<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { subscribeDelivery } from '../../lib/realtime.js';
import UiModal from '../ui/UiModal.vue';

const props = defineProps({
  orderId:     { type: Number, required: true },
  open:        { type: Boolean, required: true },
});

const emit = defineEmits(['close']);

// ── Leaflet instances (module-level, not reactive) ────────────────────────────
let L = null;
let leafletMap = null;
let driverMarker = null;

// ── Refs ──────────────────────────────────────────────────────────────────────
const mapContainer = ref(null);
const driverLocation = ref(null);
let unsubscribeDelivery = null;

// ── Map init ──────────────────────────────────────────────────────────────────

function initMap() {
  if (!L || !mapContainer.value) return;
  if (leafletMap) { leafletMap.remove(); leafletMap = null; driverMarker = null; }

  const center = driverLocation.value
    ? [driverLocation.value.lat, driverLocation.value.lng]
    : [39.8283, -98.5795]; // US center fallback

  leafletMap = L.map(mapContainer.value).setView(center, driverLocation.value ? 14 : 4);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(leafletMap);

  if (driverLocation.value) {
    placeDriverMarker(driverLocation.value.lat, driverLocation.value.lng);
  }
}

function placeDriverMarker(lat, lng) {
  if (!leafletMap || !L) return;
  const carIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(1px 1px 2px rgba(0,0,0,0.4))" aria-hidden="true">&#x1F697;</div>',
    iconAnchor: [14, 14],
  });
  if (!driverMarker) {
    driverMarker = L.marker([lat, lng], { icon: carIcon })
      .addTo(leafletMap)
      .bindPopup('Your driver');
  } else {
    driverMarker.setLatLng([lat, lng]);
  }
  leafletMap.panTo([lat, lng]);
}

// ── Realtime subscription ─────────────────────────────────────────────────────

async function connectDelivery(orderId) {
  if (unsubscribeDelivery) { unsubscribeDelivery(); unsubscribeDelivery = null; }
  unsubscribeDelivery = await subscribeDelivery(orderId, {
    driverLocation: ({ lat, lng }) => {
      driverLocation.value = { lat, lng };
      if (leafletMap) {
        placeDriverMarker(lat, lng);
      }
    },
  });
}

function disconnectDelivery() {
  if (unsubscribeDelivery) { unsubscribeDelivery(); unsubscribeDelivery = null; }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  const [leafletMod] = await Promise.all([
    import('leaflet'),
    import('leaflet/dist/leaflet.css'),
  ]);
  L = leafletMod.default;

  const [icon2x, icon, shadow] = await Promise.all([
    import('leaflet/dist/images/marker-icon-2x.png'),
    import('leaflet/dist/images/marker-icon.png'),
    import('leaflet/dist/images/marker-shadow.png'),
  ]);

  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl:       icon.default,
    iconRetinaUrl: icon2x.default,
    shadowUrl:     shadow.default,
  });

  if (props.open) {
    // Wait a tick for the modal DOM to be visible before measuring
    await new Promise((r) => setTimeout(r, 50));
    initMap();
    connectDelivery(props.orderId);
  }
});

onUnmounted(() => {
  disconnectDelivery();
  if (leafletMap) { leafletMap.remove(); leafletMap = null; driverMarker = null; }
});

// Re-init when the sheet is opened / orderId changes after mount
watch(
  () => [props.open, props.orderId],
  async ([isOpen]) => {
    if (!L) return;
    if (isOpen) {
      await new Promise((r) => setTimeout(r, 50));
      initMap();
      connectDelivery(props.orderId);
    } else {
      disconnectDelivery();
      if (leafletMap) { leafletMap.remove(); leafletMap = null; driverMarker = null; }
    }
  }
);
</script>

<template>
  <UiModal
    :open="open"
    title="Track Your Delivery"
    :sheet="true"
    @close="emit('close')"
  >
    <div class="delivery-map__body">
      <p class="delivery-map__hint">
        Your driver's location updates in real time.
      </p>
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

.delivery-map__container {
  width: 100%;
  height: 340px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface-sunken);
}
</style>
