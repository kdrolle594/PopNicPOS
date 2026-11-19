<script setup>
import { computed, onMounted, ref } from 'vue';

import { usePosStore } from '../../store/usePosStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { TIERS, tierProgress, DOLLARS_PER_POINT } from '../../../shared/loyalty.js';
import UiCard from '../ui/UiCard.vue';
import UiButton from '../ui/UiButton.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiEmptyState from '../ui/UiEmptyState.vue';

const pos = usePosStore();
const auth = useAuthStore();

const profile = ref(null);
const loading = ref(true);
const failed = ref(false);

async function load() {
  loading.value = true;
  failed.value = false;
  const me = await pos.fetchMe();
  profile.value = me;
  failed.value = !me;
  loading.value = false;
}
onMounted(load);

const progress = computed(() => tierProgress(profile.value?.points ?? 0));
const percent = computed(() => Math.round(progress.value.progress * 100));
const history = computed(() => profile.value?.history ?? []);

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
</script>

<template>
  <section class="rewards" aria-label="Your rewards">
    <h2 class="rewards__heading">Rewards</h2>

    <UiCard v-if="loading">
      <UiSkeleton width="40%" height="1.6em" />
      <UiSkeleton width="100%" height="10px" style="margin-top: var(--space-4)" />
      <UiSkeleton width="55%" height="0.9em" style="margin-top: var(--space-2)" />
    </UiCard>

    <UiEmptyState
      v-else-if="failed"
      title="Rewards didn't load"
      description="Check your connection and try again."
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="load">Try again</UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <UiCard class="rewards__card">
        <div class="rewards__top">
          <p class="rewards__tier" :data-tier="progress.current.id">{{ progress.current.label }}</p>
          <p class="rewards__points">
            <span class="rewards__points-num">{{ profile.points }}</span>
            <span class="rewards__points-unit">points</span>
          </p>
        </div>

        <div
          class="rewards__bar"
          role="progressbar"
          :aria-valuenow="percent"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="progress.next ? `Progress to ${progress.next.label}` : 'Top tier reached'"
        >
          <div class="rewards__bar-fill" :style="{ width: percent + '%' }" />
        </div>
        <p class="rewards__next">
          <template v-if="progress.next">
            {{ progress.toNext }} more points to reach {{ progress.next.label }}
          </template>
          <template v-else>You're at our top tier.</template>
        </p>

        <ol class="rewards__ladder" aria-label="Tiers">
          <li
            v-for="t in TIERS"
            :key="t.id"
            :class="{ 'rewards__rung--reached': profile.points >= t.min }"
            class="rewards__rung"
          >
            <span class="rewards__rung-name">{{ t.label }}</span>
            <span class="rewards__rung-min">{{ t.min }}</span>
          </li>
        </ol>
      </UiCard>

      <p class="rewards__rule">
        You earn 1 point for every ${{ DOLLARS_PER_POINT }} you spend. Points are added when your order is complete.
      </p>

      <h3 class="rewards__subheading">Points history</h3>
      <UiEmptyState
        v-if="history.length === 0"
        title="No points yet"
        description="Place an order to start earning."
      />
      <UiCard v-else :padded="false">
        <ul class="rewards__history">
          <li v-for="h in history" :key="h.orderId" class="rewards__row">
            <span class="rewards__row-main">
              <span class="rewards__row-order">Order #{{ h.orderNumber }}</span>
              <span class="rewards__row-date">{{ formatDate(h.createdAt) }}</span>
            </span>
            <span class="rewards__row-pts">
              <span v-if="h.pointsEarned" :class="h.credited ? 'rewards__plus' : 'rewards__pending'">
                +{{ h.pointsEarned }}<template v-if="!h.credited"> pending</template>
              </span>
              <span v-if="h.pointsRedeemed" class="rewards__minus">−{{ h.pointsRedeemed }}</span>
            </span>
          </li>
        </ul>
      </UiCard>

      <p v-if="auth.state.appUser" class="rewards__account">
        Signed in as {{ auth.state.appUser?.email || auth.state.appUser?.name }}
        <UiButton variant="ghost" size="sm" @click="auth.logout()">Sign out</UiButton>
      </p>
    </template>
  </section>
</template>

<style scoped>
.rewards {
  padding: var(--space-5) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
  margin: 0 auto;
}

.rewards__heading {
  font-size: var(--text-h3);
  font-weight: var(--weight-semibold);
  color: var(--ink);
  margin: 0 0 var(--space-2);
}

.rewards__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

/* The tier name is the one big element on this screen. */
.rewards__tier {
  margin: 0;
  font-size: var(--text-display);
  line-height: var(--leading-display);
  letter-spacing: var(--tracking-display);
  font-weight: var(--weight-bold);
  color: var(--primary-text);
}
.rewards__tier[data-tier='bronze']   { color: #9A5B2E; }
.rewards__tier[data-tier='silver']   { color: var(--ink-muted); }
.rewards__tier[data-tier='gold']     { color: var(--warning); }
.rewards__tier[data-tier='platinum'] { color: var(--primary-text); }

.rewards__points { margin: 0; text-align: right; }
.rewards__points-num {
  font-size: var(--text-h2);
  font-weight: var(--weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.rewards__points-unit {
  margin-left: var(--space-1);
  font-size: var(--text-small);
  color: var(--ink-muted);
}

.rewards__bar {
  margin-top: var(--space-4);
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  overflow: hidden;
}
.rewards__bar-fill {
  height: 100%;
  background: var(--primary);
  border-radius: inherit;
  transition: width var(--motion-base) var(--ease);
}
@media (prefers-reduced-motion: reduce) {
  .rewards__bar-fill { transition: none; }
}

.rewards__next {
  margin: var(--space-2) 0 0;
  font-size: var(--text-small);
  color: var(--ink-muted);
}

.rewards__ladder {
  list-style: none;
  margin: var(--space-5) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
}
.rewards__rung {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: var(--space-2);
  border-top: 3px solid var(--line);
  font-size: var(--text-caption);
  color: var(--ink-subtle);
}
.rewards__rung--reached { border-top-color: var(--primary); color: var(--ink); }
.rewards__rung-name { font-weight: var(--weight-semibold); }
.rewards__rung-min { font-variant-numeric: tabular-nums; }

.rewards__rule {
  margin: 0;
  font-size: var(--text-small);
  color: var(--ink-muted);
}

.rewards__subheading {
  margin: var(--space-2) 0 0;
  font-size: var(--text-body-lg);
  font-weight: var(--weight-semibold);
}

.rewards__history { list-style: none; margin: 0; padding: 0; }
.rewards__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--card-pad, 20px);
}
.rewards__row + .rewards__row { border-top: 1px solid var(--line); }
.rewards__row-main { display: flex; flex-direction: column; }
.rewards__row-order { font-weight: var(--weight-medium); }
.rewards__row-date { font-size: var(--text-caption); color: var(--ink-muted); }
.rewards__row-pts {
  display: flex;
  gap: var(--space-3);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.rewards__plus    { color: var(--positive-text); }
.rewards__pending { color: var(--ink-muted); font-weight: var(--weight-medium); }
.rewards__minus   { color: var(--danger); }

.rewards__account {
  margin: var(--space-2) 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--text-small);
  color: var(--ink-muted);
}
</style>
