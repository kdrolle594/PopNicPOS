<script setup>
import { inject, ref, reactive, computed, onMounted, nextTick } from 'vue';
import { useCartStore } from '../../store/useCartStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { usePosStore } from '../../store/usePosStore.js';
import { useToast } from '../../lib/useToast.js';
import UiButton from '../ui/UiButton.vue';
import UiField from '../ui/UiField.vue';
import UiChip from '../ui/UiChip.vue';
import UiIcon from '../ui/UiIcon.vue';

const emit = defineEmits(['placed', 'back']);

const storefrontView = inject('storefrontView');
const cart  = useCartStore();
const auth  = useAuthStore();
const pos   = usePosStore();
const toast = useToast();

// ── Form state ──────────────────────────────────────────────────────────────
const orderType      = ref(cart.state.orderType || 'delivery');
const customerName   = ref('');
const phone          = ref(cart.state.phone || '');
const notes          = ref(cart.state.deliveryInstructions || '');
const deliveryAddress = ref('');

// ── Geolocation ─────────────────────────────────────────────────────────────
// 'idle' | 'locating' | 'captured' | 'denied'
const geoStatus = ref('idle');
const geoLat    = ref(null);
const geoLng    = ref(null);

function requestLocation() {
  if (!navigator.geolocation) {
    geoStatus.value = 'denied';
    return;
  }
  geoStatus.value = 'locating';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      geoLat.value    = position.coords.latitude;
      geoLng.value    = position.coords.longitude;
      geoStatus.value = 'captured';
    },
    () => {
      geoStatus.value = 'denied';
    }
  );
}

function retryLocation() {
  geoLat.value    = null;
  geoLng.value    = null;
  geoStatus.value = 'idle';
  requestLocation();
}

// ── Chip selection ───────────────────────────────────────────────────────────
function selectOrderType(type) {
  orderType.value = type;
  if (type === 'delivery' && geoStatus.value === 'idle') {
    requestLocation();
  }
}

// ── Validation ───────────────────────────────────────────────────────────────
const errors = reactive({ phone: '', delivery: '' });

const phoneRef   = ref(null);
const addressRef = ref(null);

function validate() {
  errors.phone    = '';
  errors.delivery = '';
  let valid = true;

  if (!phone.value.trim()) {
    errors.phone = 'Phone number is required.';
    valid = false;
  }

  if (orderType.value === 'delivery') {
    const hasCoords  = geoLat.value != null && geoLng.value != null;
    const hasAddress = deliveryAddress.value.trim().length > 0;
    if (!hasCoords && !hasAddress) {
      errors.delivery = 'Please allow location access or enter a delivery address.';
      valid = false;
    }
  }

  return valid;
}

// ── Submit ───────────────────────────────────────────────────────────────────
const submitting = ref(false);

const canSubmit = computed(() =>
  cart.state.items.length > 0 && !submitting.value
);

async function submit() {
  if (!canSubmit.value) return;

  if (!validate()) {
    await nextTick();
    if (errors.phone)    { phoneRef.value?.focus();   return; }
    if (errors.delivery) { addressRef.value?.focus(); return; }
    return;
  }

  submitting.value = true;
  try {
    const token = await auth.getToken();
    const base  = import.meta.env.VITE_API_URL || '';

    const body = {
      orderType:     orderType.value,
      customerName:  customerName.value || null,
      customerPhone: phone.value.trim(),
      notes:         notes.value.trim() || null,
      paymentMethod: 'digital',
      items: cart.state.items.map((line) => ({
        menuItemId:     line.menuItemId,
        name:           line.name,
        quantity:       line.quantity,
        options:        line.options || {},
        notes:          line.notes   || null,
        paidWithPoints: false,
      })),
    };

    if (orderType.value === 'delivery') {
      if (geoLat.value != null && geoLng.value != null) {
        body.deliveryLat = geoLat.value;
        body.deliveryLng = geoLng.value;
      }
      const addr = deliveryAddress.value.trim();
      if (addr) body.deliveryAddress = addr;
    }

    const res = await fetch(`${base}/api/orders`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(data.error || res.statusText);
    }

    const order = await res.json();
    cart.clear();
    toast.success('Order placed!');
    emit('placed', order);
    storefrontView.value = 'orders';
  } catch (err) {
    toast.error(err.message || 'Failed to place order. Please try again.');
  } finally {
    submitting.value = false;
  }
}

