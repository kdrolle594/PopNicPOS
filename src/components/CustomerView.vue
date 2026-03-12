<script setup>
import { computed, ref } from 'vue';
import { usePosStore } from '../store/usePosStore';

const { state, addOrder } = usePosStore();

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
const deliveryAddress = ref('');
const deliveryInstructions = ref('');

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
  const name = (menuItem.name || '').toLowerCase();
  return name.includes('wings');
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
  return value
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
  if (selectedPizzaToppings.value.includes(toppingValue)) {
    selectedPizzaToppings.value = selectedPizzaToppings.value.filter((value) => value !== toppingValue);
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

  if (existing) {
    existing.quantity += 1;
    cart.value = [...cart.value];
    return;
  }

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
            ]
              .filter(Boolean)
              .join(' • ')
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
      if (item.menuItemId !== cartItem.menuItemId || optionSignature(item.options) !== optionSignature(cartItem.options)) {
        return item;
      }
      return { ...item, quantity: Math.max(1, item.quantity + delta) };
    })
    .filter((item) => item.quantity > 0);
}

function removeFromCart(cartItem) {
  cart.value = cart.value.filter(
    (item) => !(item.menuItemId === cartItem.menuItemId && optionSignature(item.options) === optionSignature(cartItem.options))
  );
}

function placeDeliveryOrder() {
  if (!customerName.value || !customerPhone.value || !deliveryAddress.value) {
    alert('Name, phone, and delivery address are required.');
    return;
  }

  if (!cart.value.length) {
    alert('Please add items to your cart first.');
    return;
  }

  const nextOrderNumber = state.orders.length ? Math.max(...state.orders.map((order) => order.orderNumber)) + 1 : 1;

  addOrder({
    id: Date.now().toString(),
    orderNumber: nextOrderNumber,
    items: cart.value,
    total: cartTotal.value,
    status: 'pending',
    orderType: 'delivery',
    customerName: customerName.value,
    customerPhone: customerPhone.value,
    deliveryAddress: deliveryAddress.value,
    notes: deliveryInstructions.value || undefined,
    createdAt: new Date().toISOString(),
    paymentMethod: 'digital',
  });

  alert(`Delivery order #${nextOrderNumber} placed successfully!`);

  cart.value = [];
  deliveryInstructions.value = '';

  activeTab.value = 'track';
  trackOrderNumber.value = String(nextOrderNumber);
  trackPhone.value = customerPhone.value;
  findOrder();
}

function findOrder() {
  const orderNumber = Number(trackOrderNumber.value);
  if (!orderNumber || !trackPhone.value) {
    alert('Enter order number and phone to track your delivery.');
    return;
  }

  const phone = String(trackPhone.value).trim();

  trackedOrder.value =
    [...state.orders]
      .reverse()
      .find(
        (order) =>
          order.orderType === 'delivery' &&
          order.orderNumber === orderNumber &&
          String(order.customerPhone || '').trim() === phone
      ) || null;

  if (!trackedOrder.value) {
    alert('No matching delivery order found.');
  }
}

const statusLabelMap = {
  pending: 'Order Received',
  preparing: 'Preparing',
  ready: 'Out for Delivery',
  completed: 'Delivered',
  cancelled: 'Cancelled',
};

const progressPercent = computed(() => {
  if (!trackedOrder.value) return 0;
  const status = trackedOrder.value.status;
  if (status === 'pending') return 25;
  if (status === 'preparing') return 50;
  if (status === 'ready') return 75;
  if (status === 'completed') return 100;
  return 0;
});
</script>

<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-3xl font-bold">Customer Delivery</h1>
      <p class="text-gray-500">Place and track delivery orders</p>
    </div>

    <div class="flex gap-2">
      <button
        class="px-4 py-2 rounded border"
        :class="activeTab === 'order' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'"
        @click="activeTab = 'order'"
      >
        Place Delivery Order
      </button>
      <button
        class="px-4 py-2 rounded border"
        :class="activeTab === 'track' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'"
        @click="activeTab = 'track'"
      >
        Track Delivery
      </button>
    </div>

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
        <h2 class="font-semibold">Delivery Details</h2>

        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1">Name *</label>
            <input v-model="customerName" class="w-full border rounded px-3 py-2" placeholder="Enter full name" />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Phone *</label>
            <input v-model="customerPhone" class="w-full border rounded px-3 py-2" placeholder="Enter phone" />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Delivery Address *</label>
            <textarea
              v-model="deliveryAddress"
              rows="3"
              class="w-full border rounded px-3 py-2"
              placeholder="Street, city, zip"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Instructions</label>
            <textarea
              v-model="deliveryInstructions"
              rows="2"
              class="w-full border rounded px-3 py-2"
              placeholder="Gate code, leave at door, etc."
            />
          </div>
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

          <button class="w-full px-3 py-2 rounded bg-blue-600 text-white" @click="placeDeliveryOrder">Place Delivery Order</button>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'track'" class="bg-white border rounded-xl p-4 space-y-4 max-w-2xl">
      <h2 class="font-semibold">Track Delivery Order</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium mb-1">Order Number *</label>
          <input v-model="trackOrderNumber" type="number" min="1" class="w-full border rounded px-3 py-2" placeholder="e.g. 1042" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Phone Number *</label>
          <input v-model="trackPhone" class="w-full border rounded px-3 py-2" placeholder="Same phone used on order" />
        </div>
      </div>

      <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="findOrder">Track Order</button>

      <div v-if="trackedOrder" class="border rounded-lg p-4 space-y-3">
        <div class="flex items-start justify-between">
          <div>
            <p class="font-semibold">Order #{{ trackedOrder.orderNumber }}</p>
            <p class="text-sm text-gray-500">{{ trackedOrder.customerName }} • {{ trackedOrder.customerPhone }}</p>
          </div>
          <span class="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
            {{ statusLabelMap[trackedOrder.status] || trackedOrder.status }}
          </span>
        </div>

        <div>
          <p class="text-sm font-medium">Delivery Address</p>
          <p class="text-sm text-gray-600">{{ trackedOrder.deliveryAddress || 'N/A' }}</p>
        </div>

        <div>
          <p class="text-sm font-medium mb-1">Progress</p>
          <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full bg-blue-600 transition-all" :style="{ width: `${progressPercent}%` }" />
          </div>
          <p class="text-xs text-gray-500 mt-1">{{ progressPercent }}% complete</p>
        </div>

        <div>
          <p class="text-sm font-medium mb-1">Items</p>
          <div class="space-y-1">
            <div v-for="(item, index) in trackedOrder.items" :key="index" class="text-sm flex justify-between">
              <span>{{ item.name }} ×{{ item.quantity }}</span>
              <span>${{ (item.price * item.quantity).toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <div class="text-sm flex justify-between border-t pt-2">
          <span>Total</span>
          <span class="font-semibold">${{ trackedOrder.total.toFixed(2) }}</span>
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
            <label v-for="topping in pizzaToppingOptions" :key="topping.value" class="flex items-center gap-2 border rounded px-3 py-2 text-sm cursor-pointer">
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
          <button class="px-3 py-2 bg-blue-600 text-white rounded" @click="confirmCustomization">Add to Cart</button>
        </div>
      </div>
    </div>
  </div>
</template>
