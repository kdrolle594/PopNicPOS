<script setup>
import { computed, ref, watch } from 'vue';
import { useAuth0 } from '@auth0/auth0-vue';
import { useAuthStore } from './store/useAuthStore';

import Dashboard from './components/Dashboard.vue';
import POSTerminal from './components/POSTerminal.vue';
import KitchenDisplay from './components/KitchenDisplay.vue';
import Inventory from './components/Inventory.vue';
import MenuManagement from './components/MenuManagement.vue';
import Analytics from './components/Analytics.vue';
import LoyaltyManagement from './components/LoyaltyManagement.vue';
import CustomerView from './components/CustomerView.vue';
import DriverView from './components/DriverView.vue';
import UserManagement from './components/UserManagement.vue';
import LoginView from './components/LoginView.vue';

const auth0 = useAuth0();
const auth  = useAuthStore();

const currentView      = ref('dashboard');
const isMobileMenuOpen = ref(false);

const ICONS = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  pos:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
  kitchen:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>`,
  inventory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  menu:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
  loyalty:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  analytics: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  customer:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  driver:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l3 4v10h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><polyline points="12 11 12 5 18 11 12 11"/></svg>`,
  users:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
};

const ALL_MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard'       },
  { id: 'pos',       label: 'POS Terminal'    },
  { id: 'kitchen',   label: 'Kitchen Display' },
  { id: 'inventory', label: 'Inventory'       },
  { id: 'menu',      label: 'Menu'            },
  { id: 'loyalty',   label: 'Loyalty Program' },
  { id: 'analytics', label: 'Analytics'       },
  { id: 'customer',  label: 'Customer View'   },
  { id: 'driver',    label: 'Driver Portal'   },
  { id: 'users',     label: 'User Management' },
];

const viewMap = {
  dashboard: Dashboard,
  pos:       POSTerminal,
  kitchen:   KitchenDisplay,
  inventory: Inventory,
  menu:      MenuManagement,
  loyalty:   LoyaltyManagement,
  analytics: Analytics,
  customer:  CustomerView,
  driver:    DriverView,
  users:     UserManagement,
};

const menuItems = computed(() => {
  const allowed = auth.allowedViews();
  return ALL_MENU_ITEMS.filter((item) => allowed.includes(item.id));
});

const activeComponent = computed(() => viewMap[currentView.value] || Dashboard);

const userInitials = computed(() => {
  const name = auth.state.appUser?.name || '';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
});

const userRole = computed(() => {
  const role = auth.state.role || '';
  return role.charAt(0).toUpperCase() + role.slice(1);
});

function openView(id) {
  currentView.value = id;
  isMobileMenuOpen.value = false;
}

watch(
  () => auth0.isAuthenticated.value,
  async (authenticated) => {
    if (authenticated && !auth.state.role) {
      await auth.fetchRole();
      currentView.value = auth.defaultView();
    }
  },
  { immediate: true }
);

const ready = computed(() =>
  !auth0.isLoading.value && auth0.isAuthenticated.value && !!auth.state.role
);
const showLogin = computed(() =>
  !auth0.isLoading.value && !auth0.isAuthenticated.value
);
</script>

<template>
  <!-- Loading spinner while Auth0 initialises -->
  <div v-if="auth0.isLoading.value" class="app-loading">
    <div class="app-loading__spinner"></div>
    <p>Loading…</p>
  </div>

  <!-- Login screen -->
  <LoginView v-else-if="showLogin" />

  <!-- Waiting for role fetch after login -->
  <div v-else-if="!ready" class="app-loading">
    <div class="app-loading__spinner"></div>
    <p>Signing you in…</p>
  </div>

  <!-- Main app shell -->
  <div v-else class="app-shell">

    <!-- Mobile menu toggle -->
    <button class="mobile-menu-btn" @click="isMobileMenuOpen = !isMobileMenuOpen" aria-label="Toggle menu">
      <svg v-if="!isMobileMenuOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>

    <!-- Sidebar -->
    <aside class="sidebar" :class="{ 'sidebar--open': isMobileMenuOpen }">

      <!-- Brand -->
      <div class="sidebar__brand">
        <div class="sidebar__logo">
          <span>P</span>
        </div>
        <div>
          <h1 class="sidebar__brand-name">PopNic <em>POS</em></h1>
          <p class="sidebar__brand-tagline">Restaurant System</p>
        </div>
      </div>

      <!-- User info -->
      <div class="sidebar__user">
        <div class="sidebar__avatar">{{ userInitials }}</div>
        <div class="sidebar__user-info">
          <p class="sidebar__user-name">{{ auth.state.appUser?.name || 'User' }}</p>
          <p class="sidebar__user-role">{{ userRole }}</p>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="sidebar__nav">
        <button
          v-for="item in menuItems"
          :key="item.id"
          class="nav-item"
          :class="{ 'nav-item--active': currentView === item.id }"
          @click="openView(item.id)"
        >
          <span class="nav-item__icon" v-html="ICONS[item.id]"></span>
          <span class="nav-item__label">{{ item.label }}</span>
        </button>
      </nav>

      <!-- Footer -->
      <div class="sidebar__footer">
        <button class="signout-btn" @click="auth.logout()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign Out
        </button>
        <p class="sidebar__copy">© 2026 PopNic POS System</p>
      </div>
    </aside>

    <!-- Mobile overlay -->
    <div v-if="isMobileMenuOpen" class="mobile-overlay" @click="isMobileMenuOpen = false" />

    <!-- Main content with animated view transitions -->
    <main class="app-main">
      <Transition name="view" mode="out-in">
        <component :is="activeComponent" :key="currentView" />
      </Transition>
    </main>

  </div>