// ── Back ──────────────────────────────────────────────────────────────────────
function goBack() {
  emit('back');
  storefrontView.value = 'cart';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPrice(amount) {
  return '$' + Number(amount).toFixed(2);
}

function lineKey(line) {
  return line.menuItemId + '|' + JSON.stringify(line.options);
}

// ── Mount: reconcile cart + prefill ──────────────────────────────────────────
onMounted(async () => {
  await pos.loadPublic();
  const { removed } = cart.reconcileWithMenu(pos.state.menuItems);
  if (removed.length) {
    toast.error(
      `No longer available: ${removed.join(', ')}. ` +
      `We removed ${removed.length === 1 ? 'it' : 'them'} from your cart.`
    );
  }

  const me = await pos.fetchMe();
  if (me) {
    customerName.value = me.name  || '';
    if (!cart.state.phone) cart.state.phone = me.phone || '';
    phone.value = cart.state.phone;
  }

  // Kick off location if delivery is already selected
  if (orderType.value === 'delivery') {
    requestLocation();
  }
});
</script>

<template>
  <div v-if="storefrontView.value === 'checkout'" class="co-wrap">
    <div class="co-panel">

      <!-- ── Header ──────────────────────────────────────── -->
      <div class="co-header">
        <button class="co-back" type="button" aria-label="Back to cart" @click="goBack">
          <UiIcon name="chevron-left" :size="18" />
          <span>Back to cart</span>
        </button>
        <h1 class="co-title">Checkout</h1>
      </div>

      <!-- ── Form ───────────────────────────────────────── -->
      <form class="co-form" novalidate @submit.prevent="submit">

        <!-- Order type chips -->
        <fieldset class="co-fieldset">
          <legend class="co-legend">Order type</legend>
          <div class="co-chips" role="group" aria-label="Order type">
            <UiChip
              :selected="orderType === 'delivery'"
              @click="selectOrderType('delivery')"
            >
              Delivery
            </UiChip>
            <UiChip
              :selected="orderType === 'pickup'"
              @click="selectOrderType('pickup')"
            >
              Pickup
            </UiChip>
          </div>
        </fieldset>

        <!-- Phone -->
        <UiField
          label="Phone number"
          :error="errors.phone"
          required
        >
          <template #default="{ id, describedBy, invalid }">
            <input
              :id="id"
              ref="phoneRef"
              v-model="phone"
              class="co-input"
              :class="{ 'co-input--invalid': invalid }"
              type="tel"
              autocomplete="tel"
              placeholder="+1 (555) 000-0000"
              :aria-describedby="describedBy"
              :aria-invalid="invalid"
              @input="errors.phone = ''"
            />
          </template>
        </UiField>

        <!-- Delivery address block -->
        <template v-if="orderType === 'delivery'">

          <!-- Locating spinner -->
          <div v-if="geoStatus === 'locating'" class="co-geo co-geo--locating" aria-live="polite">
            <span class="co-geo__spinner" aria-hidden="true" />
            <span>Detecting your location…</span>
          </div>

          <!-- Captured coordinates -->
          <div v-else-if="geoStatus === 'captured'" class="co-geo co-geo--captured" aria-live="polite">
            <UiIcon name="check-circle" :size="16" />
            <span>Location captured</span>
            <button
              type="button"
              class="co-geo__change"
              @click="retryLocation"
            >Use a different location</button>
          </div>

          <!-- Denied: show text address field -->
          <template v-else-if="geoStatus === 'denied'">
            <UiField
              label="Delivery address"
              :error="errors.delivery"
              hint="We couldn't access your location. Enter your address below."
              required
            >
              <template #default="{ id, describedBy, invalid }">
                <input
                  :id="id"
                  ref="addressRef"
                  v-model="deliveryAddress"
                  class="co-input"
                  :class="{ 'co-input--invalid': invalid }"
                  type="text"
                  autocomplete="street-address"
                  placeholder="123 Main St, City, State"
                  :aria-describedby="describedBy"
                  :aria-invalid="invalid"
                  @input="errors.delivery = ''"
                />
              </template>
            </UiField>
          </template>

          <!-- Validation error when no coords and not denied (edge case) -->
          <p
            v-if="errors.delivery && geoStatus !== 'denied'"
            class="co-geo-error"
            role="alert"
          >
            {{ errors.delivery }}
          </p>

        </template>

        <!-- Notes -->
        <UiField label="Special instructions" hint="Optional — dietary needs, delivery notes, etc.">
          <template #default="{ id, describedBy }">
            <textarea
              :id="id"
              v-model="notes"
              class="co-textarea"
              rows="3"
              placeholder="e.g. No onions, leave at door…"
              :aria-describedby="describedBy"
            />
          </template>
        </UiField>

        <!-- ── Order summary ────────────────────────────── -->
        <div class="co-summary" aria-label="Order summary">
          <h2 class="co-summary__heading">Order summary</h2>

          <ul class="co-lines" role="list">
            <li
              v-for="line in cart.state.items"
              :key="lineKey(line)"
              class="co-line"
            >
              <span class="co-line__qty">{{ line.quantity }}×</span>
              <span class="co-line__name">{{ line.name }}</span>
              <span class="co-line__price">{{ formatPrice(line.price * line.quantity) }}</span>
            </li>
          </ul>

          <div class="co-total">
            <span class="co-total__label">Total</span>
            <span class="co-total__amount">{{ formatPrice(cart.total.value) }}</span>
          </div>
        </div>

        <!-- ── Submit ───────────────────────────────────── -->
        <UiButton
          type="submit"
          variant="primary"
          size="lg"
          block
          :disabled="!canSubmit"
          :loading="submitting"
        >
          {{ submitting ? 'Placing order…' : 'Place order' }}
        </UiButton>

        <p v-if="cart.state.items.length === 0" class="co-empty-note" role="status">
          Your cart is empty. Go back and add some items.
        </p>

      </form>
    </div>
  </div>
</template>

<style scoped>
/* ─── WRAPPER ─────────────────────────────────────── */
.co-wrap {
  min-height: 100%;
  display: flex;
  justify-content: center;
  background: var(--surface-sunken);
  padding: var(--space-6) var(--space-5) var(--space-10);
}

/* ─── PANEL ───────────────────────────────────────── */
.co-panel {
  width: 100%;
  max-width: 560px;
}

/* ─── HEADER ──────────────────────────────────────── */
.co-header {
  margin-bottom: var(--space-6);
}

.co-back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: none;
  border: none;
  padding: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--ink-muted);
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease);
}

