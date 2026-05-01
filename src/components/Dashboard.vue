<script setup>
import { computed } from 'vue';
import { usePosStore } from '../store/usePosStore';

const { state } = usePosStore();

const stats = computed(() => {
  const today = new Date().toDateString();
  const month = new Date().getMonth();
  const year  = new Date().getFullYear();

  const nonCancelled = state.orders.filter((o) => o.status !== 'cancelled');
  const todayOrders  = nonCancelled.filter((o) => new Date(o.createdAt).toDateString() === today);
  const monthOrders  = nonCancelled.filter((o) => {
    const d = new Date(o.createdAt);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);
  const monthRevenue = monthOrders.reduce((s, o) => s + o.total, 0);

  return {
    todayRevenue,
    monthRevenue,
    todayOrders:   todayOrders.length,
    monthOrders:   monthOrders.length,
    activeOrders:  state.orders.filter((o) => o.status === 'pending' || o.status === 'preparing').length,
    lowStockItems: state.inventoryItems.filter((i) => i.quantity <= i.reorderLevel).length,
    menuCount:     state.menuItems.length,
    avgOrderValue: todayOrders.length ? todayRevenue / todayOrders.length : 0,
  };
});

const categoryRevenue = computed(() => {
  const byCategory = new Map();
  state.orders.forEach((order) => {
    if (order.status === 'cancelled') return;
    order.items.forEach((item) => {
      const mi = state.menuItems.find((m) => m.id === item.menuItemId);
      const cat = mi?.category || 'Other';
      byCategory.set(cat, (byCategory.get(cat) || 0) + item.price * item.quantity);
    });
  });
  const rows = Array.from(byCategory.entries()).map(([category, revenue]) => ({ category, revenue }));
  const max  = Math.max(...rows.map((r) => r.revenue), 1);
  return rows
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)
    .map((r) => ({ ...r, width: `${(r.revenue / max) * 100}%` }));
});

const recentOrders = computed(() => state.orders.slice(-5).reverse());

const STATUS = {
  pending:   { bg: '#FFF7ED', text: '#C2410C', dot: '#F97316' },
  preparing: { bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6' },
  ready:     { bg: '#F0FDF4', text: '#15803D', dot: '#22C55E' },
  completed: { bg: '#F5F3FF', text: '#6D28D9', dot: '#8B5CF6' },
  cancelled: { bg: '#FFF1F2', text: '#9F1239', dot: '#E11D48' },
};

const STAT_CARDS = computed(() => [
  {
    label: "Today's Revenue",
    value: `$${stats.value.todayRevenue.toFixed(2)}`,
    sub: `${stats.value.todayOrders} orders`,
    variant: 'blue',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  },
  {
    label: 'Monthly Revenue',
    value: `$${stats.value.monthRevenue.toFixed(2)}`,
    sub: `${stats.value.monthOrders} orders`,
    variant: 'brown',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  },
  {
    label: 'Active Orders',
    value: `${stats.value.activeOrders}`,
    sub: 'in progress',
    variant: 'teal',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
  },
  {
    label: 'Low Stock',
    value: `${stats.value.lowStockItems}`,
    sub: 'items to reorder',
    variant: stats.value.lowStockItems > 0 ? 'red' : 'green',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  },
  {
    label: 'Menu Items',
    value: `${stats.value.menuCount}`,
    sub: 'active items',
    variant: 'slate',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
  },
  {
    label: 'Avg Order Value',
    value: `$${stats.value.avgOrderValue.toFixed(2)}`,
    sub: 'today',
    variant: 'blue',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  },
]);
</script>

<template>
  <div class="dashboard">

    <header class="dash-header">
      <div>
        <h1 class="dash-title">Dashboard</h1>
        <p class="dash-sub">Welcome back — here's what's happening today.</p>
      </div>
    </header>

    <!-- KPI Cards -->
    <div class="stats-grid">
      <div
        v-for="(card, i) in STAT_CARDS"
        :key="card.label"
        class="stat-card"
        :class="`stat-card--${card.variant}`"
        :style="`--delay: ${i * 55}ms`"
      >
        <div class="stat-card__icon" v-html="card.icon"></div>
        <div class="stat-card__body">
          <p class="stat-card__label">{{ card.label }}</p>
          <p class="stat-card__value">{{ card.value }}</p>
          <p class="stat-card__sub">{{ card.sub }}</p>
        </div>
      </div>
    </div>

    <!-- Charts row -->
    <div class="charts-row">

      <div class="panel" style="--panel-delay: 340ms">
        <h2 class="panel__title">Sales by Category</h2>
        <div v-if="categoryRevenue.length" class="category-bars">
          <div
            v-for="(row, i) in categoryRevenue"
            :key="row.category"
            class="cat-row"
            :style="`--ci: ${i}`"
          >
            <div class="cat-row__header">
              <span class="cat-row__name">{{ row.category }}</span>
              <span class="cat-row__value">${{ row.revenue.toFixed(2) }}</span>
            </div>
            <div class="cat-row__track">
              <div class="cat-row__fill" :style="{ width: row.width }"></div>
            </div>
          </div>
        </div>
        <p v-else class="empty-msg">No sales data yet.</p>
      </div>

      <div class="panel" style="--panel-delay: 400ms">
        <h2 class="panel__title">Recent Orders</h2>
        <div v-if="recentOrders.length" class="orders-list">
          <div v-for="order in recentOrders" :key="order.id" class="order-row">
            <div>
              <p class="order-row__num">Order #{{ order.orderNumber }}</p>
              <p class="order-row__time">{{ new Date(order.createdAt).toLocaleString() }}</p>
            </div>
            <div class="order-row__right">
              <p class="order-row__total">${{ order.total.toFixed(2) }}</p>
              <span
                class="status-badge"
                :style="{
                  background: (STATUS[order.status] || STATUS.pending).bg,
                  color:      (STATUS[order.status] || STATUS.pending).text,
                }"
              >
                <span
                  class="status-badge__dot"
                  :style="{ background: (STATUS[order.status] || STATUS.pending).dot }"
                ></span>
                {{ order.status }}
              </span>
            </div>
          </div>
        </div>
        <p v-else class="empty-msg">No orders yet.</p>
      </div>

    </div>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 28px 32px;
  font-family: 'DM Sans', system-ui, sans-serif;
  min-height: 100%;
}

