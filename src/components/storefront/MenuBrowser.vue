<script setup>
import { ref, computed, onMounted } from 'vue';
import { usePosStore }   from '../../store/usePosStore.js';
import { useCartStore }  from '../../store/useCartStore.js';
import { useToast }      from '../../lib/useToast.js';
import UiChip            from '../ui/UiChip.vue';
import UiSkeleton        from '../ui/UiSkeleton.vue';
import UiEmptyState      from '../ui/UiEmptyState.vue';
import MenuItemCard      from './MenuItemCard.vue';
import ItemCustomizeSheet from './ItemCustomizeSheet.vue';

const store = usePosStore();
const cart  = useCartStore();
const toast = useToast();

const selectedCategory = ref('All');
const sheetOpen        = ref(false);
const sheetItem        = ref(null);

// ── On mount: load public menu if not yet loaded ──────────────────────────────

onMounted(async () => {
  if (!store.state.menuItems.length) {
    await store.loadPublic();
    if (cart.state.items.length) {
      const { removed } = cart.reconcileWithMenu(store.state.menuItems);
      if (removed.length) {
        toast.info(
          `${removed.join(', ')} ${removed.length === 1 ? 'is' : 'are'} no longer available and ${removed.length === 1 ? 'was' : 'were'} removed from your cart.`,
        );
      }
    }
  }
});

// ── Derived data ──────────────────────────────────────────────────────────────

const categories = computed(() => {
  const cats = [
    ...new Set(
      store.state.menuItems
        .filter((i) => i.available)
        .map((i) => i.category),
    ),
  ];
  return ['All', ...cats];
});

const filteredItems = computed(() => {
  const available = store.state.menuItems.filter((i) => i.available);
  if (selectedCategory.value === 'All') return available;
  return available.filter((i) => i.category === selectedCategory.value);
});

// ── Customization detection ───────────────────────────────────────────────────

function needsCustomization(item) {
  const name = (item.name || '').toLowerCase();
  const cat  = (item.category || '').toLowerCase();
  return (
    name.includes('pizza') || cat.includes('pizza') ||
    name.includes('wings') ||
    name.includes('soda')  || name.includes('cola') ||
    name.includes('coke')  || name.includes('sprite') ||
    name.includes('root beer')
  );
}

// ── Cart actions ──────────────────────────────────────────────────────────────

function onAdd(item) {
  cart.addLine({
    menuItemId: item.id,
    name:       item.name,
    price:      Number(item.price),
    options:    {},
    notes:      undefined,
  });
  toast.success(`${item.name} added to cart`);
}

function onCustomize(item) {
  if (!needsCustomization(item)) {
    onAdd(item);
    return;
  }
  sheetItem.value = item;
  sheetOpen.value = true;
}

function onSheetConfirm(payload) {
  cart.addLine(payload);
  toast.success(`${payload.name} added to cart`);
  sheetOpen.value = false;
  sheetItem.value = null;
}

function onSheetClose() {
  sheetOpen.value = false;
}
</script>

<template>
  <div class="mb">

    <!-- ── Category chips ───────────────────────────────────────────────────── -->
    <nav class="mb__chips" aria-label="Filter by category">
      <UiChip
        v-for="cat in categories"
        :key="cat"
        :selected="selectedCategory === cat"
        @click="selectedCategory = cat"
      >{{ cat }}</UiChip>
    </nav>

    <!-- ── Loading skeleton (8 cards) ───────────────────────────────────────── -->
    <div
      v-if="store.state.loading"
      class="mb__grid"
      aria-busy="true"
      aria-label="Loading menu items"
    >
      <div v-for="n in 8" :key="n" class="mb__skel-card">
        <UiSkeleton
          width="100%"
          height="140px"
          :radius="'var(--radius-lg) var(--radius-lg) 0 0'"
        />
        <div class="mb__skel-body">
          <UiSkeleton width="70%" height="1rem" />
          <UiSkeleton width="90%" height="0.75rem" />
          <UiSkeleton width="40%" height="1rem" />
        </div>
      </div>
    </div>

    <!-- ── Empty state ──────────────────────────────────────────────────────── -->
    <UiEmptyState
      v-else-if="filteredItems.length === 0"
      icon="search"
      title="No items found"
      description="Try a different category or check back later."
    />

    <!-- ── Item grid ────────────────────────────────────────────────────────── -->
    <div v-else class="mb__grid">
      <MenuItemCard
        v-for="item in filteredItems"
        :key="item.id"
        :item="item"
        @add="onAdd"
        @customize="onCustomize"
      />
    </div>

    <!-- ── Customization sheet ──────────────────────────────────────────────── -->
    <ItemCustomizeSheet
      :open="sheetOpen"
      :item="sheetItem"
      @close="onSheetClose"
      @confirm="onSheetConfirm"
    />

  </div>
</template>

<style scoped>
.mb {
  display: flex;
  flex-direction: column;
}

/* ── Chip row ─────────────────────────────────────────────────────────────── */
.mb__chips {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  overflow-x: auto;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  scrollbar-width: none;
}

.mb__chips::-webkit-scrollbar {
  display: none;
}

/* ── Grid ─────────────────────────────────────────────────────────────────── */
.mb__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--row-gap, var(--space-4));
  padding: var(--space-5);
}

/* 2 columns at 480px+ */
@media (min-width: 480px) {
  .mb__grid { grid-template-columns: repeat(2, 1fr); }
}

/* 3 columns at 768px+ */
@media (min-width: 768px) {
  .mb__grid { grid-template-columns: repeat(3, 1fr); }
}

/* 4 columns at 1200px+ */
@media (min-width: 1200px) {
  .mb__grid { grid-template-columns: repeat(4, 1fr); }
}

/* ── Skeleton card ────────────────────────────────────────────────────────── */
.mb__skel-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--surface-raised);
}

.mb__skel-body {
  padding: var(--card-pad, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
