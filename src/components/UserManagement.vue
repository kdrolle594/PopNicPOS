<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../store/useAuthStore';

const auth = useAuthStore();

const users = ref([]);
const loading = ref(false);
const error = ref('');
const success = ref('');

const form = ref({ name: '', email: '', phone: '', role: 'cashier' });
const editingId = ref(null);
const editForm = ref({ name: '', email: '', phone: '', role: '' });

const ROLES = ['cashier', 'kitchen', 'driver', 'manager', 'admin'];

const ROLE_LABELS = {
  cashier: 'Staff / Cashier',
  kitchen: 'Kitchen',
  driver:  'Driver',
  manager: 'Management',
  admin:   'Admin',
};

async function apiFetch(path, options = {}) {
  const token = await auth.getToken();
  const base = import.meta.env.VITE_API_URL || '';
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}

async function loadUsers() {
  loading.value = true;
  error.value = '';
  try {
    users.value = await apiFetch('/api/users');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createUser() {
  if (!form.value.name || !form.value.email) {
    error.value = 'Name and email are required.';
    return;
  }
  error.value = '';
  success.value = '';
  try {
    const user = await apiFetch('/api/users', { method: 'POST', body: form.value });
    users.value.push(user);
    form.value = { name: '', email: '', phone: '', role: 'cashier' };
    success.value = `Account created. Ask ${user.name} to sign up at the app using ${user.email}.`;
  } catch (err) {
    error.value = err.message;
  }
}

function startEdit(user) {
  editingId.value = user.id;
  editForm.value = { name: user.name, email: user.email, phone: user.phone || '', role: user.role };
}

async function saveEdit(id) {
  error.value = '';
  try {
    await apiFetch(`/api/users/${id}`, { method: 'PUT', body: editForm.value });
    const idx = users.value.findIndex((u) => u.id === id);
    if (idx !== -1) users.value[idx] = { ...users.value[idx], ...editForm.value };
    editingId.value = null;
  } catch (err) {
    error.value = err.message;
  }
}

async function deleteUser(id, name) {
  if (!confirm(`Remove ${name}? They will lose access immediately.`)) return;
  error.value = '';
  try {
    await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    users.value = users.value.filter((u) => u.id !== id);
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(loadUsers);
</script>

<template>
  <div class="c-page c-page--narrow">
    <div>
      <h1 class="text-2xl font-bold text-ink">User Management</h1>
      <p class="text-sm text-ink-muted mt-1">
        Create employee and driver accounts. Ask them to sign up using the same email.
      </p>
    </div>

    <!-- Alerts -->
    <div v-if="error" class="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg p-3">{{ error }}</div>
    <div v-if="success" class="bg-positive/10 border border-positive/30 text-positive-text text-sm rounded-lg p-3">{{ success }}</div>

    <!-- Create form -->
    <div class="bg-surface rounded-xl border p-5 space-y-4">
      <h2 class="font-semibold text-ink">Add New Account</h2>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label class="block text-xs font-medium text-ink-muted mb-1">Full Name</label>
          <input
            v-model="form.name"
            class="c-input"
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-ink-muted mb-1">Email</label>
          <input
            v-model="form.email"
            type="email"
            class="c-input"
            placeholder="jane@example.com"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-ink-muted mb-1">
            Phone <span class="text-ink-subtle font-normal">(drivers)</span>
          </label>
          <input
            v-model="form.phone"
            type="tel"
            class="c-input"
            placeholder="555-0142"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-ink-muted mb-1">Role</label>
          <select v-model="form.role" class="c-input">
            <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
          </select>
        </div>
      </div>
      <button
        class="px-5 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-lg transition-colors"
        @click="createUser"
      >
        Create Account
      </button>
    </div>

    <!-- Users table -->
    <div class="bg-surface rounded-xl border overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-ink-subtle">Loading…</div>
      <div v-else-if="!users.length" class="p-8 text-center text-ink-subtle">No staff accounts yet.</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-surface-sunken border-b">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-ink-muted">Name</th>
            <th class="text-left px-4 py-3 font-medium text-ink-muted">Email</th>
            <th class="text-left px-4 py-3 font-medium text-ink-muted">Phone</th>
            <th class="text-left px-4 py-3 font-medium text-ink-muted">Role</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="user in users" :key="user.id" class="hover:bg-surface-sunken">
            <template v-if="editingId === user.id">
              <td class="px-4 py-2">
                <input v-model="editForm.name" class="c-input c-input--sm" />
              </td>
              <td class="px-4 py-2">
                <input v-model="editForm.email" class="c-input c-input--sm" />
              </td>
              <td class="px-4 py-2">
                <input v-model="editForm.phone" type="tel" class="c-input c-input--sm" placeholder="555-0142" />
              </td>
              <td class="px-4 py-2">
                <select v-model="editForm.role" class="c-input c-input--sm w-auto">
                  <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
                </select>
              </td>
              <td class="px-4 py-2 flex gap-2 justify-end">
                <button class="text-primary-text hover:underline text-xs font-medium" @click="saveEdit(user.id)">Save</button>
                <button class="text-ink-subtle hover:underline text-xs" @click="editingId = null">Cancel</button>
              </td>
            </template>
            <template v-else>
              <td class="px-4 py-3 font-medium text-ink">{{ user.name }}</td>
              <td class="px-4 py-3 text-ink-muted">{{ user.email }}</td>
              <td class="px-4 py-3 text-ink-muted">
                <span v-if="user.phone">{{ user.phone }}</span>
                <span v-else class="text-ink-subtle">—</span>
              </td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary-text">
                  {{ ROLE_LABELS[user.role] || user.role }}
                </span>
              </td>
              <td class="px-4 py-3 flex gap-3 justify-end">
                <button class="text-ink-muted hover:text-primary-text text-xs font-medium" @click="startEdit(user)">Edit</button>
                <button class="text-ink-muted hover:text-danger text-xs font-medium" @click="deleteUser(user.id, user.name)">Remove</button>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