</template>

<style scoped>
/* ─── LOADING ────────────────────────────────────── */
.app-loading {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #EEF6FB;
  gap: 16px;
  color: #5B7A8F;
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 14px;
}

.app-loading__spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #B8D8EC;
  border-top-color: #3A8FBA;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ─── SHELL ──────────────────────────────────────── */
.app-shell {
  display: flex;
  height: 100vh;
  background: #EEF6FB;
  font-family: 'DM Sans', system-ui, sans-serif;
}

/* ─── SIDEBAR ─────────────────────────────────────── */
.sidebar {
  width: 256px;
  flex-shrink: 0;
  height: 100vh;
  background: #ffffff;
  border-right: 1px solid rgba(58, 143, 186, 0.12);
  box-shadow: 2px 0 20px rgba(58, 143, 186, 0.07);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 40;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ─── BRAND ──────────────────────────────────────── */
.sidebar__brand {
  padding: 22px 18px 18px;
  background: linear-gradient(135deg, #EEF6FB 0%, #F5EDE4 100%);
  border-bottom: 1px solid rgba(58, 143, 186, 0.1);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.sidebar__logo {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #3A8FBA 0%, #8B6B4A 100%);
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(58, 143, 186, 0.3);
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
  color: #1A3D56;
  line-height: 1.2;
  margin: 0;
  font-style: normal;
}

.sidebar__brand-name em {
  color: #3A8FBA;
  font-style: normal;
}

.sidebar__brand-tagline {
  font-size: 10.5px;
  color: #8B6B4A;
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
  border-bottom: 1px solid rgba(58, 143, 186, 0.08);
  flex-shrink: 0;
}

.sidebar__avatar {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #3A8FBA, #2E6F96);
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
  color: #1A3D56;
  line-height: 1.3;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__user-role {
  font-size: 11px;
  color: #8B6B4A;
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
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
  color: #4A6878;
  font-size: 13.5px;
  font-weight: 500;
  text-align: left;
  border: none;
  background: transparent;
  position: relative;
}

.nav-item:hover {
  background: #EEF6FB;
  color: #2E6F96;
}

.nav-item--active {
  background: #EEF6FB;
  color: #3A8FBA;
  font-weight: 600;
}

.nav-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  background: #8B6B4A;
  border-radius: 0 2px 2px 0;
}

.nav-item__icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  opacity: 0.8;
  transition: opacity 0.14s ease;
}

.nav-item--active .nav-item__icon,
.nav-item:hover .nav-item__icon {
  opacity: 1;
}

.nav-item__label { flex: 1; }

/* ─── FOOTER ─────────────────────────────────────── */
.sidebar__footer {
  padding: 10px 8px 14px;
  border-top: 1px solid rgba(58, 143, 186, 0.08);
  flex-shrink: 0;
}

.signout-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #6B8FA5;
  font-size: 13.5px;
  font-weight: 500;
  transition: background 0.14s ease, color 0.14s ease;
}

.signout-btn:hover {
  background: #FFF0F0;
  color: #c0392b;
}

.sidebar__copy {
  font-size: 10px;
  color: #B8D4E3;
  text-align: center;
  margin: 10px 0 0;
  letter-spacing: 0.02em;
}

/* ─── MOBILE BUTTON ──────────────────────────────── */
.mobile-menu-btn {
  display: none;
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 50;
  width: 40px;
  height: 40px;
  background: white;
  border: 1px solid rgba(58, 143, 186, 0.2);
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  color: #3A8FBA;
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
.app-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
}

/* ─── VIEW TRANSITIONS ───────────────────────────── */
.view-enter-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.view-leave-active {
  transition: opacity 0.17s ease, transform 0.17s ease;
}
.view-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.view-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ─── RESPONSIVE ─────────────────────────────────── */
@media (max-width: 1023px) {
  .mobile-menu-btn { display: flex; }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    transform: translateX(-100%);
  }

  .sidebar--open { transform: translateX(0); }
}
</style>
