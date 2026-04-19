<script setup>
import { useAuthStore } from '../store/useAuthStore';

const auth = useAuthStore();
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
    <div class="bg-white rounded-2xl shadow-xl border w-full max-w-sm p-8 space-y-6 text-center">

      <div>
        <div class="text-5xl mb-3">🍴</div>
        <h1 class="text-3xl font-bold text-blue-600">PopNic POS</h1>
        <p class="text-gray-500 mt-2 text-sm">Sign in to access your workspace</p>
      </div>

      <div v-if="auth.state.error" class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
        {{ auth.state.error }}
      </div>

      <button
        class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
        @click="auth.login()"
      >
        Sign In / Register
      </button>

      <p class="text-xs text-gray-400">
        New customers can create an account on the next screen.
      </p>

    </div>
  </div>
</template>
