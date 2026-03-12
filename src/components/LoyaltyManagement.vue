<script setup>
import { computed, reactive, ref } from 'vue';
import { usePosStore } from '../store/usePosStore';

const { state, addLoyaltyCustomer, updateLoyaltyCustomer, deleteLoyaltyCustomer, getTier } = usePosStore();

const searchTerm = ref('');
const modalOpen = ref(false);
const editingId = ref('');

const form = reactive({
  name: '',
  phone: '',
  email: '',
  points: 0,
  totalSpent: 0,
  ordersCount: 0,
});

const filteredCustomers = computed(() =>
  state.loyaltyCustomers.filter((customer) => {
    const query = searchTerm.value.toLowerCase();
    return (
      customer.name.toLowerCase().includes(query) ||
      customer.phone.includes(searchTerm.value) ||
      customer.email?.toLowerCase().includes(query)
    );
  })
);

const stats = computed(() => {
  const totalCustomers = state.loyaltyCustomers.length;
  const totalPoints = state.loyaltyCustomers.reduce((sum, customer) => sum + customer.points, 0);
  const totalLifetimeValue = state.loyaltyCustomers.reduce((sum, customer) => sum + customer.totalSpent, 0);
  return {
    totalCustomers,
    totalPoints,
    avgPoints: totalCustomers ? totalPoints / totalCustomers : 0,
    totalLifetimeValue,
  };
});

function resetForm() {
  form.name = '';
  form.phone = '';
  form.email = '';
  form.points = 0;
  form.totalSpent = 0;
  form.ordersCount = 0;
}

function openCreate() {
  editingId.value = '';
  resetForm();
  modalOpen.value = true;
}

function openEdit(customer) {
  editingId.value = customer.id;
  form.name = customer.name;
  form.phone = customer.phone;
  form.email = customer.email || '';
  form.points = customer.points;
  form.totalSpent = customer.totalSpent;
  form.ordersCount = customer.ordersCount;
  modalOpen.value = true;
}

async function saveCustomer() {
  if (!form.name || !form.phone) {
    alert('Name and phone are required.');
    return;
  }

  const payload = {
    name: form.name,
    phone: form.phone,
    email: form.email || undefined,
    points: Number(form.points) || 0,
    totalSpent: Number(form.totalSpent) || 0,
    ordersCount: Number(form.ordersCount) || 0,
  };

  if (editingId.value) {
    const existing = state.loyaltyCustomers.find((customer) => customer.id === editingId.value);
    if (!existing) return;
    await updateLoyaltyCustomer({ ...existing, ...payload, tier: getTier(payload.points) });
  } else {
    await addLoyaltyCustomer({
      ...payload,
      joinedDate: new Date().toISOString(),
    });
  }

  modalOpen.value = false;
}

async function removeCustomer(customer) {
  if (!confirm(`Delete "${customer.name}"?`)) return;
  await deleteLoyaltyCustomer(customer.id);
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Loyalty Program</h1>
        <p class="text-gray-500">Manage customers and reward points</p>
      </div>
      <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="openCreate">Add Customer</button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Total Customers</p><p class="text-2xl font-bold">{{ stats.totalCustomers }}</p></div>
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Total Points</p><p class="text-2xl font-bold">{{ stats.totalPoints }}</p></div>
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Avg Points</p><p class="text-2xl font-bold">{{ stats.avgPoints.toFixed(0) }}</p></div>
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Lifetime Value</p><p class="text-2xl font-bold">${{ stats.totalLifetimeValue.toFixed(2) }}</p></div>
    </div>

    <div class="bg-white rounded-xl border p-4 space-y-4">
      <input v-model="searchTerm" class="w-full border rounded px-3 py-2" placeholder="Search by name, phone, or email" />

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="text-left p-3">Name</th>
              <th class="text-left p-3">Phone</th>
              <th class="text-left p-3">Email</th>
              <th class="text-left p-3">Points</th>
              <th class="text-left p-3">Tier</th>
              <th class="text-left p-3">Orders</th>
              <th class="text-left p-3">Spent</th>
              <th class="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!filteredCustomers.length">
              <td colspan="8" class="p-4 text-center text-gray-500">No customers found.</td>
            </tr>
            <tr v-for="customer in filteredCustomers" :key="customer.id" class="border-t">
              <td class="p-3 font-medium">{{ customer.name || '-' }}</td>
              <td class="p-3">{{ customer.phone || '-' }}</td>
              <td class="p-3">{{ customer.email || '-' }}</td>
              <td class="p-3">{{ customer.points ?? 0 }}</td>
              <td class="p-3 uppercase text-xs">{{ customer.tier || 'bronze' }}</td>
              <td class="p-3">{{ customer.ordersCount ?? 0 }}</td>
              <td class="p-3">${{ (customer.totalSpent ?? 0).toFixed(2) }}</td>
              <td class="p-3">
                <div class="flex gap-2">
                  <button class="px-2 py-1 border rounded" @click="openEdit(customer)">Edit</button>
                  <button class="px-2 py-1 border border-red-300 text-red-600 rounded" @click="removeCustomer(customer)">Delete</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="modalOpen" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl border w-full max-w-lg p-4 space-y-3">
        <h2 class="font-semibold text-lg">{{ editingId ? 'Edit Customer' : 'Add Customer' }}</h2>
        <div>
          <label class="block text-sm font-medium mb-1">Name *</label>
          <input v-model="form.name" class="w-full border rounded px-3 py-2" placeholder="Enter name" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Phone *</label>
          <input v-model="form.phone" class="w-full border rounded px-3 py-2" placeholder="Enter phone" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Email</label>
          <input v-model="form.email" class="w-full border rounded px-3 py-2" placeholder="Enter email" />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">Points</label>
            <input v-model.number="form.points" type="number" min="0" class="w-full border rounded px-3 py-2" placeholder="0" />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Orders Count</label>
            <input v-model.number="form.ordersCount" type="number" min="0" class="w-full border rounded px-3 py-2" placeholder="0" />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Total Spent</label>
            <input v-model.number="form.totalSpent" type="number" min="0" step="0.01" class="w-full border rounded px-3 py-2" placeholder="0.00" />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button class="px-3 py-2 border rounded" @click="modalOpen = false">Cancel</button>
          <button class="px-3 py-2 bg-blue-600 text-white rounded" @click="saveCustomer">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>
