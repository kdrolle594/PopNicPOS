import { reactive, computed, watch } from 'vue';
import { lineSignature, validateSelection, linePrice, lineLabel } from '../../shared/menuOptions.js';

const STORAGE_KEY = 'popnic.cart.v2';
// v1 lines stored hard-coded option fields; they cannot be priced any more.
const LEGACY_KEYS = ['popnic.cart.v1'];

function sig(line) {
  return lineSignature(line.menuItemId, line.choiceIds || []);
}

function dropLegacyCarts() {
  let dropped = false;
  for (const key of LEGACY_KEYS) {
    try {
      if (sessionStorage.getItem(key) != null) {
        sessionStorage.removeItem(key);
        dropped = true;
      }
    } catch {
      // Storage blocked — nothing to drop.
    }
  }
  return dropped;
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

  let resetNotice = dropLegacyCarts();

  const state = reactive({ ...EMPTY(), ...(readStorage() || {}) });

  watch(state, () => writeStorage({ ...state }), { deep: true });

  const itemCount = computed(() => state.items.reduce((n, i) => n + i.quantity, 0));
  const total = computed(() =>
    Number(state.items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2))
  );

  function addLine({ menuItemId, name, price, choiceIds = [], notes }) {
    const line = { menuItemId, name, price, choiceIds: [...choiceIds], notes, quantity: 1 };
    const existing = state.items.find((i) => sig(i) === sig(line));
    if (existing) {
      existing.quantity += 1;
      return;
    }
    state.items.push(line);
  }

  function setQuantity(line, quantity) {
    if (quantity <= 0) return removeLine(line);
    const target = state.items.find((i) => sig(i) === sig(line));
    if (target) target.quantity = quantity;
  }

  function removeLine(line) {
    state.items = state.items.filter((i) => sig(i) !== sig(line));
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
      const baseOk = Boolean(match) && match.available !== false && !match.soldOut;
      const ok = baseOk && validateSelection(match, line.choiceIds || []).ok;
      if (!ok) {
        // Use the line's own name here — it's about to be dropped, so it's
        // never re-labelled below.
        removed.push(line.name);
        return false;
      }
      // A live price or option-name change should be reflected on a kept
      // line rather than left stale until the next add.
      line.price = linePrice(match, line.choiceIds);
      line.name = lineLabel(match, line.choiceIds);
      return true;
    });
    return { removed };
  }

  function consumeResetNotice() {
    const was = resetNotice;
    resetNotice = false;
    return was;
  }

  storeInstance = {
    state, itemCount, total,
    addLine, setQuantity, removeLine, clear,
    beginCheckout, consumePendingCheckout, reconcileWithMenu, consumeResetNotice,
  };
  return storeInstance;
}
