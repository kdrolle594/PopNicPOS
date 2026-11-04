<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { usePosStore } from '../store/usePosStore';
import { useAuthStore } from '../store/useAuthStore.js';
import { subscribeMenu, subscribeOrders } from '../lib/realtime.js';
import { useToast } from '../lib/useToast.js';
import { needsCustomization, linePrice, lineLabel, lineSignature } from '../../shared/menuOptions.js';
import { pointsForTotal } from '../../shared/loyalty.js';
import { isCategoryOpen, BREAKFAST } from '../../shared/menuHours.js';
import UiButton from './ui/UiButton.vue';
import UiBadge from './ui/UiBadge.vue';
import UiChip from './ui/UiChip.vue';
import UiEmptyState from './ui/UiEmptyState.vue';
import ItemCustomizeSheet from './storefront/ItemCustomizeSheet.vue';

const { state, addOrder, payOrder, applyPayment, updateLoyaltyCustomer, getTier, refreshMenu } = usePosStore();
const auth = useAuthStore();
const toast = useToast();

const tab = ref('new'); // 'new' | 'unpaid' | 'log'

// ── New order ────────────────────────────────────────────────────────────────
const currentOrder = ref([]);
const tableNumber = ref(1);
const customerName = ref('');
const notes = ref('');
const selectedCategory = ref('All');
const paymentMethod = ref('cash');
const selectedCustomerId = ref('');
const customerSearch = ref('');
const placingOrder = ref(false);

const sheetItemId = ref(null);
const sheetUsePoints = ref(false);
// Read through the store so a live refresh updates the open sheet.
const sheetItem = computed(() => state.menuItems.find((i) => i.id === sheetItemId.value) || null);

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'digital', label: 'Digital' },
];

function posLineKey(line) {
  return `${line.paidWithPoints ? 'pts' : 'cash'}|${lineSignature(line.menuItemId, line.choiceIds || [])}`;
}

const now = ref(new Date());
let clock = null;

const categories = computed(() => ['All', ...new Set(state.menuItems.map((item) => item.category))]);

const filteredMenuItems = computed(() => {
  if (selectedCategory.value === 'All') return state.menuItems;
  return state.menuItems.filter((item) => item.category === selectedCategory.value);
});

const RESTAURANT_TZ = import.meta.env.VITE_RESTAURANT_TZ || undefined;
function closedForHours(item) {
  return !isCategoryOpen(item.category, now.value, RESTAURANT_TZ);
}

const selectedCustomer = computed(() => state.loyaltyCustomers.find((c) => c.id === selectedCustomerId.value));

const filteredCustomers = computed(() => {
  if (!customerSearch.value) return state.loyaltyCustomers;
  const q = customerSearch.value.toLowerCase();
  return state.loyaltyCustomers.filter((customer) =>
    (customer.name || '').toLowerCase().includes(q) ||
    (customer.phone || '').includes(customerSearch.value)
  );
});

const total = computed(() => currentOrder.value.reduce((sum, item) => sum + item.price * item.quantity, 0));
const pointsToEarn = computed(() => pointsForTotal(total.value));
const totalPointsToRedeem = computed(() =>
  currentOrder.value.reduce((sum, orderItem) => {
    if (!orderItem.paidWithPoints) return sum;
    const menuItem = state.menuItems.find((item) => item.id === orderItem.menuItemId);
    return sum + (menuItem?.pointsValue || 0) * orderItem.quantity;
  }, 0)
);

