<script setup>
import { useAuthStore } from '../store/useAuthStore';
const auth = useAuthStore();
</script>

<template>
  <div class="login-page">
    <div class="login-bg-orb login-bg-orb--blue"></div>
    <div class="login-bg-orb login-bg-orb--brown"></div>

    <div class="login-card">
      <div class="login-logo">
        <span>P</span>
      </div>

      <div class="login-header">
        <h1 class="login-title">PopNic <em>POS</em></h1>
        <p class="login-sub">Restaurant Management System</p>
      </div>

      <div v-if="auth.state.error" class="login-error">
        {{ auth.state.error }}
      </div>

      <button class="login-btn" @click="auth.login()">
        Sign In to Continue
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="17" height="17">
          <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
        </svg>
      </button>

      <p class="login-note">New users can register on the next screen</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #C5DFEF 0%, #DDD0C2 55%, #C8E2F2 100%);
  padding: 24px;
  font-family: 'DM Sans', system-ui, sans-serif;
  position: relative;
  overflow: hidden;
}

.login-bg-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  filter: blur(60px);
}

.login-bg-orb--blue {
  width: 480px;
  height: 480px;
  background: rgba(58, 143, 186, 0.22);
  top: -80px;
  left: -100px;
}

.login-bg-orb--brown {
  width: 400px;
  height: 400px;
  background: rgba(139, 107, 74, 0.18);
  bottom: -60px;
  right: -80px;
}

.login-card {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: 24px;
  padding: 48px 40px 40px;
  width: 100%;
  max-width: 380px;
  box-shadow:
    0 24px 60px rgba(58, 143, 186, 0.14),
    0 4px 16px rgba(0, 0, 0, 0.07);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  text-align: center;
  animation: card-rise 0.5s cubic-bezier(0.34, 1.45, 0.64, 1) forwards;
  position: relative;
  z-index: 1;
}

@keyframes card-rise {
  from { opacity: 0; transform: translateY(22px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}

.login-logo {
  width: 66px;
  height: 66px;
  background: linear-gradient(135deg, #3A8FBA 0%, #8B6B4A 100%);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(58, 143, 186, 0.32);
}

.login-logo span {
  color: white;
  font-size: 30px;
  font-weight: 700;
  font-family: 'Playfair Display', serif;
  line-height: 1;
}

.login-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.login-title {
  font-family: 'Playfair Display', serif;
  font-size: 33px;
  font-weight: 600;
  color: #1A3D56;
  line-height: 1.1;
  margin: 0;
  font-style: normal;
}

.login-title em {
  color: #3A8FBA;
  font-style: normal;
}

.login-sub {
  font-size: 13.5px;
  color: #8B6B4A;
  margin: 0;
  font-weight: 500;
  letter-spacing: 0.03em;
}

.login-error {
  background: #FFF0F0;
  border: 1px solid #FFCDD2;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13px;
  color: #c0392b;
  width: 100%;
  text-align: left;
}

.login-btn {
  width: 100%;
  padding: 14px 24px;
  background: linear-gradient(135deg, #3A8FBA 0%, #2E6F96 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 4px 16px rgba(58, 143, 186, 0.38);
  font-family: 'DM Sans', system-ui, sans-serif;
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(58, 143, 186, 0.44);
}

.login-btn:active {
  transform: translateY(0);
  box-shadow: 0 4px 16px rgba(58, 143, 186, 0.38);
}

.login-note {
  font-size: 12px;
  color: #A8BFCC;
  margin: 0;
}
</style>
