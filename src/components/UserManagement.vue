<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../store/useAuthStore';

const auth = useAuthStore();

const users = ref([]);
const loading = ref(false);
const error = ref('');
const success = ref('');

const form = ref({ name: '', email: '', role: 'cashier' });
const editingId = ref(null);
const editForm = ref({ name: '', email: '', role: '' });

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
    form.value = { name: '', email: '', role: 'cashier' };
    success.value = `Account created. Ask ${user.name} to sign up at the app using ${user.email}.`;
  } catch (err) {
    error.value = err.message;
  }
}

function startEdit(user) {
  editingId.value = user.id;
  editForm.value = { name: user.name, email: user.email, role: user.role };
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
  <div class="p-6 space-y-6 max-w-4xl mx-auto">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">User Management</h1>
      <p class="text-sm text-gray-500 mt-1">
        Create employee and driver accounts. Ask them to sign up using the same email.
      </p>
    </div>

    <!-- Alerts -->
    <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{{ error }}</div>
    <div v-if="success" class="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">{{ success }}</div>

    <!-- Create form -->
    <div class="bg-white rounded-xl border p-5 space-y-4">
      <h2 class="font-semibold text-gray-800">Add New Account</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
          <input
            v-model="form.name"
            class="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input
            v-model="form.email"
            type="email"
            class="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="jane@example.com"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Role</label>
          <select v-model="form.role" class="w-full border rounded-lg px-3 py-2 text-sm">
            <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
          </select>
        </div>
      </div>
      <button
        class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        @click="createUser"
      >
        Create Account
      </button>
    </div>

    <!-- Users table -->
    <div class="bg-white rounded-xl border overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-gray-400">Loading…</div>
      <div v-else-if="!users.length" class="p-8 text-center text-gray-400">No staff accounts yet.</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Email</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Role</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50">
            <template v-if="editingId === user.id">
              <td class="px-4 py-2">
                <input v-model="editForm.name" class="border rounded px-2 py-1 w-full text-sm" />
              </td>
              <td class="px-4 py-2">
                <input v-model="editForm.email" class="border rounded px-2 py-1 w-full text-sm" />
              </td>
              <td class="px-4 py-2">
                <select v-model="editForm.role" class="border rounded px-2 py-1 text-sm">
                  <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
                </select>
              </td>
              <td class="px-4 py-2 flex gap-2 justify-end">
                <button class="text-blue-600 hover:underline text-xs font-medium" @click="saveEdit(user.id)">Save</button>
                <button class="text-gray-400 hover:underline text-xs" @click="editingId = null">Cancel</button>
              </td>
            </template>
            <template v-else>
              <td class="px-4 py-3 font-medium text-gray-800">{{ user.name }}</td>
              <td class="px-4 py-3 text-gray-600">{{ user.email }}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {{ ROLE_LABELS[user.role] || user.role }}
                </span>
              </td>
              <td class="px-4 py-3 flex gap-3 justify-end">
                <button class="text-gray-500 hover:text-blue-600 text-xs font-medium" @click="startEdit(user)">Edit</button>
                <button class="text-gray-500 hover:text-red-600 text-xs font-medium" @click="deleteUser(user.id, user.name)">Remove</button>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
