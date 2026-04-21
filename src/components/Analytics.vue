<script setup>
import { computed, ref } from 'vue';
import { Bar, Doughnut, Line } from 'vue-chartjs';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { usePosStore } from '../store/usePosStore';

ChartJS.register(ArcElement, BarElement, CategoryScale, Legend, LineElement, LinearScale, PointElement, Tooltip);

const { state } = usePosStore();
const timeRange = ref('month');

const filteredOrders = computed(() => {
  const now = new Date();
  const cutoff = new Date();

  if (timeRange.value === 'week') cutoff.setDate(now.getDate() - 7);
  if (timeRange.value === 'month') cutoff.setMonth(now.getMonth() - 1);
  if (timeRange.value === 'year') cutoff.setFullYear(now.getFullYear() - 1);

  return state.orders.filter(
    (order) => order.status !== 'cancelled' && new Date(order.createdAt) >= cutoff
  );
});

const stats = computed(() => {
  const totalRevenue = filteredOrders.value.reduce((sum, order) => sum + order.total, 0);
  const totalCost = filteredOrders.value.reduce((sum, order) => {
    const orderCost = order.items.reduce((lineSum, item) => {
      const menuItem = state.menuItems.find((menu) => menu.id === item.menuItemId);
      return lineSum + (menuItem?.cost || 0) * item.quantity;
    }, 0);
    return sum + orderCost;
  }, 0);

  const totalOrders = filteredOrders.value.length;
  const completedOrders = filteredOrders.value.filter((order) => order.status === 'completed').length;
  const profit = totalRevenue - totalCost;

  return {
    totalRevenue,
    totalOrders,
    completedOrders,
    avgOrderValue: totalOrders ? totalRevenue / totalOrders : 0,
    profit,
    profitMargin: totalRevenue ? (profit / totalRevenue) * 100 : 0,
  };
});

const topSellingItems = computed(() => {
  const map = new Map();

  filteredOrders.value.forEach((order) => {
    order.items.forEach((item) => {
      const existing = map.get(item.menuItemId) || { name: item.name, quantity: 0, revenue: 0 };
      map.set(item.menuItemId, {
        name: item.name,
        quantity: existing.quantity + item.quantity,
        revenue: existing.revenue + item.price * item.quantity,
      });
    });
  });

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
});

const revenueTrend = computed(() => {
  const buckets = new Map();

  filteredOrders.value.forEach((order) => {
    const date = new Date(order.createdAt);
    let key = '';

    if (timeRange.value === 'week') {
      key = date.toLocaleDateString('en-US', { weekday: 'short' });
    } else if (timeRange.value === 'month') {
      key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      key = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }

    const current = buckets.get(key) || { revenue: 0, orders: 0 };
    buckets.set(key, {
      revenue: current.revenue + order.total,
      orders: current.orders + 1,
    });
  });

  const rows = Array.from(buckets.entries()).map(([label, values]) => ({
    label,
    revenue: Number(values.revenue.toFixed(2)),
    orders: values.orders,
  }));

  return rows.slice(-12);
});

const categorySales = computed(() => {
  const map = new Map();

  filteredOrders.value.forEach((order) => {
    order.items.forEach((item) => {
      const menuItem = state.menuItems.find((menu) => menu.id === item.menuItemId);
      const category = menuItem?.category || 'Other';
      map.set(category, (map.get(category) || 0) + item.price * item.quantity);
    });
  });

  return Array.from(map.entries())
    .map(([name, revenue]) => ({ name, revenue: Number(revenue.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue);
});

const paymentMethodData = computed(() => {
  const map = new Map();

  filteredOrders.value.forEach((order) => {
    if (!order.paymentMethod) return;
    map.set(order.paymentMethod, (map.get(order.paymentMethod) || 0) + 1);
  });

  return Array.from(map.entries()).map(([method, count]) => ({
    method: method.charAt(0).toUpperCase() + method.slice(1),
    count,
  }));
});

const lineChartData = computed(() => ({
  labels: revenueTrend.value.map((row) => row.label),
  datasets: [
    {
      label: 'Revenue',
      data: revenueTrend.value.map((row) => row.revenue),
      borderColor: '#2563eb',
      backgroundColor: 'rgba(37, 99, 235, 0.2)',
      tension: 0.25,
      fill: true,
    },
  ],
}));

const barChartData = computed(() => ({
  labels: topSellingItems.value.map((item) => item.name),
  datasets: [
    {
      label: 'Revenue',
      data: topSellingItems.value.map((item) => Number(item.revenue.toFixed(2))),
      backgroundColor: '#16a34a',
      borderRadius: 6,
    },
  ],
}));

const categoryChartData = computed(() => ({
  labels: categorySales.value.map((row) => row.name),
  datasets: [
    {
      data: categorySales.value.map((row) => row.revenue),
      backgroundColor: ['#2563eb', '#7c3aed', '#16a34a', '#ea580c', '#dc2626', '#0891b2', '#ca8a04'],
    },
  ],
}));

const paymentChartData = computed(() => ({
  labels: paymentMethodData.value.map((row) => row.method),
  datasets: [
    {
      data: paymentMethodData.value.map((row) => row.count),
      backgroundColor: ['#2563eb', '#0d9488', '#f59e0b', '#a855f7'],
    },
  ],
}));

const sharedOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
    },
  },
};

