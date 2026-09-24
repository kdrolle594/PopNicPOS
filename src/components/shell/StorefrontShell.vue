<script setup>
import { computed, inject } from 'vue';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useCartStore } from '../../store/useCartStore.js';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiIcon from '../ui/UiIcon.vue';
import UiToast from '../ui/UiToast.vue';
import CartPanel from '../storefront/CartPanel.vue';

const auth = useAuthStore();
const cart = useCartStore();

const storefrontView = inject('storefrontView');

// Task 5 complete — wire itemCount directly from useCartStore
const cartCount = computed(() => cart.itemCount.value);
const cartTotal = computed(() => '$' + Number(cart.total.value).toFixed(2));

const userInitials = computed(() => {
  const name = auth.state.appUser?.name || '';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
});
</script>

<template>
  <div class="sf-shell density-comfortable">
    <!-- Sticky top bar -->
    <header class="sf-topbar">
      <span class="sf-wordmark">PopNic</span>

      <div class="sf-topbar__actions">
        <!-- Cart button -->
        <button
          class="sf-cart-btn"
          type="button"
          aria-label="Open cart"
          @click="storefrontView.value = 'cart'"
        >
          <UiIcon name="cart" :size="22" />
          <UiBadge v-if="cartCount > 0" tone="primary" class="sf-cart-badge">{{ cartCount }}</UiBadge>
        </button>

        <!-- Sign in (guest) or user initials avatar (authenticated) -->
        <UiButton
          v-if="auth.isGuest.value"
          variant="ghost"
          size="sm"
          @click="auth.login()"
        >
          Sign in
        </UiButton>
        <button
          v-else
          class="sf-avatar"
          type="button"
          aria-label="Account menu"
        >
          {{ userInitials }}
        </button>
      </div>
    </header>

    <!-- Category chip row — MenuBrowser (Task 7) fills this -->
    <div class="sf-chips" role="navigation" aria-label="Menu categories">
      <!-- Task 7 slot -->
    </div>

    <!-- Active storefront view -->
    <main class="sf-main">
      <slot />
    </main>

    <!-- Mobile bottom bar (≤ 639px) -->
    <nav class="sf-bottom-bar" aria-label="Storefront navigation">
      <button
        class="sf-bottom-btn"
        type="button"
        :class="{ 'sf-bottom-btn--active': storefrontView.value === 'browse' }"
        @click="storefrontView.value = 'browse'"
        aria-label="Browse menu"
      >
        <UiIcon name="menu" :size="20" />
        <span class="sf-bottom-btn__label">Menu</span>
      </button>

      <button
        class="sf-bottom-btn"
        type="button"
        :class="{ 'sf-bottom-btn--active': storefrontView.value === 'cart' }"
        @click="storefrontView.value = 'cart'"
        aria-label="Cart"
      >
        <span class="sf-bottom-btn__icon-wrap">
          <UiIcon name="cart" :size="20" />
          <UiBadge v-if="cartCount > 0" tone="primary" class="sf-bottom-badge">{{ cartCount }}</UiBadge>
        </span>
        <span class="sf-bottom-btn__label">Cart</span>
      </button>

      <button
        class="sf-bottom-btn"
        type="button"
        :class="{ 'sf-bottom-btn--active': storefrontView.value === 'orders' }"
        @click="storefrontView.value = 'orders'"
        aria-label="My orders"
      >
        <UiIcon name="clock" :size="20" />
        <span class="sf-bottom-btn__label">Orders</span>
      </button>
    </nav>

    <!-- Mobile pinned cart bar (< 1024px, shown when cart has items) -->
    <div
      v-if="cartCount > 0"
      class="sf-cart-bar"
      aria-label="Cart summary"
    >
      <span class="sf-cart-bar__count">{{ cartCount }} item{{ cartCount === 1 ? '' : 's' }}</span>
      <span class="sf-cart-bar__sep" aria-hidden="true">·</span>
      <span class="sf-cart-bar__total">{{ cartTotal }}</span>
      <UiButton
        variant="primary"
        size="sm"
        class="sf-cart-bar__btn"
        @click="storefrontView.value = 'cart'"
      >View cart</UiButton>
    </div>

    <UiToast />

    <!-- Cart panel (teleports to body) -->
    <CartPanel />
  </div>
</template>

<style scoped>
.sf-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--surface-sunken);
  font-family: 'DM Sans', system-ui, sans-serif;
}

/* ─── TOP BAR ─────────────────────────────────── */
.sf-topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-5);
  height: var(--control-h, 56px);
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  box-shadow: var(--elev-1);
}

.sf-wordmark {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-weight: 700;
  font-size: 20px;
  color: var(--ink);
  letter-spacing: -0.01em;
}

.sf-topbar__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* ─── CART BUTTON ─────────────────────────────── */
.sf-cart-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
}

.sf-cart-btn:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

.sf-cart-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.sf-cart-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
}

/* ─── USER AVATAR ─────────────────────────────── */
.sf-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  letter-spacing: 0.03em;
  transition: background var(--motion-fast) var(--ease);
}

.sf-avatar:hover {
  background: color-mix(in srgb, var(--primary) 22%, transparent);
}

.sf-avatar:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

/* ─── CHIP ROW ────────────────────────────────── */
.sf-chips {
  display: flex;
  overflow-x: auto;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  scrollbar-width: none;
}

.sf-chips::-webkit-scrollbar {
  display: none;
}

/* ─── MAIN ────────────────────────────────────── */
.sf-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
  padding-bottom: 0;
}

/* ─── MOBILE BOTTOM BAR ───────────────────────── */
.sf-bottom-bar {
  display: none;
  position: sticky;
  bottom: 0;
  z-index: 40;
  background: var(--surface);
  border-top: 1px solid var(--line);
  box-shadow: 0 -1px 0 var(--line);
}

@media (max-width: 639px) {
  .sf-bottom-bar {
    display: flex;
    align-items: stretch;
  }

  .sf-main {
    padding-bottom: 64px;
  }
}

.sf-bottom-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-1);
  border: none;
  background: transparent;
  color: var(--ink-muted);
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  cursor: pointer;
  min-height: 56px;
  transition: color var(--motion-fast) var(--ease);
}

.sf-bottom-btn:hover {
  color: var(--ink);
}

.sf-bottom-btn--active {
  color: var(--primary);
}

.sf-bottom-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.sf-bottom-btn__icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sf-bottom-badge {
  position: absolute;
  top: -4px;
  right: -8px;
  font-size: 10px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
}

.sf-bottom-btn__label {
  line-height: 1;
}

/* ─── MOBILE PINNED CART BAR ──────────────────────── */
.sf-cart-bar {
  display: none;
  position: sticky;
  bottom: 0;
  z-index: 41;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  background: var(--surface-raised);
  border-top: 1px solid var(--line);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, .08);
}

@media (max-width: 1023px) {
  .sf-cart-bar {
    display: flex;
  }

  /* Extra bottom padding so the cart bar does not obscure the last card */
  .sf-main:has(~ .sf-cart-bar) {
    padding-bottom: 56px;
  }
}

.sf-cart-bar__count {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--ink);
}

.sf-cart-bar__sep {
  color: var(--ink-subtle);
  font-size: var(--text-sm);
}

.sf-cart-bar__total {
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.sf-cart-bar__btn {
  margin-left: auto;
}
</style>
