<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { usePosStore } from '../store/usePosStore';
import { subscribeMenu } from '../lib/realtime.js';
import {
  needsCustomization, defaultSelection, validateSelection, linePrice, lineLabel,
  pruneSelection, toggleChoice, groupHint, formatPriceDelta, lineSignature,
} from '../../shared/menuOptions.js';

const { state, addOrder, updateLoyaltyCustomer, getTier, refreshMenu } = usePosStore();

const currentOrder = ref([]);
const tableNumber = ref(1);
const customerName = ref('');
const notes = ref('');
const selectedCategory = ref('All');
const paymentMethod = ref('cash');
const selectedCustomerId = ref('');
const customerSearch = ref('');
const customizationOpen = ref(false);
const placingOrder = ref(false);
const pendingUsePoints = ref(false);

const pendingMenuItemId = ref(null);
// Read through the store so a live refresh updates the open modal.
const pendingMenuItem = computed(
  () => state.menuItems.find((i) => i.id === pendingMenuItemId.value) || null
);
const selectedChoiceIds = ref([]);
const customizeNotice = ref('');

const customizeValidation = computed(() =>
  pendingMenuItem.value ? validateSelection(pendingMenuItem.value, selectedChoiceIds.value) : { ok: false, errors: [] }
);

watch(pendingMenuItem, (next, prev) => {
  if (!next || !prev || next.id !== prev.id) return;
  const { choiceIds, dropped } = pruneSelection(next, selectedChoiceIds.value, prev);
  if (dropped.length) {
    selectedChoiceIds.value = choiceIds;
    customizeNotice.value = `${dropped.join(', ')} just sold out.`;
  }
});

function groupErrorFor(group) {
  return customizeValidation.value.errors.find((e) => e.groupId === group.id)?.message || '';
}

function pickChoice(choiceId) {
  selectedChoiceIds.value = toggleChoice(pendingMenuItem.value, selectedChoiceIds.value, choiceId);
}

function posLineKey(line) {
  return `${line.paidWithPoints ? 'pts' : 'cash'}|${lineSignature(line.menuItemId, line.choiceIds || [])}`;
}

let unsubscribeMenu = null;
let disposed = false;
onMounted(async () => {
  try {
    const unsubscribe = await subscribeMenu(() => refreshMenu());
    if (disposed) unsubscribe();
    else unsubscribeMenu = unsubscribe;
  } catch (err) {
    console.warn('Live menu updates unavailable:', err);
  }
});
onUnmounted(() => {
  disposed = true;
  if (unsubscribeMenu) unsubscribeMenu();
});

const categories = computed(() => ['All', ...new Set(state.menuItems.map((item) => item.category))]);

const filteredMenuItems = computed(() => {
  if (selectedCategory.value === 'All') return state.menuItems;
  return state.menuItems.filter((item) => item.category === selectedCategory.value);
});

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

const pointsToEarn = computed(() => Math.floor(total.value / 10));

const totalPointsToRedeem = computed(() =>
  currentOrder.value.reduce((sum, orderItem) => {
    if (!orderItem.paidWithPoints) return sum;
    const menuItem = state.menuItems.find((item) => item.id === orderItem.menuItemId);
    return sum + (menuItem?.pointsValue || 0) * orderItem.quantity;
  }, 0)
);

