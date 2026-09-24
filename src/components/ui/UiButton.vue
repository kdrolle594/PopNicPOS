<script setup>
defineProps({
  variant:  { type: String,  default: 'primary' },
  size:     { type: String,  default: 'md' },
  loading:  Boolean,
  disabled: Boolean,
  block:    Boolean,
  type:     { type: String,  default: 'button' },
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    class="ui-btn"
    :class="[`ui-btn--${variant}`, `ui-btn--${size}`, { 'ui-btn--block': block }]"
  >
    <span v-if="loading" class="ui-btn__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: var(--control-h, 44px);
  padding: 0 var(--space-5);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--motion-fast) var(--ease),
    border-color var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}

.ui-btn:disabled { opacity: .55; cursor: not-allowed; }
.ui-btn--block   { width: 100%; }

.ui-btn--sm { height: calc(var(--control-h, 44px) - 10px); padding: 0 var(--space-3); font-size: var(--text-small); }
.ui-btn--lg { height: calc(var(--control-h, 44px) + 6px);  padding: 0 var(--space-6); font-size: var(--text-body-lg); }

.ui-btn--primary { background: var(--primary); color: var(--primary-ink); }
.ui-btn--primary:hover:not(:disabled) { background: var(--primary-hover); }

.ui-btn--secondary { background: var(--surface); color: var(--ink); border-color: var(--line); }
.ui-btn--secondary:hover:not(:disabled) { background: var(--surface-sunken); }

.ui-btn--ghost { background: transparent; color: var(--ink-muted); }
.ui-btn--ghost:hover:not(:disabled) { background: var(--surface-sunken); color: var(--ink); }

.ui-btn--danger { background: var(--danger); color: #FFFFFF; }
.ui-btn--danger:hover:not(:disabled) { filter: brightness(.92); }

.ui-btn__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ui-btn-spin .7s linear infinite;
}

@keyframes ui-btn-spin { to { transform: rotate(360deg); } }
</style>
