<script setup>
import { computed } from 'vue';
import { usePosStore } from '../store/usePosStore';

const { state } = usePosStore();

const stats = computed(() => {
  const today = new Date().toDateString();
  const month = new Date().getMonth();
  const year = new Date().getFullYear();

  const todayOrders = state.orders.filter((order) => new Date(order.createdAt).toDateString() === today);
  const monthOrders = state.orders.filter((order) => {
    const date = new Date(order.createdAt);
    return date.getMonth() === month && date.getFullYear() === year;
  });

  const todayRevenue = todayOrders.reduce((sum, order) => sum + order.total, 0);
  const monthRevenue = monthOrders.reduce((sum, order) => sum + order.total, 0);

  return {
    todayRevenue,
    monthRevenue,
    todayOrders: todayOrders.length,
    monthOrders: monthOrders.length,
    activeOrders: state.orders.filter((o) => o.status === 'pending' || o.status === 'preparing').length,
    lowStockItems: state.inventoryItems.filter((item) => item.quantity <= item.reorderLevel).length,
    avgOrderValue: todayOrders.length ? todayRevenue / todayOrders.length : 0,
  };
});

const categoryRevenue = computed(() => {
  const byCategory = new Map();

  state.orders.forEach((order) => {
    order.items.forEach((item) => {
      const menuItem = state.menuItems.find((m) => m.id === item.menuItemId);
      const category = menuItem?.category || 'Other';
      byCategory.set(category, (byCategory.get(category) || 0) + item.price * item.quantity);
    });
  });

  const rows = Array.from(byCategory.entries()).map(([category, revenue]) => ({
    category,
    revenue,
  }));

  const max = Math.max(...rows.map((row) => row.revenue), 1);
  return rows
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)
    .map((row) => ({ ...row, width: `${(row.revenue / max) * 100}%` }));
});

const recentOrders = computed(() => state.orders.slice(-5).reverse());
</script>

<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-3xl font-bold">Dashboard</h1>
      <p class="text-gray-500">Welcome back! Here's what's happening today.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Today's Revenue</p>
        <p class="text-2xl font-bold">${{ stats.todayRevenue.toFixed(2) }}</p>
        <p class="text-xs text-gray-500">{{ stats.todayOrders }} orders</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Monthly Revenue</p>
        <p class="text-2xl font-bold">${{ stats.monthRevenue.toFixed(2) }}</p>
        <p class="text-xs text-gray-500">{{ stats.monthOrders }} orders</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Active Orders</p>
        <p class="text-2xl font-bold">{{ stats.activeOrders }}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Low Stock Items</p>
        <p class="text-2xl font-bold text-red-600">{{ stats.lowStockItems }}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Menu Items</p>
        <p class="text-2xl font-bold">{{ state.menuItems.length }}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Avg Order Value</p>
        <p class="text-2xl font-bold">${{ stats.avgOrderValue.toFixed(2) }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-white rounded-xl border p-4">
        <h2 class="font-semibold mb-4">Sales by Category</h2>
        <div v-if="categoryRevenue.length" class="space-y-3">
          <div v-for="row in categoryRevenue" :key="row.category">
            <div class="flex justify-between text-sm mb-1">
              <span>{{ row.category }}</span>
              <span>${{ row.revenue.toFixed(2) }}</span>
            </div>
            <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full bg-blue-600" :style="{ width: row.width }" />
            </div>
          </div>
        </div>
        <p v-else class="text-gray-500 text-sm">No category sales yet.</p>
      </div>

      <div class="bg-white rounded-xl border p-4">
        <h2 class="font-semibold mb-4">Recent Orders</h2>
        <div v-if="recentOrders.length" class="space-y-3">
          <div v-for="order in recentOrders" :key="order.id" class="flex items-center justify-between border-b pb-3 last:border-0">
            <div>
              <p class="font-medium">Order #{{ order.orderNumber }}</p>
              <p class="text-xs text-gray-500">{{ new Date(order.createdAt).toLocaleString() }}</p>
            </div>
            <div class="text-right">
              <p class="font-semibold">${{ order.total.toFixed(2) }}</p>
              <p class="text-xs uppercase text-gray-500">{{ order.status }}</p>
            </div>
          </div>
        </div>
        <p v-else class="text-gray-500 text-sm">No orders yet.</p>
      </div>
    </div>
  </div>
</template>
