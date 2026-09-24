<script setup>
import { useUiStore } from '../../store/useUiStore.js';
import UiIcon from './UiIcon.vue';

const { state, dismissToast } = useUiStore();

const TONE_BORDER = {
  info:     'var(--primary)',
  positive: 'var(--positive)',
  danger:   'var(--danger)',
  warning:  'var(--warning)',
};
</script>

<template>
  <Teleport to="body">
    <div class="toast-region" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast" tag="div" class="toast-stack">
        <div
          v-for="toast in state.toasts"
          :key="toast.id"
          class="toast-card"
          :role="toast.tone === 'danger' ? 'alert' : 'status'"
          :style="{ '--toast-border-color': TONE_BORDER[toast.tone] || 'var(--primary)' }"
        >
          <span class="toast-message">{{ toast.message }}</span>
          <button
            class="toast-dismiss"
            type="button"
            aria-label="Dismiss notification"
            @click="dismissToast(toast.id)"
          >
            <UiIcon name="close" :size="16" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-region {
  position: fixed;
  bottom: var(--space-6);
  left: 50%;
  transform: translateX(-50%);
  z-index: 80;
  width: max-content;
  max-width: calc(100vw - var(--space-8));
  pointer-events: none;
}

@media (min-width: 640px) {
  .toast-region {
    top: var(--space-6);
    right: var(--space-6);
    bottom: auto;
    left: auto;
    transform: none;
  }
}

.toast-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: center;
}

@media (min-width: 640px) {
  .toast-stack {
    align-items: flex-end;
  }
}

.toast-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-raised);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--toast-border-color, var(--primary));
  box-shadow: var(--elev-1);
  pointer-events: auto;
  min-width: 220px;
  max-width: 380px;
}

.toast-message {
  flex: 1;
  font-size: var(--text-body);
  color: var(--ink);
  word-break: break-word;
}

.toast-dismiss {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  padding: 0;
}

.toast-dismiss:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

.toast-dismiss:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

/* TransitionGroup animations */
.toast-enter-active {
  transition: opacity var(--motion-base) var(--ease), transform var(--motion-base) var(--ease);
}
.toast-leave-active {
  transition: opacity var(--motion-base) var(--ease), transform var(--motion-base) var(--ease);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: opacity var(--motion-fast) var(--ease);
  }
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
