import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRoute, parseOrsResponse, sliceToFirstStop, _resetRoutingState } from '../server/lib/routing.js';

const DRIVER = { lat: 40, lng: -74 };
const S1 = { lat: 40.01, lng: -74 };
const S2 = { lat: 40.02, lng: -74.01 };

// ORS GeoJSON: coordinates are [lng, lat]; way_points index into them.
const ORS_BODY = {
  features: [{
    geometry: { coordinates: [[-74, 40], [-74, 40.005], [-74, 40.01], [-74.005, 40.015], [-74.01, 40.02]] },
    properties: {
      segments: [{ duration: 300.4, distance: 1200 }, { duration: 240, distance: 1000 }],
      way_points: [0, 2, 4],
    },
  }],
};

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  _resetRoutingState();
  process.env.ORS_API_KEY = 'test-key';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.ORS_API_KEY;
});

describe('parseOrsResponse', () => {
  it('converts to leg durations, [lat, lng] geometry and waypoint indexes', () => {
    expect(parseOrsResponse(ORS_BODY, 2)).toEqual({
      source: 'ors',
      legDurationsSec: [300.4, 240],
      geometry: [[40, -74], [40.005, -74], [40.01, -74], [40.015, -74.005], [40.02, -74.01]],
      wayPointIndexes: [0, 2, 4],
    });
  });
  it('rejects a segment count that does not match the stops', () => {
    expect(parseOrsResponse(ORS_BODY, 3)).toBeNull();
  });
  it('rejects malformed bodies', () => {
    expect(parseOrsResponse({}, 2)).toBeNull();
    expect(parseOrsResponse(null, 2)).toBeNull();
    const bad = structuredClone(ORS_BODY);
    bad.features[0].properties.segments[0].duration = 'x';
    expect(parseOrsResponse(bad, 2)).toBeNull();
  });
});

describe('sliceToFirstStop', () => {
  it('returns the geometry from the driver to stop 1 inclusive', () => {
    const { geometry, wayPointIndexes } = parseOrsResponse(ORS_BODY, 2);
    expect(sliceToFirstStop(geometry, wayPointIndexes)).toEqual([[40, -74], [40.005, -74], [40.01, -74]]);
  });
  it('returns null without geometry', () => {
    expect(sliceToFirstStop(null, null)).toBeNull();
  });
});

describe('getRoute', () => {
  it('posts [lng, lat] coordinates with the key and parses the result', async () => {
    globalThis.fetch = vi.fn(async () => okResponse(ORS_BODY));
    const route = await getRoute([DRIVER, S1, S2]);
    expect(route.legDurationsSec).toEqual([300.4, 240]);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.openrouteservice.org/v2/directions/driving-car/geojson');
    expect(init.headers.Authorization).toBe('test-key');
    expect(JSON.parse(init.body)).toEqual({ coordinates: [[-74, 40], [-74, 40.01], [-74.01, 40.02]] });
  });
  it('returns null without an API key and does not call fetch', async () => {
    delete process.env.ORS_API_KEY;
    globalThis.fetch = vi.fn();
    expect(await getRoute([DRIVER, S1])).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('returns null on a non-OK response', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await getRoute([DRIVER, S1])).toBeNull();
  });
  it('returns null when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('network down'); });
    expect(await getRoute([DRIVER, S1])).toBeNull();
  });
  it('returns null on a malformed body', async () => {
    globalThis.fetch = vi.fn(async () => okResponse({ features: [] }));
    expect(await getRoute([DRIVER, S1])).toBeNull();
  });
  it('aborts after 5 seconds', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = getRoute([DRIVER, S1]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBeNull();
  });
  it('backs off for 5 minutes after a 429', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    const t0 = 1_000_000;
    expect(await getRoute([DRIVER, S1], { now: t0 })).toBeNull();
    globalThis.fetch = vi.fn(async () => okResponse(ORS_BODY));
    expect(await getRoute([DRIVER, S1, S2], { now: t0 + 4 * 60_000 })).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await getRoute([DRIVER, S1, S2], { now: t0 + 5 * 60_000 + 1 })).not.toBeNull();
  });
  it('backs off for 5 minutes after a 403', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    const t0 = 1_000_000;
    expect(await getRoute([DRIVER, S1], { now: t0 })).toBeNull();
    globalThis.fetch = vi.fn(async () => okResponse(ORS_BODY));
    expect(await getRoute([DRIVER, S1, S2], { now: t0 + 4 * 60_000 })).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await getRoute([DRIVER, S1, S2], { now: t0 + 5 * 60_000 + 1 })).not.toBeNull();
  });
  it('returns null for fewer than two points', async () => {
    globalThis.fetch = vi.fn();
    expect(await getRoute([DRIVER])).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
