import { reactive } from 'vue';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTier(points) {
  if (points >= 1000) return 'platinum';
  if (points >= 500) return 'gold';
  if (points >= 250) return 'silver';
  return 'bronze';
}

async function api(path, options = {}) {
  const base = import.meta.env.VITE_API_URL || '';

  // Attach Auth0 access token when available
  let authHeader = {};
  try {
    const { useAuthStore } = await import('./useAuthStore.js');
    const auth = useAuthStore();
    if (auth.isAuthenticated.value) {
      const token = await auth.getToken();
      authHeader = { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Not authenticated or store not ready — proceed without token (public routes)
  }

  const res = await fetch(`${base}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Singleton store ────────────────────────────────────────────────────────────

let storeInstance;

export function usePosStore() {
  if (storeInstance) return storeInstance;

  const state = reactive({
    menuItems: [],
    inventoryItems: [],
    orders: [],
    loyaltyCustomers: [],
    loading: true,
  });

  // Fetch all collections from the API on first access. Some endpoints are
  // role-gated (inventory + customers are manager+), so use allSettled and
  // tolerate 403s — the view that would need the data is role-gated anyway.
  async function loadAll() {
    const results = await Promise.allSettled([
      api('/menu-items'),
      api('/inventory-items'),
      api('/orders'),
      api('/customers'),
    ]);
    const [menuItems, inventoryItems, orders, loyaltyCustomers] = results;
    if (menuItems.status === 'fulfilled')        state.menuItems = menuItems.value;
    if (inventoryItems.status === 'fulfilled')   state.inventoryItems = inventoryItems.value;
    if (orders.status === 'fulfilled')           state.orders = orders.value;
    if (loyaltyCustomers.status === 'fulfilled') state.loyaltyCustomers = loyaltyCustomers.value;
    state.loading = false;
  }
  loadAll();

  // ── Menu Items ─────────────────────────────────────────────────────────────

  async function addMenuItem(item) {
    try {
      const created = await api('/menu-items', { method: 'POST', body: item });
      state.menuItems = [...state.menuItems, created];
    } catch (err) {
      console.error('Failed to add menu item:', err);
    }
  }

  async function updateMenuItem(item) {
    try {
      const updated = await api(`/menu-items/${item.id}`, { method: 'PUT', body: item });
      state.menuItems = state.menuItems.map((existing) =>
        existing.id === updated.id ? updated : existing
      );
    } catch (err) {
      console.error('Failed to update menu item:', err);
    }
  }

  async function deleteMenuItem(id) {
    try {
      await api(`/menu-items/${id}`, { method: 'DELETE' });
      state.menuItems = state.menuItems.filter((item) => item.id !== id);
    } catch (err) {
      console.error('Failed to delete menu item:', err);
    }
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async function addInventoryItem(item) {
    try {
      const created = await api('/inventory-items', { method: 'POST', body: item });
      state.inventoryItems = [...state.inventoryItems, created];
    } catch (err) {
      console.error('Failed to add inventory item:', err);
    }
  }

  async function updateInventoryItem(item) {
    try {
      const updated = await api(`/inventory-items/${item.id}`, { method: 'PUT', body: item });
      state.inventoryItems = state.inventoryItems.map((existing) =>
        existing.id === updated.id ? updated : existing
      );
    } catch (err) {
      console.error('Failed to update inventory item:', err);
    }
  }

  async function deleteInventoryItem(id) {
    try {
      await api(`/inventory-items/${id}`, { method: 'DELETE' });
      state.inventoryItems = state.inventoryItems.filter((item) => item.id !== id);
    } catch (err) {
      console.error('Failed to delete inventory item:', err);
    }
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async function addOrder(order) {
    try {
      const created = await api('/orders', { method: 'POST', body: order });
      state.orders = [...state.orders, created];
      // Re-fetch inventory — the server deducted quantities in the same transaction
      const freshInventory = await api('/inventory-items');
      state.inventoryItems = freshInventory;
    } catch (err) {
      console.error('Failed to place order:', err);
    }
  }

  async function updateOrderDriver(orderId, driverName, driverPhone) {
    try {
      await api(`/orders/${orderId}/driver`, {
        method: 'PUT',
        body: { driverName, driverPhone },
      });
      state.orders = state.orders.map((o) =>
        o.id !== orderId ? o : { ...o, driverName, driverPhone }
      );
    } catch (err) {
      console.error('Failed to assign driver:', err);
    }
  }

  async function updateOrderStatus(orderId, status) {
    try {
      await api(`/orders/${orderId}/status`, { method: 'PUT', body: { status } });
      state.orders = state.orders.map((order) => {
        if (order.id !== orderId) return order;
        return {
          ...order,
          status,
          completedAt: status === 'completed' ? new Date().toISOString() : order.completedAt,
        };
      });
    } catch (err) {
      console.error('Failed to update order status:', err);
    }
  }

  // ── Loyalty Customers ──────────────────────────────────────────────────────

  async function addLoyaltyCustomer(customer) {
    try {
      const created = await api('/customers', { method: 'POST', body: customer });
      state.loyaltyCustomers = [...state.loyaltyCustomers, created];
    } catch (err) {
      console.error('Failed to add customer:', err);
    }
  }

  async function updateLoyaltyCustomer(customer) {
    try {
      const updated = await api(`/customers/${customer.id}`, { method: 'PUT', body: customer });
      state.loyaltyCustomers = state.loyaltyCustomers.map((existing) =>
        existing.id === updated.id ? updated : existing
      );
    } catch (err) {
      console.error('Failed to update customer:', err);
    }
  }

  async function deleteLoyaltyCustomer(id) {
    try {
      await api(`/customers/${id}`, { method: 'DELETE' });
      state.loyaltyCustomers = state.loyaltyCustomers.filter((c) => c.id !== id);
    } catch (err) {
      console.error('Failed to delete customer:', err);
    }
  }

  storeInstance = {
    state,
    getTier,
    loadAll,
    addOrder,
    updateOrderStatus,
    updateOrderDriver,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    addLoyaltyCustomer,
    updateLoyaltyCustomer,
    deleteLoyaltyCustomer,
  };

  return storeInstance;
}