/* Header */
.dash-header {
  margin-bottom: 26px;
  animation: rise 0.3s ease both;
}

.dash-title {
  font-family: 'Playfair Display', serif;
  font-size: 27px;
  font-weight: 600;
  color: #1A3D56;
  margin: 0 0 4px;
  line-height: 1.2;
}

.dash-sub {
  font-size: 13.5px;
  color: #5B7A8F;
  margin: 0;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}

.stat-card {
  background: white;
  border-radius: 14px;
  padding: 18px 20px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  border: 1px solid rgba(58, 143, 186, 0.1);
  box-shadow: 0 2px 8px rgba(58, 143, 186, 0.05);
  animation: rise 0.35s ease calc(var(--delay, 0ms)) both;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(58, 143, 186, 0.11);
}

.stat-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-card--blue  .stat-card__icon { background: #EEF6FB; color: #3A8FBA; }
.stat-card--brown .stat-card__icon { background: #F5EDE4; color: #8B6B4A; }
.stat-card--teal  .stat-card__icon { background: #E0F5F0; color: #0E9E7A; }
.stat-card--red   .stat-card__icon { background: #FFF1F1; color: #e74c3c; }
.stat-card--green .stat-card__icon { background: #EDFAF4; color: #16A34A; }
.stat-card--slate .stat-card__icon { background: #F1F5F9; color: #64748B; }

.stat-card__body { min-width: 0; }

.stat-card__label {
  font-size: 11.5px;
  color: #7A9AAD;
  margin: 0 0 4px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.055em;
  white-space: nowrap;
}

.stat-card__value {
  font-size: 24px;
  font-weight: 700;
  color: #1A3D56;
  margin: 0 0 2px;
  line-height: 1.1;
}

.stat-card__sub {
  font-size: 12px;
  color: #9AB5C5;
  margin: 0;
}

/* Charts Row */
.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.panel {
  background: white;
  border-radius: 14px;
  padding: 20px 22px;
  border: 1px solid rgba(58, 143, 186, 0.1);
  box-shadow: 0 2px 8px rgba(58, 143, 186, 0.05);
  animation: rise 0.35s ease var(--panel-delay, 0ms) both;
}

.panel__title {
  font-size: 14.5px;
  font-weight: 600;
  color: #1A3D56;
  margin: 0 0 16px;
}

/* Category Bars */
.category-bars { display: flex; flex-direction: column; gap: 11px; }

.cat-row {
  animation: rise 0.3s ease calc(340ms + var(--ci, 0) * 50ms) both;
}

.cat-row__header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 5px;
}

.cat-row__name  { color: #3A5A6A; font-weight: 500; }
.cat-row__value { color: #8B6B4A; font-weight: 600; }

.cat-row__track {
  height: 6px;
  background: #EEF6FB;
  border-radius: 4px;
  overflow: hidden;
}

.cat-row__fill {
  height: 100%;
  background: linear-gradient(90deg, #3A8FBA 0%, #5AABDB 100%);
  border-radius: 4px;
  transition: width 0.9s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Orders List */
.orders-list { display: flex; flex-direction: column; }

.order-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid rgba(58, 143, 186, 0.08);
}

.order-row:last-child { border-bottom: none; }

.order-row__num {
  font-size: 13.5px;
  font-weight: 600;
  color: #1A3D56;
  margin: 0 0 2px;
}

.order-row__time {
  font-size: 11.5px;
  color: #9AB5C5;
  margin: 0;
}

.order-row__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.order-row__total {
  font-size: 14px;
  font-weight: 700;
  color: #1A3D56;
  margin: 0;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
}

.status-badge__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.empty-msg {
  color: #9AB5C5;
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}

/* Animations */
@keyframes rise {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0);    }
}

/* Responsive */
@media (max-width: 960px) {
  .stats-grid    { grid-template-columns: repeat(2, 1fr); }
  .charts-row    { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
  .dashboard     { padding: 18px 16px; }
  .stats-grid    { grid-template-columns: 1fr; }
}
</style>