function addConfiguredToOrder(menuItem, usePoints = false, choiceIds = []) {
  if (!menuItem.available || menuItem.soldOut) return;

  if (usePoints) {
    if (!selectedCustomer.value) {
      alert('Select a loyalty customer first.');
      return;
    }
    if (!menuItem.pointsValue || selectedCustomer.value.points < menuItem.pointsValue) {
      alert('Not enough points for this item.');
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
  pendingMenuItemId.value = menuItem.id;
  pendingUsePoints.value = usePoints;
  selectedChoiceIds.value = defaultSelection(menuItem);
  customizeNotice.value = '';
  customizationOpen.value = true;
}

function confirmCustomization() {
  if (!pendingMenuItem.value || !customizeValidation.value.ok) return;
  addConfiguredToOrder(pendingMenuItem.value, pendingUsePoints.value, selectedChoiceIds.value);
  customizationOpen.value = false;
  pendingMenuItemId.value = null;
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

async function placeOrder() {
  if (placingOrder.value) return;
  if (!currentOrder.value.length) {
    alert('Please add items to the order.');
    return;
  }

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
      total: total.value,
      status: 'pending',
      tableNumber: Number(tableNumber.value),
      customerName: customerName.value || selectedCustomer.value?.name,
      customerId: selectedCustomerId.value || undefined,
      paymentMethod: paymentMethod.value,
      createdAt: new Date().toISOString(),
      notes: notes.value || undefined,
      pointsEarned: pointsToEarn.value,
      pointsRedeemed: totalPointsToRedeem.value,
    });
  } finally {
    placingOrder.value = false;
  }

  if (!created) {
    alert(state.orderError || 'Failed to place order. Please try again.');
    await refreshMenu();
    return;
  }

  currentOrder.value = [];
  notes.value = '';
  customerName.value = '';
  selectedCustomerId.value = '';

  alert(`Order #${created.orderNumber} placed successfully.`);
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-3xl font-bold">POS Terminal</h1>
      <p class="text-gray-500">Take orders and process payments</p>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div class="xl:col-span-2 bg-white border rounded-xl p-4 space-y-4">
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
          <div v-for="item in filteredMenuItems" :key="item.id" class="border rounded-lg p-3 space-y-2">
            <p class="font-medium text-sm">{{ item.name }}</p>
            <p class="text-xs text-gray-500">{{ item.category }}</p>
            <p class="text-lg font-bold text-blue-600">${{ item.price.toFixed(2) }}</p>
            <div class="flex gap-1">
              <button
                class="flex-1 px-2 py-1 rounded border text-sm"
                :class="item.available && !item.soldOut ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'"
                :disabled="!item.available || item.soldOut"
                @click="addToOrder(item, false)"
              >
                {{ item.soldOut ? 'Sold out' : 'Add' }}
              </button>
              <button
                v-if="item.pointsValue"
                class="px-2 py-1 rounded border text-sm bg-amber-50 border-amber-300"
                :disabled="item.soldOut"
                @click="addToOrder(item, true)"
              >
                {{ item.pointsValue }} pts
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white border rounded-xl p-4 space-y-4">
        <h2 class="font-semibold">Current Order</h2>

        <div class="space-y-2">
          <label class="text-sm">Loyalty Customer</label>
          <input v-model="customerSearch" class="w-full border rounded px-3 py-2" placeholder="Search by name or phone" />
          <div v-if="customerSearch" class="max-h-36 overflow-y-auto border rounded p-2 space-y-1">
            <button
              v-for="customer in filteredCustomers"
              :key="customer.id"
              class="w-full text-left px-2 py-1 rounded hover:bg-gray-50 text-sm"
              @click="selectCustomer(customer)"
            >
              {{ customer.name }} · {{ customer.points }} pts
            </button>
          </div>
          <p v-if="selectedCustomer" class="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Selected: {{ selectedCustomer.name }} ({{ selectedCustomer.points }} pts)
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-sm">Table</label>
            <input v-model.number="tableNumber" type="number" min="1" class="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label class="text-sm">Payment</label>
            <select v-model="paymentMethod" class="w-full border rounded px-3 py-2 bg-white">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="digital">Digital</option>
            </select>
          </div>
        </div>

        <div class="space-y-2 max-h-52 overflow-y-auto">
          <div
            v-for="item in currentOrder"
            :key="posLineKey(item)"
            class="border rounded p-2"
          >
            <div class="flex justify-between gap-2">
              <p class="text-sm font-medium">{{ item.name }}</p>
              <button class="text-xs text-red-600" @click="removeItem(item)">Remove</button>
            </div>
            <p class="text-xs text-gray-500">{{ item.paidWithPoints ? 'Paid with points' : '$' + item.price.toFixed(2) }}</p>
            <div class="flex items-center gap-2 mt-1">
              <button class="px-2 py-1 border rounded" @click="updateQuantity(item, -1)">-</button>
              <span class="text-sm">{{ item.quantity }}</span>
              <button class="px-2 py-1 border rounded" @click="updateQuantity(item, 1)">+</button>
            </div>
          </div>
          <p v-if="!currentOrder.length" class="text-sm text-gray-500">No items added yet.</p>
        </div>

        <textarea
          v-model="notes"
          rows="3"
          class="w-full border rounded px-3 py-2"
          placeholder="Order notes"
        />

        <div class="rounded-lg bg-gray-50 border p-3 space-y-1 text-sm">
          <p class="flex justify-between"><span>Subtotal</span><span>${{ total.toFixed(2) }}</span></p>
          <p class="flex justify-between"><span>Points Earned</span><span>{{ pointsToEarn }}</span></p>
          <p class="flex justify-between"><span>Points Redeemed</span><span>{{ totalPointsToRedeem }}</span></p>
        </div>

        <div class="flex gap-2">
          <button class="flex-1 px-3 py-2 rounded border" @click="currentOrder = []">Clear</button>
          <button
            class="flex-1 px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
            :disabled="placingOrder"
            @click="placeOrder"
          >{{ placingOrder ? 'Placing…' : 'Place Order' }}</button>
        </div>
      </div>
    </div>

    <div v-if="customizationOpen" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl border w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <h2 class="text-lg font-semibold p-4 border-b">Customize {{ pendingMenuItem?.name }}</h2>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <p v-if="pendingMenuItem?.soldOut" class="text-sm rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2">
            {{ pendingMenuItem.name }} just sold out.
          </p>
          <p v-else-if="customizeNotice" class="text-sm rounded border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
            {{ customizeNotice }}
          </p>

          <div v-for="group in pendingMenuItem?.optionGroups || []" :key="group.id">
            <div class="flex items-baseline justify-between mb-2">
              <p class="text-sm font-medium">{{ group.name }}</p>
              <span class="text-xs text-gray-500">{{ groupHint(group) }}</span>
            </div>
            <div :class="group.maxSelect === 1 ? 'space-y-2' : 'grid grid-cols-2 gap-2'">
              <label
                v-for="choice in group.choices"
                :key="choice.id"
                class="flex items-center justify-between gap-2 border rounded px-3 py-2 text-sm cursor-pointer"
                :class="selectedChoiceIds.includes(choice.id) ? 'bg-blue-50 border-blue-300' : ''"
              >
                <span>{{ choice.name }}</span>
                <span class="flex items-center gap-2">
                  <span v-if="choice.priceDelta" class="text-xs text-gray-500">{{ formatPriceDelta(choice.priceDelta) }}</span>
                  <input
                    :type="group.maxSelect === 1 ? 'radio' : 'checkbox'"
                    :name="`pos-group-${group.id}`"
                    :checked="selectedChoiceIds.includes(choice.id)"
                    @click.prevent="pickChoice(choice.id)"
                  />
                </span>
              </label>
            </div>
            <p v-if="groupErrorFor(group)" class="text-xs text-red-600 mt-1">{{ groupErrorFor(group) }}</p>
          </div>
        </div>

        <div class="flex justify-end gap-2 p-4 border-t">
          <button class="px-3 py-2 border rounded" @click="customizationOpen = false">Cancel</button>
          <button
            class="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
            :disabled="!customizeValidation.ok || pendingMenuItem?.soldOut"
            @click="confirmCustomization"
          >Add to Order</button>
        </div>
      </div>
    </div>
  </div>
</template>
