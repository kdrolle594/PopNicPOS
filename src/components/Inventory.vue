<script setup>
import { computed, reactive, ref } from 'vue';
import { usePosStore } from '../store/usePosStore';

const { state, addInventoryItem, updateInventoryItem, deleteInventoryItem } = usePosStore();

const editOpen = ref(false);
const createOpen = ref(false);
const editingItem = reactive({
  id: '',
  name: '',
  quantity: 0,
  unit: '',
  reorderLevel: 0,
  costPerUnit: 0,
});

const newItem = reactive({
  name: '',
  quantity: 0,
  unit: '',
  reorderLevel: 0,
  costPerUnit: 0,
});

const lowStockItems = computed(() => state.inventoryItems.filter((item) => item.quantity <= item.reorderLevel));
const totalValue = computed(() => state.inventoryItems.reduce((sum, item) => sum + item.quantity * item.costPerUnit, 0));

function changeQuantity(item, delta) {
  updateInventoryItem({ ...item, quantity: Math.max(0, item.quantity + delta) });
}

function openEdit(item) {
  editingItem.id = item.id;
  editingItem.name = item.name;
  editingItem.quantity = item.quantity;
  editingItem.unit = item.unit;
  editingItem.reorderLevel = item.reorderLevel;
  editingItem.costPerUnit = item.costPerUnit;
  editOpen.value = true;
}

function saveEdit() {
  const original = state.inventoryItems.find((item) => item.id === editingItem.id);
  if (!original) return;

  updateInventoryItem({
    ...original,
    name: editingItem.name,
    quantity: Number(editingItem.quantity),
    unit: editingItem.unit,
    reorderLevel: Number(editingItem.reorderLevel),
    costPerUnit: Number(editingItem.costPerUnit),
  });

  editOpen.value = false;
}

function openCreate() {
  newItem.name = '';
  newItem.quantity = 0;
  newItem.unit = '';
  newItem.reorderLevel = 0;
  newItem.costPerUnit = 0;
  createOpen.value = true;
}

async function saveCreate() {
  if (!newItem.name || !newItem.unit) {
    alert('Name and unit are required.');
    return;
  }
  await addInventoryItem({
    name: newItem.name,
    quantity: Number(newItem.quantity) || 0,
    unit: newItem.unit,
    reorderLevel: Number(newItem.reorderLevel) || 0,
    costPerUnit: Number(newItem.costPerUnit) || 0,
  });
  createOpen.value = false;
}

async function removeItem(item) {
  if (!confirm(`Delete "${item.name}"?`)) return;
  await deleteInventoryItem(item.id);
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Inventory Management</h1>
        <p class="text-gray-500">Track and manage stock levels</p>
      </div>
      <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="openCreate">Add Item</button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Total Items</p>
        <p class="text-2xl font-bold">{{ state.inventoryItems.length }}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Low Stock Items</p>
        <p class="text-2xl font-bold text-red-600">{{ lowStockItems.length }}</p>
      </div>
      <div class="bg-white rounded-xl border p-4">
        <p class="text-sm text-gray-500">Inventory Value</p>
        <p class="text-2xl font-bold text-green-600">${{ totalValue.toFixed(2) }}</p>
      </div>
    </div>

    <div v-if="lowStockItems.length" class="bg-red-50 border border-red-200 rounded-xl p-4">
      <h2 class="font-semibold text-red-800 mb-2">Low Stock Alert</h2>
      <div class="space-y-2">
        <div v-for="item in lowStockItems" :key="item.id" class="bg-white border rounded px-3 py-2 text-sm">
          <span class="font-medium">{{ item.name }}</span> — {{ item.quantity }} {{ item.unit }} (reorder at {{ item.reorderLevel }})
        </div>
      </div>
    </div>

    <div class="bg-white rounded-xl border overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left p-3">Name</th>
            <th class="text-left p-3">Qty</th>
            <th class="text-left p-3">Unit</th>
            <th class="text-left p-3">Cost</th>
            <th class="text-left p-3">Value</th>
            <th class="text-left p-3">Reorder</th>
            <th class="text-left p-3">Status</th>
            <th class="text-left p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in state.inventoryItems" :key="item.id" class="border-t">
            <td class="p-3 font-medium">{{ item.name }}</td>
            <td class="p-3">{{ item.quantity }}</td>
            <td class="p-3">{{ item.unit }}</td>
            <td class="p-3">${{ item.costPerUnit.toFixed(2) }}</td>
            <td class="p-3 font-semibold">${{ (item.quantity * item.costPerUnit).toFixed(2) }}</td>
            <td class="p-3">{{ item.reorderLevel }}</td>
            <td class="p-3">
              <span class="px-2 py-1 rounded text-xs" :class="item.quantity <= item.reorderLevel ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'">
                {{ item.quantity <= item.reorderLevel ? 'Low' : 'OK' }}
              </span>
            </td>
            <td class="p-3">
              <div class="flex gap-1">
                <button class="px-2 py-1 border rounded" @click="changeQuantity(item, -1)">-</button>
                <button class="px-2 py-1 border rounded" @click="changeQuantity(item, 1)">+</button>
                <button class="px-2 py-1 border rounded" @click="openEdit(item)">Edit</button>
                <button class="px-2 py-1 border border-red-300 text-red-600 rounded" @click="removeItem(item)">Delete</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editOpen" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl border w-full max-w-lg p-4 space-y-3">
        <h3 class="font-semibold text-lg">Edit Inventory Item</h3>
        <input v-model="editingItem.name" class="w-full border rounded px-3 py-2" placeholder="Name" />
        <div class="grid grid-cols-2 gap-2">
          <input v-model.number="editingItem.quantity" type="number" min="0" class="w-full border rounded px-3 py-2" placeholder="Quantity" />
          <input v-model="editingItem.unit" class="w-full border rounded px-3 py-2" placeholder="Unit" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <input v-model.number="editingItem.costPerUnit" type="number" step="0.01" class="w-full border rounded px-3 py-2" placeholder="Cost" />
          <input v-model.number="editingItem.reorderLevel" type="number" min="0" class="w-full border rounded px-3 py-2" placeholder="Reorder level" />
        </div>
        <div class="flex justify-end gap-2">
          <button class="px-3 py-2 rounded border" @click="editOpen = false">Cancel</button>
          <button class="px-3 py-2 rounded bg-blue-600 text-white" @click="saveEdit">Save</button>
        </div>
      </div>
    </div>

    <!-- Create modal -->
    <div v-if="createOpen" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl border w-full max-w-lg p-4 space-y-3">
        <h3 class="font-semibold text-lg">Add Inventory Item</h3>
        <input v-model="newItem.name" class="w-full border rounded px-3 py-2" placeholder="Name" />
        <div class="grid grid-cols-2 gap-2">
          <input v-model.number="newItem.quantity" type="number" min="0" class="w-full border rounded px-3 py-2" placeholder="Quantity" />
          <input v-model="newItem.unit" class="w-full border rounded px-3 py-2" placeholder="Unit (lbs, cans, etc.)" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <input v-model.number="newItem.costPerUnit" type="number" step="0.01" class="w-full border rounded px-3 py-2" placeholder="Cost per unit" />
          <input v-model.number="newItem.reorderLevel" type="number" min="0" class="w-full border rounded px-3 py-2" placeholder="Reorder level" />
        </div>
        <div class="flex justify-end gap-2">
          <button class="px-3 py-2 rounded border" @click="createOpen = false">Cancel</button>
          <button class="px-3 py-2 rounded bg-blue-600 text-white" @click="saveCreate">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>
