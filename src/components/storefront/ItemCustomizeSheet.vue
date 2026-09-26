<script setup>
import { ref, computed, watch } from 'vue';
import UiModal from '../ui/UiModal.vue';
import UiButton from '../ui/UiButton.vue';
import {
  defaultSelection, validateSelection, linePrice, lineLabel, pruneSelection,
  toggleChoice, groupHint, formatPriceDelta,
} from '../../../shared/menuOptions.js';

const props = defineProps({
  open: { type: Boolean, required: true },
  // Pass the live item from the store: it updates when the menu refreshes.
  item: { type: Object, default: null },
});

const emit = defineEmits(['close', 'confirm']);

const selected = ref([]);
const notice = ref('');

// Opening starts from the item's defaults.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.item) {
      selected.value = defaultSelection(props.item);
      notice.value = '';
    }
  },
  { immediate: true },
);

// A live refresh of the same item keeps the customer's picks, minus any
// choice that just became unavailable.
watch(
  () => props.item,
  (next, prev) => {
    if (!next || !prev || next.id !== prev.id) return;
    const { choiceIds, dropped } = pruneSelection(next, selected.value, prev);
    if (dropped.length) {
      selected.value = choiceIds;
      notice.value = `${dropped.join(', ')} just sold out.`;
    }
  },
);

const soldOut = computed(() => Boolean(props.item?.soldOut));
const validation = computed(() =>
  props.item ? validateSelection(props.item, selected.value) : { ok: false, errors: [] }
);
const price = computed(() => (props.item ? linePrice(props.item, selected.value) : 0));

function isSelected(choiceId) {
  return selected.value.includes(choiceId);
}

function pick(choiceId) {
  selected.value = toggleChoice(props.item, selected.value, choiceId);
}

function groupError(group) {
  return validation.value.errors.find((e) => e.groupId === group.id)?.message || '';
}

function handleConfirm() {
  if (!props.item || soldOut.value || !validation.value.ok) return;
  emit('confirm', {
    menuItemId: props.item.id,
    name: lineLabel(props.item, selected.value),
    price: price.value,
    choiceIds: [...selected.value],
  });
}
</script>

<template>
  <UiModal
    :open="open"
    :title="item ? `Customize ${item.name}` : ''"
    sheet
    @close="emit('close')"
  >
    <div v-if="item" class="cs">
      <p v-if="soldOut" class="cs__notice cs__notice--danger" role="alert">
        {{ item.name }} just sold out.
      </p>
      <p v-else-if="notice" class="cs__notice" role="status">{{ notice }}</p>

      <section v-for="group in item.optionGroups" :key="group.id" class="cs__section">
        <div class="cs__group-head">
          <p :id="`cs-group-${group.id}`" class="cs__label">{{ group.name }}</p>
          <span class="cs__hint">{{ groupHint(group) }}</span>
        </div>

        <div
          v-if="group.maxSelect === 1"
          class="cs__radio-group"
          role="radiogroup"
          :aria-labelledby="`cs-group-${group.id}`"
        >
          <label
            v-for="choice in group.choices"
            :key="choice.id"
            class="cs__radio-row"
            :class="{ 'cs__radio-row--active': isSelected(choice.id) }"
          >
            <span class="cs__radio-text">
              {{ choice.name }}
              <span v-if="choice.priceDelta" class="cs__price-delta">{{ formatPriceDelta(choice.priceDelta) }}</span>
            </span>
            <input
              type="radio"
              class="cs__radio-input"
              :name="`cs-group-${group.id}`"
              :checked="isSelected(choice.id)"
              @click.prevent="pick(choice.id)"
            />
          </label>
        </div>

        <div v-else class="cs__grid" role="group" :aria-labelledby="`cs-group-${group.id}`">
          <label
            v-for="choice in group.choices"
            :key="choice.id"
            class="cs__check-row"
            :class="{ 'cs__check-row--active': isSelected(choice.id) }"
          >
            <input
              type="checkbox"
              class="cs__check-input"
              :checked="isSelected(choice.id)"
              @click.prevent="pick(choice.id)"
            />
            {{ choice.name }}
            <span v-if="choice.priceDelta" class="cs__price-delta">{{ formatPriceDelta(choice.priceDelta) }}</span>
          </label>
        </div>

        <p v-if="groupError(group)" class="cs__error">{{ groupError(group) }}</p>
      </section>
    </div>

    <template #footer>
      <UiButton variant="secondary" @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" :disabled="soldOut || !validation.ok" @click="handleConfirm">
        Add to Cart — ${{ price.toFixed(2) }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.cs {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* ── Section ──────────────────────────────────────────────────────────────── */
.cs__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cs__label {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--ink);
  margin: 0;
}

/* ── Radio rows ───────────────────────────────────────────────────────────── */
.cs__radio-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cs__radio-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--ease),
    background   var(--motion-fast) var(--ease);
}

.cs__radio-row--active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
}

.cs__radio-text {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--ink);
}

.cs__price-delta {
  font-size: var(--text-caption);
  color: var(--ink-muted);
}

.cs__radio-input {
  accent-color: var(--primary);
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ── Grid (multi-select choices) ──────────────────────────────────────────── */
.cs__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

/* ── Checkbox rows ────────────────────────────────────────────────────────── */
.cs__check-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--ink);
  transition:
    border-color var(--motion-fast) var(--ease),
    background   var(--motion-fast) var(--ease);
}

.cs__check-row--active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
}

.cs__check-input {
  accent-color: var(--primary);
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.cs__group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.cs__hint {
  font-size: var(--text-caption);
  color: var(--ink-muted);
}

.cs__notice {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background: var(--surface-sunken);
  color: var(--ink);
  font-size: var(--text-sm);
}

.cs__notice--danger {
  border-color: var(--danger);
  color: var(--danger);
}

.cs__error {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--danger);
}
</style>