function addConfiguredToOrder(menuItem, usePoints = false, choiceIds = []) {
  if (!menuItem.available || menuItem.soldOut || closedForHours(menuItem)) return;

  if (usePoints) {
    if (!selectedCustomer.value) {
      toast.error('Select a loyalty customer first.');
      return;
    }
    if (!menuItem.pointsValue || selectedCustomer.value.points < menuItem.pointsValue) {
      toast.error(`${selectedCustomer.value.name} doesn't have enough points for ${menuItem.name}.`);
      return;
    }
  }

  const line = {
    menuItemId: menuItem.id,
    name: lineLabel(menuItem, choiceIds),
    quantity: 1,
    price: usePoints ? 0 : linePrice(menuItem, choiceIds),
    paidWithPoints: usePoints,
    choiceIds: [...choiceIds],
  };
  const existing = currentOrder.value.find((item) => posLineKey(item) === posLineKey(line));
  if (existing) {
    existing.quantity += 1;
    currentOrder.value = [...currentOrder.value];
    return;
  }
  currentOrder.value = [...currentOrder.value, line];
}

function addToOrder(menuItem, usePoints = false) {
  if (!needsCustomization(menuItem)) {
    addConfiguredToOrder(menuItem, usePoints);
    return;
  }
  sheetItemId.value = menuItem.id;
  sheetUsePoints.value = usePoints;
}

function onSheetConfirm({ choiceIds }) {
  if (sheetItem.value) addConfiguredToOrder(sheetItem.value, sheetUsePoints.value, choiceIds);
  sheetItemId.value = null;
}

function updateQuantity(orderItem, delta) {
  const key = posLineKey(orderItem);
  currentOrder.value = currentOrder.value.map((item) =>
    posLineKey(item) === key ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
  );
}

function removeItem(orderItem) {
  const key = posLineKey(orderItem);
  currentOrder.value = currentOrder.value.filter((item) => posLineKey(item) !== key);
}

function selectCustomer(customer) {
  selectedCustomerId.value = customer.id;
  customerName.value = customer.name;
  customerSearch.value = '';
}

function clearCustomer() {
  selectedCustomerId.value = '';
  customerName.value = '';
}

// payNow: true takes payment while placing; false sends it to the kitchen unpaid
// so any cashier can take payment later from the Unpaid tab.
async function placeOrder(payNow) {
  if (placingOrder.value) return;
  if (!currentOrder.value.length) {
    toast.error('Add items to the order first.');
    return;
  }

  placingOrder.value = true;
  let created;
  try {
    created = await addOrder({
      items: currentOrder.value.map((line) => ({
        menuItemId: line.menuItemId,
        name: line.name,
        quantity: line.quantity,
        price: line.price,
        paidWithPoints: line.paidWithPoints,
        choiceIds: line.choiceIds || [],
      })),
      tableNumber: Number(tableNumber.value),
      customerName: customerName.value || selectedCustomer.value?.name,
      paymentMethod: payNow ? paymentMethod.value : undefined,
      paid: payNow,
      notes: notes.value || undefined,
      pointsEarned: pointsToEarn.value,
      pointsRedeemed: totalPointsToRedeem.value,
    });
  } finally {
    placingOrder.value = false;
  }

  if (!created) {
    toast.error(state.orderError || 'The order was not placed. Try again.');
    await refreshMenu();
    return;
  }

  // Loyalty bookkeeping only after the order exists.
  if (selectedCustomer.value && (pointsToEarn.value > 0 || totalPointsToRedeem.value > 0)) {
    const updatedCustomer = {
      ...selectedCustomer.value,
      points: selectedCustomer.value.points + pointsToEarn.value - totalPointsToRedeem.value,
      totalSpent: selectedCustomer.value.totalSpent + total.value,
      ordersCount: selectedCustomer.value.ordersCount + 1,
      lastVisit: new Date().toISOString(),
    };
    updatedCustomer.tier = getTier(updatedCustomer.points);
    updateLoyaltyCustomer(updatedCustomer);
  }

  currentOrder.value = [];
  notes.value = '';
  clearCustomer();

  toast.success(payNow
    ? `Order #${created.orderNumber} paid and sent to the kitchen.`
    : `Order #${created.orderNumber} sent to the kitchen. It's waiting for payment.`);
}

