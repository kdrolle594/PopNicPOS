<script setup>
defineProps({
  tone: { type: String, default: 'neutral' },
});
</script>

<template>
  <span class="ui-badge" :class="`ui-badge--${tone}`">
    <slot />
  </span>
</template>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-pill);
  font-size: var(--text-caption);
  font-weight: var(--weight-semibold);
  padding: 2px var(--space-2);
  line-height: 1.4;
  white-space: nowrap;
}

/* Neutral — uses ink-subtle as the tone reference */
.ui-badge--neutral {
  background: color-mix(in srgb, var(--ink-subtle) 14%, transparent);
  color: var(--ink-muted);
}

.ui-badge--primary {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary-text);
}

.ui-badge--positive {
  background: color-mix(in srgb, var(--positive) 14%, transparent);
  color: var(--positive-text);
}

.ui-badge--warning {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--warning);
}

.ui-badge--danger {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
  color: var(--danger);
}
</style>
