<script setup>
import { computed } from 'vue';
import { usePosStore } from '../store/usePosStore';

const { state, updateOrderStatus } = usePosStore();

const activeOrders = computed(() =>
  state.orders
    .filter((order) => ['pending', 'preparing', 'ready'].includes(order.status))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
);

const counts = computed(() => ({
  pending: state.orders.filter((o) => o.status === 'pending').length,
  preparing: state.orders.filter((o) => o.status === 'preparing').length,
  ready: state.orders.filter((o) => o.status === 'ready').length,
}));

function getTimeSince(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
}

function nextStatus(status) {
  if (status === 'pending') return 'preparing';
  if (status === 'preparing') return 'ready';
  return 'completed';
}

function nextLabel(status) {
  if (status === 'pending') return 'Start Preparing';
  if (status === 'preparing') return 'Mark Ready';
  return 'Complete Order';
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-3xl font-bold">Kitchen Display</h1>
      <p class="text-gray-500">Monitor and manage active orders</p>
    </div>

    <div v-if="!activeOrders.length" class="bg-white rounded-xl border p-12 text-center text-gray-500">
      No active orders.
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div
        v-for="order in activeOrders"
        :key="order.id"
        class="bg-white border-2 rounded-xl p-4"
        :class="{
          'border-orange-300': order.status === 'pending',
          'border-blue-300': order.status === 'preparing',
          'border-green-300': order.status === 'ready',
        }"
      >
        <div class="flex items-start justify-between mb-3">
          <div>
            <h2 class="font-semibold">Order #{{ order.orderNumber }}</h2>
            <p class="text-xs text-gray-500">{{ getTimeSince(order.createdAt) }}</p>
          </div>
          <span class="text-xs px-2 py-1 rounded-full bg-gray-100 uppercase">{{ order.status }}</span>
        </div>

        <div class="text-sm mb-3">Table: <span class="font-semibold">{{ order.tableNumber || 'N/A' }}</span></div>

        <div class="space-y-1 mb-3">
          <div v-for="(item, idx) in order.items" :key="idx" class="text-sm flex justify-between bg-gray-50 px-2 py-1 rounded">
            <span>{{ item.name }}</span>
            <span>x{{ item.quantity }}</span>
          </div>
        </div>

        <p v-if="order.notes" class="text-sm bg-yellow-50 border border-yellow-200 rounded p-2 mb-3">{{ order.notes }}</p>

        <div class="flex gap-2">
          <button
            class="flex-1 px-3 py-2 rounded-lg border hover:bg-gray-50"
            @click="updateOrderStatus(order.id, nextStatus(order.status))"
          >
            {{ nextLabel(order.status) }}
          </button>
          <button
            v-if="order.status === 'pending'"
            class="px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
            @click="updateOrderStatus(order.id, 'cancelled')"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Pending</p>
        <p class="text-2xl font-bold text-orange-600">{{ counts.pending }}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Preparing</p>
        <p class="text-2xl font-bold text-blue-600">{{ counts.preparing }}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Ready</p>
        <p class="text-2xl font-bold text-green-600">{{ counts.ready }}</p>
      </div>
    </div>
  </div>
</template>