// ── Unpaid orders ────────────────────────────────────────────────────────────
const unpaidOrders = computed(() =>
  state.orders
    .filter((o) => !o.paidAt && o.status !== 'cancelled')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
);
const unpaidMethod = ref({}); // orderId -> method
const payingId = ref(null);

async function takePayment(order) {
  if (payingId.value) return;
  const method = unpaidMethod.value[order.id] || 'cash';
  payingId.value = order.id;
  const payment = await payOrder(order.id, method);
  payingId.value = null;
  if (payment) toast.success(`Order #${order.orderNumber} paid by ${method}.`);
  else toast.error(state.orderError || `Payment for order #${order.orderNumber} didn't go through.`);
}

// ── Payment log (today) ──────────────────────────────────────────────────────
function isToday(value) {
  if (!value) return false;
  const d = new Date(value);
  const t = now.value;
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
const todaysOrders = computed(() =>
  state.orders
    .filter((o) => isToday(o.createdAt))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
);

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function orderWhere(o) {
  if (o.orderType === 'delivery') return 'Delivery';
  if (o.orderType === 'pickup') return 'Pickup';
  return o.tableNumber ? `Table ${o.tableNumber}` : 'Dine in';
}
function methodLabel(id) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label || '—';
}
function isMine(userId) {
  return userId != null && userId === auth.state.appUser?.id;
}

// ── Live updates ─────────────────────────────────────────────────────────────
let unsubscribeMenu = null;
let unsubscribeOrders = null;
let disposed = false;
onMounted(async () => {
  clock = setInterval(() => { now.value = new Date(); }, 60_000);
  try {
    const unsubscribe = await subscribeMenu(() => refreshMenu());
    if (disposed) unsubscribe();
    else unsubscribeMenu = unsubscribe;
  } catch (err) {
    console.warn('Live menu updates unavailable:', err);
  }
  try {
    const unsubscribe = await subscribeOrders({
      newOrder: (order) => {
        if (!state.orders.some((o) => o.id === order.id)) state.orders = [...state.orders, order];
      },
      orderPaid: (payment) => applyPayment(payment),
      orderStatusUpdated: ({ orderId, status }) => {
        state.orders = state.orders.map((o) => (o.id === orderId ? { ...o, status } : o));
      },
    });
    if (disposed) unsubscribe();
    else unsubscribeOrders = unsubscribe;
  } catch (err) {
    console.warn('Live order updates unavailable:', err);
  }
});
onUnmounted(() => {
  disposed = true;
  clearInterval(clock);
  if (unsubscribeMenu) unsubscribeMenu();
  if (unsubscribeOrders) unsubscribeOrders();
});
</script>

