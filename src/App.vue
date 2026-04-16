<script setup>
import { computed, ref } from 'vue';
import Dashboard from './components/Dashboard.vue';
import POSTerminal from './components/POSTerminal.vue';
import KitchenDisplay from './components/KitchenDisplay.vue';
import Inventory from './components/Inventory.vue';
import MenuManagement from './components/MenuManagement.vue';
import Analytics from './components/Analytics.vue';
import LoyaltyManagement from './components/LoyaltyManagement.vue';
import CustomerView from './components/CustomerView.vue';
import DriverView from './components/DriverView.vue';

const currentView = ref('dashboard');
const isMobileMenuOpen = ref(false);

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'pos', label: 'POS Terminal', icon: '🛒' },
  { id: 'kitchen', label: 'Kitchen Display', icon: '👨‍🍳' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'menu', label: 'Menu', icon: '🍽️' },
  { id: 'loyalty', label: 'Loyalty Program', icon: '🏆' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
  { id: 'customer', label: 'Customer View', icon: '🚚' },
  { id: 'driver', label: 'Driver Portal', icon: '🚗' },
];

const viewMap = {
  dashboard: Dashboard,
  pos: POSTerminal,
  kitchen: KitchenDisplay,
  inventory: Inventory,
  menu: MenuManagement,
  loyalty: LoyaltyManagement,
  analytics: Analytics,
  customer: CustomerView,
  driver: DriverView,
};

const activeComponent = computed(() => viewMap[currentView.value] || Dashboard);

function openView(id) {
  currentView.value = id;
  isMobileMenuOpen.value = false;
}
</script>

<template>
  <div class="flex h-screen bg-gray-50">
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
          <p class="text-sm text-gray-500 mt-1">Complete Management System</p>
        </div>

        <nav class="flex-1 p-4 space-y-2">
          <button
            v-for="item in menuItems"
            :key="item.id"
            @click="openView(item.id)"
            :class="[
              'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left',
              currentView === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100',
            ]"
          >
            <span>{{ item.icon }}</span>
            <span class="font-medium">{{ item.label }}</span>
          </button>
        </nav>

        <div class="p-4 border-t border-gray-200 text-xs text-gray-500 text-center">
          <p>© 2026 PopNic POS System</p>
          <p class="mt-1">Vue + JavaScript Edition</p>
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
