<script setup>
import { inject, ref, computed, watch, nextTick } from 'vue';
import { lineSignature } from '../../../shared/menuOptions.js';
import { useCartStore } from '../../store/useCartStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import UiButton from '../ui/UiButton.vue';
import UiIcon from '../ui/UiIcon.vue';
import UiEmptyState from '../ui/UiEmptyState.vue';

const cart = useCartStore();
const auth = useAuthStore();
const storefrontView = inject('storefrontView');
const view = computed(() => storefrontView.value);

const panelRef = ref(null);

watch(
  () => storefrontView.value,
  async (view) => {
    if (view === 'cart') {
      await nextTick();
      panelRef.value?.focus();
    }
  }
);

function close() {
  storefrontView.value = 'browse';
}

function onCheckout() {
  if (auth.isGuest.value) {
    cart.beginCheckout();   // persists synchronously before navigation
    auth.login();           // full page redirect — nothing after this runs
    return;
  }
  storefrontView.value = 'checkout';
}

function formatPrice(amount) {
  return '$' + Number(amount).toFixed(2);
}

function lineKey(line) {
  return lineSignature(line.menuItemId, line.choiceIds || []);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cart-panel">
      <div
        v-if="view === 'cart'"
        class="cart-overlay"
        @click.self="close"
      >
        <div
          ref="panelRef"
          class="cart-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Shopping cart"
          tabindex="-1"
          @keydown.esc="close"
        >
          <!-- Header -->
          <div class="cart-panel__header">
            <h2 class="cart-panel__title">Your cart</h2>
            <button
              class="cart-panel__close"
              type="button"
              aria-label="Close cart"
              @click="close"
            >
              <UiIcon name="close" :size="20" />
            </button>
          </div>

          <!-- Empty state -->
          <div v-if="cart.state.items.length === 0" class="cart-panel__empty">
            <UiEmptyState
              icon="cart"
              title="Your cart is empty"
              description="Add items from the menu to get started."
            >
              <template #action>
                <UiButton variant="secondary" @click="close">Browse menu</UiButton>
              </template>
            </UiEmptyState>
          </div>

          <!-- Line items -->
          <ul v-else class="cart-panel__items" role="list">
            <li
              v-for="line in cart.state.items"
              :key="lineKey(line)"
              class="cart-line"
            >
              <div class="cart-line__info">
                <p class="cart-line__name">{{ line.name }}</p>
                <p v-if="line.notes" class="cart-line__notes">{{ line.notes }}</p>
              </div>
              <div class="cart-line__controls">
                <div
                  class="cart-line__stepper"
                  role="group"
                  :aria-label="`${line.name} quantity`"
                >
                  <button
                    class="cart-line__step-btn"
                    type="button"
                    :aria-label="`Decrease quantity of ${line.name}`"
                    @click="cart.setQuantity(line, line.quantity - 1)"
                  >
                    <UiIcon name="minus" :size="14" />
                  </button>
                  <span class="cart-line__qty" aria-live="polite">{{ line.quantity }}</span>
                  <button
                    class="cart-line__step-btn"
                    type="button"
                    :aria-label="`Increase quantity of ${line.name}`"
                    @click="cart.setQuantity(line, line.quantity + 1)"
                  >
                    <UiIcon name="plus" :size="14" />
                  </button>
                </div>
                <span class="cart-line__price">{{ formatPrice(line.price * line.quantity) }}</span>
                <button
                  class="cart-line__remove"
                  type="button"
                  :aria-label="`Remove ${line.name} from cart`"
                  @click="cart.removeLine(line)"
                >
                  <UiIcon name="close" :size="14" />
                </button>
              </div>
            </li>
          </ul>

          <!-- Footer: only when there are items -->
          <div v-if="cart.state.items.length > 0" class="cart-panel__footer">
            <div class="cart-panel__total">
              <span class="cart-panel__total-label">Subtotal</span>
              <span class="cart-panel__total-amount">{{ formatPrice(cart.total.value) }}</span>
            </div>
            <UiButton variant="ghost" block @click="close">Continue shopping</UiButton>
            <UiButton variant="primary" size="lg" block @click="onCheckout">
              {{ auth.isGuest.value ? 'Sign in to order' : 'Place order' }}
            </UiButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ─── OVERLAY / SCRIM ─────────────────────────────── */
.cart-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}