<template>
  <div class="c-page">
    <div class="c-head">
      <div>
        <h1 class="c-title">POS Terminal</h1>
        <p class="c-sub">Take orders and payments. Any cashier can take payment for an order.</p>
      </div>
      <div class="c-tabs" role="tablist" aria-label="POS sections">
        <button
          class="c-tab" :class="{ 'c-tab--active': tab === 'new' }"
          role="tab" :aria-selected="tab === 'new'" @click="tab = 'new'"
        >New order</button>
        <button
          class="c-tab" :class="{ 'c-tab--active': tab === 'unpaid' }"
          role="tab" :aria-selected="tab === 'unpaid'" @click="tab = 'unpaid'"
        >
          Unpaid
          <span v-if="unpaidOrders.length" class="pos-count c-num">{{ unpaidOrders.length }}</span>
        </button>
        <button
          class="c-tab" :class="{ 'c-tab--active': tab === 'log' }"
          role="tab" :aria-selected="tab === 'log'" @click="tab = 'log'"
        >Today's log</button>
      </div>
    </div>

    <!-- New order -->
    <div v-if="tab === 'new'" class="pos-grid">
      <section class="c-card pos-menu" aria-label="Menu">
        <div class="pos-chips">
          <UiChip
            v-for="category in categories"
            :key="category"
            :selected="selectedCategory === category"
            @click="selectedCategory = category"
          >{{ category }}</UiChip>
        </div>

        <p v-if="selectedCategory === BREAKFAST.category && closedForHours({ category: BREAKFAST.category })" class="c-notice c-notice--warning">
          Breakfast is served {{ BREAKFAST.label }}.
        </p>

        <div class="pos-items">
          <div
            v-for="item in filteredMenuItems"
            :key="item.id"
            class="pos-item"
            :class="{ 'pos-item--off': !item.available || item.soldOut || closedForHours(item) }"
          >
            <p class="pos-item__name">{{ item.name }}</p>
            <p class="c-caption c-muted">{{ item.category }}</p>
            <p class="pos-item__price c-num">${{ item.price.toFixed(2) }}</p>
            <div class="pos-item__actions">
              <UiButton
                variant="secondary"
                size="sm"
                class="pos-item__add"
                :disabled="!item.available || item.soldOut || closedForHours(item)"
                @click="addToOrder(item, false)"
              >{{ item.soldOut ? 'Sold out' : closedForHours(item) ? 'Not now' : 'Add' }}</UiButton>
              <UiButton
                v-if="item.pointsValue"
                variant="ghost"
                size="sm"
                :disabled="item.soldOut || closedForHours(item)"
                :aria-label="`Add ${item.name} for ${item.pointsValue} points`"
                @click="addToOrder(item, true)"
              >{{ item.pointsValue }} pts</UiButton>
            </div>
          </div>
        </div>
      </section>

      <section class="c-card pos-ticket" aria-label="Current order">
        <h2 class="c-section-title">Current order</h2>

        <div>
          <label class="c-label" for="pos-customer">Loyalty customer</label>
          <div v-if="selectedCustomer" class="pos-customer">
            <span>{{ selectedCustomer.name }} <span class="c-muted c-num">· {{ selectedCustomer.points }} pts</span></span>
            <button class="c-link" type="button" @click="clearCustomer">Change</button>
          </div>
          <template v-else>
            <input id="pos-customer" v-model="customerSearch" class="c-input" placeholder="Search by name or phone" />
            <div v-if="customerSearch" class="pos-customer-list">
              <button
                v-for="customer in filteredCustomers"
                :key="customer.id"
                type="button"
                class="pos-customer-option"
                @click="selectCustomer(customer)"
              >
                {{ customer.name }} <span class="c-muted c-num">{{ customer.points }} pts</span>
              </button>
              <p v-if="!filteredCustomers.length" class="c-small c-muted">No customer matches “{{ customerSearch }}”.</p>
            </div>
          </template>
        </div>

        <div class="pos-row2">
          <div>
            <label class="c-label" for="pos-table">Table</label>
            <input id="pos-table" v-model.number="tableNumber" type="number" min="1" class="c-input" />
          </div>
          <div>
            <label class="c-label" for="pos-pay">Payment</label>
            <select id="pos-pay" v-model="paymentMethod" class="c-select">
              <option v-for="m in PAYMENT_METHODS" :key="m.id" :value="m.id">{{ m.label }}</option>
            </select>
          </div>
        </div>

        <ul class="pos-lines">
          <li v-for="item in currentOrder" :key="posLineKey(item)" class="pos-line">
            <div class="pos-line__top">
              <p class="pos-line__name">{{ item.name }}</p>
              <button class="c-link c-link--danger" type="button" @click="removeItem(item)">Remove</button>
            </div>
            <div class="pos-line__bottom">
              <div class="pos-qty">
                <button type="button" class="pos-qty__btn" :aria-label="`One less ${item.name}`" @click="updateQuantity(item, -1)">−</button>
                <span class="c-num">{{ item.quantity }}</span>
                <button type="button" class="pos-qty__btn" :aria-label="`One more ${item.name}`" @click="updateQuantity(item, 1)">+</button>
              </div>
              <span class="c-small c-num">{{ item.paidWithPoints ? 'Points' : '$' + (item.price * item.quantity).toFixed(2) }}</span>
            </div>
          </li>
          <li v-if="!currentOrder.length" class="c-small c-muted pos-lines__empty">Tap a menu item to add it.</li>
        </ul>

        <textarea v-model="notes" rows="2" class="c-textarea" placeholder="Order notes" aria-label="Order notes" />

        <dl class="pos-totals">
          <div><dt>Subtotal</dt><dd class="c-num">${{ total.toFixed(2) }}</dd></div>
          <div><dt>Points earned</dt><dd class="c-num">{{ pointsToEarn }}</dd></div>
          <div><dt>Points redeemed</dt><dd class="c-num">{{ totalPointsToRedeem }}</dd></div>
        </dl>

        <div class="pos-actions">
          <UiButton variant="ghost" :disabled="!currentOrder.length" @click="currentOrder = []">Clear</UiButton>
          <UiButton variant="secondary" :disabled="placingOrder || !currentOrder.length" @click="placeOrder(false)">
            Send unpaid
          </UiButton>
          <UiButton variant="primary" :loading="placingOrder" :disabled="!currentOrder.length" @click="placeOrder(true)">
            Take payment · ${{ total.toFixed(2) }}
          </UiButton>
        </div>
      </section>
    </div>

    <!-- Unpaid -->
    <section v-else-if="tab === 'unpaid'" aria-label="Unpaid orders">
      <UiEmptyState
        v-if="!unpaidOrders.length"
        icon="check"
        title="Every order is paid"
        description="Orders sent unpaid from any terminal show up here."
      />
      <ul v-else class="unpaid-list">
        <li v-for="o in unpaidOrders" :key="o.id" class="c-card unpaid">
          <div class="unpaid__main">
            <p class="unpaid__num">Order #{{ o.orderNumber }} <span class="c-muted c-small">{{ orderWhere(o) }}<template v-if="o.customerName"> · {{ o.customerName }}</template></span></p>
            <p class="c-small c-muted">
              Entered by {{ isMine(o.createdByUserId) ? 'you' : o.createdByName || 'online customer' }} at {{ formatTime(o.createdAt) }}
              · {{ o.items.reduce((n, i) => n + i.quantity, 0) }} items
            </p>
          </div>
          <p class="unpaid__total c-num">${{ o.total.toFixed(2) }}</p>
          <div class="unpaid__pay">
            <select v-model="unpaidMethod[o.id]" class="c-select" :aria-label="`Payment method for order ${o.orderNumber}`">
              <option :value="undefined" disabled hidden>Cash</option>
              <option v-for="m in PAYMENT_METHODS" :key="m.id" :value="m.id">{{ m.label }}</option>
            </select>
            <UiButton variant="primary" :loading="payingId === o.id" @click="takePayment(o)">Take payment</UiButton>
          </div>
        </li>
      </ul>
    </section>

    <!-- Log -->
    <section v-else class="c-card c-card--flush" aria-label="Today's orders">
      <UiEmptyState v-if="!todaysOrders.length" icon="receipt" title="No orders yet today" />
      <div v-else class="c-table-wrap">
        <table class="c-table">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Entered by</th>
              <th scope="col">Paid by</th>
              <th scope="col">Method</th>
              <th scope="col">Status</th>
              <th scope="col" class="t-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in todaysOrders" :key="o.id">
              <td><span class="c-strong">#{{ o.orderNumber }}</span> <span class="c-muted">{{ formatTime(o.createdAt) }}</span></td>
              <td>{{ o.createdByName || 'Online customer' }}</td>
              <td>
                <template v-if="o.paidAt">{{ o.paidByName || '—' }} <span class="c-muted">{{ formatTime(o.paidAt) }}</span></template>
                <UiBadge v-else-if="o.status !== 'cancelled'" tone="warning">Unpaid</UiBadge>
                <span v-else class="c-muted">—</span>
              </td>
              <td>{{ o.paidAt ? methodLabel(o.paymentMethod) : '—' }}</td>
              <td class="t-cap">{{ o.status.replace(/_/g, ' ') }}</td>
              <td class="t-right c-num">${{ o.total.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ItemCustomizeSheet
      :open="sheetItemId != null"
      :item="sheetItem"
      confirm-label="Add to order"
      @close="sheetItemId = null"
      @confirm="onSheetConfirm"
    />
  </div>
</template>

<style scoped>
.pos-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);
  align-items: start;
}
@media (min-width: 1280px) {
  .pos-grid { grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr); }
  .pos-ticket { position: sticky; top: var(--space-6); }
}

