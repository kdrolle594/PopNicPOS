<script setup>
import { ref, inject, computed, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '../../store/useAuthStore.js';
import { subscribeOrders } from '../../lib/realtime.js';
import UiCard from '../ui/UiCard.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiEmptyState from '../ui/UiEmptyState.vue';
import UiButton from '../ui/UiButton.vue';
import DeliveryMap from './DeliveryMap.vue';

const storefrontView = inject('storefrontView');
const auth = useAuthStore();

// ── State ─────────────────────────────────────────────────────────────────────

const loading = ref(true);
const orders = ref([]);
const mapOrderId = ref(null);
const mapOpen = ref(false);

let unsubscribeOrders = null;

// ── Status badge tone mapping ─────────────────────────────────────────────────

function statusTone(status) {
  switch (status) {
    case 'pending':          return 'neutral';
    case 'preparing':        return 'warning';
    case 'ready':
    case 'out_for_delivery': return 'primary';
    case 'completed':        return 'positive';
    case 'cancelled':        return 'danger';
    default:                 return 'neutral';
  }
}

function statusLabel(status) {
  switch (status) {
    case 'pending':          return 'Pending';
    case 'preparing':        return 'Preparing';
    case 'ready':            return 'Ready';
    case 'out_for_delivery': return 'Out for Delivery';
    case 'completed':        return 'Completed';
    case 'cancelled':        return 'Cancelled';
    default:                 return status;
  }
}

// ── Timeline helpers (ported from CustomerView) ───────────────────────────────

const statusOrder = { pending: 0, preparing: 1, ready: 2, completed: 3 };

function timelineSteps(order) {
  if (order.orderType === 'pickup') {
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
}

function etaMap(order) {
  if (order.orderType === 'pickup') {
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
}

function stepState(order, stepStatus) {
  const cur = statusOrder[order.status] ?? -1;
  const idx = statusOrder[stepStatus] ?? 0;
  if (idx < cur) return 'done';
  if (idx === cur) return 'active';
  return 'pending';
}

function timelineLineWidth(order) {
  const widths = { pending: '0%', preparing: '33%', ready: '66%', completed: '100%' };
  return widths[order.status] || '0%';
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return ts;
  }
}

function itemsSummary(items = []) {
  if (!items.length) return '';
  const parts = items.slice(0, 3).map((i) => `${i.name} ×${i.quantity}`);
  const extra = items.length - 3;
  return extra > 0 ? `${parts.join(', ')} +${extra} more` : parts.join(', ');
}

// ── Computed list sorted newest-first ─────────────────────────────────────────

const sortedOrders = computed(() =>
  [...orders.value].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  })
);

// ── Track delivery map ─────────────────────────────────────────────────────────

function openMap(orderId) {
  mapOrderId.value = orderId;
  mapOpen.value = true;
}

function closeMap() {
  mapOpen.value = false;
  mapOrderId.value = null;
}

// ── Fetch orders ─────────────────────────────────────────────────────────────

