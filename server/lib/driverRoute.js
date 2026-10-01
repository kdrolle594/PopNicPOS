import {
  orderStops, isRouteStale, computeEtas, fallbackLegDurations, buildCustomerUpdate,
} from './deliveryQueue.js';
import { getRoute as orsGetRoute, sliceToFirstStop } from './routing.js';

const toIso = (v) => (v == null ? null : new Date(v).toISOString());

export function toStopInput(row) {
  return {
    id: row.id,
    lat: Number(row.delivery_lat),
    lng: Number(row.delivery_lng),
    customerUserId: row.customer_user_id ?? null,
    queuePosition: row.queue_position ?? null,
    etaAt: row.eta_at ?? null,
  };
}

// Pure: decides stop order and ETAs. getRoute is injected so tests never hit ORS.
export async function planRoute({ driver, orders, cache, now, force, getRoute }) {
  if (orders.length === 0) {
    return { stops: [], routeJson: null, recalculated: true, cacheUpdate: null };
  }
  const byId = new Map(orders.map((o) => [o.id, o]));
  const stopFor = (orderId, i, etaAt) => ({
    orderId, customerUserId: byId.get(orderId).customerUserId, position: i + 1, etaAt,
  });

  if (!driver) {
    const sorted = [...orders].sort((a, b) =>
      (a.queuePosition ?? Infinity) - (b.queuePosition ?? Infinity) || a.id - b.id);
    return {
      stops: sorted.map((o, i) => stopFor(o.id, i, null)),
      routeJson: null,
      recalculated: true,
      cacheUpdate: null,
    };
  }

  const ordered = orderStops(driver, orders.map((o) => ({ orderId: o.id, lat: o.lat, lng: o.lng })));
  const stopIds = ordered.map((s) => s.orderId);

  if (!force && !isRouteStale(cache, driver, stopIds, now)) {
    return {
      stops: stopIds.map((id, i) => stopFor(id, i, byId.get(id).etaAt ?? null)),
      routeJson: cache.routeJson ?? null,
      recalculated: false,
      cacheUpdate: null,
    };
  }

  const ors = await getRoute([driver, ...ordered]);
  const legs = ors ? ors.legDurationsSec : fallbackLegDurations(driver, ordered);
  const etas = computeEtas(legs, now);
  const routeJson = ors
    ? { source: 'ors', geometry: ors.geometry, wayPointIndexes: ors.wayPointIndexes }
    : { source: 'fallback', geometry: null, wayPointIndexes: null };
  return {
    stops: stopIds.map((id, i) => stopFor(id, i, etas[i])),
    routeJson,
    recalculated: true,
    cacheUpdate: { calcAt: now, calcFrom: driver, stopIds, routeJson },
  };
}

// Pure: every realtime message for this route. Customer messages are built
// only through buildCustomerUpdate.
export function buildPublishes({ driverUserId, driver, stops, routeJson, recalculated }) {
  const routeToNext = routeJson?.geometry
    ? sliceToFirstStop(routeJson.geometry, routeJson.wayPointIndexes)
    : null;
  const publishes = [];
  for (const stop of stops) {
    if (stop.customerUserId == null) continue;
    publishes.push({
      channel: `customer:${stop.customerUserId}`,
      event: 'deliveryUpdate',
      data: buildCustomerUpdate({
        orderId: stop.orderId,
        driver,
        position: stop.position,
        totalStops: stops.length,
        etaAt: stop.etaAt,
        routeToNext,
      }),
    });
  }
  if (recalculated) {
    publishes.push({
      channel: 'orders',
      event: 'driverRouteUpdated',
      data: {
        driverUserId,
        stops: stops.map((s) => ({ orderId: s.orderId, position: s.position, etaAt: toIso(s.etaAt) })),
      },
    });
  }
  return publishes;
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value; // mysql2 already parses JSON columns
  try { return JSON.parse(value); } catch { return null; }
}

// DB wrapper. Must run inside the caller's transaction. Lock order: the
// driver_location row is locked first, then customer_order rows are written.
export async function recalculateDriverRoute(conn, driverUserId, { force = false, now = new Date() } = {}) {
  const [[loc]] = await conn.query(
    'SELECT * FROM driver_location WHERE driver_user_id = ? FOR UPDATE',
    [driverUserId]
  );
  const [rows] = await conn.query(
    `SELECT id, order_number, customer_user_id, customer_name, customer_phone,
            delivery_address, delivery_lat, delivery_lng, queue_position, eta_at
       FROM customer_order
      WHERE driver_user_id = ? AND status = 'out_for_delivery'`,
    [driverUserId]
  );

  if (rows.length === 0) {
    if (loc) await conn.query('DELETE FROM driver_location WHERE driver_user_id = ?', [driverUserId]);
    return {
      route: { stops: [], geometry: null, source: 'fallback' },
      publishes: [{ channel: 'orders', event: 'driverRouteUpdated', data: { driverUserId, stops: [] } }],
    };
  }

  const driver = loc ? { lat: Number(loc.lat), lng: Number(loc.lng) } : null;
  const cache = loc && loc.route_calc_at
    ? {
        calcAt: new Date(loc.route_calc_at),
        calcFrom: { lat: Number(loc.route_calc_lat), lng: Number(loc.route_calc_lng) },
        stopIds: String(loc.route_stop_ids || '').split(',').filter(Boolean).map(Number),
        routeJson: parseJson(loc.route_json),
      }
    : null;

  const plan = await planRoute({
    driver, orders: rows.map(toStopInput), cache, now, force, getRoute: orsGetRoute,
  });

  if (plan.recalculated) {
    for (const s of plan.stops) {
      await conn.query(
        'UPDATE customer_order SET queue_position = ?, eta_at = ? WHERE id = ?',
        [s.position, s.etaAt, s.orderId]
      );
    }
  }
  if (plan.cacheUpdate) {
    const c = plan.cacheUpdate;
    await conn.query(
      `UPDATE driver_location
          SET route_calc_at = ?, route_calc_lat = ?, route_calc_lng = ?,
              route_stop_ids = ?, route_json = ?
        WHERE driver_user_id = ?`,
      [c.calcAt, c.calcFrom.lat, c.calcFrom.lng, c.stopIds.join(','), JSON.stringify(c.routeJson), driverUserId]
    );
  }

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const route = {
    stops: plan.stops.map((s) => {
      const r = rowById.get(s.orderId);
      return {
        orderId: s.orderId,
        orderNumber: r.order_number,
        position: s.position,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        deliveryAddress: r.delivery_address,
        lat: Number(r.delivery_lat),
        lng: Number(r.delivery_lng),
        etaAt: toIso(s.etaAt),
      };
    }),
    geometry: plan.routeJson?.geometry ?? null,
    source: plan.routeJson?.source ?? 'fallback',
  };

  return {
    route,
    publishes: buildPublishes({
      driverUserId, driver, stops: plan.stops, routeJson: plan.routeJson, recalculated: plan.recalculated,
    }),
  };
}