.co-back:hover {
  color: var(--ink);
}

.co-back:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.co-title {
  margin: var(--space-3) 0 0;
  font-size: var(--text-h2);
  font-weight: var(--weight-semibold);
  color: var(--ink);
  line-height: 1.2;
}

/* ─── FORM ────────────────────────────────────────── */
.co-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* ─── FIELDSET (order type) ───────────────────────── */
.co-fieldset {
  border: none;
  margin: 0;
  padding: 0;
}

.co-legend {
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  color: var(--ink);
  margin-bottom: var(--space-2);
}

.co-chips {
  display: flex;
  gap: var(--space-2);
}

/* ─── INPUT ───────────────────────────────────────── */
.co-input {
  display: block;
  width: 100%;
  height: var(--control-h, 44px);
  padding: 0 var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--text-body);
  box-sizing: border-box;
  transition:
    border-color var(--motion-fast) var(--ease),
    box-shadow var(--motion-fast) var(--ease);
}

.co-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
}

.co-input--invalid {
  border-color: var(--danger);
}

.co-input--invalid:focus {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 18%, transparent);
}

.co-input::placeholder {
  color: var(--ink-subtle);
}

/* ─── TEXTAREA ────────────────────────────────────── */
.co-textarea {
  display: block;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--text-body);
  resize: vertical;
  box-sizing: border-box;
  transition:
    border-color var(--motion-fast) var(--ease),
    box-shadow var(--motion-fast) var(--ease);
}

.co-textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
}

.co-textarea::placeholder {
  color: var(--ink-subtle);
}

/* ─── GEOLOCATION STATUS ──────────────────────────── */
.co-geo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
}

.co-geo--locating {
  background: var(--surface-sunken);
  color: var(--ink-muted);
}

.co-geo--captured {
  background: color-mix(in srgb, var(--positive) 10%, transparent);
  border-color: color-mix(in srgb, var(--positive) 30%, transparent);
  color: var(--ink);
}

.co-geo__spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  flex-shrink: 0;
  animation: co-spin 0.7s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .co-geo__spinner {
    animation: none;
    opacity: 0.5;
  }
}

@keyframes co-spin {
  to { transform: rotate(360deg); }
}

.co-geo__change {
  background: none;
  border: none;
  padding: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--primary);
  cursor: pointer;
  text-decoration: underline;
  margin-left: auto;
}

.co-geo__change:hover {
  color: var(--primary-hover, var(--primary));
}

.co-geo__change:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.co-geo-error {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--danger);
}

/* ─── ORDER SUMMARY ───────────────────────────────── */
.co-summary {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
}

.co-summary__heading {
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  color: var(--ink);
  margin: 0 0 var(--space-4);
}

.co-lines {
  list-style: none;
  margin: 0 0 var(--space-4);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.co-line {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-body);
}

.co-line__qty {
  color: var(--ink-muted);
  flex-shrink: 0;
  min-width: 24px;
}

.co-line__name {
  flex: 1;
  color: var(--ink);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.co-line__price {
  font-weight: var(--weight-medium);
  color: var(--ink);
  flex-shrink: 0;
  white-space: nowrap;
}

.co-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
}

.co-total__label {
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  color: var(--ink);
}

.co-total__amount {
  font-size: var(--text-h2);
  font-weight: var(--weight-semibold);
  color: var(--ink);
}

/* ─── EMPTY NOTE ──────────────────────────────────── */
.co-empty-note {
  margin: 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--ink-muted);
}
</style>
