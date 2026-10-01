import { describe, it, expect, vi } from 'vitest';
import { planRoute, buildPublishes, toStopInput } from '../server/lib/driverRoute.js';

const now = new Date('2026-09-30T18:00:00Z');
const driver = { lat: 40, lng: -74 };
// Three customers north of the driver at increasing distance.
const orders = [
  { id: 3, lat: 40.03, lng: -74, customerUserId: 103, queuePosition: null, etaAt: null },
  { id: 1, lat: 40.01, lng: -74, customerUserId: 101, queuePosition: null, etaAt: null },
  { id: 2, lat: 40.02, lng: -74, customerUserId: 102, queuePosition: null, etaAt: null },
];
const orsRoute = {
  source: 'ors',
  legDurationsSec: [300, 200, 100],
  geometry: [[40, -74], [40.005, -74], [40.01, -74], [40.02, -74], [40.03, -74]],
  wayPointIndexes: [0, 2, 3, 4],
};

describe('toStopInput', () => {
  it('converts mysql2 DECIMAL strings to numbers', () => {
    expect(toStopInput({
      id: 5, delivery_lat: '40.7128000', delivery_lng: '-74.0060000',
      customer_user_id: 9, queue_position: 2, eta_at: null,
    })).toEqual({ id: 5, lat: 40.7128, lng: -74.006, customerUserId: 9, queuePosition: 2, etaAt: null });
  });
});

describe('planRoute', () => {
  it('orders nearest-first and uses ORS leg times when available', async () => {
    const getRoute = vi.fn(async () => orsRoute);
    const plan = await planRoute({ driver, orders, cache: null, now, force: false, getRoute });
    expect(plan.recalculated).toBe(true);
    expect(plan.stops.map((s) => [s.orderId, s.position])).toEqual([[1, 1], [2, 2], [3, 3]]);
    expect(plan.stops[0].etaAt.toISOString()).toBe('2026-09-30T18:05:00.000Z');
    expect(plan.stops[1].etaAt.toISOString()).toBe('2026-09-30T18:10:20.000Z'); // 300 + 120 + 200
    expect(getRoute).toHaveBeenCalledWith([driver, expect.objectContaining({ orderId: 1 }),
      expect.objectContaining({ orderId: 2 }), expect.objectContaining({ orderId: 3 })]);
    expect(plan.routeJson).toEqual({ source: 'ors', geometry: orsRoute.geometry, wayPointIndexes: orsRoute.wayPointIndexes });
    expect(plan.cacheUpdate).toMatchObject({ calcAt: now, calcFrom: driver, stopIds: [1, 2, 3] });
  });

  it('falls back to straight-line times with no geometry', async () => {
    const plan = await planRoute({ driver, orders, cache: null, now, force: false, getRoute: async () => null });
    expect(plan.routeJson).toEqual({ source: 'fallback', geometry: null, wayPointIndexes: null });
    expect(plan.stops.every((s) => s.etaAt instanceof Date)).toBe(true);
  });

  it('keeps stored positions and ETAs when the cache is fresh', async () => {
    const stored = new Date('2026-09-30T18:04:00Z');
    const fresh = orders.map((o) => ({ ...o, etaAt: o.id === 1 ? stored : null }));
    const cache = { calcAt: new Date('2026-09-30T17:59:40Z'), calcFrom: driver, stopIds: [1, 2, 3], routeJson: { source: 'ors', geometry: orsRoute.geometry, wayPointIndexes: orsRoute.wayPointIndexes } };
    const getRoute = vi.fn();
    const plan = await planRoute({ driver, orders: fresh, cache, now, force: false, getRoute });
    expect(getRoute).not.toHaveBeenCalled();
    expect(plan.recalculated).toBe(false);
    expect(plan.cacheUpdate).toBeNull();
    expect(plan.stops[0]).toMatchObject({ orderId: 1, position: 1, etaAt: stored });
    expect(plan.routeJson).toBe(cache.routeJson);
  });

  it('recalculates a fresh cache when forced', async () => {
    const cache = { calcAt: now, calcFrom: driver, stopIds: [1, 2, 3], routeJson: null };
    const getRoute = vi.fn(async () => orsRoute);
    const plan = await planRoute({ driver, orders, cache, now, force: true, getRoute });
    expect(getRoute).toHaveBeenCalledOnce();
    expect(plan.recalculated).toBe(true);
  });

  it('without a driver fix keeps stored order, appends new stops, and has no ETAs', async () => {
    const noFix = [
      { ...orders[0], queuePosition: 1 },   // id 3
      { ...orders[1], queuePosition: null }, // id 1, newly claimed
      { ...orders[2], queuePosition: 2 },   // id 2
    ];
    const getRoute = vi.fn();
    const plan = await planRoute({ driver: null, orders: noFix, cache: null, now, force: true, getRoute });
    expect(getRoute).not.toHaveBeenCalled();
    expect(plan.stops.map((s) => s.orderId)).toEqual([3, 2, 1]);
    expect(plan.stops.every((s) => s.etaAt === null)).toBe(true);
    expect(plan.recalculated).toBe(true);
    expect(plan.cacheUpdate).toBeNull();
  });

  it('returns an empty plan for no orders', async () => {
    const plan = await planRoute({ driver, orders: [], cache: null, now, force: true, getRoute: vi.fn() });
    expect(plan.stops).toEqual([]);
  });
});

