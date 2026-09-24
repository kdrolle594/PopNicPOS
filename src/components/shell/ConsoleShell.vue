<script setup>
import { ref, computed } from 'vue';
import { useAuthStore } from '../../store/useAuthStore.js';
import UiIcon from '../ui/UiIcon.vue';
import UiToast from '../ui/UiToast.vue';

const props = defineProps({
  currentView: { type: String, required: true },
  menuItems:   { type: Array,  required: true }, // [{ id, label }]
});

const emit = defineEmits(['navigate']);

const auth = useAuthStore();
const isMobileMenuOpen = ref(false);

const userInitials = computed(() => {
  const name = auth.state.appUser?.name || '';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
});

const userRole = computed(() => {
  const role = auth.state.role || '';
  return role.charAt(0).toUpperCase() + role.slice(1);
});

function openView(id) {
  emit('navigate', id);
  isMobileMenuOpen.value = false;
}
</script>

<template>
  <div class="console-shell density-compact">
    <!-- Mobile menu toggle -->
    <button
      class="mobile-menu-btn"
      type="button"
      :aria-expanded="isMobileMenuOpen"
      aria-label="Toggle navigation menu"
      @click="isMobileMenuOpen = !isMobileMenuOpen"
    >
      <UiIcon v-if="!isMobileMenuOpen" name="menu" :size="20" />
      <UiIcon v-else name="close" :size="20" />
    </button>

    <!-- Sidebar -->
    <aside class="sidebar" :class="{ 'sidebar--open': isMobileMenuOpen }">

      <!-- Brand -->
      <div class="sidebar__brand">
        <div class="sidebar__logo" aria-hidden="true">
          <span>P</span>
        </div>
        <div>
          <h1 class="sidebar__brand-name">PopNic <em>POS</em></h1>
          <p class="sidebar__brand-tagline">Restaurant System</p>
        </div>
      </div>

      <!-- User info -->
      <div class="sidebar__user">
        <div class="sidebar__avatar" aria-hidden="true">{{ userInitials }}</div>
        <div class="sidebar__user-info">
          <p class="sidebar__user-name">{{ auth.state.appUser?.name || 'User' }}</p>
          <p class="sidebar__user-role">{{ userRole }}</p>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="sidebar__nav" aria-label="Console navigation">
        <button
          v-for="item in menuItems"
          :key="item.id"
          class="nav-item"
          type="button"
          :class="{ 'nav-item--active': currentView === item.id }"
          :aria-current="currentView === item.id ? 'page' : undefined"
          @click="openView(item.id)"
        >
          <span class="nav-item__icon">
            <UiIcon :name="item.id" :size="18" />
          </span>
          <span class="nav-item__label">{{ item.label }}</span>
        </button>
      </nav>

      <!-- Footer -->
      <div class="sidebar__footer">
        <button class="signout-btn" type="button" @click="auth.logout()">
          <UiIcon name="signout" :size="16" />
          Sign Out
        </button>
        <p class="sidebar__copy">© 2026 PopNic POS System</p>
      </div>
    </aside>

    <!-- Mobile overlay -->
    <div
      v-if="isMobileMenuOpen"
      class="mobile-overlay"
      aria-hidden="true"
      @click="isMobileMenuOpen = false"
    />

    <!-- Main content -->
    <main class="console-main">
      <slot />
    </main>

    <UiToast />
  </div>
</template>

<style scoped>
.console-shell {
  display: flex;
  height: 100vh;
  background: var(--surface-sunken);
  font-family: 'DM Sans', system-ui, sans-serif;
}

/* ─── SIDEBAR ─────────────────────────────────────── */
.sidebar {
  width: 256px;
  flex-shrink: 0;
  height: 100vh;
  background: var(--surface);
  border-right: 1px solid color-mix(in srgb, var(--primary) 12%, transparent);
  box-shadow: var(--elev-1);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 40;
  transition: transform var(--motion-base) cubic-bezier(0.4, 0, 0.2, 1);
}

/* ─── BRAND ──────────────────────────────────────── */
.sidebar__brand {
  padding: 22px 18px 18px;
  background: linear-gradient(135deg, var(--surface-sunken) 0%, color-mix(in srgb, var(--secondary) 10%, var(--surface)) 100%);
  border-bottom: 1px solid color-mix(in srgb, var(--primary) 10%, transparent);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.sidebar__logo {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--elev-1);
}

.sidebar__logo span {
  color: white;
  font-size: 20px;
  font-weight: 700;
  font-family: 'Playfair Display', serif;
  line-height: 1;
}

.sidebar__brand-name {
  font-family: 'Playfair Display', serif;
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.2;
  margin: 0;
  font-style: normal;
}

.sidebar__brand-name em {
  color: var(--primary);
  font-style: normal;
}

.sidebar__brand-tagline {
  font-size: 10.5px;
  color: var(--secondary);
  margin: 3px 0 0;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ─── USER ────────────────────────────────────────── */
.sidebar__user {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--primary) 8%, transparent);
  flex-shrink: 0;
}

.sidebar__avatar {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 75%, black));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  letter-spacing: 0.03em;
}

.sidebar__user-info {
  min-width: 0;
}

.sidebar__user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.3;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__user-role {
  font-size: 11px;
  color: var(--secondary);
  margin: 1px 0 0;
  font-weight: 500;
}

/* ─── NAV ─────────────────────────────────────────── */
.sidebar__nav {
  flex: 1;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
}

.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
  color: var(--ink-muted);
  font-size: 13.5px;
  font-weight: 500;
  text-align: left;
  border: none;
  background: transparent;
  position: relative;
}

.nav-item:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

.nav-item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.nav-item--active {
  background: var(--surface-sunken);
  color: var(--primary);
  font-weight: 600;
}

.nav-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  background: var(--secondary);
  border-radius: 0 2px 2px 0;
}

.nav-item__icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  opacity: 0.8;
  transition: opacity var(--motion-fast) var(--ease);
}

.nav-item--active .nav-item__icon,
.nav-item:hover .nav-item__icon {
  opacity: 1;
}

.nav-item__label {
  flex: 1;
}

/* ─── FOOTER ─────────────────────────────────────── */
.sidebar__footer {
  padding: 10px 8px 14px;
  border-top: 1px solid color-mix(in srgb, var(--primary) 8%, transparent);
  flex-shrink: 0;
}

.signout-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--ink-muted);
  font-size: 13.5px;
  font-weight: 500;
  transition:
    background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}

.signout-btn:hover {
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  color: var(--danger);
}

.signout-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.sidebar__copy {
  font-size: 10px;
  color: var(--ink-subtle);
  text-align: center;
  margin: 10px 0 0;
  letter-spacing: 0.02em;
}

/* ─── MOBILE TOGGLE ──────────────────────────────── */
.mobile-menu-btn {
  display: none;
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 50;
  width: 40px;
  height: 40px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: var(--elev-1);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  color: var(--primary);
}

.mobile-menu-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

/* ─── MOBILE OVERLAY ─────────────────────────────── */
.mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 30;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

/* ─── MAIN ───────────────────────────────────────── */
.console-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
}

/* ─── RESPONSIVE ─────────────────────────────────── */
@media (max-width: 1023px) {
  .mobile-menu-btn {
    display: flex;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    transform: translateX(-100%);
  }

  .sidebar--open {
    transform: translateX(0);
  }
}
</style>