.pos-menu { display: flex; flex-direction: column; gap: var(--space-4); }
.pos-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }

.pos-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-3);
}
.pos-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.pos-item--off { background: var(--surface-sunken); }
.pos-item--off .pos-item__name,
.pos-item--off .pos-item__price { color: var(--ink-subtle); }
.pos-item__name { margin: 0; font-weight: var(--weight-semibold); }
.pos-item__price {
  margin: var(--space-1) 0 var(--space-2);
  font-size: var(--text-h3);
  font-weight: var(--weight-bold);
  color: var(--primary-text);
}
.pos-item__actions { display: flex; gap: var(--space-1); margin-top: auto; }
.pos-item__add { flex: 1; }

.pos-ticket { display: flex; flex-direction: column; gap: var(--space-4); }
.pos-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }

.pos-customer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
}
.pos-customer-list {
  margin-top: var(--space-1);
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: var(--space-1);
}
.pos-customer-option {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.pos-customer-option:hover,
.pos-customer-option:focus-visible { background: var(--surface-sunken); outline: none; }

.pos-lines {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
  border-top: 1px solid var(--line);
}
.pos-line { padding: var(--space-3) 0; border-bottom: 1px solid var(--line); }
.pos-lines__empty { padding: var(--space-4) 0; }
.pos-line__top, .pos-line__bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}
.pos-line__name { margin: 0; font-weight: var(--weight-medium); }
.pos-line__bottom { margin-top: var(--space-2); }
.pos-qty { display: inline-flex; align-items: center; gap: var(--space-3); }
.pos-qty__btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font: inherit;
  cursor: pointer;
}
.pos-qty__btn:hover { background: var(--surface-sunken); }
.pos-qty__btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }

