import { reactive, computed, watch } from 'vue';

const STORAGE_KEY = 'popnic.cart.v1';

export function optionSignature(options = {}) {
  return JSON.stringify({
    pizzaSize: options.pizzaSize || null,
    pizzaStyle: options.pizzaStyle || null,
    pizzaToppings: (options.pizzaToppings || []).slice().sort(),
    wingFlavor: options.wingFlavor || null,
    sodaFlavor: options.sodaFlavor || null,
  });
}

const EMPTY = () => ({
  items: [],
  orderType: 'delivery',
  deliveryInstructions: '',
  deliveryLat: null,
  deliveryLng: null,
  phone: '',
  pendingCheckout: false,
});

function readStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(snapshot) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Private browsing or blocked site data — the cart stays in memory.
  }
}

let storeInstance;

export function useCartStore() {
  if (storeInstance) return storeInstance;

  const state = reactive({ ...EMPTY(), ...(readStorage() || {}) });

  watch(state, () => writeStorage({ ...state }), { deep: true });

  const itemCount = computed(() => state.items.reduce((n, i) => n + i.quantity, 0));
  const total = computed(() =>
    Number(state.items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2))
  );

  function addLine({ menuItemId, name, price, options = {}, notes }) {
    const signature = optionSignature(options);
    const existing = state.items.find(
      (i) => i.menuItemId === menuItemId && optionSignature(i.options) === signature
    );
    if (existing) {
      existing.quantity += 1;
      return;
    }
    state.items.push({ menuItemId, name, price, options, notes, quantity: 1 });
  }

  function setQuantity(line, quantity) {
    const signature = optionSignature(line.options);
    if (quantity <= 0) return removeLine(line);
    const target = state.items.find(
      (i) => i.menuItemId === line.menuItemId && optionSignature(i.options) === signature
    );
    if (target) target.quantity = quantity;
  }

  function removeLine(line) {
    const signature = optionSignature(line.options);
    state.items = state.items.filter(
      (i) => !(i.menuItemId === line.menuItemId && optionSignature(i.options) === signature)
    );
  }

  function clear() {
    Object.assign(state, EMPTY());
  }

  function beginCheckout() {
    state.pendingCheckout = true;
    // Written synchronously — the Auth0 redirect may fire before the watcher.
    writeStorage({ ...state });
  }

  function consumePendingCheckout() {
    const was = state.pendingCheckout;
    state.pendingCheckout = false;
    writeStorage({ ...state });
    return was;
  }

  function reconcileWithMenu(menuItems) {
    const live = new Map(menuItems.map((m) => [m.id, m]));
    const removed = [];
    state.items = state.items.filter((line) => {
      const match = live.get(line.menuItemId);
      if (!match || match.available === false) {
        removed.push(line.name);
        return false;
      }
      return true;
    });
    return { removed };
  }

  storeInstance = {
    state, itemCount, total,
    addLine, setQuantity, removeLine, clear,
    beginCheckout, consumePendingCheckout, reconcileWithMenu,
  };
  return storeInstance;
}
