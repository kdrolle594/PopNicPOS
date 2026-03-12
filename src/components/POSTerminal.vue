<script setup>
import { computed, ref } from 'vue';
import { usePosStore } from '../store/usePosStore';

const { state, addOrder, updateLoyaltyCustomer, getTier } = usePosStore();

const currentOrder = ref([]);
const tableNumber = ref(1);
const customerName = ref('');
const notes = ref('');
const selectedCategory = ref('All');
const paymentMethod = ref('cash');
const selectedCustomerId = ref('');
const customerSearch = ref('');
const customizationOpen = ref(false);
const pendingMenuItem = ref(null);
const pendingUsePoints = ref(false);
const selectedPizzaSize = ref('medium');
const selectedPizzaStyle = ref('custom');
const selectedPizzaToppings = ref([]);
const selectedWingFlavor = ref('buffalo');
const selectedSodaFlavor = ref('coke cola');

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
  {
    value: 'hawaiian',
    label: 'Hawaiian',
    toppings: ['ham', 'pineapple'],
  },
  {
    value: 'meat lovers',
    label: 'Meat Lovers',
    toppings: ['pepperoni', 'sausage', 'bacon', 'ham'],
  },
  {
    value: 'veggie',
    label: 'Veggie',
    toppings: ['mushrooms', 'onions', 'bell peppers', 'black olives', 'tomatoes'],
  },
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

const filteredMenuItems = computed(() => {
  if (selectedCategory.value === 'All') return state.menuItems;
  return state.menuItems.filter((item) => item.category === selectedCategory.value);
});

const selectedCustomer = computed(() => state.loyaltyCustomers.find((c) => c.id === selectedCustomerId.value));