/* ─── PANEL (desktop: right side drawer) ─────────── */
.cart-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 92vw);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--line);
  box-shadow: var(--elev-2);
  overflow: hidden;
  outline: none;
}

/* ─── MOBILE: bottom sheet ────────────────────────── */
@media (max-width: 1023px) {
  .cart-panel {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-height: 90vh;
    border-left: none;
    border-top: 1px solid var(--line);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }
}

/* ─── HEADER ──────────────────────────────────────── */
.cart-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.cart-panel__title {
  font-size: var(--text-h3);
  font-weight: var(--weight-semibold);
  color: var(--ink);
  margin: 0;
}

.cart-panel__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  padding: 0;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}

.cart-panel__close:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

.cart-panel__close:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

/* ─── EMPTY STATE ─────────────────────────────────── */
.cart-panel__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

/* ─── ITEM LIST ───────────────────────────────────── */
.cart-panel__items {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: var(--space-3) 0;
}

/* ─── LINE ITEM ───────────────────────────────────── */
.cart-line {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--line);
}

.cart-line:last-child {
  border-bottom: none;
}

.cart-line__info {
  flex: 1;
  min-width: 0;
}

.cart-line__name {
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  color: var(--ink);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cart-line__notes {
  font-size: var(--text-sm);
  color: var(--ink-muted);
  margin: var(--space-1) 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cart-line__controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

/* ─── STEPPER ─────────────────────────────────────── */
.cart-line__stepper {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--surface-sunken);
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-2);
}

.cart-line__step-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  padding: 0;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}

.cart-line__step-btn:hover {
  background: var(--surface-raised);
  color: var(--ink);
}

.cart-line__step-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.cart-line__qty {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--ink);
  min-width: 20px;
  text-align: center;
}

/* ─── PRICE & REMOVE ──────────────────────────────── */
.cart-line__price {
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  color: var(--ink);
  white-space: nowrap;
}

.cart-line__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-subtle);
  cursor: pointer;
  padding: 0;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}

.cart-line__remove:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.cart-line__remove:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

/* ─── FOOTER ──────────────────────────────────────── */
.cart-panel__footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  border-top: 1px solid var(--line);
  background: var(--surface);
  flex-shrink: 0;
}

.cart-panel__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cart-panel__total-label {
  font-size: var(--text-body);
  color: var(--ink-muted);
}

.cart-panel__total-amount {
  font-size: var(--text-h3);
  font-weight: var(--weight-semibold);
  color: var(--ink);
}

/* ─── SLIDE-IN TRANSITION (desktop) ──────────────── */
.cart-panel-enter-active {
  transition: opacity var(--motion-base) var(--ease);
}
.cart-panel-leave-active {
  transition: opacity var(--motion-base) var(--ease);
}
.cart-panel-enter-from,
.cart-panel-leave-to {
  opacity: 0;
}

.cart-panel-enter-active .cart-panel {
  animation: cart-slide-in var(--motion-base) var(--ease);
}
.cart-panel-leave-active .cart-panel {
  animation: cart-slide-out var(--motion-base) var(--ease) forwards;
}

@keyframes cart-slide-in {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@keyframes cart-slide-out {
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
}

/* Mobile: slide up from bottom */
@media (max-width: 1023px) {
  .cart-panel-enter-active .cart-panel {
    animation: cart-sheet-up var(--motion-base) var(--ease);
  }
  .cart-panel-leave-active .cart-panel {
    animation: cart-sheet-down var(--motion-base) var(--ease) forwards;
  }

  @keyframes cart-sheet-up {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  @keyframes cart-sheet-down {
    from { transform: translateY(0); }
    to   { transform: translateY(100%); }
  }
}

@media (prefers-reduced-motion: reduce) {
  .cart-panel-enter-active .cart-panel,
  .cart-panel-leave-active .cart-panel {
    animation: none;
  }
  .cart-panel-enter-active,
  .cart-panel-leave-active {
    transition: opacity var(--motion-fast) var(--ease);
  }
}
</style>