.pos-totals { margin: 0; display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-small); }
.pos-totals div { display: flex; justify-content: space-between; }
.pos-totals div:first-child { font-size: var(--text-body); font-weight: var(--weight-semibold); }
.pos-totals dt { color: var(--ink-muted); }
.pos-totals div:first-child dt { color: var(--ink); }
.pos-totals dd { margin: 0; }

.pos-actions { display: grid; grid-template-columns: auto 1fr; gap: var(--space-2); }
.pos-actions > :last-child { grid-column: 1 / -1; }

.unpaid-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.unpaid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
}
.unpaid__main p { margin: 0; }
.unpaid__num { font-weight: var(--weight-semibold); }
.unpaid__total { margin: 0; font-size: var(--text-h3); font-weight: var(--weight-bold); }
.unpaid__pay { grid-column: 1 / -1; display: flex; gap: var(--space-2); }
.unpaid__pay .c-select { width: auto; min-width: 110px; }
@media (min-width: 900px) {
  .unpaid { grid-template-columns: minmax(0, 1fr) auto auto; }
  .unpaid__pay { grid-column: auto; }
}

.pos-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary-text);
  font-size: var(--text-caption);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-align: center;
}
.c-tab--active .pos-count { background: var(--primary-ink); color: var(--primary-text); }

.t-right { text-align: right; }
.t-cap { text-transform: capitalize; }
</style>
