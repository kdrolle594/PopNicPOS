<script setup>
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import UiIcon from './UiIcon.vue';

const props = defineProps({
  open:        { type: Boolean, required: true },
  title:       { type: String,  default: undefined },
  sheet:       { type: Boolean, default: false },
  dismissible: { type: Boolean, default: true },
});

const emit = defineEmits(['close']);

// IDs for aria-labelledby
const titleId = `ui-modal-title-${Math.random().toString(36).slice(2)}`;

// Refs
const dialogEl = ref(null);
const previousFocus = ref(null);
let savedBodyOverflow = '';

// Focusable selectors
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable() {
  if (!dialogEl.value) return [];
  return Array.from(dialogEl.value.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.closest('[inert]') && getComputedStyle(el).display !== 'none',
  );
}

function trapFocus(e) {
  if (!dialogEl.value) return;
  const focusable = getFocusable();
  if (!focusable.length) { e.preventDefault(); return; }
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

function onKeyDown(e) {
  if (e.key === 'Tab') trapFocus(e);
  if (e.key === 'Escape' && props.dismissible) emit('close');
}

function onScrimClick() {
  if (props.dismissible) emit('close');
}

function lockScroll() {
  savedBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  document.body.style.overflow = savedBodyOverflow;
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      previousFocus.value = document.activeElement;
      lockScroll();
      await nextTick();
      const focusable = getFocusable();
      if (focusable.length) focusable[0].focus();
    } else {
      unlockScroll();
      if (previousFocus.value && typeof previousFocus.value.focus === 'function') {
        previousFocus.value.focus();
      }
    }
  },
);

onBeforeUnmount(() => {
  if (props.open) unlockScroll();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="modal-scrim"
        @click.self="onScrimClick"
        @keydown="onKeyDown"
      >
        <div
          ref="dialogEl"
          class="modal-dialog"
          :class="{ 'modal-dialog--sheet': sheet }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
          tabindex="-1"
        >
          <div v-if="title || dismissible" class="modal-header">
            <h2 v-if="title" :id="titleId" class="modal-title">{{ title }}</h2>
            <button
              v-if="dismissible"
              type="button"
              class="modal-close"
              aria-label="Close dialog"
              @click="emit('close')"
            >
              <UiIcon name="close" :size="20" />
            </button>
          </div>

          <div class="modal-body">
            <slot />
          </div>

          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, .45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.modal-dialog {
  position: relative;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-2);
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - var(--space-16));
  overflow-y: auto;
  outline: none;
}

/* Sheet variant on small viewports */
@media (max-width: 639px) {
  .modal-scrim:has(.modal-dialog--sheet) {
    align-items: flex-end;
    padding: 0;
  }

  .modal-dialog--sheet {
    max-width: 100%;
    max-height: 90vh;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-5) 0;
}

.modal-title {
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  color: var(--ink);
  margin: 0;
}

.modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  margin-left: auto;
  padding: 0;
}

.modal-close:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

.modal-close:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.modal-body {
  padding: var(--space-5);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: 0 var(--space-5) var(--space-5);
}

/* Transition */
.modal-enter-active {
  transition: opacity var(--motion-base) var(--ease);
}
.modal-leave-active {
  transition: opacity var(--motion-base) var(--ease);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-dialog {
  animation: modal-slide-in var(--motion-base) var(--ease);
}
.modal-leave-active .modal-dialog {
  animation: modal-slide-out var(--motion-base) var(--ease) forwards;
}

@keyframes modal-slide-in {
  from { transform: translateY(12px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes modal-slide-out {
  from { transform: translateY(0);    opacity: 1; }
  to   { transform: translateY(12px); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active .modal-dialog,
  .modal-leave-active .modal-dialog {
    animation: none;
  }
  .modal-enter-active,
  .modal-leave-active {
    transition: opacity var(--motion-fast) var(--ease);
  }
}

/* Sheet slide-up on small viewports */
@media (max-width: 639px) {
  .modal-enter-active .modal-dialog--sheet {
    animation: sheet-slide-up var(--motion-base) var(--ease);
  }
  .modal-leave-active .modal-dialog--sheet {
    animation: sheet-slide-down var(--motion-base) var(--ease) forwards;
  }

  @keyframes sheet-slide-up {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  @keyframes sheet-slide-down {
    from { transform: translateY(0); }
    to   { transform: translateY(100%); }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal-enter-active .modal-dialog--sheet,
    .modal-leave-active .modal-dialog--sheet {
      animation: none;
    }
  }
}
</style>
