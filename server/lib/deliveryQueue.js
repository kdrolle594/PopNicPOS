import { haversineMeters } from '../../shared/geo.js';

export { haversineMeters };

export const HANDOFF_SEC = 120;
export const STALE_AFTER_MS = 60_000;
export const STALE_MOVE_M = 150;
const FALLBACK_ROAD_FACTOR = 1.3;
const FALLBACK_SPEED_MPS = 30_000 / 3600;

// Nearest-neighbour chain: nearest stop to the driver, then the nearest
// remaining stop to that one, and so on. Ties go to the lower order id.
export function orderStops(driver, stops) {
  const remaining = [...stops];
  const ordered = [];
  let from = driver;
  while (remaining.length) {
    let best = 0;
    let bestDistance = Infinity;
    remaining.forEach((stop, i) => {
      const d = haversineMeters(from, stop);
      if (d < bestDistance || (d === bestDistance && stop.orderId < remaining[best].orderId)) {
        best = i;
        bestDistance = d;
      }
    });
    const [next] = remaining.splice(best, 1);
    ordered.push(next);
    from = next;
  }
  return ordered;
}

export function isRouteStale(cache, driver, stopIds, now) {
  if (!cache || !cache.calcAt) return true;
  if (now.getTime() - cache.calcAt.getTime() > STALE_AFTER_MS) return true;
  if (haversineMeters(driver, cache.calcFrom) > STALE_MOVE_M) return true;
  return cache.stopIds.join(',') !== stopIds.join(',');
}

// Stop n's ETA = now + legs up to n + a handoff for each earlier stop.
export function computeEtas(legDurationsSec, now) {
  let elapsed = 0;
  return legDurationsSec.map((leg, i) => {
    elapsed += leg + (i > 0 ? HANDOFF_SEC : 0);
    return new Date(now.getTime() + elapsed * 1000);
  });
}

export function fallbackLegDurations(driver, orderedStops) {
  let from = driver;
  return orderedStops.map((stop) => {
    const seconds = (haversineMeters(from, stop) * FALLBACK_ROAD_FACTOR) / FALLBACK_SPEED_MPS;
    from = stop;
    return Math.round(seconds);
  });
}

function toIso(value) {
  return value == null ? null : new Date(value).toISOString();
}

// The only shape a customer ever receives about a delivery. It takes nothing
// about other stops, so it cannot leak them.
export function buildCustomerUpdate({ orderId, driver, position, totalStops, etaAt, routeToNext }) {
  return {
    orderId,
    driver: driver ? { lat: driver.lat, lng: driver.lng } : null,
    position,
    totalStops,
    etaAt: toIso(etaAt),
    route: position === 1 && routeToNext ? routeToNext : null,
  };
}
