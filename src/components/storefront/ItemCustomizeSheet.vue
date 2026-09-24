<script setup>
import { ref, computed, watch } from 'vue';
import UiModal from '../ui/UiModal.vue';
import UiButton from '../ui/UiButton.vue';

const props = defineProps({
  open: { type: Boolean, required: true },
  item: { type: Object, default: null },
});

const emit = defineEmits(['close', 'confirm']);

// ── Options data ──────────────────────────────────────────────────────────────

const pizzaSizeOptions = [
  { value: 'personal pan', label: 'Personal Pan', priceDelta: -2 },
  { value: 'medium',       label: 'Medium',       priceDelta: 0  },
  { value: 'large',        label: 'Large',        priceDelta: 3  },
];

const pizzaToppingOptions = [
  { value: 'pepperoni',   label: 'Pepperoni'   },
  { value: 'ham',         label: 'Ham'         },
  { value: 'sausage',     label: 'Sausage'     },
  { value: 'bacon',       label: 'Bacon'       },
  { value: 'pineapple',   label: 'Pineapple'   },
  { value: 'mushrooms',   label: 'Mushrooms'   },
  { value: 'onions',      label: 'Onions'      },
  { value: 'bell peppers',label: 'Bell Peppers'},
  { value: 'black olives',label: 'Black Olives'},
  { value: 'tomatoes',    label: 'Tomatoes'    },
  { value: 'extra cheese',label: 'Extra Cheese'},
];

const pizzaPresetStyles = [
  { value: 'hawaiian',    label: 'Hawaiian',     toppings: ['ham', 'pineapple']                              },
  { value: 'meat lovers', label: 'Meat Lovers',  toppings: ['pepperoni', 'sausage', 'bacon', 'ham']          },
  { value: 'veggie',      label: 'Veggie',       toppings: ['mushrooms', 'onions', 'bell peppers', 'black olives', 'tomatoes'] },
];

const wingFlavorOptions = [
  { value: 'buffalo',        label: 'Buffalo'        },
  { value: 'honey mustard',  label: 'Honey Mustard'  },
  { value: 'original',       label: 'Original'       },
  { value: 'bbq',            label: 'BBQ'            },
  { value: 'sweet and spicy',label: 'Sweet and Spicy'},
];

const sodaFlavorOptions = [
  { value: 'root beer',   label: 'Root Beer'  },
  { value: 'sprite',      label: 'Sprite'     },
  { value: 'coke cola',   label: 'Coke Cola'  },
  { value: 'orange soda', label: 'Orange Soda'},
  { value: 'grape soda',  label: 'Grape Soda' },
];

// ── Selection state ───────────────────────────────────────────────────────────

const selectedPizzaSize     = ref('medium');
const selectedPizzaStyle    = ref('custom');
const selectedPizzaToppings = ref(['pepperoni']);
const selectedWingFlavor    = ref('buffalo');
const selectedSodaFlavor    = ref('coke cola');

// Reset defaults whenever a new item is opened
watch(
  () => props.item,
  (newItem) => {
    if (newItem) {
      selectedPizzaSize.value     = 'medium';
      selectedPizzaStyle.value    = 'custom';
      selectedPizzaToppings.value = ['pepperoni'];
      selectedWingFlavor.value    = 'buffalo';
      selectedSodaFlavor.value    = 'coke cola';
    }
  },
);

// ── Item classification ───────────────────────────────────────────────────────

function isPizzaItem(menuItem) {
  const name     = (menuItem?.name     || '').toLowerCase();
  const category = (menuItem?.category || '').toLowerCase();
  return name.includes('pizza') || category.includes('pizza');
}

function isWingsItem(menuItem) {
  return (menuItem?.name || '').toLowerCase().includes('wings');
}

function isSodaItem(menuItem) {
  const name = (menuItem?.name || '').toLowerCase();
  return (
    name.includes('soda') ||
    name.includes('cola') ||
    name.includes('coke') ||
    name.includes('sprite') ||
    name.includes('root beer')
  );
}

