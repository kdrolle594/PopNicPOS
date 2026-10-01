import { describe, it, expect } from 'vitest';
import {
  haversineMeters, orderStops, isRouteStale, computeEtas,
  fallbackLegDurations, buildCustomerUpdate, HANDOFF_SEC,
} from '../server/lib/deliveryQueue.js';

// ~111 m per 0.001° of latitude.
const P = (lat, lng, orderId) => ({ lat, lng, ...(orderId ? { orderId } : {}) });

describe('haversineMeters', () => {
  it('is 0 for the same point', () => {
    expect(haversineMeters(P(40, -74), P(40, -74))).toBe(0);
  });
  it('measures 0.001° of latitude as about 111 m', () => {
    expect(haversineMeters(P(40, -74), P(40.001, -74))).toBeCloseTo(111.2, 0);
  });
});

describe('orderStops', () => {
  it('chains nearest-first from each stop, not by distance to the driver', () => {
    // Driver at 0. A at +1.0 km north, B at +1.1 km south, C at +1.5 km north.
    // By distance to the driver: A, B, C. As a chain: A (nearest), then C (0.5 km from A), then B.
    const driver = P(40, -74);
    const A = P(40.009, -74, 1);
    const B = P(39.990, -74, 2);
    const C = P(40.0135, -74, 3);
    expect(orderStops(driver, [B, C, A]).map((s) => s.orderId)).toEqual([1, 3, 2]);
  });
  it('breaks exact ties by the lower order id', () => {
    const driver = P(40, -74);
    const east = P(40, -73.99, 9);
    const west = P(40, -74.01, 4);
    expect(orderStops(driver, [east, west])[0].orderId).toBe(4);
  });
  it('does not mutate its input', () => {
    const stops = [P(40.01, -74, 1), P(40.001, -74, 2)];
    orderStops(P(40, -74), stops);
    expect(stops.map((s) => s.orderId)).toEqual([1, 2]);
  });
  it('returns an empty list for no stops', () => {
    expect(orderStops(P(40, -74), [])).toEqual([]);
  });
});

describe('isRouteStale', () => {
  const now = new Date('2026-09-30T18:00:00Z');
  const cache = { calcAt: new Date('2026-09-30T17:59:30Z'), calcFrom: P(40, -74), stopIds: [1, 2] };
  it('is stale with no cache', () => {
    expect(isRouteStale(null, P(40, -74), [1, 2], now)).toBe(true);
  });
  it('is fresh when recent, close and the same stops', () => {
    expect(isRouteStale(cache, P(40.0005, -74), [1, 2], now)).toBe(false);
  });
  it('is stale after 60 s', () => {
    const old = { ...cache, calcAt: new Date('2026-09-30T17:58:59Z') };
    expect(isRouteStale(old, P(40, -74), [1, 2], now)).toBe(true);
  });
  it('is stale after moving more than 150 m', () => {
    expect(isRouteStale(cache, P(40.0015, -74), [1, 2], now)).toBe(true);
  });
  it('is stale when the stops or their order change', () => {
    expect(isRouteStale(cache, P(40, -74), [2, 1], now)).toBe(true);
    expect(isRouteStale(cache, P(40, -74), [1], now)).toBe(true);
    expect(isRouteStale(cache, P(40, -74), [1, 2, 3], now)).toBe(true);
  });
});

describe('computeEtas', () => {
  it('adds each leg plus a handoff for every earlier stop', () => {
    const now = new Date('2026-09-30T18:00:00Z');
    const etas = computeEtas([300, 240, 600], now);
    expect(etas.map((d) => (d.getTime() - now.getTime()) / 1000)).toEqual([
      300,
      300 + HANDOFF_SEC + 240,
      300 + HANDOFF_SEC + 240 + HANDOFF_SEC + 600,
    ]);
  });
  it('returns nothing for no legs', () => {
    expect(computeEtas([], new Date())).toEqual([]);
  });
});

describe('fallbackLegDurations', () => {
  it('uses straight-line distance x 1.3 at 30 km/h', () => {
    // 1 km straight line -> 1.3 km road -> 156 s at 30 km/h (8.333 m/s).
    const driver = P(40, -74);
    const stop = P(40 + 1000 / 111195, -74, 1);
    expect(fallbackLegDurations(driver, [stop])[0]).toBeCloseTo(156, -1);
  });
  it('chains legs from stop to stop', () => {
    const driver = P(40, -74);
    const a = P(40.009, -74, 1);
    const b = P(40.018, -74, 2);
    const [l1, l2] = fallbackLegDurations(driver, [a, b]);
    expect(Math.abs(l1 - l2)).toBeLessThanOrEqual(1);
  });
});

describe('buildCustomerUpdate', () => {
  const route = [[40, -74], [40.001, -74]];
  it('includes the route only for the next stop', () => {
    const eta = new Date('2026-09-30T18:10:00Z');
    expect(buildCustomerUpdate({
      orderId: 7, driver: P(40, -74), position: 1, totalStops: 3, etaAt: eta, routeToNext: route,
    })).toEqual({
      orderId: 7, driver: { lat: 40, lng: -74 }, position: 1, totalStops: 3,
      etaAt: '2026-09-30T18:10:00.000Z', route,
    });
    expect(buildCustomerUpdate({
      orderId: 8, driver: P(40, -74), position: 2, totalStops: 3, etaAt: eta, routeToNext: route,
    }).route).toBeNull();
  });
  it('handles no driver fix and no ETA', () => {
    const u = buildCustomerUpdate({ orderId: 7, driver: null, position: 1, totalStops: 1, etaAt: null, routeToNext: null });
    expect(u.driver).toBeNull();
    expect(u.etaAt).toBeNull();
    expect(u.route).toBeNull();
  });
  it('copies only lat/lng from the driver object', () => {
    const u = buildCustomerUpdate({
      orderId: 7, driver: { lat: 40, lng: -74, driverUserId: 99 }, position: 2, totalStops: 2, etaAt: null, routeToNext: null,
    });
    expect(u.driver).toEqual({ lat: 40, lng: -74 });
  });
});
