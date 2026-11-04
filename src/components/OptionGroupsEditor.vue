<script setup>
import { reactive, ref, onMounted } from 'vue';
import { usePosStore } from '../store/usePosStore';

const { state, loadOptionGroups, saveOptionGroup, deleteOptionGroup, setChoiceEnabled } = usePosStore();

const modalOpen = ref(false);
const saving = ref(false);
const error = ref('');
const form = reactive({ id: null, name: '', minSelect: 1, maxSelect: 1, choices: [] });

onMounted(async () => {
  try {
    await loadOptionGroups();
  } catch (err) {
    error.value = err.message;
  }
});

function blankChoice() {
  return { id: null, name: '', priceDelta: 0, enabled: true, isDefault: false, inventoryItemId: null, inventoryQty: 1 };
}

function openCreate() {
  Object.assign(form, { id: null, name: '', minSelect: 1, maxSelect: 1, choices: [blankChoice()] });
  error.value = '';
  modalOpen.value = true;
}

function openEdit(group) {
  Object.assign(form, {
    id: group.id,
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    choices: group.choices.map((c) => ({
      id: c.id,
      name: c.name,
      priceDelta: c.priceDelta,
      enabled: c.enabled,
      isDefault: c.isDefault,
      inventoryItemId: c.inventoryItemId,
      inventoryQty: c.inventoryQty ?? 1,
    })),
  });
  error.value = '';
  modalOpen.value = true;
}

function addChoice() {
  form.choices.push(blankChoice());
}

function removeChoice(index) {
  form.choices.splice(index, 1);
}

function moveChoice(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= form.choices.length) return;
  const [row] = form.choices.splice(index, 1);
  form.choices.splice(target, 0, row);
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    await saveOptionGroup({
      id: form.id || undefined,
      name: form.name.trim(),
      minSelect: Number(form.minSelect),
      maxSelect: Number(form.maxSelect),
      choices: form.choices.map((c) => ({
        ...(c.id ? { id: c.id } : {}),
        name: c.name.trim(),
        priceDelta: Number(c.priceDelta) || 0,
        enabled: Boolean(c.enabled),
        isDefault: Boolean(c.isDefault),
        inventoryItemId: c.inventoryItemId ? Number(c.inventoryItemId) : null,
        inventoryQty: c.inventoryItemId ? Number(c.inventoryQty) : null,
      })),
    });
    modalOpen.value = false;
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function remove(group) {
  if (!confirm(`Delete the "${group.name}" option group?`)) return;
  try {
    await deleteOptionGroup(group.id);
  } catch (err) {
    alert(err.message);
  }
}

async function toggle(choice) {
  try {
    await setChoiceEnabled(choice.id, !choice.enabled);
  } catch (err) {
    alert(err.message);
  }
}

function stockName(id) {
  return state.inventoryItems.find((i) => i.id === id)?.name || 'stock';
}

