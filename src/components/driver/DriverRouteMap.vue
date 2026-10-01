<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const props = defineProps({
  driver:   { type: Object, default: null },
  stops:    { type: Array, required: true },
  geometry: { type: Array, default: null },
});

const container = ref(null);
let map = null;
let driverMarker = null;
let stopLayer = null;
let routeLine = null;
let fittedFor = '';

function divIcon(html, size) {
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function stopIcon(n) {
  return divIcon(
    `<div style="width:28px;height:28px;border-radius:50%;background:#2563eb;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${n}</div>`,
    28
  );
}

function render() {
  if (!map) return;
  if (props.driver) {
    const at = [props.driver.lat, props.driver.lng];
    if (!driverMarker) {
      driverMarker = L.marker(at, {
        icon: divIcon('<div style="font-size:28px;line-height:1">🚗</div>', 28),
      }).addTo(map).bindPopup('You');
    } else {
      driverMarker.setLatLng(at);
    }
  }

  stopLayer.clearLayers();
  for (const s of props.stops) {
    L.marker([s.lat, s.lng], { icon: stopIcon(s.position) }).addTo(stopLayer);
  }

  if (routeLine) { routeLine.remove(); routeLine = null; }
  if (props.geometry?.length) {
    routeLine = L.polyline(props.geometry, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(map);
  }

  // Refit only when the set of stops changes, so the map doesn't jump every fix.
  const key = props.stops.map((s) => s.orderId).join(',') + (props.driver ? ':d' : '');
  if (key !== fittedFor) {
    const points = props.stops.map((s) => [s.lat, s.lng]);
    if (props.driver) points.push([props.driver.lat, props.driver.lng]);
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [30, 30] });
    fittedFor = key;
  }
}

onMounted(() => {
  map = L.map(container.value).setView([39.8283, -98.5795], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);
  stopLayer = L.layerGroup().addTo(map);
  render();
});

onUnmounted(() => {
  if (map) map.remove();
  map = null;
});

watch(() => [props.driver, props.stops, props.geometry], render, { deep: true });
</script>

<template>
  <div class="rounded-xl overflow-hidden border" style="height: 280px;">
    <div ref="container" style="height: 100%; width: 100%;" />
  </div>
</template>