// ── Price calculation ─────────────────────────────────────────────────────────

function calculateCustomPrice(menuItem, options = {}) {
  let price = Number(menuItem?.price || 0);
  if (options.pizzaSize) {
    const sizeOption = pizzaSizeOptions.find((s) => s.value === options.pizzaSize);
    price += sizeOption?.priceDelta || 0;
  }
  return Math.max(0, Number(price.toFixed(2)));
}

const currentOptions = computed(() => {
  if (!props.item) return {};
  const opts = {};
  if (isPizzaItem(props.item)) {
    opts.pizzaSize     = selectedPizzaSize.value;
    opts.pizzaStyle    = selectedPizzaStyle.value;
    opts.pizzaToppings = [...selectedPizzaToppings.value].sort();
  }
  if (isWingsItem(props.item)) opts.wingFlavor = selectedWingFlavor.value;
  if (isSodaItem(props.item))  opts.sodaFlavor = selectedSodaFlavor.value;
  return opts;
});

const livePrice = computed(() => calculateCustomPrice(props.item, currentOptions.value));

// ── Display helpers ───────────────────────────────────────────────────────────

function formatToppingLabel(value) {
  return value
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildDisplayName(menuItem, options = {}) {
  const details = [];
  if (options.pizzaSize)                                    details.push(options.pizzaSize);
  if (options.pizzaStyle && options.pizzaStyle !== 'custom') details.push(options.pizzaStyle);
  if (options.pizzaToppings?.length)                        details.push(`${options.pizzaToppings.length} toppings`);
  if (options.wingFlavor)                                   details.push(options.wingFlavor);
  if (options.sodaFlavor)                                   details.push(options.sodaFlavor);
  return details.length ? `${menuItem.name} (${details.join(', ')})` : menuItem.name;
}

// ── Preset / Topping helpers ──────────────────────────────────────────────────

function applyPizzaPreset(styleValue) {
  if (styleValue === 'custom') { selectedPizzaStyle.value = 'custom'; return; }
  const preset = pizzaPresetStyles.find((style) => style.value === styleValue);
  if (!preset) return;
  selectedPizzaStyle.value    = preset.value;
  selectedPizzaToppings.value = [...preset.toppings];
}

function togglePizzaTopping(toppingValue) {
  if (selectedPizzaToppings.value.includes(toppingValue)) {
    selectedPizzaToppings.value = selectedPizzaToppings.value.filter((v) => v !== toppingValue);
  } else {
    selectedPizzaToppings.value = [...selectedPizzaToppings.value, toppingValue];
  }
  selectedPizzaStyle.value = 'custom';
}

// ── Confirm ───────────────────────────────────────────────────────────────────

function handleConfirm() {
  if (!props.item) return;
  const options = currentOptions.value;
  const notesParts = [
    options.pizzaSize                ? `Size: ${options.pizzaSize}`                                               : null,
    options.pizzaStyle               ? `Style: ${options.pizzaStyle}`                                             : null,
    options.pizzaToppings?.length    ? `Toppings: ${options.pizzaToppings.map(formatToppingLabel).join(', ')}` : null,
    options.wingFlavor               ? `Wings Flavor: ${options.wingFlavor}`                                      : null,
    options.sodaFlavor               ? `Soda Flavor: ${options.sodaFlavor}`                                       : null,
  ].filter(Boolean);

  emit('confirm', {
    menuItemId: props.item.id,
    name:       buildDisplayName(props.item, options),
    price:      livePrice.value,
    options,
    notes:      notesParts.length ? notesParts.join(' • ') : undefined,
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

      <!-- ── Pizza ─────────────────────────────────────────────────────────── -->
      <template v-if="isPizzaItem(item)">
        <section class="cs__section">
          <p class="cs__label">Pizza Size</p>
          <div class="cs__radio-group" role="radiogroup" :aria-label="`${item.name} size`">
            <label
              v-for="size in pizzaSizeOptions"
              :key="size.value"
              class="cs__radio-row"
              :class="{ 'cs__radio-row--active': selectedPizzaSize === size.value }"
            >
              <span class="cs__radio-text">
                {{ size.label }}
                <span v-if="size.priceDelta !== 0" class="cs__price-delta">
                  {{ size.priceDelta > 0 ? `+$${size.priceDelta.toFixed(2)}` : `-$${Math.abs(size.priceDelta).toFixed(2)}` }}
                </span>
              </span>
              <input
                v-model="selectedPizzaSize"
                type="radio"
                :value="size.value"
                class="cs__radio-input"
              />
            </label>
          </div>
        </section>

        <section class="cs__section">
          <p class="cs__label">Preset Style</p>
          <div class="cs__grid">
            <button
              type="button"
              class="cs__preset-btn"
              :class="{ 'cs__preset-btn--active': selectedPizzaStyle === 'custom' }"
              :aria-pressed="selectedPizzaStyle === 'custom'"
              @click="applyPizzaPreset('custom')"
            >Custom</button>
            <button
              v-for="style in pizzaPresetStyles"
              :key="style.value"
              type="button"
              class="cs__preset-btn"
              :class="{ 'cs__preset-btn--active': selectedPizzaStyle === style.value }"
              :aria-pressed="selectedPizzaStyle === style.value"
              @click="applyPizzaPreset(style.value)"
            >{{ style.label }}</button>
          </div>
        </section>

        <section class="cs__section">
          <p class="cs__label">Toppings</p>
          <div class="cs__grid">
            <label
              v-for="topping in pizzaToppingOptions"
              :key="topping.value"
              class="cs__check-row"
              :class="{ 'cs__check-row--active': selectedPizzaToppings.includes(topping.value) }"
            >
              <input
                type="checkbox"
                :checked="selectedPizzaToppings.includes(topping.value)"
                class="cs__check-input"
                @change="togglePizzaTopping(topping.value)"
              />
              {{ topping.label }}
            </label>
          </div>
        </section>
      </template>

      <!-- ── Wings ─────────────────────────────────────────────────────────── -->
      <section v-if="isWingsItem(item)" class="cs__section">
        <label class="cs__label" :for="`cs-wing-${item.id}`">Wings Flavor</label>
        <select
          :id="`cs-wing-${item.id}`"
          v-model="selectedWingFlavor"
          class="cs__select"
        >
          <option
            v-for="flavor in wingFlavorOptions"
            :key="flavor.value"
            :value="flavor.value"
          >{{ flavor.label }}</option>
        </select>
      </section>

      <!-- ── Soda ───────────────────────────────────────────────────────────── -->
      <section v-if="isSodaItem(item)" class="cs__section">
        <label class="cs__label" :for="`cs-soda-${item.id}`">Soda Flavor</label>
        <select
          :id="`cs-soda-${item.id}`"
          v-model="selectedSodaFlavor"
          class="cs__select"
        >
          <option
            v-for="flavor in sodaFlavorOptions"
            :key="flavor.value"
            :value="flavor.value"
          >{{ flavor.label }}</option>
        </select>
      </section>

    </div>

    <template #footer>
      <UiButton variant="secondary" @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" @click="handleConfirm">
        Add to Cart — ${{ livePrice.toFixed(2) }}
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

/* ── Grid (presets + toppings) ────────────────────────────────────────────── */
.cs__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

/* ── Preset buttons ───────────────────────────────────────────────────────── */
.cs__preset-btn {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  text-align: center;
  transition:
    border-color var(--motion-fast) var(--ease),
    background   var(--motion-fast) var(--ease),
    color        var(--motion-fast) var(--ease);
}

.cs__preset-btn--active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
  color: var(--primary);
}

.cs__preset-btn:not(.cs__preset-btn--active):hover {
  background: var(--surface-sunken);
}

.cs__preset-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
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

/* ── Select ───────────────────────────────────────────────────────────────── */
.cs__select {
  width: 100%;
  padding: 0 var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--text-sm);
  height: var(--control-h, 44px);
  cursor: pointer;
  appearance: auto;
}

.cs__select:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}
</style>