const filteredCustomers = computed(() => {
  if (!customerSearch.value) return state.loyaltyCustomers;
  return state.loyaltyCustomers.filter((customer) =>
    customer.name.toLowerCase().includes(customerSearch.value.toLowerCase()) || customer.phone.includes(customerSearch.value)
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

function isPizzaItem(menuItem) {
  const name = (menuItem.name || '').toLowerCase();
  const category = (menuItem.category || '').toLowerCase();
  return name.includes('pizza') || category.includes('pizza');
}

function isWingsItem(menuItem) {
  const name = (menuItem.name || '').toLowerCase();
  return name.includes('wings');
}

function isSodaItem(menuItem) {
  const name = (menuItem.name || '').toLowerCase();
  return (
    name.includes('soda') ||
    name.includes('cola') ||
    name.includes('coke') ||
    name.includes('sprite') ||
    name.includes('root beer')
  );
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

function calculateCustomPrice(menuItem, usePoints, options = {}) {
  if (usePoints) return 0;

  let price = Number(menuItem.price || 0);
  if (options.pizzaSize) {
    const sizeOption = pizzaSizeOptions.find((s) => s.value === options.pizzaSize);
    price += sizeOption?.priceDelta || 0;
  }

  return Math.max(0, Number(price.toFixed(2)));
}

function buildDisplayName(menuItem, options = {}) {
  const details = [];
  if (options.pizzaSize) details.push(options.pizzaSize);
  if (options.pizzaStyle && options.pizzaStyle !== 'custom') details.push(options.pizzaStyle);
  if (options.pizzaToppings?.length) details.push(`${options.pizzaToppings.length} toppings`);
  if (options.wingFlavor) details.push(options.wingFlavor);
  if (options.sodaFlavor) details.push(options.sodaFlavor);
  if (!details.length) return menuItem.name;
  return `${menuItem.name} (${details.join(', ')})`;
}

function formatToppingLabel(value) {
  return value
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function applyPizzaPreset(styleValue) {
  if (styleValue === 'custom') {
    selectedPizzaStyle.value = 'custom';
    return;
  }

  const preset = pizzaPresetStyles.find((style) => style.value === styleValue);
  if (!preset) return;

  selectedPizzaStyle.value = preset.value;
  selectedPizzaToppings.value = [...preset.toppings];
}

function togglePizzaTopping(toppingValue) {
  const exists = selectedPizzaToppings.value.includes(toppingValue);
  if (exists) {
    selectedPizzaToppings.value = selectedPizzaToppings.value.filter((value) => value !== toppingValue);
  } else {
    selectedPizzaToppings.value = [...selectedPizzaToppings.value, toppingValue];
  }

  selectedPizzaStyle.value = 'custom';
}

function addConfiguredToOrder(menuItem, usePoints = false, options = {}) {
  if (!menuItem.available) return;

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

  const signature = optionSignature(options);

  const existing = currentOrder.value.find(
    (item) =>
      item.menuItemId === menuItem.id &&
      Boolean(item.paidWithPoints) === Boolean(usePoints) &&
      optionSignature(item.options) === signature
  );

  if (existing) {
    existing.quantity += 1;
    currentOrder.value = [...currentOrder.value];
    return;
  }

  currentOrder.value = [
    ...currentOrder.value,
    {
      menuItemId: menuItem.id,
      name: buildDisplayName(menuItem, options),
      quantity: 1,
      price: calculateCustomPrice(menuItem, usePoints, options),
      paidWithPoints: usePoints,
      options,
      notes:
        options.pizzaSize || options.pizzaStyle || options.pizzaToppings?.length || options.wingFlavor || options.sodaFlavor
          ? [
              options.pizzaSize ? `Size: ${options.pizzaSize}` : null,
              options.pizzaStyle ? `Style: ${options.pizzaStyle}` : null,
              options.pizzaToppings?.length ? `Toppings: ${options.pizzaToppings.map(formatToppingLabel).join(', ')}` : null,
              options.wingFlavor ? `Wings Flavor: ${options.wingFlavor}` : null,
              options.sodaFlavor ? `Soda Flavor: ${options.sodaFlavor}` : null,
            ]
              .filter(Boolean)
              .join(' • ')
          : undefined,
    },
  ];
}

function addToOrder(menuItem, usePoints = false) {
  const needsSize = isPizzaItem(menuItem);
  const needsFlavor = isWingsItem(menuItem);
  const needsSodaFlavor = isSodaItem(menuItem);

  if (!needsSize && !needsFlavor && !needsSodaFlavor) {
    addConfiguredToOrder(menuItem, usePoints);
    return;
  }

  pendingMenuItem.value = menuItem;
  pendingUsePoints.value = usePoints;
  selectedPizzaSize.value = 'medium';
  selectedPizzaStyle.value = 'custom';
  selectedPizzaToppings.value = [];
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

  addConfiguredToOrder(pendingMenuItem.value, pendingUsePoints.value, options);
  customizationOpen.value = false;
  pendingMenuItem.value = null;
}

function updateQuantity(orderItem, delta) {
  const updated = currentOrder.value
    .map((item) => {
      if (
        item.menuItemId !== orderItem.menuItemId ||
        Boolean(item.paidWithPoints) !== Boolean(orderItem.paidWithPoints) ||
        optionSignature(item.options) !== optionSignature(orderItem.options)
      ) {
        return item;
      }
      return { ...item, quantity: Math.max(1, item.quantity + delta) };
    })
    .filter((item) => item.quantity > 0);

  currentOrder.value = updated;
}

function removeItem(orderItem) {
  currentOrder.value = currentOrder.value.filter(
    (item) =>
      !(
        item.menuItemId === orderItem.menuItemId &&
        Boolean(item.paidWithPoints) === Boolean(orderItem.paidWithPoints) &&
        optionSignature(item.options) === optionSignature(orderItem.options)
      )
  );
}

function selectCustomer(customer) {
  selectedCustomerId.value = customer.id;
  customerName.value = customer.name;
  customerSearch.value = '';
}

function placeOrder() {
  if (!currentOrder.value.length) {
    alert('Please add items to the order.');
    return;
  }

  const nextOrderNumber = state.orders.length ? Math.max(...state.orders.map((order) => order.orderNumber)) + 1 : 1;

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

  addOrder({
    id: Date.now().toString(),
    orderNumber: nextOrderNumber,
    items: currentOrder.value,
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

  currentOrder.value = [];
  notes.value = '';
  customerName.value = '';
  selectedCustomerId.value = '';

  alert(`Order #${nextOrderNumber} placed successfully.`);
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
                :class="item.available ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'"
                :disabled="!item.available"
                @click="addToOrder(item, false)"
              >
                Add
              </button>
              <button
                v-if="item.pointsValue"
                class="px-2 py-1 rounded border text-sm bg-amber-50 border-amber-300"
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
            :key="`${item.menuItemId}-${item.paidWithPoints ? 'pts' : 'cash'}-${optionSignature(item.options)}`"
            class="border rounded p-2"
          >
            <div class="flex justify-between gap-2">
              <p class="text-sm font-medium">{{ item.name }}</p>
              <button class="text-xs text-red-600" @click="removeItem(item)">Remove</button>
            </div>
            <p class="text-xs text-gray-500">{{ item.paidWithPoints ? 'Paid with points' : '$' + item.price.toFixed(2) }}</p>
            <p v-if="item.notes" class="text-xs text-gray-500">{{ item.notes }}</p>
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
          <button class="flex-1 px-3 py-2 rounded bg-blue-600 text-white" @click="placeOrder">Place Order</button>
        </div>
      </div>
    </div>

    <div v-if="customizationOpen" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl border w-full max-w-md p-4 space-y-4">
        <h2 class="text-lg font-semibold">Customize {{ pendingMenuItem?.name }}</h2>

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
            >
              Custom
            </button>
            <button
              v-for="style in pizzaPresetStyles"
              :key="style.value"
              class="px-3 py-2 border rounded text-sm"
              :class="selectedPizzaStyle === style.value ? 'bg-blue-50 border-blue-300 text-blue-700' : ''"
              @click="applyPizzaPreset(style.value)"
            >
              {{ style.label }}
            </button>
          </div>

          <label class="block text-sm font-medium mt-4 mb-2">Toppings</label>
          <div class="grid grid-cols-2 gap-2">
            <label
              v-for="topping in pizzaToppingOptions"
              :key="topping.value"
              class="flex items-center gap-2 border rounded px-3 py-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="selectedPizzaToppings.includes(topping.value)"
                @change="togglePizzaTopping(topping.value)"
              />
              {{ topping.label }}
            </label>
          </div>
        </div>

        <div v-if="pendingMenuItem && isWingsItem(pendingMenuItem)">
          <label class="block text-sm font-medium mb-2">Wings Flavor</label>
          <select v-model="selectedWingFlavor" class="w-full border rounded px-3 py-2 bg-white">
            <option v-for="flavor in wingFlavorOptions" :key="flavor.value" :value="flavor.value">
              {{ flavor.label }}
            </option>
          </select>
        </div>

        <div v-if="pendingMenuItem && isSodaItem(pendingMenuItem)">
          <label class="block text-sm font-medium mb-2">Soda Flavor</label>
          <select v-model="selectedSodaFlavor" class="w-full border rounded px-3 py-2 bg-white">
            <option v-for="flavor in sodaFlavorOptions" :key="flavor.value" :value="flavor.value">
              {{ flavor.label }}
            </option>
          </select>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button class="px-3 py-2 border rounded" @click="customizationOpen = false">Cancel</button>
          <button class="px-3 py-2 bg-blue-600 text-white rounded" @click="confirmCustomization">Add to Order</button>
        </div>
      </div>
    </div>
  </div>
</template>
