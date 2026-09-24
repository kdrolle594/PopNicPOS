<script setup>
import { computed, ref, watch, provide } from 'vue';
import { useAuth0 } from '@auth0/auth0-vue';
import { useAuthStore } from './store/useAuthStore';
import { usePosStore } from './store/usePosStore.js';
import { useCartStore } from './store/useCartStore.js';
import StorefrontShell from './components/shell/StorefrontShell.vue';
import ConsoleShell from './components/shell/ConsoleShell.vue';
import Dashboard from './components/Dashboard.vue';
import POSTerminal from './components/POSTerminal.vue';
import KitchenDisplay from './components/KitchenDisplay.vue';
import Inventory from './components/Inventory.vue';
import MenuManagement from './components/MenuManagement.vue';
import Analytics from './components/Analytics.vue';
import LoyaltyManagement from './components/LoyaltyManagement.vue';
import DriverView from './components/DriverView.vue';
import UserManagement from './components/UserManagement.vue';
const auth0    = useAuth0();
const auth     = useAuthStore();
const posStore = usePosStore();
const cart     = useCartStore();
const currentView = ref('storefront');

// storefrontView is owned here so Task 8 can flip it from the auth watcher.
const storefrontView = ref('browse');
provide('storefrontView', storefrontView);

const STAFF_ROLES = ['cashier', 'kitchen', 'manager', 'admin', 'driver'];
const isStaff = computed(() => STAFF_ROLES.includes(auth.state.role));
// Admins can preview the storefront via their existing `customer` nav entry.
const showStorefront = computed(
  () => !auth0.isAuthenticated.value || !isStaff.value || currentView.value === 'customer'
);
const ALL_MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard'       },
  { id: 'pos',       label: 'POS Terminal'    },
  { id: 'kitchen',   label: 'Kitchen Display' },
  { id: 'inventory', label: 'Inventory'       },
  { id: 'menu',      label: 'Menu'            },
  { id: 'loyalty',   label: 'Loyalty Program' },
  { id: 'analytics', label: 'Analytics'       },
  { id: 'customer',  label: 'Customer View'   },
  { id: 'driver',    label: 'Driver Portal'   },
  { id: 'users',     label: 'User Management' },
];

const VIEW_MAP = {
  dashboard: Dashboard,
  pos:       POSTerminal,
  kitchen:   KitchenDisplay,
  inventory: Inventory,
  menu:      MenuManagement,
  loyalty:   LoyaltyManagement,
  analytics: Analytics,
  driver:    DriverView,
  users:     UserManagement,
};

const menuItems = computed(() => {
  const allowed = auth.allowedViews();
  return ALL_MENU_ITEMS.filter((item) => allowed.includes(item.id));
});

const activeComponent = computed(() => VIEW_MAP[currentView.value] || Dashboard);

watch(
  () => auth0.isAuthenticated.value,
  async (authenticated) => {
    if (authenticated && !auth.state.role) {
      await auth.fetchRole();
      currentView.value = auth.defaultView();
      // Load full POS data (menu items + inventory/orders/customers) after role resolves.
      posStore.loadAll();
      // Auth-hop: if the user initiated checkout as a guest, land them on checkout.
      if (cart.consumePendingCheckout()) {
        storefrontView.value = 'checkout';
      }
    }
  },
  { immediate: true }
);

// Abandoned login: Auth0 finished loading but user is not authenticated.
// Clear any stale pendingCheckout flag while leaving the cart intact.
watch(
  () => auth0.isLoading.value,
  (loading) => {
    if (!loading && !auth0.isAuthenticated.value) {
      cart.consumePendingCheckout(); // discard result — only clears the flag
    }
  },
  { immediate: true }
);
</script>

<template>
  <!-- Loading splash while Auth0 initialises -->
  <div v-if="auth0.isLoading.value" class="app-loading">
    <div class="app-loading__spinner" aria-hidden="true"></div>
    <p>Loading…</p>
  </div>

  <!-- Storefront: guests and customer-role users -->
  <StorefrontShell v-else-if="showStorefront">
    <!-- Tasks 8–10 render the active storefront view here -->
  </StorefrontShell>

  <!-- Console: staff roles (cashier, kitchen, manager, admin, driver) -->
  <ConsoleShell
    v-else
    :current-view="currentView"
    :menu-items="menuItems"
    @navigate="currentView = $event"
  >
    <Transition name="view" mode="out-in">
      <component :is="activeComponent" :key="currentView" />
    </Transition>
  </ConsoleShell>
</template>
