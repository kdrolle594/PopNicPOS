<script setup>
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue';
import { usePosStore } from '../store/usePosStore';
import OptionGroupsEditor from './OptionGroupsEditor.vue';
import { subscribeMenu } from '../lib/realtime.js';

const { state, addMenuItem, updateMenuItem, deleteMenuItem, loadOptionGroups, refreshMenu } = usePosStore();

const modalOpen = ref(false);
const editingId = ref('');
const activeTab = ref('items');

const form = reactive({
  name: '',
  category: '',
  price: 0,
  cost: 0,
  available: true,
  isCombo: false,
  pointsValue: 0,
  inventoryItems: [],
  imageUrl: '',
  description: '',
  optionGroupIds: [],
});

const imagePreviewFailed = ref(false);

const stats = computed(() => {
  const avgMargin =
    state.menuItems.length > 0
      ? state.menuItems.reduce((sum, item) => sum + ((item.price - item.cost) / item.price) * 100, 0) / state.menuItems.length
      : 0;

  return {
    total: state.menuItems.length,
    available: state.menuItems.filter((item) => item.available).length,
    combos: state.menuItems.filter((item) => item.isCombo).length,
    avgMargin,
  };
});

const profitMargin = computed(() => {
  if (!form.price) return 0;
  return ((form.price - form.cost) / form.price) * 100;
});

function resetForm() {
  form.name = '';
  form.category = '';
  form.price = 0;
  form.cost = 0;
  form.available = true;
  form.isCombo = false;
  form.pointsValue = 0;
  form.inventoryItems = [];
  form.imageUrl = '';
  form.description = '';
  form.optionGroupIds = [];
  imagePreviewFailed.value = false;
}

function openCreate() {
  editingId.value = '';
  resetForm();
  modalOpen.value = true;
}

function openEdit(item) {
  editingId.value = item.id;
  form.name = item.name;
  form.category = item.category;
  form.price = item.price;
  form.cost = item.cost;
  form.available = item.available;
  form.isCombo = Boolean(item.isCombo);
  form.pointsValue = item.pointsValue || 0;
  form.inventoryItems = Array.isArray(item.inventoryItems) ? item.inventoryItems.map((inv) => ({ ...inv })) : [];
  form.imageUrl = item.imageUrl || '';
  form.description = item.description || '';
  form.optionGroupIds = [...(item.optionGroupIds || [])];
  imagePreviewFailed.value = false;
  modalOpen.value = true;
}

function isInventoryLinked(inventoryId) {
  return form.inventoryItems.some((inv) => inv.id === inventoryId);
}

function getInventoryQuantity(inventoryId) {
  const linked = form.inventoryItems.find((inv) => inv.id === inventoryId);
  return linked ? linked.quantity : 1;
}

function toggleInventoryLink(inventoryId) {
  if (isInventoryLinked(inventoryId)) {
    form.inventoryItems = form.inventoryItems.filter((inv) => inv.id !== inventoryId);
    return;
  }

  form.inventoryItems = [...form.inventoryItems, { id: inventoryId, quantity: 1 }];
}

function setInventoryQuantity(inventoryId, quantity) {
  const safeQuantity = Math.max(0.01, Number(quantity) || 0.01);
  form.inventoryItems = form.inventoryItems.map((inv) =>
    inv.id === inventoryId ? { ...inv, quantity: safeQuantity } : inv
  );
}

function onImageUrlChange() {
  imagePreviewFailed.value = false;
}

function onImagePreviewError() {
  imagePreviewFailed.value = true;
}

async function saveItem() {
  if (!form.name || !form.category || !form.price || !form.cost) {
    alert('Please fill all required fields.');
    return;
  }

  const payload = {
    name: form.name,
    category: form.category,
    price: Number(form.price),
    cost: Number(form.cost),
    available: Boolean(form.available),
    isCombo: Boolean(form.isCombo),
    pointsValue: Number(form.pointsValue) || 0,
    imageUrl: form.imageUrl.trim(),
    description: form.description.trim(),
    inventoryItems: form.inventoryItems
      .map((inv) => ({ id: inv.id, quantity: Math.max(0.01, Number(inv.quantity) || 0.01) }))
      .filter((inv) => Boolean(inv.id)),
    optionGroupIds: [...form.optionGroupIds],
  };

  if (editingId.value) {
    const current = state.menuItems.find((item) => item.id === editingId.value);
    if (!current) return;
    await updateMenuItem({ ...current, ...payload });
  } else {
    await addMenuItem(payload);
  }

  modalOpen.value = false;
}