async function fetchOrders() {
  loading.value = true;
  try {
    const token = await auth.getToken();
    const base = import.meta.env.VITE_API_URL || '';
    const res = await fetch(`${base}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    orders.value = await res.json();
  } catch (err) {
    console.error('[OrderTracker] fetch failed:', err);
  } finally {
    loading.value = false;
  }
}

// ── Realtime subscription ─────────────────────────────────────────────────────

async function connectRealtime() {
  unsubscribeOrders = await subscribeOrders({
    orderStatusUpdated: ({ orderId, status }) => {
      const order = orders.value.find((o) => o.id === orderId);
      if (order) order.status = status;
    },
    orderDriverAssigned: ({ orderId, driverName, driverPhone }) => {
      const order = orders.value.find((o) => o.id === orderId);
      if (order) {
        order.driverName = driverName;
        order.driverPhone = driverPhone;
      }
    },
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  await fetchOrders();
  connectRealtime();
});

onUnmounted(() => {
  if (unsubscribeOrders) { unsubscribeOrders(); unsubscribeOrders = null; }
});
</script>

<template>
  <section class="order-tracker" aria-label="Your orders">
    <h2 class="order-tracker__heading">Your Orders</h2>

    <!-- Skeleton while loading -->
    <template v-if="loading">
      <UiCard v-for="n in 3" :key="n" class="order-tracker__skeleton-card">
        <div class="order-tracker__skeleton-row">
          <UiSkeleton width="120px" height="1.1em" />
          <UiSkeleton width="72px" height="1.1em" />
        </div>
        <UiSkeleton width="70%" height="0.9em" style="margin-top: var(--space-2)" />
        <UiSkeleton width="40%" height="0.9em" style="margin-top: var(--space-1)" />
      </UiCard>
    </template>

    <!-- Empty state -->
    <UiEmptyState
      v-else-if="!sortedOrders.length"
      icon="receipt"
      title="No orders yet"
      description="Your order history will appear here once you place an order."
    >
      <template #action>
        <UiButton variant="primary" @click="storefrontView.value = 'browse'">Browse the menu</UiButton>
      </template>
    </UiEmptyState>

    <!-- Order list -->
    <template v-else>
      <UiCard v-for="order in sortedOrders" :key="order.id" class="order-tracker__card">
        <!-- Card header: order number + badge -->
        <template #header>
          <div class="order-tracker__card-head">
            <span class="order-tracker__order-num">Order #{{ order.orderNumber }}</span>
            <UiBadge :tone="statusTone(order.status)">{{ statusLabel(order.status) }}</UiBadge>
          </div>
        </template>

        <!-- Body -->
        <p class="order-tracker__items">{{ itemsSummary(order.items) }}</p>
        <div class="order-tracker__meta">
          <span class="order-tracker__total">${{ Number(order.total).toFixed(2) }}</span>
          <span class="order-tracker__sep" aria-hidden="true">·</span>
          <span class="order-tracker__time">{{ formatTimestamp(order.createdAt) }}</span>
        </div>

        <!-- Timeline (active/recent orders only) -->
        <div
          v-if="order.status !== 'cancelled'"
          class="order-tracker__timeline"
          aria-label="Order progress"
        >
          <!-- Progress bar -->
          <div class="order-tracker__bar-track" aria-hidden="true">
            <div
              class="order-tracker__bar-fill"
              :style="{ width: timelineLineWidth(order) }"
            />
          </div>

          <div
            v-for="step in timelineSteps(order)"
            :key="step.status"
            class="order-tracker__step"
          >
            <div
              class="order-tracker__dot"
              :class="`order-tracker__dot--${stepState(order, step.status)}`"
              aria-hidden="true"
            >
              <span v-if="stepState(order, step.status) === 'done'" class="order-tracker__check">✓</span>
              <span
                v-else-if="stepState(order, step.status) === 'active'"
                class="order-tracker__pulse"
              />
              <span v-else class="order-tracker__idle-dot" />
            </div>
            <p
              class="order-tracker__step-label"
              :class="{ 'order-tracker__step-label--active': stepState(order, step.status) === 'active' }"
            >{{ step.label }}</p>
            <p
              v-if="stepState(order, step.status) === 'active'"
              class="order-tracker__eta"
            >{{ etaMap(order)[order.status] }}</p>
          </div>
        </div>

        <!-- Track delivery CTA -->
        <div
          v-if="order.status === 'out_for_delivery' && order.driverId"
          class="order-tracker__map-cta"
        >
          <UiButton variant="secondary" size="sm" @click="openMap(order.id)">
            Track delivery
          </UiButton>
        </div>
      </UiCard>
    </template>

    <!-- Delivery map sheet -->
    <DeliveryMap
      v-if="mapOrderId !== null"
      :order-id="mapOrderId"
      :open="mapOpen"
      @close="closeMap"
    />
  </section>
</template>

<style scoped>
.order-tracker {
  padding: var(--space-5) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
  margin: 0 auto;
}

.order-tracker__heading {
  font-size: var(--text-h3);
  font-weight: var(--weight-semibold);
  color: var(--ink);
  margin: 0 0 var(--space-2);
}

/* Skeleton */
.order-tracker__skeleton-card + .order-tracker__skeleton-card {
  margin-top: var(--space-3);
}

.order-tracker__skeleton-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

/* Card */
.order-tracker__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.order-tracker__order-num {
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  color: var(--ink);
}

.order-tracker__items {
  font-size: var(--text-sm);
  color: var(--ink-muted);
  margin: 0 0 var(--space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-tracker__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--ink-muted);
  margin-bottom: var(--space-4);
}

.order-tracker__total {
  font-weight: var(--weight-semibold);
  color: var(--ink);
}

.order-tracker__sep {
  color: var(--ink-subtle);
}

/* Timeline */
.order-tracker__timeline {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0 var(--space-2);
  margin-bottom: var(--space-2);
}

.order-tracker__bar-track {
  position: absolute;
  top: 16px;
  left: var(--space-4);
  right: var(--space-4);
  height: 3px;
  background: var(--line);
  z-index: 0;
}

.order-tracker__bar-fill {
  height: 100%;
  background: var(--primary);
  transition: width 700ms var(--ease);
}

@media (prefers-reduced-motion: reduce) {
  .order-tracker__bar-fill {
    transition: none;
  }
}

.order-tracker__step {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.order-tracker__dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--line);
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 500ms var(--ease), background 500ms var(--ease);
}

@media (prefers-reduced-motion: reduce) {
  .order-tracker__dot {
    transition: none;
  }
}

.order-tracker__dot--done {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-ink);
}

.order-tracker__dot--active {
  background: var(--surface);
  border-color: var(--primary);
  color: var(--primary);
  outline: 4px solid color-mix(in srgb, var(--primary) 18%, transparent);
  transform: scale(1.1);
}

.order-tracker__check {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}

.order-tracker__pulse {
  display: block;
  width: 10px;
  height: 10px;
  background: var(--primary);
  border-radius: 50%;
  animation: ot-pulse 1.2s ease-in-out infinite;
}

@keyframes ot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: .6; transform: scale(0.8); }
}

@media (prefers-reduced-motion: reduce) {
  .order-tracker__pulse {
    animation: none;
  }
}

.order-tracker__idle-dot {
  display: block;
  width: 8px;
  height: 8px;
  background: var(--line);
  border-radius: 50%;
}

.order-tracker__step-label {
  margin-top: var(--space-2);
  font-size: var(--text-caption);
  color: var(--ink-subtle);
  text-align: center;
  white-space: pre-line;
  line-height: 1.3;
}

.order-tracker__step-label--active {
  font-weight: var(--weight-semibold);
  color: var(--primary);
}

.order-tracker__eta {
  font-size: var(--text-caption);
  color: var(--primary);
  text-align: center;
  margin-top: 2px;
}

/* Track delivery CTA */
.order-tracker__map-cta {
  margin-top: var(--space-3);
}
</style>
