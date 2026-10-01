// The only module that talks to OpenRouteService. Every failure returns null
// so callers fall back to straight-line ETAs with no route line.
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
const TIMEOUT_MS = 5000;
const BACKOFF_MS = 5 * 60 * 1000;

// Per serverless instance; best-effort.
let backoffUntil = 0;

export function _resetRoutingState() {
  backoffUntil = 0;
}

const round5 = (x) => Math.round(x * 1e5) / 1e5;

export function parseOrsResponse(body, stopCount) {
  const feature = body?.features?.[0];
  const segments = feature?.properties?.segments;
  const wayPoints = feature?.properties?.way_points;
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(segments) || segments.length !== stopCount) return null;
  if (!Array.isArray(wayPoints) || wayPoints.length !== stopCount + 1) return null;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const legDurationsSec = segments.map((s) => (typeof s?.duration === 'number' ? s.duration : NaN));
  if (legDurationsSec.some((d) => !Number.isFinite(d) || d < 0)) return null;
  return {
    source: 'ors',
    legDurationsSec,
    // 5 decimals (~1 m) keeps Ably payloads small.
    geometry: coords.map(([lng, lat]) => [round5(lat), round5(lng)]),
    wayPointIndexes: wayPoints,
  };
}

export function sliceToFirstStop(geometry, wayPointIndexes) {
  if (!Array.isArray(geometry) || !Array.isArray(wayPointIndexes) || wayPointIndexes.length < 2) return null;
  return geometry.slice(wayPointIndexes[0], wayPointIndexes[1] + 1);
}

export async function getRoute(points, { now = Date.now() } = {}) {
  const key = process.env.ORS_API_KEY;
  if (!key || points.length < 2 || now < backoffUntil) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ORS_URL, {
      method: 'POST',
      headers: {
        Authorization: key,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json, application/json',
      },
      body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]) }),
      signal: controller.signal,
    });
    if (res.status === 429 || res.status === 403) {
      backoffUntil = now + BACKOFF_MS;
      console.warn('ORS quota or key rejected — using straight-line ETAs for 5 minutes');
      return null;
    }
    if (!res.ok) {
      console.warn(`ORS request failed: HTTP ${res.status}`);
      return null;
    }
    const parsed = parseOrsResponse(await res.json(), points.length - 1);
    if (!parsed) console.warn('ORS response was malformed — using straight-line ETAs');
    return parsed;
  } catch (err) {
    console.warn('ORS request failed:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
