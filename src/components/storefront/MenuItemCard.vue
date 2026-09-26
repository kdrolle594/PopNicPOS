<script setup>
import UiCard from '../ui/UiCard.vue';
import UiBadge from '../ui/UiBadge.vue';

const props = defineProps({
  item: { type: Object, required: true },
});

const emit = defineEmits(['add', 'customize']);

function getInitial(name) {
  return (name || '?')[0].toUpperCase();
}
</script>

<template>
  <UiCard
    interactive
    :padded="false"
    :class="{ 'mic--sold-out': item.soldOut }"
    :aria-disabled="item.soldOut || undefined"
    @click="!item.soldOut && emit('customize', item)"
  >
    <!-- 16:9 image / gradient fallback -->
    <div class="mic__media" aria-hidden="true">
      <img
        v-if="item.imageUrl"
        :src="item.imageUrl"
        loading="lazy"
        alt=""
        class="mic__img"
      />
      <div v-else class="mic__fallback">
        <span class="mic__initial" aria-hidden="true">{{ getInitial(item.name) }}</span>
      </div>
    </div>

    <!-- Card body -->
    <div class="mic__body">
      <p class="mic__name">{{ item.name }}</p>
      <p v-if="item.description" class="mic__desc">{{ item.description }}</p>
      <div class="mic__footer">
        <span class="mic__price">${{ Number(item.price).toFixed(2) }}</span>
        <UiBadge v-if="item.soldOut" tone="neutral">Sold out</UiBadge>
        <button
          v-else
          type="button"
          class="mic__add"
          :aria-label="`Add ${item.name} to cart`"
          @click.stop="emit('add', item)"
        >+</button>
      </div>
    </div>
  </UiCard>
</template>

<style scoped>
/* ── Media ─────────────────────────────────────────────────────────────────── */
.mic__media {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.mic__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mic__fallback {
  width: 100%;
  height: 100%;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--primary) 18%, var(--surface)),
    color-mix(in srgb, var(--secondary) 18%, var(--surface))
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

.mic__initial {
  font-size: var(--text-display, 3rem);
  font-weight: var(--weight-semibold);
  color: var(--ink-subtle);
  line-height: 1;
  user-select: none;
}

/* ── Body ──────────────────────────────────────────────────────────────────── */
.mic__body {
  padding: var(--card-pad, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.mic__name {
  font-size: var(--text-h3);
  font-weight: var(--weight-semibold);
  color: var(--ink);
  margin: 0;
  line-height: 1.3;
}

.mic__desc {
  font-size: var(--text-sm);
  color: var(--ink-muted);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Footer row ────────────────────────────────────────────────────────────── */
.mic__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-1);
}

.mic__price {
  font-size: var(--text-body-lg, 1.125rem);
  font-weight: 700;
  color: var(--ink);
}

/* ── Add button (≥ 44×44 per WCAG) ────────────────────────────────────────── */
.mic__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary);
  color: var(--primary-ink);
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--motion-fast) var(--ease);
}

.mic__add:hover {
  background: var(--primary-hover);
}

.mic__add:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.mic--sold-out {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