describe('buildPublishes', () => {
  const stops = [
    { orderId: 1, customerUserId: 101, position: 1, etaAt: new Date('2026-09-30T18:05:00Z') },
    { orderId: 2, customerUserId: 102, position: 2, etaAt: new Date('2026-09-30T18:10:20Z') },
    { orderId: 3, customerUserId: 103, position: 3, etaAt: new Date('2026-09-30T18:14:00Z') },
  ];
  const routeJson = { source: 'ors', geometry: orsRoute.geometry, wayPointIndexes: orsRoute.wayPointIndexes };

  it('never puts another stop in a customer payload (privacy)', () => {
    const publishes = buildPublishes({ driverUserId: 20, driver, stops, routeJson, recalculated: true });
    const customerMsgs = publishes.filter((p) => p.channel.startsWith('customer:'));
    expect(customerMsgs).toHaveLength(3);
    for (const msg of customerMsgs) {
      const own = stops.find((s) => `customer:${s.customerUserId}` === msg.channel);
      expect(msg.event).toBe('deliveryUpdate');
      expect(msg.data.orderId).toBe(own.orderId);
      const text = JSON.stringify(msg.data);
      for (const other of orders.filter((o) => o.id !== own.orderId)) {
        expect(text).not.toContain(String(other.lat));
      }
      for (const otherId of stops.filter((s) => s !== own).map((s) => s.orderId)) {
        expect(msg.data.orderId).not.toBe(otherId);
      }
    }
  });

  it('sends the route line only to stop 1, and only up to stop 1', () => {
    const publishes = buildPublishes({ driverUserId: 20, driver, stops, routeJson, recalculated: true });
    const byChannel = Object.fromEntries(publishes.map((p) => [p.channel + ':' + p.event, p.data]));
    expect(byChannel['customer:101:deliveryUpdate'].route).toEqual([[40, -74], [40.005, -74], [40.01, -74]]);
    expect(byChannel['customer:102:deliveryUpdate'].route).toBeNull();
    expect(byChannel['customer:103:deliveryUpdate'].route).toBeNull();
    expect(byChannel['customer:102:deliveryUpdate']).toMatchObject({ position: 2, totalStops: 3 });
  });

  it('sends one update per order when a customer has two orders on the route', () => {
    const twoOrders = [stops[0], { ...stops[1], customerUserId: 101 }];
    const publishes = buildPublishes({ driverUserId: 20, driver, stops: twoOrders, routeJson, recalculated: false });
    const mine = publishes.filter((p) => p.channel === 'customer:101');
    expect(mine.map((p) => [p.data.orderId, p.data.position])).toEqual([[1, 1], [2, 2]]);
  });

  it('skips walk-in orders with no customer account', () => {
    const publishes = buildPublishes({
      driverUserId: 20, driver, stops: [{ ...stops[0], customerUserId: null }], routeJson, recalculated: false,
    });
    expect(publishes.filter((p) => p.channel.startsWith('customer:'))).toEqual([]);
  });

  it('tells staff about the route only when it was recalculated', () => {
    const recalculated = buildPublishes({ driverUserId: 20, driver, stops, routeJson, recalculated: true });
    expect(recalculated.find((p) => p.channel === 'orders')).toEqual({
      channel: 'orders', event: 'driverRouteUpdated',
      data: { driverUserId: 20, stops: [
        { orderId: 1, position: 1, etaAt: '2026-09-30T18:05:00.000Z' },
        { orderId: 2, position: 2, etaAt: '2026-09-30T18:10:20.000Z' },
        { orderId: 3, position: 3, etaAt: '2026-09-30T18:14:00.000Z' },
      ] },
    });
    const kept = buildPublishes({ driverUserId: 20, driver, stops, routeJson, recalculated: false });
    expect(kept.find((p) => p.channel === 'orders')).toBeUndefined();
  });
});