function rule(group) {
  if (group.maxSelect === 1) return group.minSelect === 1 ? 'Pick 1 (required)' : 'Pick 1 (optional)';
  return `Pick ${group.minSelect}–${group.maxSelect}`;
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <p class="text-sm text-ink-muted">Choices customers and cashiers pick from. Switch a choice off when you run out.</p>
      <button class="c-btn c-btn--primary" @click="openCreate">Add Option Group</button>
    </div>

    <p v-if="error && !modalOpen" class="text-sm text-danger">{{ error }}</p>
    <p v-if="!state.optionGroups.length && !error" class="text-sm text-ink-muted">No option groups yet.</p>

    <div v-for="group in state.optionGroups" :key="group.id" class="bg-surface rounded-xl border p-4 space-y-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="font-semibold">{{ group.name }}</p>
          <p class="text-xs text-ink-muted">
            {{ rule(group) }} ·
            <span v-if="group.usedBy.length">Used by {{ group.usedBy.map((u) => u.name).join(', ') }}</span>
            <span v-else>Not used by any menu item</span>
          </p>
        </div>
        <div class="flex gap-2">
          <button class="c-btn c-btn--secondary c-btn--sm" @click="openEdit(group)">Edit</button>
          <button class="c-btn c-btn--danger c-btn--sm" @click="remove(group)">Delete</button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="choice in group.choices"
          :key="choice.id"
          class="px-2 py-1 rounded-md text-xs border"
          :class="choice.available ? 'bg-positive/10 border-positive/30 text-positive-text' : 'bg-surface-sunken border-line text-ink-muted'"
          :title="choice.enabled ? 'Click to switch off' : 'Click to switch on'"
          @click="toggle(choice)"
        >
          {{ choice.name }}
          <span v-if="!choice.enabled">· Off</span>
          <span v-else-if="!choice.available">· Out of {{ stockName(choice.inventoryItemId) }}</span>
        </button>
      </div>
    </div>

    <div v-if="modalOpen" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-surface rounded-xl border w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <h2 class="text-lg font-semibold p-4 border-b">{{ form.id ? 'Edit' : 'New' }} Option Group</h2>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div class="md:col-span-1">
              <label class="text-sm">Name</label>
              <input v-model="form.name" class="c-input" placeholder="Soda Flavor" />
            </div>
            <div>
              <label class="text-sm">Must pick at least</label>
              <input v-model.number="form.minSelect" type="number" min="0" class="c-input" />
            </div>
            <div>
              <label class="text-sm">Can pick at most</label>
              <input v-model.number="form.maxSelect" type="number" min="1" class="c-input" />
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-ink-muted">
                  <th class="py-1 pr-2">Choice</th>
                  <th class="py-1 pr-2">Price +/−</th>
                  <th class="py-1 pr-2">Default</th>
                  <th class="py-1 pr-2">On</th>
                  <th class="py-1 pr-2">Stock item</th>
                  <th class="py-1 pr-2">Qty</th>
                  <th class="py-1"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(choice, index) in form.choices" :key="choice.id ?? `new-${index}`" class="border-t">
                  <td class="py-1 pr-2"><input v-model="choice.name" class="c-input c-input--sm" /></td>
                  <td class="py-1 pr-2"><input v-model.number="choice.priceDelta" type="number" step="0.01" class="c-input c-input--sm w-24" /></td>
                  <td class="py-1 pr-2"><input v-model="choice.isDefault" type="checkbox" /></td>
                  <td class="py-1 pr-2"><input v-model="choice.enabled" type="checkbox" /></td>
                  <td class="py-1 pr-2">
                    <select v-model="choice.inventoryItemId" class="c-input c-input--sm w-auto">
                      <option :value="null">Not linked</option>
                      <option v-for="inv in state.inventoryItems" :key="inv.id" :value="inv.id">{{ inv.name }}</option>
                    </select>
                  </td>
                  <td class="py-1 pr-2">
                    <input
                      v-model.number="choice.inventoryQty"
                      type="number"
                      min="0.001"
                      step="0.001"
                      class="w-20 border rounded-md px-2 py-1"
                      :disabled="!choice.inventoryItemId"
                    />
                  </td>
                  <td class="py-1 whitespace-nowrap">
                    <button class="px-1" aria-label="Move up" @click="moveChoice(index, -1)">↑</button>
                    <button class="px-1" aria-label="Move down" @click="moveChoice(index, 1)">↓</button>
                    <button class="px-1 text-danger" aria-label="Remove choice" @click="removeChoice(index)">✕</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button class="c-btn c-btn--secondary c-btn--sm" @click="addChoice">Add choice</button>

          <p v-if="error" class="text-sm text-danger">{{ error }}</p>
        </div>

        <div class="flex justify-end gap-2 p-4 border-t">
          <button class="c-btn c-btn--secondary" @click="modalOpen = false">Cancel</button>
          <button class="c-btn c-btn--primary" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