const lineOptions = {
  ...sharedOptions,
  scales: {
    y: {
      beginAtZero: true,
    },
  },
};

const barOptions = {
  ...sharedOptions,
  plugins: {
    ...sharedOptions.plugins,
    legend: {
      display: false,
    },
  },
};
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Analytics & Reports</h1>
        <p class="text-gray-500">Track business performance</p>
      </div>
      <select v-model="timeRange" class="border rounded px-3 py-2 bg-white">
        <option value="week">Last 7 Days</option>
        <option value="month">Last 30 Days</option>
        <option value="year">Last Year</option>
      </select>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Total Revenue</p><p class="text-2xl font-bold">${{ stats.totalRevenue.toFixed(2) }}</p><p class="text-xs text-gray-500">{{ stats.totalOrders }} orders</p></div>
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Profit</p><p class="text-2xl font-bold text-blue-600">${{ stats.profit.toFixed(2) }}</p><p class="text-xs text-gray-500">{{ stats.profitMargin.toFixed(1) }}% margin</p></div>
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Avg Order Value</p><p class="text-2xl font-bold">${{ stats.avgOrderValue.toFixed(2) }}</p></div>
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Completion Rate</p><p class="text-2xl font-bold">{{ stats.totalOrders ? ((stats.completedOrders / stats.totalOrders) * 100).toFixed(1) : 0 }}%</p></div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-white rounded-xl border p-4">
        <h2 class="font-semibold mb-4">Revenue Trend</h2>
        <div v-if="revenueTrend.length" class="h-72">
          <Line :data="lineChartData" :options="lineOptions" />
        </div>
        <p v-else class="text-gray-500 text-sm">No trend data.</p>
      </div>

      <div class="bg-white rounded-xl border p-4">
        <h2 class="font-semibold mb-4">Sales by Category</h2>
        <div v-if="categorySales.length" class="h-72">
          <Doughnut :data="categoryChartData" :options="sharedOptions" />
        </div>
        <p v-else class="text-gray-500 text-sm">No category data.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-white rounded-xl border p-4">
        <h2 class="font-semibold mb-4">Payment Methods</h2>
        <div v-if="paymentMethodData.length" class="h-72">
          <Doughnut :data="paymentChartData" :options="sharedOptions" />
        </div>
        <p v-else class="text-gray-500 text-sm">No payment data.</p>
      </div>

      <div class="bg-white rounded-xl border p-4">
        <h2 class="font-semibold mb-4">Top Sellers Revenue</h2>
        <div v-if="topSellingItems.length" class="h-72">
          <Bar :data="barChartData" :options="barOptions" />
        </div>
        <p v-else class="text-gray-500 text-sm">No sales data available.</p>
      </div>
    </div>

    <div class="bg-white rounded-xl border p-4">
      <h2 class="font-semibold mb-4">Top 10 Best Sellers</h2>
      <div v-if="topSellingItems.length" class="space-y-2">
        <div v-for="(item, index) in topSellingItems" :key="item.name + index" class="flex items-center justify-between border-b pb-2">
          <div class="flex items-center gap-3">
            <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center">{{ index + 1 }}</span>
            <div>
              <p class="font-medium">{{ item.name }}</p>
              <p class="text-xs text-gray-500">{{ item.quantity }} sold</p>
            </div>
          </div>
          <p class="font-semibold text-green-700">${{ item.revenue.toFixed(2) }}</p>
        </div>
      </div>
      <p v-else class="text-gray-500 text-sm">No sales data available.</p>
    </div>
  </div>
</template>
