<script setup>
import { computed, ref, watch } from 'vue';
import { useAuth0 } from '@auth0/auth0-vue';
import { useAuthStore } from './store/useAuthStore';

import Dashboard from './components/Dashboard.vue';
import POSTerminal from './components/POSTerminal.vue';
import KitchenDisplay from './components/KitchenDisplay.vue';
import Inventory from './components/Inventory.vue';
import MenuManagement from './components/MenuManagement.vue';
import Analytics from './components/Analytics.vue';
import LoyaltyManagement from './components/LoyaltyManagement.vue';
import CustomerView from './components/CustomerView.vue';
import DriverView from './components/DriverView.vue';
import UserManagement from './components/UserManagement.vue';
import LoginView from './components/LoginView.vue';

const auth0 = useAuth0();
const auth  = useAuthStore();

const currentView    = ref('dashboard');
const isMobileMenuOpen = ref(false);

const ALL_MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',      icon: '📊' },
  { id: 'pos',       label: 'POS Terminal',   icon: '🛒' },
  { id: 'kitchen',   label: 'Kitchen Display',icon: '👨‍🍳' },
  { id: 'inventory', label: 'Inventory',      icon: '📦' },
  { id: 'menu',      label: 'Menu',           icon: '🍽️' },
  { id: 'loyalty',   label: 'Loyalty Program',icon: '🏆' },
  { id: 'analytics', label: 'Analytics',      icon: '📈' },
  { id: 'customer',  label: 'Customer View',  icon: '🚚' },
  { id: 'driver',    label: 'Driver Portal',  icon: '🚗' },
  { id: 'users',     label: 'User Management',icon: '👥' },
];

const viewMap = {
  dashboard: Dashboard,
  pos:       POSTerminal,
  kitchen:   KitchenDisplay,
  inventory: Inventory,
  menu:      MenuManagement,
  loyalty:   LoyaltyManagement,
  analytics: Analytics,
  customer:  CustomerView,
  driver:    DriverView,
  users:     UserManagement,
};

// Filter nav items to only those the current role can access
const menuItems = computed(() => {
  const allowed = auth.allowedViews();
  return ALL_MENU_ITEMS.filter((item) => allowed.includes(item.id));
});

const activeComponent = computed(() => viewMap[currentView.value] || Dashboard);

function openView(id) {
  currentView.value = id;
  isMobileMenuOpen.value = false;
}

// After Auth0 login completes and we're authenticated, fetch role then navigate
watch(
  () => auth0.isAuthenticated.value,
  async (authenticated) => {
    if (authenticated && !auth.state.role) {
      await auth.fetchRole();
      currentView.value = auth.defaultView();
    }
  },
  { immediate: true }
);

// Show app shell only when authenticated AND role loaded
const ready = computed(() =>
  !auth0.isLoading.value && auth0.isAuthenticated.value && !!auth.state.role
);
const showLogin = computed(() =>
  !auth0.isLoading.value && !auth0.isAuthenticated.value
);
</script>

<template>
  <!-- Loading spinner while Auth0 initialises -->
  <div v-if="auth0.isLoading.value" class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-gray-400 text-sm">Loading…</div>
  </div>

  <!-- Login screen -->
  <LoginView v-else-if="showLogin" />

  <!-- Waiting for role fetch after login -->
  <div v-else-if="!ready" class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-gray-400 text-sm">Signing you in…</div>
  </div>

  <!-- Main app shell -->
  <div v-else class="flex h-screen bg-gray-50">
    <button
      class="lg:hidden fixed top-4 left-4 z-50 px-3 py-2 bg-white rounded-lg shadow-lg"
      @click="isMobileMenuOpen = !isMobileMenuOpen"
    >
      {{ isMobileMenuOpen ? '✕' : '☰' }}
    </button>

    <aside
      :class="[
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out',
      ]"
    >
      <div class="flex flex-col h-full">
        <div class="p-6 border-b border-gray-200">
          <h1 class="text-2xl font-bold text-blue-600 flex items-center gap-2">🍴 PopNic POS</h1>
          <p class="text-sm text-gray-500 mt-1">{{ auth.state.appUser?.name || '' }}</p>
        </div>

        <nav class="flex-1 p-4 space-y-2">
          <button
            v-for="item in menuItems"
            :key="item.id"
            @click="openView(item.id)"
            :class="[
              'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left',
              currentView === item.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-700 hover:bg-gray-100',
            ]"
          >
            <span>{{ item.icon }}</span>
            <span class="font-medium">{{ item.label }}</span>
          </button>
        </nav>

        <div class="p-4 border-t border-gray-200 space-y-2">
          <button
            class="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 text-sm transition-all"
            @click="auth.logout()"
          >
            <span>🚪</span>
            <span>Sign Out</span>
          </button>
          <p class="text-xs text-gray-400 text-center">© 2026 PopNic POS System</p>
        </div>
      </div>
    </aside>

    <div
      v-if="isMobileMenuOpen"
      class="lg:hidden fixed inset-0 bg-black/50 z-30"
      @click="isMobileMenuOpen = false"
    />

    <main class="flex-1 overflow-y-auto">
      <component :is="activeComponent" />
    </main>
  </div>
</template>
