import { reactive, computed } from 'vue';
import { useAuth0 } from '@auth0/auth0-vue';

// Role → default view when user logs in
const ROLE_DEFAULT_VIEW = {
  customer: 'customer',
  driver:   'driver',
  cashier:  'kitchen',
  kitchen:  'kitchen',
  manager:  'dashboard',
  admin:    'dashboard',
};

// Role → allowed view IDs
const ROLE_VIEWS = {
  customer: ['customer'],
  driver:   ['driver'],
  cashier:  ['pos', 'kitchen'],
  kitchen:  ['kitchen'],
  manager:  ['dashboard', 'pos', 'kitchen', 'inventory', 'menu', 'loyalty', 'analytics'],
  admin:    ['dashboard', 'pos', 'kitchen', 'inventory', 'menu', 'loyalty', 'analytics', 'users'],
};

let storeInstance;

export function useAuthStore() {
  if (storeInstance) return storeInstance;

  const state = reactive({
    role: null,
    appUser: null, // { id, name, email, userType, role }
    error: null,
  });

  // Must be called during setup context (first invocation of useAuthStore
  // happens from App.vue's setup). Lazy init previously failed inside event
  // handlers where inject() has no active instance.
  const _auth0 = useAuth0();
  function auth0() { return _auth0; }

  const isAuthenticated = computed(() => auth0().isAuthenticated.value);
  const isLoading       = computed(() => auth0().isLoading.value);
  const auth0User       = computed(() => auth0().user.value);

  async function getToken() {
    return auth0().getAccessTokenSilently();
  }

  async function fetchRole() {
    try {
      const token = await getToken();
      const base = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${base}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const user = await res.json();
      state.appUser = user;
      state.role = user.role;
      state.error = null;
    } catch (err) {
      state.error = err.message;
    }
  }

  function login() {
    auth0().loginWithRedirect();
  }

  function logout() {
    state.role = null;
    state.appUser = null;
    auth0().logout({
      logoutParams: { returnTo: window.location.origin + (import.meta.env.VITE_BASE_PATH || '/') },
    });
  }

  function defaultView() {
    return ROLE_DEFAULT_VIEW[state.role] || 'dashboard';
  }

  function allowedViews() {
    return ROLE_VIEWS[state.role] || [];
  }

  storeInstance = {
    state,
    isAuthenticated,
    isLoading,
    auth0User,
    getToken,
    fetchRole,
    login,
    logout,
    defaultView,
    allowedViews,
  };

  return storeInstance;
}
