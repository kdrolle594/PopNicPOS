<script setup>
defineProps({
  selected: Boolean,
  as:       { type: String, default: 'button' },
});
</script>

<template>
  <component
    :is="as"
    class="ui-chip"
    :class="{ 'ui-chip--selected': selected }"
    :type="as === 'button' ? 'button' : undefined"
    :aria-pressed="as === 'button' ? selected : undefined"
  >
    <slot />
  </component>
</template>

<style scoped>
.ui-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: calc(var(--control-h, 44px) - 12px);
  padding: 0 var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  font-family: inherit;
  font-size: var(--text-small);
  font-weight: var(--weight-medium);
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  background: var(--surface);
  color: var(--ink);
  transition:
    background var(--motion-fast) var(--ease),
    border-color var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
  text-decoration: none;
}

.ui-chip--selected {
  background: var(--primary);
  color: var(--primary-ink);
  border-color: var(--primary);
}

.ui-chip:not(.ui-chip--selected):hover {
  background: var(--surface-sunken);
}
</style>