async function removeItem(item) {
  if (!confirm(`Delete "${item.name}"?`)) return;
  await deleteMenuItem(item.id);
}

function toggleAvailability(item) {
  updateMenuItem({ ...item, available: !item.available });
}

function toggleOptionGroup(groupId) {
  form.optionGroupIds = form.optionGroupIds.includes(groupId)
    ? form.optionGroupIds.filter((id) => id !== groupId)
    : [...form.optionGroupIds, groupId];
}

// Another manager's edits (or an order selling something out) show up live.
let unsubscribeMenu = null;
let disposed = false;
onMounted(async () => {
  loadOptionGroups().catch((err) => console.error('Failed to load option groups:', err));
  try {
    const unsubscribe = await subscribeMenu(() => {
      refreshMenu();
      loadOptionGroups().catch(() => {});
    });
    if (disposed) unsubscribe();
    else unsubscribeMenu = unsubscribe;
  } catch (err) {
    console.warn('Live menu updates unavailable:', err);
  }
});
onUnmounted(() => {
  disposed = true;
  if (unsubscribeMenu) unsubscribeMenu();
});
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Menu Management</h1>
        <p class="text-gray-500">Add, edit, and manage menu items</p>
      </div>
      <button v-if="activeTab === 'items'" class="px-4 py-2 rounded bg-blue-600 text-white" @click="openCreate">Add Menu Item</button>
    </div>

    <div class="flex gap-2 border-b">
      <button
        class="px-3 py-2 text-sm -mb-px border-b-2"
        :class="activeTab === 'items' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'"
        @click="activeTab = 'items'"
      >Menu Items</button>
      <button
        class="px-3 py-2 text-sm -mb-px border-b-2"
        :class="activeTab === 'options' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'"
        @click="activeTab = 'options'"
      >Options</button>
    </div>

    <OptionGroupsEditor v-if="activeTab === 'options'" />

    <template v-if="activeTab === 'items'">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Total Items</p><p class="text-2xl font-bold">{{ stats.total }}</p></div>
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Available</p><p class="text-2xl font-bold text-green-600">{{ stats.available }}</p></div>
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Combos</p><p class="text-2xl font-bold">{{ stats.combos }}</p></div>
      <div class="bg-white rounded-xl border p-4"><p class="text-sm text-gray-500">Avg Margin</p><p class="text-2xl font-bold text-purple-600">{{ stats.avgMargin.toFixed(1) }}%</p></div>
    </div>

    <div class="bg-white rounded-xl border overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left p-3">Name</th>
            <th class="text-left p-3">Category</th>
            <th class="text-left p-3">Type</th>
            <th class="text-left p-3">Price</th>
            <th class="text-left p-3">Cost</th>
            <th class="text-left p-3">Margin</th>
            <th class="text-left p-3">Points</th>
            <th class="text-left p-3">Status</th>
            <th class="text-left p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in state.menuItems" :key="item.id" class="border-t">
            <td class="p-3 font-medium">{{ item.name }}</td>
            <td class="p-3">{{ item.category }}</td>
            <td class="p-3">{{ item.isCombo ? 'Combo' : 'Single' }}</td>
            <td class="p-3 font-semibold text-green-700">${{ item.price.toFixed(2) }}</td>
            <td class="p-3">${{ item.cost.toFixed(2) }}</td>
            <td class="p-3">{{ (((item.price - item.cost) / item.price) * 100).toFixed(1) }}%</td>
            <td class="p-3">{{ item.pointsValue || 0 }}</td>
            <td class="p-3">
              <button class="px-2 py-1 rounded text-xs" :class="item.available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'" @click="toggleAvailability(item)">
                {{ item.available ? 'Available' : 'Unavailable' }}
              </button>
              <span v-if="item.soldOut && item.available" class="ml-2 text-xs text-red-600">Sold out</span>
            </td>
            <td class="p-3">
              <div class="flex gap-2">
                <button class="px-2 py-1 border rounded" @click="openEdit(item)">Edit</button>
                <button class="px-2 py-1 border border-red-300 text-red-600 rounded" @click="removeItem(item)">Delete</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    </template>

    <div v-if="modalOpen" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl border w-full max-w-xl p-4 space-y-3">
        <h2 class="font-semibold text-lg">{{ editingId ? 'Edit Menu Item' : 'Add Menu Item' }}</h2>

        <div>
          <label class="block text-sm font-medium mb-1">Item Name *</label>
          <input v-model="form.name" class="w-full border rounded px-3 py-2" placeholder="Enter item name" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Category *</label>
          <input v-model="form.category" class="w-full border rounded px-3 py-2" placeholder="Enter category" />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-sm font-medium mb-1">Price *</label>
            <input v-model.number="form.price" type="number" step="0.01" class="w-full border rounded px-3 py-2" placeholder="0.00" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Cost *</label>
            <input v-model.number="form.cost" type="number" step="0.01" class="w-full border rounded px-3 py-2" placeholder="0.00" />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Points Value</label>
          <input v-model.number="form.pointsValue" type="number" min="0" class="w-full border rounded px-3 py-2" placeholder="0" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Image URL</label>
          <div class="flex items-center gap-3">
            <div class="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-line flex items-center justify-center">
              <img
                v-if="form.imageUrl && !imagePreviewFailed"
                :src="form.imageUrl"
                alt=""
                class="w-full h-full object-cover"
                @error="onImagePreviewError"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center font-semibold"
                :style="{ backgroundImage: 'linear-gradient(135deg, var(--primary), var(--secondary))', color: 'var(--primary-ink)' }"
              >
                {{ (form.name || '?').charAt(0).toUpperCase() }}
              </div>
            </div>
            <input
              v-model="form.imageUrl"
              type="url"
              class="flex-1 border border-line rounded-md px-3 py-2 bg-surface text-ink"
              placeholder="https://example.com/image.jpg"
              @input="onImageUrlChange"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Description</label>
          <textarea
            v-model="form.description"
            maxlength="280"
            rows="3"
            class="w-full border border-line rounded-md px-3 py-2 bg-surface text-ink"
            placeholder="Optional description shown to customers"
          ></textarea>
          <p class="text-xs text-ink-muted mt-1">{{ form.description.length }}/280</p>
        </div>

        <div class="border rounded-lg p-3 space-y-3">
          <div>
            <label class="block text-sm font-medium">Inventory Impact</label>
            <p class="text-xs text-gray-500">Select inventory items used per 1 menu item sold.</p>
          </div>

          <div class="max-h-52 overflow-y-auto space-y-2">
            <div
              v-for="inventory in state.inventoryItems"
              :key="inventory.id"
              class="border rounded p-2"
            >
              <div class="flex items-center justify-between gap-2">
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    :checked="isInventoryLinked(inventory.id)"
                    @change="toggleInventoryLink(inventory.id)"
                  />
                  <span>{{ inventory.name }}</span>
                </label>
                <span class="text-xs text-gray-500">Stock: {{ inventory.quantity }} {{ inventory.unit }}</span>
              </div>

              <div v-if="isInventoryLinked(inventory.id)" class="mt-2">
                <label class="block text-xs text-gray-600 mb-1">Quantity used per order item</label>
                <input
                  :value="getInventoryQuantity(inventory.id)"
                  type="number"
                  min="0.01"
                  step="0.01"
                  class="w-full border rounded px-2 py-1 text-sm"
                  @input="setInventoryQuantity(inventory.id, $event.target.value)"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="border rounded-lg p-3 space-y-2">
          <p class="text-sm font-medium">Options</p>
          <p class="text-xs text-gray-500">Pickers shown when this item is ordered, in the order you tick them.</p>
          <p v-if="!state.optionGroups.length" class="text-xs text-gray-500">No option groups yet — create them in the Options tab.</p>
          <label v-for="group in state.optionGroups" :key="group.id" class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              :checked="form.optionGroupIds.includes(group.id)"
              @change="toggleOptionGroup(group.id)"
            />
            {{ group.name }}
          </label>
        </div>

        <div class="flex items-center gap-4 text-sm">
          <label class="flex items-center gap-2"><input v-model="form.available" type="checkbox" /> Available</label>
          <label class="flex items-center gap-2"><input v-model="form.isCombo" type="checkbox" /> Combo</label>
        </div>

        <div v-if="form.price > 0" class="bg-blue-50 border border-blue-200 rounded p-2 text-sm">
          Profit margin: {{ profitMargin.toFixed(1) }}% · Profit per item: ${{ (form.price - form.cost).toFixed(2) }}
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button class="px-3 py-2 border rounded" @click="modalOpen = false">Cancel</button>
          <button class="px-3 py-2 bg-blue-600 text-white rounded" @click="saveItem">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>
