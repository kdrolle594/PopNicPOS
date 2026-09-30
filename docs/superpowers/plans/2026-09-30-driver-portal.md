# Multi-Stop Driver Portal & Private Delivery Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One driver carries several delivery orders ordered nearest-first from their live GPS; each customer sees their place in line, an ETA, the driver's dot and (only when next) the road route to them, and never another customer's location.

**Architecture:** The driver's phone posts GPS to `POST /api/driver/location`. The server orders the driver's stops (`server/lib/deliveryQueue.js`, pure), asks OpenRouteService for road times and geometry when the cached route is stale (`server/lib/routing.js`), stores positions/ETAs, and publishes one private payload per customer on `customer:{userId}` Ably channels (`server/lib/driverRoute.js`). Status/claim rules live in pure `server/lib/orderRules.js`. Browsers never publish to Ably and customers lose the shared `orders` channel.

**Tech Stack:** Vue 3 `<script setup>`, Vite, Tailwind (console views) + CSS tokens (storefront), Leaflet, Express 5, mysql2/promise, Ably, OpenRouteService Directions API, vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-09-30-driver-portal-design.md` — read §3 (decisions), §5 (server) and §7 (edge cases) before starting any task.

## Global Constraints

- Work on branch `feat/driver-portal`. No new npm dependencies. No Pinia, no Vue Router, no jsdom / Vue test utils.
- Tests run in vitest's **node** environment (`npm test`). Only pure modules are unit-tested; routes and components are verified by `npm run build`, `node --check`, and the manual checklist in Task 13.
- ESM everywhere. Server imports use explicit `.js` extensions.
- **Every realtime publish is `await`ed before the response is sent** (Vercel can freeze work left running after the response).
- **Publish only after `conn.commit()`.** Nothing is announced for a rolled-back change.
- **Lock order:** inside any transaction, lock the driver's `driver_location` row **before** any `customer_order` row. Two endpoints taking these locks in opposite orders deadlock.
- Constants (copy exactly): GPS post every **10 s**; route stale after **60 s** or **150 m** or a changed stop list; **120 s** handoff per earlier stop; fallback **30 km/h** × **1.3** road factor; ORS timeout **5 s**; ORS 429 backoff **5 min**; customer map "Last updated" after **60 s** without an update.
- No customer payload may contain another customer's coordinates, address, name, phone or order id.
- Customers may cancel only while `pending`. Only a claim sets `out_for_delivery`.
- New env var `ORS_API_KEY` (server). Without it everything works with straight-line ETAs and no route line.
- Commit after every task with the message given; end every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deviations from the spec (decided while planning — follow these)

1. `haversineMeters` lives in **`shared/geo.js`** (repo root, like `shared/menuOptions.js`) because the driver portal needs it for "1.8 km away" too. `server/lib/deliveryQueue.js` re-exports it.
2. `recalculateDriverRoute` is split in two: pure **`planRoute`** + **`buildPublishes`** (unit-tested, `getRoute` injected) and the DB wrapper **`recalculateDriverRoute(conn, driverUserId, opts)`**, which returns `{ route, publishes }`. Callers commit, then `await emitRoutePublishes(publishes)`.
3. When the route is **not** stale, stored `queue_position`/`eta_at` are kept (not recomputed from the new position) and only the driver dot moves; `driverRouteUpdated` is only sent when the route was recalculated.
4. Staff who open the storefront "customer" view do not subscribe to realtime there (their token has no `customer:*` right); their order list is static until reload.
5. `PUT /orders/:id/status` reads the order without a lock first to learn its driver, locks that driver's `driver_location`, then locks the order and returns **409 "Order changed, try again"** if its driver changed in between (lock-order rule).
6. The driver portal refetches `GET /api/orders` whenever a `driverRouteUpdated` for itself arrives (covers staff assigning or cancelling one of its stops), rather than patching stops in place.
7. Client-side delivery text/formatting helpers live in **`src/lib/delivery.js`** (pure, tested).

## Review Focus

1. **A customer with two active delivery orders** (same or different drivers) must get one `deliveryUpdate` per order, each with its own position, and the tracker must keep them apart. Pinned in Task 5 (`buildPublishes`) and Task 11 (updates keyed by `orderId`).
2. **DECIMAL columns arrive from mysql2 as strings** (`"40.7128000"`); ordering and distances must use numbers. Pinned in Task 5 (`planRoute` with string coordinates via `toStopInput`).
3. **ORS returns a body whose segment count doesn't match the stops** (duplicate points, partial response) — must fall back, not mis-assign ETAs. Pinned in Task 3.
4. **No ETA yet** (`etaAt: null` — no GPS fix, or staff assigned before the driver shared location) — customer and driver text must read "ETA pending", not "NaN" or "Invalid Date". Pinned in Task 9 (`formatEta`).
5. **Location bodies with strings, `NaN`, or out-of-range values** (`{ lat: "40", lng: 200 }`) — 400, never stored. Pinned in Task 4 (`parseLocation`).

Also check by hand (not unit-testable here): two drivers pressing "Add to route" on the same order at once (Task 13 checklist), and the driver phone screen staying awake during a route.

## File map

| File | Status | Responsibility |
|---|---|---|
| `shared/geo.js` | create | `haversineMeters` |
| `server/lib/deliveryQueue.js` | create | Pure stop ordering, staleness, ETAs, fallback durations, customer payload |
| `server/lib/routing.js` | create | ORS call, response parsing, first-leg slice, backoff |
| `server/lib/orderRules.js` | create | Pure status/claim/release/location/pin rules |
| `server/lib/driverRoute.js` | create | `planRoute`, `buildPublishes` (pure) + `recalculateDriverRoute` (DB) |
| `server/routes/driver.js` | create | `POST /api/driver/location` |
| `server/migrate.js` | modify | Step 9: status enum, driver/queue/eta columns, `driver_location` |
| `database/phase1_schema.sql` | modify | Match step 9 for fresh databases |
| `server/realtime.js` | modify | Capabilities, customer-channel emits, `emitRoutePublishes` |
| `server/routes/orders.js` | modify | GET fields, POST pin rule, drivers list, claim, release, status rules |
| `server/app.js` | modify | Mount `/api/driver` |
| `src/lib/realtime.js` | modify | `subscribeCustomer` (Task 10); remove delivery channel helpers (Task 12) |
| `src/lib/delivery.js` | create | Pure client text/format helpers |
| `src/lib/useLocationSharing.js` | create | GPS watch, 10 s posting, wake lock |
| `src/store/usePosStore.js` | modify | `updateOrderDriver(orderId, driverUserId)`, `fetchDrivers()` |
| `src/components/KitchenDisplay.vue` | modify | Driver dropdown, no Complete on ready deliveries |
| `src/components/storefront/CheckoutPanel.vue` | modify | Pin required, landmark field |
| `src/components/storefront/OrderTracker.vue` | modify | 5-step timeline, live queue block, customer channel |
| `src/components/storefront/DeliveryMap.vue` | modify | Prop-driven map, route polyline, captions |
| `src/components/driver/DriverRouteMap.vue` | create | Driver map: car, numbered stops, full route |
| `src/components/DriverView.vue` | rewrite | Available / My route tabs |
| `CLAUDE.md` | modify | Routes, channels, status, env var |
| `tests/deliveryQueue.test.js`, `tests/routing.test.js`, `tests/orderRules.test.js`, `tests/driverRoute.test.js`, `tests/delivery.test.js` | create | Unit tests |
| `tests/realtimeCapability.test.js` | modify | New capability table |

---

### Task 1: Schema migration (step 9)

**Files:**
- Modify: `server/migrate.js` (insert before `console.log('✔  Migration complete');`)
- Modify: `database/phase1_schema.sql` (the `customer_order` table and a new table after it)

**Interfaces:**
- Produces: `customer_order.status` accepts `'out_for_delivery'`; columns `customer_order.driver_name`, `driver_phone` (ensured), `driver_user_id BIGINT NULL`, `queue_position SMALLINT NULL`, `eta_at DATETIME NULL`; table `driver_location(driver_user_id PK, lat, lng, updated_at, route_calc_at, route_calc_lat, route_calc_lng, route_stop_ids, route_json)`.

- [ ] **Step 1: Add step 9 to `server/migrate.js`**

Insert this block immediately before `console.log('✔  Migration complete');`:

```js
    // 9. Multi-stop delivery: out_for_delivery status, driver identity,
    // queue position / ETA on the order, and one location row per active driver.
    const [statusCols] = await conn.query(`
      SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'customer_order'
        AND COLUMN_NAME  = 'status'
    `);
    if (statusCols.length === 0) {
      console.warn('customer_order.status column not found — skipping status enum migration');
    } else if (statusCols[0].COLUMN_TYPE.includes("'out_for_delivery'")) {
      console.log('✔  customer_order.status already includes out_for_delivery — skipping');
    } else {
      const existing = Array.from(statusCols[0].COLUMN_TYPE.matchAll(/'([^']+)'/g)).map((m) => m[1]);
      const ordered = ['pending', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
      const next = [...ordered, ...existing.filter((v) => !ordered.includes(v))];
      const enumList = next.map((v) => `'${v}'`).join(',');
      await conn.query(
        `ALTER TABLE customer_order MODIFY COLUMN status ENUM(${enumList}) NOT NULL DEFAULT 'pending'`
      );
      console.log('✔  Added out_for_delivery to customer_order.status enum');
    }

    const [idCol] = await conn.query(`
      SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND COLUMN_NAME = 'id'
    `);
    const userIdType = idCol[0].COLUMN_TYPE; // FK columns must match exactly, e.g. "bigint"

    // driver_name / driver_phone are used by the existing code but no earlier
    // step creates them (they were added to the shared DB by hand), so ensure them here.
    const orderColumns = [
      ['driver_name', 'VARCHAR(100) NULL'],
      ['driver_phone', 'VARCHAR(30) NULL'],
      ['driver_user_id', `${userIdType} NULL`],
      ['queue_position', 'SMALLINT NULL'],
      ['eta_at', 'DATETIME NULL'],
    ];
    for (const [column, definition] of orderColumns) {
      const [found] = await conn.query(`
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_order' AND COLUMN_NAME = ?
      `, [column]);
      if (found.length) {
        console.log(`✔  customer_order.${column} already exists — skipping`);
      } else {
        await conn.query(`ALTER TABLE customer_order ADD COLUMN ${column} ${definition}`);
        console.log(`✔  Added ${column} to customer_order`);
      }
    }

    const [driverFk] = await conn.query(`
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_order'
        AND CONSTRAINT_NAME = 'fk_customer_order_driver_user'
    `);
    if (driverFk.length) {
      console.log('✔  customer_order driver FK already exists — skipping');
    } else {
      await conn.query(`
        ALTER TABLE customer_order
          ADD CONSTRAINT fk_customer_order_driver_user
          FOREIGN KEY (driver_user_id) REFERENCES app_user(id) ON DELETE SET NULL
      `);
      console.log('✔  Added customer_order.driver_user_id FK');
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS driver_location (
        driver_user_id  ${userIdType} NOT NULL,
        lat             DECIMAL(10,7) NOT NULL,
        lng             DECIMAL(10,7) NOT NULL,
        updated_at      DATETIME      NOT NULL,
        route_calc_at   DATETIME      NULL,
        route_calc_lat  DECIMAL(10,7) NULL,
        route_calc_lng  DECIMAL(10,7) NULL,
        route_stop_ids  VARCHAR(512)  NULL,
        route_json      JSON          NULL,
        PRIMARY KEY (driver_user_id),
        CONSTRAINT fk_driver_location_user
          FOREIGN KEY (driver_user_id) REFERENCES app_user(id) ON DELETE CASCADE
      )
    `);
    console.log('✔  driver_location table ready');
```

(MySQL creates an index for the FK automatically, which covers "indexed" in spec §4.)

- [ ] **Step 2: Update `database/phase1_schema.sql`**

In `CREATE TABLE IF NOT EXISTS customer_order`, change the status line to:

```sql
  status            ENUM('pending','preparing','ready','out_for_delivery','completed','cancelled') NOT NULL DEFAULT 'pending',
```

The file currently has none of the delivery/driver columns (earlier migrations added `delivery_lat`/`delivery_lng` only in `migrate.js`). Add these after the `delivery_address` line:

```sql
  delivery_lat      DECIMAL(10,7) DEFAULT NULL,
  delivery_lng      DECIMAL(10,7) DEFAULT NULL,
  driver_name       VARCHAR(100)  DEFAULT NULL,
  driver_phone      VARCHAR(30)   DEFAULT NULL,
  driver_user_id    BIGINT        DEFAULT NULL,
  queue_position    SMALLINT      DEFAULT NULL,
  eta_at            DATETIME      DEFAULT NULL,
```

and this constraint after `CONSTRAINT fk_order_customer ...` (keep commas valid):

```sql
  CONSTRAINT fk_customer_order_driver_user
    FOREIGN KEY (driver_user_id) REFERENCES app_user(id) ON DELETE SET NULL
```

After the `customer_order` table, add:

```sql
CREATE TABLE IF NOT EXISTS driver_location (
  driver_user_id  BIGINT        NOT NULL,
  lat             DECIMAL(10,7) NOT NULL,
  lng             DECIMAL(10,7) NOT NULL,
  updated_at      DATETIME      NOT NULL,
  route_calc_at   DATETIME      NULL,
  route_calc_lat  DECIMAL(10,7) NULL,
  route_calc_lng  DECIMAL(10,7) NULL,
  route_stop_ids  VARCHAR(512)  NULL,
  route_json      JSON          NULL,
  PRIMARY KEY (driver_user_id),
  CONSTRAINT fk_driver_location_user
    FOREIGN KEY (driver_user_id) REFERENCES app_user(id) ON DELETE CASCADE
);
```

- [ ] **Step 3: Syntax-check**

Run: `node --check server/migrate.js`
Expected: no output, exit 0.

**Do not run the migration.** The shared preview/production database is updated by the operator in the Rollout section after merge.

- [ ] **Step 4: Commit**

```bash
git add server/migrate.js database/phase1_schema.sql
git commit -m "feat(db): add out_for_delivery, driver identity, queue/ETA and driver_location"
```

---

### Task 2: Delivery queue math

**Files:**
- Create: `shared/geo.js`
- Create: `server/lib/deliveryQueue.js`
- Test: `tests/deliveryQueue.test.js`

**Interfaces:**
- Produces:
  - `haversineMeters(a: {lat,lng}, b: {lat,lng}) → number` (in `shared/geo.js`, re-exported by deliveryQueue)
  - `orderStops(driver: {lat,lng}, stops: {orderId,lat,lng}[]) → same objects, chain-ordered`
  - `isRouteStale(cache: {calcAt: Date, calcFrom: {lat,lng}, stopIds: number[]} | null, driver, stopIds: number[], now: Date) → boolean`
  - `computeEtas(legDurationsSec: number[], now: Date) → Date[]`
  - `fallbackLegDurations(driver, orderedStops) → number[]` (whole seconds)
  - `buildCustomerUpdate({ orderId, driver, position, totalStops, etaAt, routeToNext }) → { orderId, driver: {lat,lng}|null, position, totalStops, etaAt: string|null, route: [lat,lng][]|null }`
  - Constants `HANDOFF_SEC = 120`, `STALE_AFTER_MS = 60000`, `STALE_MOVE_M = 150`

- [ ] **Step 1: Write the failing tests**

Create `tests/deliveryQueue.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/deliveryQueue.test.js`
Expected: FAIL — cannot resolve `../server/lib/deliveryQueue.js`.

- [ ] **Step 3: Implement**

Create `shared/geo.js`:

```js
const EARTH_RADIUS_M = 6371000;

// Great-circle distance in metres between two { lat, lng } points.
export function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
```

Create `server/lib/deliveryQueue.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/deliveryQueue.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add shared/geo.js server/lib/deliveryQueue.js tests/deliveryQueue.test.js
git commit -m "feat(delivery): add stop ordering, staleness and ETA math"
```

---

### Task 3: OpenRouteService client

**Files:**
- Create: `server/lib/routing.js`
- Test: `tests/routing.test.js`

**Interfaces:**
- Produces:
  - `getRoute(points: {lat,lng}[], opts?: { now?: number }) → Promise<{ source: 'ors', legDurationsSec: number[], geometry: [lat,lng][], wayPointIndexes: number[] } | null>` — `points[0]` is the driver.
  - `parseOrsResponse(body, stopCount) → same object | null`
  - `sliceToFirstStop(geometry, wayPointIndexes) → [lat,lng][] | null`
  - `_resetRoutingState()` (tests only)

- [ ] **Step 1: Write the failing tests**

Create `tests/routing.test.js`:

```js
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
  it('returns null for fewer than two points', async () => {
    globalThis.fetch = vi.fn();
    expect(await getRoute([DRIVER])).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/routing.test.js`
Expected: FAIL — cannot resolve `../server/lib/routing.js`.

- [ ] **Step 3: Implement**

Create `server/lib/routing.js`:

```js
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
    geometry: coords.map(([lng, lat]) => [lat, lng]),
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
    if (res.status === 429) {
      backoffUntil = now + BACKOFF_MS;
      console.warn('ORS rate limit hit — using straight-line ETAs for 5 minutes');
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/routing.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/routing.js tests/routing.test.js
git commit -m "feat(delivery): add OpenRouteService client with fallback and backoff"
```

---

### Task 4: Order rules

**Files:**
- Create: `server/lib/orderRules.js`
- Test: `tests/orderRules.test.js`

**Interfaces:**
- Produces (all pure; errors are `{ ok: false, code: 400|403|409, error: string }`):
  - `canChangeStatus(user: {role, id}, order: {status, customerUserId, driverUserId}, next: string) → { ok: true } | error`
  - `canRelease(user, order: {status, driverUserId}) → { ok: true } | error`
  - `resolveClaim(user, body) → { ok: true, driverUserId: number, self: boolean } | error`
  - `parseLocation(body) → { ok: true, lat, lng } | error`
  - `deliveryPinError(orderType, lat, lng) → string | null`
  - `STAFF_ASSIGN_ROLES`, `SELF_DELIVER_ROLES` (Sets)

- [ ] **Step 1: Write the failing tests**

Create `tests/orderRules.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  canChangeStatus, canRelease, resolveClaim, parseLocation, deliveryPinError,
} from '../server/lib/orderRules.js';

const customer = { role: 'customer', id: 10 };
const driver = { role: 'driver', id: 20 };
const kitchen = { role: 'kitchen', id: 30 };
const manager = { role: 'manager', id: 40 };
const order = (over = {}) => ({ status: 'pending', customerUserId: 10, driverUserId: null, ...over });

describe('canChangeStatus', () => {
  it('never allows setting out_for_delivery directly', () => {
    expect(canChangeStatus(manager, order({ status: 'ready' }), 'out_for_delivery')).toMatchObject({ ok: false, code: 400 });
  });
  it('keeps cancelled terminal', () => {
    expect(canChangeStatus(manager, order({ status: 'cancelled' }), 'pending')).toMatchObject({ ok: false, code: 409 });
  });
  it('lets a customer cancel their own pending order only', () => {
    expect(canChangeStatus(customer, order(), 'cancelled')).toEqual({ ok: true });
    expect(canChangeStatus(customer, order({ status: 'preparing' }), 'cancelled')).toMatchObject({ ok: false, code: 409 });
    expect(canChangeStatus(customer, order({ status: 'out_for_delivery' }), 'cancelled')).toMatchObject({ ok: false, code: 409 });
    expect(canChangeStatus(customer, order({ customerUserId: 11 }), 'cancelled')).toMatchObject({ ok: false, code: 403 });
    expect(canChangeStatus(customer, order(), 'completed')).toMatchObject({ ok: false, code: 403 });
  });
  it('lets a driver complete only their own out_for_delivery order', () => {
    const mine = order({ status: 'out_for_delivery', driverUserId: 20 });
    expect(canChangeStatus(driver, mine, 'completed')).toEqual({ ok: true });
    expect(canChangeStatus(driver, mine, 'cancelled')).toMatchObject({ ok: false, code: 403 });
    expect(canChangeStatus(driver, { ...mine, driverUserId: 21 }, 'completed')).toMatchObject({ ok: false, code: 403 });
    expect(canChangeStatus(driver, order({ status: 'ready' }), 'completed')).toMatchObject({ ok: false, code: 403 });
  });
  it('limits out_for_delivery to completed or cancelled for staff', () => {
    const out = order({ status: 'out_for_delivery', driverUserId: 20 });
    expect(canChangeStatus(kitchen, out, 'completed')).toEqual({ ok: true });
    expect(canChangeStatus(kitchen, out, 'cancelled')).toEqual({ ok: true });
    expect(canChangeStatus(kitchen, out, 'ready')).toMatchObject({ ok: false, code: 400 });
  });
  it('lets staff make ordinary kitchen transitions', () => {
    expect(canChangeStatus(kitchen, order(), 'preparing')).toEqual({ ok: true });
    expect(canChangeStatus(manager, order({ status: 'ready' }), 'completed')).toEqual({ ok: true });
  });
  it('lets a manager complete a delivery they are carrying', () => {
    expect(canChangeStatus(manager, order({ status: 'out_for_delivery', driverUserId: 40 }), 'completed')).toEqual({ ok: true });
  });
  it('rejects unknown roles', () => {
    expect(canChangeStatus({ role: 'guest', id: 1 }, order(), 'cancelled')).toMatchObject({ ok: false, code: 403 });
  });
});

describe('canRelease', () => {
  it('allows only the assigned driver while out for delivery', () => {
    expect(canRelease(driver, { status: 'out_for_delivery', driverUserId: 20 })).toEqual({ ok: true });
    expect(canRelease(driver, { status: 'out_for_delivery', driverUserId: 21 })).toMatchObject({ ok: false, code: 403 });
    expect(canRelease(manager, { status: 'out_for_delivery', driverUserId: 20 })).toMatchObject({ ok: false, code: 403 });
    expect(canRelease(driver, { status: 'completed', driverUserId: 20 })).toMatchObject({ ok: false, code: 409 });
  });
});

describe('resolveClaim', () => {
  it('self-claims for drivers, managers and admins with an empty body', () => {
    expect(resolveClaim(driver, {})).toEqual({ ok: true, driverUserId: 20, self: true });
    expect(resolveClaim(manager, undefined)).toEqual({ ok: true, driverUserId: 40, self: true });
    expect(resolveClaim({ role: 'admin', id: 50 }, {})).toEqual({ ok: true, driverUserId: 50, self: true });
  });
  it('requires kitchen and cashier to pick a driver', () => {
    expect(resolveClaim(kitchen, {})).toMatchObject({ ok: false, code: 400 });
    expect(resolveClaim(kitchen, { driverUserId: 20 })).toEqual({ ok: true, driverUserId: 20, self: false });
    expect(resolveClaim({ role: 'cashier', id: 31 }, { driverUserId: 20 })).toEqual({ ok: true, driverUserId: 20, self: false });
  });
  it('stops a driver claiming for someone else', () => {
    expect(resolveClaim(driver, { driverUserId: 21 })).toMatchObject({ ok: false, code: 403 });
    expect(resolveClaim(driver, { driverUserId: 20 })).toEqual({ ok: true, driverUserId: 20, self: true });
  });
  it('treats a manager naming themselves as a self-claim', () => {
    expect(resolveClaim(manager, { driverUserId: 40 })).toEqual({ ok: true, driverUserId: 40, self: true });
  });
  it('rejects customers and bad ids', () => {
    expect(resolveClaim(customer, {})).toMatchObject({ ok: false, code: 403 });
    expect(resolveClaim(kitchen, { driverUserId: '20' })).toMatchObject({ ok: false, code: 400 });
    expect(resolveClaim(kitchen, { driverUserId: 0 })).toMatchObject({ ok: false, code: 400 });
  });
});

describe('parseLocation', () => {
  it('accepts finite in-range numbers', () => {
    expect(parseLocation({ lat: 40.7, lng: -74 })).toEqual({ ok: true, lat: 40.7, lng: -74 });
    expect(parseLocation({ lat: 0, lng: 0 })).toEqual({ ok: true, lat: 0, lng: 0 });
  });
  it('rejects strings, NaN, missing and out-of-range values', () => {
    for (const body of [
      { lat: '40', lng: -74 }, { lat: NaN, lng: -74 }, { lat: 40 }, null,
      { lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: Infinity, lng: 0 },
    ]) {
      expect(parseLocation(body)).toMatchObject({ ok: false, code: 400 });
    }
  });
});

describe('deliveryPinError', () => {
  it('requires both coordinates for delivery only', () => {
    expect(deliveryPinError('delivery', 40, -74)).toBeNull();
    expect(deliveryPinError('delivery', null, -74)).toMatch(/location/i);
    expect(deliveryPinError('delivery', null, null)).toMatch(/location/i);
    expect(deliveryPinError('pickup', null, null)).toBeNull();
    expect(deliveryPinError(undefined, null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/orderRules.test.js`
Expected: FAIL — cannot resolve `../server/lib/orderRules.js`.

- [ ] **Step 3: Implement**

Create `server/lib/orderRules.js`:

```js
// Pure order permission rules. Routes translate { ok: false, code, error }
// straight into an HTTP response.

export const STAFF_ASSIGN_ROLES = new Set(['cashier', 'kitchen', 'manager', 'admin']);
export const SELF_DELIVER_ROLES = new Set(['driver', 'manager', 'admin']);

const OK = { ok: true };
const fail = (code, error) => ({ ok: false, code, error });

export function canChangeStatus(user, order, next) {
  if (next === 'out_for_delivery') {
    return fail(400, 'Orders go out for delivery when a driver claims them');
  }
  if (order.status === 'cancelled' && next !== 'cancelled') {
    return fail(409, 'Cancelled orders cannot be reactivated');
  }

  if (user.role === 'customer') {
    if (order.customerUserId !== user.id) return fail(403, "Cannot modify another customer's order");
    if (next !== 'cancelled') return fail(403, 'Customers can only cancel orders');
    if (order.status !== 'pending') return fail(409, 'This order can no longer be cancelled');
    return OK;
  }

  if (user.role === 'driver') {
    const ownDelivery = order.driverUserId === user.id && order.status === 'out_for_delivery';
    if (!ownDelivery || next !== 'completed') {
      return fail(403, 'Drivers can only mark their own deliveries as delivered');
    }
    return OK;
  }

  if (!STAFF_ASSIGN_ROLES.has(user.role)) return fail(403, 'Not allowed to change order status');

  if (order.status === 'out_for_delivery' && next !== 'completed' && next !== 'cancelled') {
    return fail(400, 'An order out for delivery can only be completed or cancelled');
  }
  return OK;
}

export function canRelease(user, order) {
  if (order.driverUserId !== user.id) return fail(403, 'Only the assigned driver can release this order');
  if (order.status !== 'out_for_delivery') return fail(409, 'This order is not out for delivery');
  return OK;
}

export function resolveClaim(user, body) {
  if (!STAFF_ASSIGN_ROLES.has(user.role) && !SELF_DELIVER_ROLES.has(user.role)) {
    return fail(403, 'Not allowed to assign drivers');
  }
  const target = body?.driverUserId;
  if (target == null) {
    if (!SELF_DELIVER_ROLES.has(user.role)) return fail(400, 'Choose a driver');
    return { ok: true, driverUserId: user.id, self: true };
  }
  if (!Number.isInteger(target) || target < 1) return fail(400, 'Invalid driverUserId');
  if (target === user.id && SELF_DELIVER_ROLES.has(user.role)) {
    return { ok: true, driverUserId: user.id, self: true };
  }
  if (user.role === 'driver') return fail(403, 'Drivers can only claim orders for themselves');
  return { ok: true, driverUserId: target, self: false };
}

export function parseLocation(body) {
  const lat = body?.lat;
  const lng = body?.lng;
  const valid =
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return valid ? { ok: true, lat, lng } : fail(400, 'lat and lng must be numbers within range');
}

export function deliveryPinError(orderType, lat, lng) {
  if (orderType !== 'delivery') return null;
  if (lat == null || lng == null) return 'Delivery orders need your location. Allow location access or choose pickup.';
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/orderRules.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/orderRules.js tests/orderRules.test.js
git commit -m "feat(orders): add pure status, claim, release and location rules"
```

---

### Task 5: Route planning and publishes

**Files:**
- Create: `server/lib/driverRoute.js`
- Test: `tests/driverRoute.test.js`

**Interfaces:**
- Consumes: `orderStops`, `isRouteStale`, `computeEtas`, `fallbackLegDurations`, `buildCustomerUpdate` (Task 2); `getRoute`, `sliceToFirstStop` (Task 3).
- Produces:
  - `toStopInput(row) → { id, lat, lng, customerUserId, queuePosition, etaAt }` (numbers from mysql2 DECIMAL strings)
  - `planRoute({ driver, orders, cache, now, force, getRoute }) → Promise<{ stops: {orderId, customerUserId, position, etaAt: Date|null}[], routeJson: {source, geometry, wayPointIndexes}|null, recalculated: boolean, cacheUpdate: {calcAt, calcFrom, stopIds, routeJson}|null }>`
  - `buildPublishes({ driverUserId, driver, stops, routeJson, recalculated }) → Publish[]` where `Publish = { channel: string, event: string, data: object }`
  - `recalculateDriverRoute(conn, driverUserId, { force = false, now = new Date() } = {}) → Promise<{ route: DriverRoute, publishes: Publish[] }>`
  - `DriverRoute = { stops: { orderId, orderNumber, position, customerName, customerPhone, deliveryAddress, lat, lng, etaAt: string|null }[], geometry: [lat,lng][]|null, source: 'ors'|'fallback' }`

- [ ] **Step 1: Write the failing tests**

Create `tests/driverRoute.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/driverRoute.test.js`
Expected: FAIL — cannot resolve `../server/lib/driverRoute.js`.

- [ ] **Step 3: Implement**

Create `server/lib/driverRoute.js`:

```js
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
```

Note: ORS is called while the transaction holds the driver's row lock. That is bounded by the 5 s timeout and only blocks this driver's other writes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/driverRoute.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/driverRoute.js tests/driverRoute.test.js
git commit -m "feat(delivery): plan driver routes and build private per-customer publishes"
```

---

### Task 6: Realtime server — capabilities and customer channels

**Files:**
- Modify: `server/realtime.js`
- Test: `tests/realtimeCapability.test.js` (replace contents)

**Interfaces:**
- Consumes: `Publish` shape from Task 5.
- Produces:
  - `capabilityFor(user) → object` per spec §5.3
  - `emitOrderStatusUpdated(orderId, status, customerUserId = null) → Promise`
  - `emitOrderDriverAssigned(orderId, { driverUserId, driverName, driverPhone }, customerUserId = null) → Promise`
  - `emitRoutePublishes(publishes: Publish[]) → Promise`

- [ ] **Step 1: Replace the capability tests**

Replace `tests/realtimeCapability.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import { capabilityFor } from '../server/realtime.js';

describe('capabilityFor', () => {
  it('lets a guest subscribe to menu only', () => {
    expect(capabilityFor(undefined)).toEqual({ menu: ['subscribe'] });
    expect(capabilityFor(null)).toEqual({ menu: ['subscribe'] });
  });
  it('gives a customer only menu and their own channel', () => {
    expect(capabilityFor({ id: 42, role: 'customer' })).toEqual({
      menu: ['subscribe'], 'customer:42': ['subscribe'],
    });
  });
  it('gives staff and drivers menu and orders', () => {
    for (const role of ['cashier', 'kitchen', 'manager', 'admin', 'driver']) {
      expect(capabilityFor({ id: 7, role })).toEqual({ menu: ['subscribe'], orders: ['subscribe'] });
    }
  });
  it('never grants publish', () => {
    for (const user of [null, { id: 1, role: 'customer' }, { id: 2, role: 'driver' }, { id: 3, role: 'admin' }]) {
      const rights = Object.values(capabilityFor(user)).flat();
      expect(rights).not.toContain('publish');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/realtimeCapability.test.js`
Expected: FAIL — customer gets `orders` and `delivery:*`.

- [ ] **Step 3: Update `server/realtime.js`**

Replace the three order emitters and `capabilityFor` (keep `client`, `publish`, `emitNewOrder`, `emitMenuChanged`, `createTokenRequest` unchanged):

```js
export function emitNewOrder(order) {
  return publish('orders', 'newOrder', order);
}

// Staff get every status change; the order's own customer (if it belongs to an
// account) gets it on their private channel.
export async function emitOrderStatusUpdated(orderId, status, customerUserId = null) {
  await publish('orders', 'orderStatusUpdated', { orderId, status });
  if (customerUserId != null) {
    await publish(`customer:${customerUserId}`, 'orderStatusUpdated', { orderId, status });
  }
}

// The customer copy leaves out the driver's user id.
export async function emitOrderDriverAssigned(orderId, driver, customerUserId = null) {
  const { driverUserId = null, driverName = null, driverPhone = null } = driver;
  await publish('orders', 'orderDriverAssigned', { orderId, driverUserId, driverName, driverPhone });
  if (customerUserId != null) {
    await publish(`customer:${customerUserId}`, 'orderDriverAssigned', { orderId, driverName, driverPhone });
  }
}

// Sends the messages built by server/lib/driverRoute.js buildPublishes().
export async function emitRoutePublishes(publishes) {
  await Promise.all(publishes.map((p) => publish(p.channel, p.event, p.data)));
}
```

```js
// Channel rights per caller. Nobody publishes from a browser; customers only
// see their own private channel.
export function capabilityFor(user) {
  if (!user) return { menu: ['subscribe'] };
  if (user.role === 'customer') {
    return { menu: ['subscribe'], [`customer:${user.id}`]: ['subscribe'] };
  }
  return { menu: ['subscribe'], orders: ['subscribe'] };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/realtimeCapability.test.js`
Expected: PASS.

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add server/realtime.js tests/realtimeCapability.test.js
git commit -m "fix(realtime): give customers a private channel and drop browser publishing"
```

---

### Task 7: Orders API — reads, pin rule and driver list

**Files:**
- Modify: `server/routes/orders.js` (imports, `VALID_STATUSES`, `GET /`, `POST /`, new `GET /drivers`)

**Interfaces:**
- Consumes: `deliveryPinError`, `STAFF_ASSIGN_ROLES` (Task 4).
- Produces:
  - Every order from `GET /api/orders` gains `queuePosition: number|null`, `etaAt: string|null`; staff also get `driverUserId`; customers also get `totalStops: number|null`.
  - `GET /api/orders/drivers → [{ id, name, phone, activeStops }]` (cashier, kitchen, manager, admin).
  - `POST /api/orders` → 400 for delivery without a pin.

- [ ] **Step 1: Update imports and statuses**

At the top of `server/routes/orders.js`:

```js
import { deliveryPinError, STAFF_ASSIGN_ROLES } from '../lib/orderRules.js';
```

Replace:

```js
const VALID_STATUSES = new Set(['pending', 'preparing', 'ready', 'completed', 'cancelled']);
```

with:

```js
const VALID_STATUSES = new Set(['pending', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']);
```

Leave the `DRIVER_ASSIGN_ROLES` constant for now — the current `PUT /:id/driver` handler still uses it. Task 8 replaces that handler and deletes the constant.

- [ ] **Step 2: Extend `GET /`**

After the `items` query and before `const result = orders.map(...)`, add:

```js
    // Customers see how many stops their driver is carrying, never whose.
    const stopCounts = new Map();
    if (isCustomer) {
      const driverIds = [...new Set(
        orders.filter((o) => o.status === 'out_for_delivery' && o.driver_user_id != null)
          .map((o) => o.driver_user_id)
      )];
      if (driverIds.length) {
        const [counts] = await pool.query(
          `SELECT driver_user_id, COUNT(*) AS n FROM customer_order
            WHERE status = 'out_for_delivery' AND driver_user_id IN (?)
            GROUP BY driver_user_id`,
          [driverIds]
        );
        for (const c of counts) stopCounts.set(c.driver_user_id, Number(c.n));
      }
    }
```

In the object built by `orders.map((order) => ({ ... }))`, after `driverPhone: order.driver_phone,` add:

```js
      ...(isCustomer
        ? { totalStops: order.driver_user_id != null ? stopCounts.get(order.driver_user_id) ?? null : null }
        : { driverUserId: order.driver_user_id ?? null }),
      queuePosition: order.queue_position ?? null,
      etaAt: order.eta_at ? new Date(order.eta_at).toISOString() : null,
```

- [ ] **Step 3: Require a pin for delivery in `POST /`**

Immediately after the existing `Invalid delivery coordinates` check, add:

```js
    const pinError = deliveryPinError(orderType, lat, lng);
    if (pinError) {
      await conn.rollback();
      return res.status(400).json({ error: pinError });
    }
```

- [ ] **Step 4: Add `GET /drivers`**

Add directly after the `GET /` handler (before `POST /`):

```js
// GET /api/orders/drivers — active driver accounts and how many stops each is carrying.
router.get('/drivers', async (req, res) => {
  if (!STAFF_ASSIGN_ROLES.has(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT u.id, COALESCE(NULLIF(u.display_name, ''), u.email) AS name, u.phone,
              (SELECT COUNT(*) FROM customer_order o
                WHERE o.driver_user_id = u.id AND o.status = 'out_for_delivery') AS activeStops
         FROM app_user u
         JOIN employee_profile ep ON ep.user_id = u.id
        WHERE ep.role = 'driver' AND u.is_active = 1
        ORDER BY name`
    );
    res.json(rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone || null, activeStops: Number(r.activeStops) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 5: Verify**

Run: `node --check server/routes/orders.js`
Expected: no output.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/orders.js
git commit -m "feat(orders): expose queue position and ETA, require delivery pins, list drivers"
```

---

### Task 8: Orders API — claim, release and status rules

**Files:**
- Modify: `server/routes/orders.js` (imports, `PUT /:id/status`, replace `PUT /:id/driver`, add `DELETE /:id/driver`)

**Interfaces:**
- Consumes: `canChangeStatus`, `canRelease`, `resolveClaim` (Task 4); `recalculateDriverRoute` (Task 5); `emitOrderStatusUpdated`, `emitOrderDriverAssigned`, `emitRoutePublishes` (Task 6).
- Produces:
  - `PUT /api/orders/:id/driver` body `{}` or `{ driverUserId }` → `{ id, status: 'out_for_delivery', driverUserId, driverName, driverPhone, route }`; 409 when taken/not ready.
  - `DELETE /api/orders/:id/driver` → `{ id, status: 'ready', route }`.
  - `PUT /api/orders/:id/status` → `{ id, status, completedAt, route: DriverRoute|null }`.

- [ ] **Step 1: Update imports**

Change the realtime and rules imports to:

```js
import {
  emitNewOrder, emitOrderStatusUpdated, emitOrderDriverAssigned, emitMenuChanged, emitRoutePublishes,
} from '../realtime.js';
import {
  deliveryPinError, STAFF_ASSIGN_ROLES, canChangeStatus, canRelease, resolveClaim,
} from '../lib/orderRules.js';
import { recalculateDriverRoute } from '../lib/driverRoute.js';
```

Add a helper under `parseCustomizations`:

```js
// Lock order: driver_location before customer_order (see recalculateDriverRoute).
async function lockDriver(conn, driverUserId) {
  await conn.query('SELECT driver_user_id FROM driver_location WHERE driver_user_id = ? FOR UPDATE', [driverUserId]);
}
```

- [ ] **Step 2: Rewrite the permission part of `PUT /:id/status`**

Replace everything from `const [[current]] = await conn.query(` through the end of the `if (current.status === 'cancelled' && status !== 'cancelled') { ... }` block with:

```js
    // Learn the order's driver without a lock, lock that driver first, then the
    // order (lock-order rule), and bail out if the driver changed in between.
    const [[peek]] = await conn.query('SELECT driver_user_id FROM customer_order WHERE id = ?', [orderId]);
    if (!peek) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }
    if (peek.driver_user_id != null) await lockDriver(conn, peek.driver_user_id);

    const [[current]] = await conn.query(
      'SELECT status, customer_user_id, driver_user_id FROM customer_order WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if ((current.driver_user_id ?? null) !== (peek.driver_user_id ?? null)) {
      await conn.rollback();
      return res.status(409).json({ error: 'Order changed, try again' });
    }

    const verdict = canChangeStatus(
      req.user,
      { status: current.status, customerUserId: current.customer_user_id, driverUserId: current.driver_user_id },
      status
    );
    if (!verdict.ok) {
      await conn.rollback();
      return res.status(verdict.code).json({ error: verdict.error });
    }
```

Then replace the block from `// Only stamp completed_at` through `res.json({ id: orderId, status, completedAt: completedAt ?? null });` with:

```js
    // Only stamp completed_at when first transitioning to 'completed'
    let completedAt = undefined;
    if (status === 'completed' && current.status !== 'completed') {
      completedAt = new Date();
      await conn.query(
        'UPDATE customer_order SET status = ?, completed_at = ? WHERE id = ?',
        [status, completedAt, orderId]
      );
    } else {
      await conn.query('UPDATE customer_order SET status = ? WHERE id = ?', [status, orderId]);
    }

    // Leaving a route: clear this stop and re-plan the driver's remaining stops.
    let routeResult = null;
    if (current.status === 'out_for_delivery' && status !== 'out_for_delivery') {
      await conn.query('UPDATE customer_order SET queue_position = NULL, eta_at = NULL WHERE id = ?', [orderId]);
      routeResult = await recalculateDriverRoute(conn, current.driver_user_id, { force: true });
    }

    await conn.commit();
    if (crossesThreshold(stockChanges, thresholds)) await emitMenuChanged();

    await emitOrderStatusUpdated(orderId, status, current.customer_user_id);
    if (routeResult) await emitRoutePublishes(routeResult.publishes);
    res.json({
      id: orderId,
      status,
      completedAt: completedAt ?? null,
      route: routeResult && current.driver_user_id === req.user.id ? routeResult.route : null,
    });
```

(The existing restock block between these two replacements stays as it is.)

- [ ] **Step 3: Replace `PUT /:id/driver` and add `DELETE /:id/driver`**

Delete the `DRIVER_ASSIGN_ROLES` constant near the top of the file. Then replace the whole existing `router.put('/:id/driver', ...)` handler (and its comment) with:

```js
// PUT /api/orders/:id/driver — claim a ready delivery onto a driver's route.
// Drivers, managers and admins send {} to claim for themselves; cashier,
// kitchen, manager and admin send { driverUserId } to assign a driver.
router.put('/:id/driver', async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  const claim = resolveClaim(req.user, req.body);
  if (!claim.ok) return res.status(claim.code).json({ error: claim.error });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockDriver(conn, claim.driverUserId);

    const [[driver]] = await conn.query(
      `SELECT u.id, u.display_name, u.email, u.phone, u.is_active, ep.role
         FROM app_user u LEFT JOIN employee_profile ep ON ep.user_id = u.id
        WHERE u.id = ?`,
      [claim.driverUserId]
    );
    if (!claim.self && (!driver || !driver.is_active || driver.role !== 'driver')) {
      await conn.rollback();
      return res.status(400).json({ error: 'That user is not an active driver' });
    }
    const driverName = driver.display_name || driver.email;
    const driverPhone = driver.phone || null;

    const [result] = await conn.query(
      `UPDATE customer_order
          SET driver_user_id = ?, driver_name = ?, driver_phone = ?,
              status = 'out_for_delivery', queue_position = NULL, eta_at = NULL
        WHERE id = ? AND order_type = 'delivery' AND status = 'ready'
          AND delivery_lat IS NOT NULL AND delivery_lng IS NOT NULL AND driver_user_id IS NULL`,
      [claim.driverUserId, driverName, driverPhone, orderId]
    );
    if (result.affectedRows === 0) {
      const [[exists]] = await conn.query('SELECT id FROM customer_order WHERE id = ?', [orderId]);
      await conn.rollback();
      return exists
        ? res.status(409).json({ error: 'Already taken or not ready for delivery' })
        : res.status(404).json({ error: 'Order not found' });
    }

    const [[order]] = await conn.query('SELECT customer_user_id FROM customer_order WHERE id = ?', [orderId]);
    const { route, publishes } = await recalculateDriverRoute(conn, claim.driverUserId, { force: true });
    await conn.commit();

    await emitOrderStatusUpdated(orderId, 'out_for_delivery', order.customer_user_id);
    await emitOrderDriverAssigned(
      orderId, { driverUserId: claim.driverUserId, driverName, driverPhone }, order.customer_user_id
    );
    await emitRoutePublishes(publishes);
    res.json({
      id: orderId, status: 'out_for_delivery',
      driverUserId: claim.driverUserId, driverName, driverPhone, route,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// DELETE /api/orders/:id/driver — the assigned driver hands the order back.
router.delete('/:id/driver', async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockDriver(conn, req.user.id);
    const [[order]] = await conn.query(
      'SELECT status, driver_user_id, customer_user_id FROM customer_order WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }
    const verdict = canRelease(req.user, { status: order.status, driverUserId: order.driver_user_id });
    if (!verdict.ok) {
      await conn.rollback();
      return res.status(verdict.code).json({ error: verdict.error });
    }

    await conn.query(
      `UPDATE customer_order
          SET status = 'ready', driver_user_id = NULL, driver_name = NULL, driver_phone = NULL,
              queue_position = NULL, eta_at = NULL
        WHERE id = ?`,
      [orderId]
    );
    const { route, publishes } = await recalculateDriverRoute(conn, req.user.id, { force: true });
    await conn.commit();

    await emitOrderStatusUpdated(orderId, 'ready', order.customer_user_id);
    await emitOrderDriverAssigned(orderId, { driverUserId: null, driverName: null, driverPhone: null }, order.customer_user_id);
    await emitRoutePublishes(publishes);
    res.json({ id: orderId, status: 'ready', route });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});
```

- [ ] **Step 4: Verify**

Run: `node --check server/routes/orders.js`
Expected: no output.

Run: `grep -n "DRIVER_ASSIGN_ROLES\|driver_name !== \|emitOrderStatusUpdated(orderId, status)" server/routes/orders.js`
Expected: no matches.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/orders.js
git commit -m "feat(orders): claim by driver id, release, and role-checked status changes"
```

---

### Task 9: Driver location endpoint and client delivery helpers

**Files:**
- Create: `server/routes/driver.js`
- Modify: `server/app.js`
- Create: `src/lib/delivery.js`
- Test: `tests/delivery.test.js`

**Interfaces:**
- Consumes: `parseLocation` (Task 4), `recalculateDriverRoute` (Task 5), `emitRoutePublishes` (Task 6), `haversineMeters` (`shared/geo.js`).
- Produces:
  - `POST /api/driver/location` body `{ lat, lng }` → `DriverRoute` (Task 5 shape).
  - `src/lib/delivery.js`:
    - `queueMessage({ position, totalStops }) → string|null`
    - `stopsBeforeText(position) → string`
    - `formatEta(etaAt: string|null, now?: Date) → string` (`"ETA pending"` when missing)
    - `formatClock(etaAt: string|null) → string` (`"—"` when missing)
    - `formatDistance(meters: number|null) → string|null`
    - `lastUpdatedText(receivedAt: number|null, now: number) → string|null`
    - `secondsAgoText(sentAt: number|null, now: number) → string`
    - re-export `haversineMeters`

- [ ] **Step 1: Write the failing tests for the client helpers**

Create `tests/delivery.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  queueMessage, stopsBeforeText, formatEta, formatClock, formatDistance, lastUpdatedText, secondsAgoText,
} from '../src/lib/delivery.js';

describe('queueMessage', () => {
  it('says you are next at position 1', () => {
    expect(queueMessage({ position: 1, totalStops: 3 })).toBe("You're next");
    expect(queueMessage({ position: 1, totalStops: 1 })).toBe("You're next");
  });
  it('shows the stop count and your place otherwise', () => {
    expect(queueMessage({ position: 2, totalStops: 3 })).toBe("Your driver has 3 deliveries · you're stop 2");
  });
  it('returns null without a position', () => {
    expect(queueMessage({ position: null, totalStops: 3 })).toBeNull();
    expect(queueMessage(null)).toBeNull();
  });
});

describe('stopsBeforeText', () => {
  it('pluralises', () => {
    expect(stopsBeforeText(2)).toBe('1 stop before you');
    expect(stopsBeforeText(4)).toBe('3 stops before you');
  });
});

describe('formatEta', () => {
  const now = new Date('2026-09-30T18:00:00Z');
  it('shows clock time and minutes', () => {
    expect(formatEta('2026-09-30T18:12:00Z', now)).toMatch(/^Arriving around .+ \(~12 min\)$/);
  });
  it('rounds up to at least 1 minute', () => {
    expect(formatEta('2026-09-30T18:00:20Z', now)).toMatch(/\(~1 min\)$/);
  });
  it('says any minute once the ETA has passed', () => {
    expect(formatEta('2026-09-30T17:59:00Z', now)).toBe('Arriving any minute');
  });
  it('says ETA pending when missing or invalid', () => {
    expect(formatEta(null, now)).toBe('ETA pending');
    expect(formatEta('not a date', now)).toBe('ETA pending');
  });
});

describe('formatClock', () => {
  it('returns a dash when missing', () => {
    expect(formatClock(null)).toBe('—');
    expect(formatClock('2026-09-30T18:12:00Z')).not.toBe('—');
  });
});

describe('formatDistance', () => {
  it('uses metres under 1 km and km above', () => {
    expect(formatDistance(850)).toBe('850 m away');
    expect(formatDistance(1830)).toBe('1.8 km away');
  });
  it('returns null without a distance', () => {
    expect(formatDistance(null)).toBeNull();
  });
});

describe('lastUpdatedText', () => {
  it('stays quiet for the first 60 seconds', () => {
    expect(lastUpdatedText(1_000_000, 1_000_000 + 60_000)).toBeNull();
  });
  it('reports minutes after that', () => {
    expect(lastUpdatedText(1_000_000, 1_000_000 + 61_000)).toBe('Last updated 1 min ago');
    expect(lastUpdatedText(1_000_000, 1_000_000 + 185_000)).toBe('Last updated 3 min ago');
  });
  it('returns null with no update yet', () => {
    expect(lastUpdatedText(null, 5)).toBeNull();
  });
});

describe('secondsAgoText', () => {
  it('formats the driver status strip', () => {
    expect(secondsAgoText(1_000_000, 1_008_400)).toBe('updated 8s ago');
    expect(secondsAgoText(1_000_000, 1_125_000)).toBe('updated 2 min ago');
    expect(secondsAgoText(null, 1)).toBe('waiting for first update');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/delivery.test.js`
Expected: FAIL — cannot resolve `../src/lib/delivery.js`.

- [ ] **Step 3: Implement `src/lib/delivery.js`**

```js
import { haversineMeters } from '../../shared/geo.js';

export { haversineMeters };

export function queueMessage(update) {
  if (!update || update.position == null) return null;
  if (update.position === 1) return "You're next";
  return `Your driver has ${update.totalStops} deliveries · you're stop ${update.position}`;
}

export function stopsBeforeText(position) {
  const n = position - 1;
  return `${n} stop${n === 1 ? '' : 's'} before you`;
}

function parse(etaAt) {
  if (!etaAt) return null;
  const d = new Date(etaAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatClock(etaAt) {
  const d = parse(etaAt);
  return d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—';
}

export function formatEta(etaAt, now = new Date()) {
  const d = parse(etaAt);
  if (!d) return 'ETA pending';
  const ms = d.getTime() - now.getTime();
  if (ms <= 0) return 'Arriving any minute';
  const minutes = Math.max(1, Math.round(ms / 60000));
  return `Arriving around ${formatClock(etaAt)} (~${minutes} min)`;
}

export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

export function lastUpdatedText(receivedAt, now) {
  if (receivedAt == null || now - receivedAt <= 60_000) return null;
  return `Last updated ${Math.floor((now - receivedAt) / 60_000)} min ago`;
}

export function secondsAgoText(sentAt, now) {
  if (sentAt == null) return 'waiting for first update';
  const s = Math.max(0, Math.round((now - sentAt) / 1000));
  return s < 60 ? `updated ${s}s ago` : `updated ${Math.floor(s / 60)} min ago`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/delivery.test.js`
Expected: PASS.

- [ ] **Step 5: Create `server/routes/driver.js`**

```js
import { Router } from 'express';
import pool from '../db.js';
import { parseLocation } from '../lib/orderRules.js';
import { recalculateDriverRoute } from '../lib/driverRoute.js';
import { emitRoutePublishes } from '../realtime.js';

const router = Router();

// POST /api/driver/location — the driver portal posts { lat, lng } every 10 s.
// Stores the position, re-plans the route when stale, and returns the route.
router.post('/location', async (req, res) => {
  const loc = parseLocation(req.body);
  if (!loc.ok) return res.status(loc.code).json({ error: loc.error });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const now = new Date();
    await conn.query(
      `INSERT INTO driver_location (driver_user_id, lat, lng, updated_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng), updated_at = VALUES(updated_at)`,
      [req.user.id, loc.lat, loc.lng, now]
    );
    const { route, publishes } = await recalculateDriverRoute(conn, req.user.id, { now });
    await conn.commit();
    await emitRoutePublishes(publishes);
    res.json(route);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

export default router;
```

(With no stops, `recalculateDriverRoute` deletes the row just inserted and returns `{ stops: [] }`.)

- [ ] **Step 6: Mount it in `server/app.js`**

Add the import next to the other route imports:

```js
import driverRoutes from './routes/driver.js';
```

Add after the `/api/orders` block:

```js
app.use('/api/driver', jwtCheck, loadUser, requireRole('driver', 'manager', 'admin'), driverRoutes);
```

- [ ] **Step 7: Verify**

Run: `node --check server/routes/driver.js && node --check server/app.js`
Expected: no output.

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/routes/driver.js server/app.js src/lib/delivery.js tests/delivery.test.js
git commit -m "feat(driver): add location endpoint and client delivery text helpers"
```

---

### Task 10: Client realtime, store and kitchen driver dropdown

**Files:**
- Modify: `src/lib/realtime.js`
- Modify: `src/store/usePosStore.js` (`updateOrderDriver`, new `fetchDrivers`, return object)
- Modify: `src/components/KitchenDisplay.vue`

**Interfaces:**
- Produces:
  - `subscribeCustomer(userId: number, handlers: Record<event, fn>) → Promise<unsubscribe>`
  - `subscribeOrders(handlers)` unchanged signature; handlers may include `driverRouteUpdated`.
  - `usePosStore().updateOrderDriver(orderId: number, driverUserId: number) → Promise<object|null>`
  - `usePosStore().fetchDrivers() → Promise<{id,name,phone,activeStops}[]>`
- Keeps `subscribeDelivery` and `publishDriverLocation` for now: the old `DeliveryMap.vue` and `DriverView.vue` still import them, and removing them here would break the build. Task 12 deletes them once both callers are rewritten. (Their channel no longer works after Task 6, which is expected mid-branch.)

- [ ] **Step 1: Update `src/lib/realtime.js`**

Replace `subscribeOrders` (only — leave `subscribeDelivery` and `publishDriverLocation` below it untouched) with:

```js
async function subscribeChannel(name, handlers) {
  const client = await getClient();
  const channel = client.channels.get(name);
  const bound = [];
  for (const [event, fn] of Object.entries(handlers)) {
    const listener = (msg) => fn(msg.data);
    channel.subscribe(event, listener);
    bound.push([event, listener]);
  }
  return () => {
    for (const [event, listener] of bound) channel.unsubscribe(event, listener);
  };
}

// Staff and drivers: every order event plus driverRouteUpdated.
export function subscribeOrders(handlers) {
  return subscribeChannel('orders', handlers);
}

// Customers: only their own orders (orderStatusUpdated, orderDriverAssigned, deliveryUpdate).
export function subscribeCustomer(userId, handlers) {
  return subscribeChannel(`customer:${userId}`, handlers);
}
```

- [ ] **Step 2: Update `usePosStore`**

Replace `updateOrderDriver` with:

```js
  async function updateOrderDriver(orderId, driverUserId) {
    try {
      const claimed = await api(`/orders/${orderId}/driver`, {
        method: 'PUT',
        body: { driverUserId },
      });
      state.orders = state.orders.map((o) =>
        o.id !== orderId ? o : {
          ...o,
          status: claimed.status,
          driverUserId: claimed.driverUserId,
          driverName: claimed.driverName,
          driverPhone: claimed.driverPhone,
        }
      );
      return claimed;
    } catch (err) {
      console.error('Failed to assign driver:', err);
      throw err;
    }
  }

  async function fetchDrivers() {
    return api('/orders/drivers');
  }
```

Add `fetchDrivers,` to the object the store returns (next to `updateOrderDriver,`).

- [ ] **Step 3: Update `KitchenDisplay.vue` script**

Replace the imports and the whole `// ── Driver assignment` section and realtime section with:

```js
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { usePosStore } from '../store/usePosStore';
import { subscribeOrders } from '../lib/realtime.js';
import { useToast } from '../lib/useToast.js';

const { state, updateOrderStatus, updateOrderDriver, fetchDrivers } = usePosStore();
const toast = useToast();
```

(keep `activeOrders`, `counts`, `getTimeSince`, `nextStatus`, `nextLabel` as they are), then:

```js
// Delivery orders are completed by the driver, not the kitchen.
function canAdvance(order) {
  return !(order.status === 'ready' && order.orderType === 'delivery');
}

// ── Driver assignment ──────────────────────────────────────────────────────────

const drivers = ref([]);
const selectedDriver = reactive({}); // orderId -> driver user id
const assigning = reactive({});

async function loadDrivers() {
  try {
    drivers.value = await fetchDrivers();
  } catch {
    drivers.value = [];
  }
}

function driverLabel(d) {
  return `${d.name} (${d.activeStops} stop${d.activeStops === 1 ? '' : 's'})`;
}

async function assignDriver(order) {
  const driverUserId = Number(selectedDriver[order.id]);
  if (!driverUserId) return;
  assigning[order.id] = true;
  try {
    await updateOrderDriver(order.id, driverUserId);
    toast.success(`Order #${order.orderNumber} is on its way`);
  } catch (err) {
    toast.error(err.message || 'Could not assign driver');
  } finally {
    assigning[order.id] = false;
    loadDrivers();
  }
}

// ── Realtime (Ably) ──────────────────────────────────────────────────────────

let unsubscribe;
onMounted(async () => {
  loadDrivers();
  unsubscribe = await subscribeOrders({
    newOrder: (order) => {
      state.orders.push(order);
    },
    orderStatusUpdated: ({ orderId, status }) => {
      const o = state.orders.find((o) => o.id === orderId);
      if (o) o.status = status;
    },
    orderDriverAssigned: ({ orderId, driverUserId, driverName, driverPhone }) => {
      const o = state.orders.find((o) => o.id === orderId);
      if (o) { o.driverUserId = driverUserId; o.driverName = driverName; o.driverPhone = driverPhone; }
      loadDrivers();
    },
    driverRouteUpdated: () => loadDrivers(),
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});
```

- [ ] **Step 4: Update `KitchenDisplay.vue` template**

On the advance button (the one with `@click="updateOrderStatus(order.id, nextStatus(order.status))"`), add `v-if="canAdvance(order)"`.

Replace the whole `<!-- Driver assignment — delivery orders marked ready -->` `<div>` with:

```html
        <!-- Driver assignment — delivery orders marked ready -->
        <div v-if="order.status === 'ready' && order.orderType === 'delivery'" class="mt-3 border-t pt-3 space-y-2">
          <p class="text-sm text-gray-500">Waiting for a driver</p>
          <div v-if="drivers.length" class="flex gap-2">
            <select
              v-model="selectedDriver[order.id]"
              class="flex-1 border rounded px-2 py-1 text-sm"
              :aria-label="`Driver for order ${order.orderNumber}`"
            >
              <option :value="undefined" disabled>Choose a driver</option>
              <option v-for="d in drivers" :key="d.id" :value="d.id">{{ driverLabel(d) }}</option>
            </select>
            <button
              class="px-3 py-1 rounded bg-green-600 text-white text-sm disabled:opacity-50"
              :disabled="!selectedDriver[order.id] || assigning[order.id]"
              @click="assignDriver(order)"
            >
              {{ assigning[order.id] ? 'Assigning…' : 'Assign' }}
            </button>
          </div>
          <p v-else class="text-xs text-gray-400">No active drivers. Add one in User Management.</p>
        </div>
```

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: build succeeds.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/realtime.js src/store/usePosStore.js src/components/KitchenDisplay.vue
git commit -m "feat(kitchen): assign deliveries from a driver dropdown; add customer channel client"
```

---

### Task 11: Storefront — checkout pin, tracker and customer map

**Files:**
- Modify: `src/components/storefront/CheckoutPanel.vue`
- Modify: `src/components/storefront/OrderTracker.vue`
- Modify: `src/components/storefront/DeliveryMap.vue` (script and template rewrite; keep styles)

**Interfaces:**
- Consumes: `subscribeCustomer` (Task 10); `queueMessage`, `formatEta`, `stopsBeforeText`, `lastUpdatedText` (Task 9); `GET /api/orders` fields (Task 7).
- Produces: `DeliveryMap` props `{ orderId: Number, open: Boolean, customerLat: Number|null, customerLng: Number|null, update: Object|null }`, emits `close`.

- [ ] **Step 1: Checkout — require the pin**

In `CheckoutPanel.vue` script:

Rename `deliveryAddress` to a landmark field and cap it:

```js
const landmark = ref('');
```

(delete `const deliveryAddress = ref('');` and `addressRef`.)

Add after `retryLocation`:

```js
function switchToPickup() {
  orderType.value = 'pickup';
  errors.delivery = '';
}

const hasPin = computed(() => geoLat.value != null && geoLng.value != null);
```

Replace the delivery branch in `validate()` with:

```js
  if (orderType.value === 'delivery' && !hasPin.value) {
    errors.delivery = 'Delivery needs your location. Allow location access or choose pickup.';
    valid = false;
  }
```

Replace `canSubmit` with:

```js
const canSubmit = computed(() =>
  cart.state.items.length > 0 &&
  !submitting.value &&
  (orderType.value !== 'delivery' || hasPin.value)
);
```

In `submit()`, replace `if (errors.delivery) { addressRef.value?.focus(); return; }` with `if (errors.delivery) return;`, and replace the delivery body block with:

```js
    if (orderType.value === 'delivery') {
      body.deliveryLat = geoLat.value;
      body.deliveryLng = geoLng.value;
      const place = landmark.value.trim();
      if (place) body.deliveryAddress = place.slice(0, 200);
    }
```

- [ ] **Step 2: Checkout — template**

Inside `<template v-if="orderType === 'delivery'">`, keep the `locating` block. Replace the `captured` block, the `denied` block and the trailing error `<p>` with:

```html
          <!-- Captured coordinates -->
          <template v-else-if="geoStatus === 'captured'">
            <div class="co-geo co-geo--captured" aria-live="polite">
              <UiIcon name="check-circle" :size="16" />
              <span>Location captured</span>
              <button type="button" class="co-geo__change" @click="retryLocation">Use a different location</button>
            </div>
            <UiField
              label="Apartment, building or landmark"
              hint="Optional — helps your driver find you."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  v-model="landmark"
                  class="co-input"
                  type="text"
                  maxlength="200"
                  autocomplete="address-line2"
                  placeholder="Apt 4B, blue door, behind the gym…"
                  :aria-describedby="describedBy"
                />
              </template>
            </UiField>
          </template>

          <!-- Denied: delivery needs a pin -->
          <div v-else-if="geoStatus === 'denied'" class="co-geo co-geo--denied" role="alert">
            <p class="co-geo__denied-text">
              Delivery needs your location. Allow location access for this site in your browser settings, then try again.
            </p>
            <div class="co-geo__actions">
              <UiButton type="button" variant="secondary" size="sm" @click="retryLocation">Try again</UiButton>
              <UiButton type="button" variant="ghost" size="sm" @click="switchToPickup">Switch to pickup</UiButton>
            </div>
          </div>

          <p v-if="errors.delivery && geoStatus !== 'denied'" class="co-geo-error" role="alert">
            {{ errors.delivery }}
          </p>
```

Add styles next to the other `.co-geo` rules:

```css
.co-geo--denied {
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}
.co-geo__denied-text { margin: 0; }
.co-geo__actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
```

- [ ] **Step 3: Rewrite `DeliveryMap.vue` script and template**

Replace the `<script setup>` and `<template>` with (keep the existing `<style scoped>` and add the two new classes below):

```vue
<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import UiModal from '../ui/UiModal.vue';
import { stopsBeforeText, lastUpdatedText } from '../../lib/delivery.js';

const props = defineProps({
  orderId:     { type: Number, required: true },
  open:        { type: Boolean, required: true },
  customerLat: { type: Number, default: null },
  customerLng: { type: Number, default: null },
  update:      { type: Object, default: null }, // latest deliveryUpdate + receivedAt
});
const emit = defineEmits(['close']);

let L = null;
let leafletMap = null;
let driverMarker = null;
let customerMarker = null;
let routeLine = null;
let fitted = false;

const mapContainer = ref(null);
const now = ref(Date.now());
let tick = null;

const caption = computed(() => {
  const u = props.update;
  if (!u || !u.driver) return "Waiting for your driver's location…";
  if (u.position > 1) return `${stopsBeforeText(u.position)}. Your route appears when you're next.`;
  return 'Your driver is on the way to you.';
});
const staleText = computed(() => lastUpdatedText(props.update?.receivedAt ?? null, now.value));

function icon(html, size) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(1px 1px 2px rgba(0,0,0,0.4))" aria-hidden="true">${html}</div>`,
    iconAnchor: [size / 2, size / 2],
  });
}

function initMap() {
  if (!L || !mapContainer.value) return;
  destroyMap();
  const home = props.customerLat != null ? [props.customerLat, props.customerLng] : [39.8283, -98.5795];
  leafletMap = L.map(mapContainer.value).setView(home, props.customerLat != null ? 14 : 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(leafletMap);
  if (props.customerLat != null) {
    customerMarker = L.marker(home, { icon: icon('&#x1F3E0;', 26) }).addTo(leafletMap).bindPopup('Your delivery address');
  }
  render();
}

function render() {
  if (!leafletMap) return;
  const u = props.update;
  if (u?.driver) {
    const at = [u.driver.lat, u.driver.lng];
    if (!driverMarker) driverMarker = L.marker(at, { icon: icon('&#x1F697;', 28) }).addTo(leafletMap).bindPopup('Your driver');
    else driverMarker.setLatLng(at);
  }
  if (routeLine) { routeLine.remove(); routeLine = null; }
  if (u?.route?.length) {
    routeLine = L.polyline(u.route, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(leafletMap);
  }
  if (!fitted && driverMarker && customerMarker) {
    leafletMap.fitBounds([driverMarker.getLatLng(), customerMarker.getLatLng()], { padding: [40, 40] });
    fitted = true;
  }
}

function destroyMap() {
  if (leafletMap) leafletMap.remove();
  leafletMap = null; driverMarker = null; customerMarker = null; routeLine = null; fitted = false;
}

async function openMap() {
  await new Promise((r) => setTimeout(r, 50)); // modal must be visible before Leaflet measures it
  initMap();
}

onMounted(async () => {
  const [leafletMod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
  L = leafletMod.default;
  tick = setInterval(() => { now.value = Date.now(); }, 15_000);
  if (props.open) openMap();
});

onUnmounted(() => {
  clearInterval(tick);
  destroyMap();
});

watch(() => [props.open, props.orderId], ([isOpen]) => {
  if (!L) return;
  if (isOpen) openMap();
  else destroyMap();
});

watch(() => props.update, render);
</script>

<template>
  <UiModal :open="open" title="Track Your Delivery" :sheet="true" @close="emit('close')">
    <div class="delivery-map__body">
      <p class="delivery-map__hint" aria-live="polite">{{ caption }}</p>
      <p v-if="staleText" class="delivery-map__stale">{{ staleText }}</p>
      <div class="delivery-map__container" ref="mapContainer" />
    </div>
  </UiModal>
</template>
```

Add to the styles:

```css
.delivery-map__stale {
  font-size: var(--text-caption);
  color: var(--warning, var(--ink-muted));
  margin: 0;
}
```

- [ ] **Step 4: `OrderTracker.vue` — script**

Change the imports:

```js
import { ref, reactive, inject, computed, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '../../store/useAuthStore.js';
import { subscribeCustomer } from '../../lib/realtime.js';
import { queueMessage, formatEta } from '../../lib/delivery.js';
```

Add state below `mapCustomerLng`:

```js
const updates = reactive({}); // orderId -> latest deliveryUpdate + receivedAt
const now = ref(Date.now());
let tick = null;
```

Replace `statusOrder`, `timelineSteps`, `etaMap`, `stepState` and `timelineLineWidth` with:

```js
function timelineSteps(order) {
  if (order.orderType === 'pickup') {
    return [
      { status: 'pending',   label: 'Order\nReceived' },
      { status: 'preparing', label: 'Preparing' },
      { status: 'ready',     label: 'Ready for\nPickup' },
      { status: 'completed', label: 'Picked Up' },
    ];
  }
  return [
    { status: 'pending',          label: 'Order\nReceived' },
    { status: 'preparing',        label: 'Preparing' },
    { status: 'ready',            label: 'Ready' },
    { status: 'out_for_delivery', label: 'On the\nway' },
    { status: 'completed',        label: 'Delivered' },
  ];
}

function etaMap(order) {
  if (order.orderType === 'pickup') {
    return {
      pending:   'Est. 20–30 min',
      preparing: 'Est. 10–20 min',
      ready:     'Ready for pickup',
      completed: 'Picked up',
      cancelled: 'Order cancelled',
    };
  }
  return {
    pending:   'Est. 45–55 min',
    preparing: 'Est. 30–40 min',
    ready:     'Waiting for a driver',
    out_for_delivery: '',
    completed: 'Delivered',
    cancelled: 'Order cancelled',
  };
}

function currentIndex(order) {
  return timelineSteps(order).findIndex((s) => s.status === order.status);
}

function stepState(order, stepStatus) {
  const cur = currentIndex(order);
  const idx = timelineSteps(order).findIndex((s) => s.status === stepStatus);
  if (idx < cur) return 'done';
  if (idx === cur) return 'active';
  return 'pending';
}

function timelineLineWidth(order) {
  const cur = Math.max(0, currentIndex(order));
  return `${(cur / (timelineSteps(order).length - 1)) * 100}%`;
}

// Live values from the newest deliveryUpdate, falling back to GET /api/orders.
function liveQueue(order) {
  const u = updates[order.id];
  return {
    position: u?.position ?? order.queuePosition ?? null,
    totalStops: u?.totalStops ?? order.totalStops ?? null,
    etaAt: u?.etaAt ?? order.etaAt ?? null,
  };
}
```

Update `openMap` to also reset nothing else; add a computed for the map's update:

```js
const mapUpdate = computed(() => (mapOrderId.value != null ? updates[mapOrderId.value] ?? null : null));
```

Replace `connectRealtime` with:

```js
// Only customers have a private channel; staff viewing the storefront skip realtime.
async function connectRealtime() {
  if (auth.state.role !== 'customer' || !auth.state.appUser?.id) return;
  unsubscribeOrders = await subscribeCustomer(auth.state.appUser.id, {
    orderStatusUpdated: ({ orderId, status }) => {
      const order = orders.value.find((o) => o.id === orderId);
      if (order) order.status = status;
      if (status !== 'out_for_delivery') delete updates[orderId];
      if (status === 'completed' && mapOrderId.value === orderId) closeMap();
    },
    orderDriverAssigned: ({ orderId, driverName, driverPhone }) => {
      const order = orders.value.find((o) => o.id === orderId);
      if (order) { order.driverName = driverName; order.driverPhone = driverPhone; }
    },
    deliveryUpdate: (update) => {
      updates[update.orderId] = { ...update, receivedAt: Date.now() };
    },
  });
}
```

Update lifecycle:

```js
onMounted(async () => {
  tick = setInterval(() => { now.value = Date.now(); }, 30_000);
  await fetchOrders();
  connectRealtime();
});

onUnmounted(() => {
  clearInterval(tick);
  if (unsubscribeOrders) { unsubscribeOrders(); unsubscribeOrders = null; }
});
```

- [ ] **Step 5: `OrderTracker.vue` — template**

Replace the ETA `<p>` inside each step with (hide empty text):

```html
            <p
              v-if="stepState(order, step.status) === 'active' && etaMap(order)[order.status]"
              class="order-tracker__eta"
            >{{ etaMap(order)[order.status] }}</p>
```

Replace the `<!-- Track delivery CTA -->` block with:

```html
        <!-- Live delivery block -->
        <div v-if="order.status === 'out_for_delivery'" class="order-tracker__live" aria-live="polite">
          <p v-if="queueMessage(liveQueue(order))" class="order-tracker__queue">
            {{ queueMessage(liveQueue(order)) }}
          </p>
          <p class="order-tracker__arrival">{{ formatEta(liveQueue(order).etaAt, new Date(now)) }}</p>
          <p v-if="order.driverName" class="order-tracker__driver">
            {{ order.driverName }}
            <a v-if="order.driverPhone" :href="`tel:${order.driverPhone}`" class="order-tracker__call">Call</a>
          </p>
          <UiButton variant="secondary" size="sm" @click="openMap(order)">Track delivery</UiButton>
        </div>
```

Pass the update to the map:

```html
    <DeliveryMap
      v-if="mapOrderId !== null"
      :order-id="mapOrderId"
      :open="mapOpen"
      :customer-lat="mapCustomerLat"
      :customer-lng="mapCustomerLng"
      :update="mapUpdate"
      @close="closeMap"
    />
```

Replace the `.order-tracker__map-cta` style with:

```css
/* Live delivery block */
.order-tracker__live {
  margin-top: var(--space-3);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
}
.order-tracker__queue {
  font-weight: var(--weight-semibold);
  color: var(--ink);
  margin: 0;
}
.order-tracker__arrival,
.order-tracker__driver {
  font-size: var(--text-sm);
  color: var(--ink-muted);
  margin: 0;
}
.order-tracker__call {
  margin-left: var(--space-2);
  color: var(--primary);
  font-weight: var(--weight-semibold);
}
```

- [ ] **Step 6: Verify**

Run: `npm run build`
Expected: build succeeds with no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/storefront/CheckoutPanel.vue src/components/storefront/OrderTracker.vue src/components/storefront/DeliveryMap.vue
git commit -m "feat(storefront): require delivery pins and show live queue, ETA and route"
```

---

### Task 12: Driver portal

**Files:**
- Create: `src/lib/useLocationSharing.js`
- Create: `src/components/driver/DriverRouteMap.vue`
- Rewrite: `src/components/DriverView.vue`

**Interfaces:**
- Consumes: `POST /api/driver/location`, `PUT/DELETE /api/orders/:id/driver`, `PUT /api/orders/:id/status` (Tasks 8–9); `subscribeOrders` (Task 10); `haversineMeters`, `formatDistance`, `formatClock`, `secondsAgoText` (Task 9); `DriverRoute` shape (Task 5).
- Produces:
  - `useLocationSharing(active: Ref<boolean>, send: (fix) => Promise<void>) → { fix: Ref<{lat,lng}|null>, permission: Ref<'unknown'|'granted'|'denied'|'unsupported'>, error: Ref<string>, lastSentAt: Ref<number|null>, stop: () => void }`
  - `DriverRouteMap` props `{ driver: {lat,lng}|null, stops: {orderId, position, lat, lng}[], geometry: [lat,lng][]|null }`

- [ ] **Step 1: Create `src/lib/useLocationSharing.js`**

```js
import { ref, watch, onUnmounted } from 'vue';

const POST_EVERY_MS = 10_000;

// Watches GPS for as long as the component lives. While `active` is true it
// sends the latest fix every 10 s and holds a screen wake lock.
export function useLocationSharing(active, send) {
  const fix = ref(null);
  const permission = ref('unknown');
  const error = ref('');
  const lastSentAt = ref(null);

  let watchId = null;
  let timer = null;
  let wakeLock = null;
  let sending = false;

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    permission.value = 'unsupported';
  } else {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        fix.value = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        permission.value = 'granted';
        error.value = '';
        if (active.value && lastSentAt.value == null) sendNow();
      },
      (err) => {
        if (err.code === 1) permission.value = 'denied';
        error.value = err.message || 'Location unavailable';
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }

  async function sendNow() {
    if (!fix.value || sending) return;
    sending = true;
    try {
      await send(fix.value);
      lastSentAt.value = Date.now();
    } catch (err) {
      error.value = err.message || 'Could not share location';
    } finally {
      sending = false;
    }
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch {
      // Unsupported or refused — sharing still works while the screen is on.
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible' && active.value) {
      requestWakeLock();
      sendNow();
    }
  }

  function start() {
    if (timer) return;
    sendNow();
    timer = setInterval(sendNow, POST_EVERY_MS);
    requestWakeLock();
    document.addEventListener('visibilitychange', onVisible);
  }

  function pause() {
    clearInterval(timer);
    timer = null;
    lastSentAt.value = null;
    document.removeEventListener('visibilitychange', onVisible);
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  function stop() {
    pause();
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  watch(active, (on) => (on ? start() : pause()), { immediate: true });
  onUnmounted(stop);

  return { fix, permission, error, lastSentAt, stop };
}
```

- [ ] **Step 2: Create `src/components/driver/DriverRouteMap.vue`**

```vue
<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const props = defineProps({
  driver:   { type: Object, default: null },
  stops:    { type: Array, required: true },
  geometry: { type: Array, default: null },
});

const container = ref(null);
let map = null;
let driverMarker = null;
let stopLayer = null;
let routeLine = null;
let fittedFor = '';

function divIcon(html, size) {
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function stopIcon(n) {
  return divIcon(
    `<div style="width:28px;height:28px;border-radius:50%;background:#2563eb;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${n}</div>`,
    28
  );
}

function render() {
  if (!map) return;
  if (props.driver) {
    const at = [props.driver.lat, props.driver.lng];
    if (!driverMarker) {
      driverMarker = L.marker(at, {
        icon: divIcon('<div style="font-size:28px;line-height:1">🚗</div>', 28),
      }).addTo(map).bindPopup('You');
    } else {
      driverMarker.setLatLng(at);
    }
  }

  stopLayer.clearLayers();
  for (const s of props.stops) {
    L.marker([s.lat, s.lng], { icon: stopIcon(s.position) }).addTo(stopLayer);
  }

  if (routeLine) { routeLine.remove(); routeLine = null; }
  if (props.geometry?.length) {
    routeLine = L.polyline(props.geometry, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(map);
  }

  // Refit only when the set of stops changes, so the map doesn't jump every fix.
  const key = props.stops.map((s) => s.orderId).join(',') + (props.driver ? ':d' : '');
  if (key !== fittedFor) {
    const points = props.stops.map((s) => [s.lat, s.lng]);
    if (props.driver) points.push([props.driver.lat, props.driver.lng]);
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [30, 30] });
    fittedFor = key;
  }
}

onMounted(() => {
  map = L.map(container.value).setView([39.8283, -98.5795], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);
  stopLayer = L.layerGroup().addTo(map);
  render();
});

onUnmounted(() => {
  if (map) map.remove();
  map = null;
});

watch(() => [props.driver, props.stops, props.geometry], render, { deep: true });
</script>

<template>
  <div class="rounded-xl overflow-hidden border" style="height: 280px;">
    <div ref="container" style="height: 100%; width: 100%;" />
  </div>
</template>
```

- [ ] **Step 3: Rewrite `src/components/DriverView.vue`**

Replace the whole file with:

```vue
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '../store/useAuthStore.js';
import { subscribeOrders } from '../lib/realtime.js';
import { useToast } from '../lib/useToast.js';
import { useLocationSharing } from '../lib/useLocationSharing.js';
import { haversineMeters, formatDistance, formatClock, secondsAgoText } from '../lib/delivery.js';
import DriverRouteMap from './driver/DriverRouteMap.vue';

const auth = useAuthStore();
const toast = useToast();
const me = computed(() => auth.state.appUser?.id ?? null);

const orders = ref([]);
const loading = ref(true);
const tab = ref('available'); // 'available' | 'route'
const busy = ref({}); // orderId -> true while a request is in flight
const route = ref({ stops: [], geometry: null, source: 'fallback' });
const now = ref(Date.now());
let tick = null;
let unsubscribe = null;

async function api(path, options = {}) {
  const base = import.meta.env.VITE_API_URL || '';
  const token = await auth.getToken();
  const res = await fetch(`${base}/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const available = computed(() =>
  orders.value.filter((o) =>
    o.orderType === 'delivery' && o.status === 'ready' && o.driverUserId == null && o.deliveryLat != null
  )
);

// Route from GET /api/orders, used until the first location response arrives.
function routeFromOrders() {
  const mine = orders.value
    .filter((o) => o.status === 'out_for_delivery' && o.driverUserId === me.value)
    .sort((a, b) => (a.queuePosition ?? Infinity) - (b.queuePosition ?? Infinity) || a.id - b.id);
  return mine.map((o, i) => ({
    orderId: o.id,
    orderNumber: o.orderNumber,
    position: i + 1,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    deliveryAddress: o.deliveryAddress,
    lat: o.deliveryLat,
    lng: o.deliveryLng,
    etaAt: o.etaAt,
  }));
}

async function loadOrders() {
  try {
    orders.value = await api('/orders');
    route.value = { ...route.value, stops: routeFromOrders() };
  } catch {
    toast.error('Could not load orders.');
  } finally {
    loading.value = false;
  }
}

function applyRoute(next) {
  if (next) route.value = next;
}

const hasStops = computed(() => route.value.stops.length > 0);

// ── Location sharing ─────────────────────────────────────────────────────────

const { fix, permission, error: gpsError, lastSentAt } = useLocationSharing(hasStops, async (position) => {
  applyRoute(await api('/driver/location', { method: 'POST', body: position }));
});

const canClaim = computed(() => permission.value === 'granted' && fix.value != null);

function distanceTo(order) {
  if (!fix.value) return null;
  return formatDistance(haversineMeters(fix.value, { lat: order.deliveryLat, lng: order.deliveryLng }));
}

// ── Actions ──────────────────────────────────────────────────────────────────

async function withBusy(orderId, fn) {
  busy.value = { ...busy.value, [orderId]: true };
  try { await fn(); } finally { busy.value = { ...busy.value, [orderId]: false }; }
}

async function addToRoute(order) {
  await withBusy(order.id, async () => {
    try {
      const claimed = await api(`/orders/${order.id}/driver`, { method: 'PUT', body: {} });
      applyRoute(claimed.route);
      orders.value = orders.value.map((o) => (o.id === order.id
        ? { ...o, status: 'out_for_delivery', driverUserId: me.value } : o));
    } catch (err) {
      if (err.status === 409) {
        orders.value = orders.value.filter((o) => o.id !== order.id);
        toast.info('Already taken');
      } else {
        toast.error(err.message || 'Could not add this order.');
      }
    }
  });
}

async function markDelivered(stop) {
  if (!window.confirm(`Mark order #${stop.orderNumber} as delivered?`)) return;
  await withBusy(stop.orderId, async () => {
    try {
      const res = await api(`/orders/${stop.orderId}/status`, { method: 'PUT', body: { status: 'completed' } });
      orders.value = orders.value.map((o) => (o.id === stop.orderId ? { ...o, status: 'completed' } : o));
      applyRoute(res.route ?? { ...route.value, stops: route.value.stops.filter((s) => s.orderId !== stop.orderId) });
      toast.success(`Order #${stop.orderNumber} delivered`);
    } catch (err) {
      toast.error(err.message || 'Could not mark delivered.');
    }
  });
}

async function release(stop) {
  if (!window.confirm(`Hand order #${stop.orderNumber} back? It returns to the available list.`)) return;
  await withBusy(stop.orderId, async () => {
    try {
      const res = await api(`/orders/${stop.orderId}/driver`, { method: 'DELETE' });
      orders.value = orders.value.map((o) => (o.id === stop.orderId
        ? { ...o, status: 'ready', driverUserId: null, driverName: null, driverPhone: null } : o));
      applyRoute(res.route);
    } catch (err) {
      toast.error(err.message || 'Could not release this order.');
    }
  });
}

function navigate(stop) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;
  window.open(url, '_blank', 'noopener');
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  tick = setInterval(() => { now.value = Date.now(); }, 1000);
  await loadOrders();
  if (hasStops.value) tab.value = 'route';
  unsubscribe = await subscribeOrders({
    newOrder: (order) => { orders.value = [...orders.value, order]; },
    orderStatusUpdated: ({ orderId, status }) => {
      orders.value = orders.value.map((o) => (o.id === orderId ? { ...o, status } : o));
    },
    orderDriverAssigned: ({ orderId, driverUserId, driverName, driverPhone }) => {
      orders.value = orders.value.map((o) => (o.id === orderId ? { ...o, driverUserId, driverName, driverPhone } : o));
    },
    // Someone else changed my route (staff assign/cancel): rebuild from the server.
    driverRouteUpdated: ({ driverUserId }) => {
      if (driverUserId === me.value) loadOrders();
    },
  });
});

onUnmounted(() => {
  clearInterval(tick);
  if (unsubscribe) unsubscribe();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-start justify-center p-4 sm:p-6">
    <div class="bg-white rounded-2xl shadow-lg border w-full max-w-md p-5 space-y-4 mt-4">
      <h1 class="text-xl font-bold">Deliveries</h1>

      <!-- Location banner -->
      <div
        v-if="permission === 'denied' || permission === 'unsupported'"
        class="rounded-xl p-3 text-sm bg-orange-50 border border-orange-200 text-orange-800"
        role="alert"
      >
        Location access is off. Turn on location for this site in your browser settings and reload.
        You need it to add orders to your route.
      </div>

      <!-- Tabs -->
      <div class="grid grid-cols-2 gap-2" role="tablist">
        <button
          role="tab"
          :aria-selected="tab === 'available'"
          class="py-2 rounded-lg text-sm font-medium border"
          :class="tab === 'available' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-700'"
          @click="tab = 'available'"
        >
          Available ({{ available.length }})
        </button>
        <button
          role="tab"
          :aria-selected="tab === 'route'"
          class="py-2 rounded-lg text-sm font-medium border"
          :class="tab === 'route' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-700'"
          @click="tab = 'route'"
        >
          My route ({{ route.stops.length }})
        </button>
      </div>

      <div v-if="loading" class="text-center text-gray-400 py-8">Loading orders…</div>

      <!-- Available -->
      <div v-else-if="tab === 'available'" class="space-y-3">
        <p v-if="!available.length" class="text-center text-gray-400 py-8">No orders ready for delivery.</p>
        <div v-for="order in available" :key="order.id" class="border rounded-xl p-4 space-y-2">
          <div class="flex items-center justify-between">
            <p class="font-semibold">Order #{{ order.orderNumber }}</p>
            <span v-if="distanceTo(order)" class="text-xs text-gray-500">{{ distanceTo(order) }}</span>
          </div>
          <p class="text-sm text-gray-600">{{ order.items?.length || 0 }} item{{ order.items?.length === 1 ? '' : 's' }}</p>
          <p class="text-sm text-gray-500">{{ order.deliveryAddress || 'No address notes' }}</p>
          <button
            class="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            :disabled="!canClaim || busy[order.id]"
            @click="addToRoute(order)"
          >
            {{ busy[order.id] ? 'Adding…' : 'Add to route' }}
          </button>
        </div>
      </div>

      <!-- My route -->
      <div v-else class="space-y-3">
        <p v-if="!route.stops.length" class="text-center text-gray-400 py-8">
          Your route is empty. Add orders from the Available tab.
        </p>
        <template v-else>
          <DriverRouteMap :driver="fix" :stops="route.stops" :geometry="route.geometry" />

          <div
            class="rounded-xl p-2 text-xs"
            :class="gpsError ? 'bg-orange-50 border border-orange-200 text-orange-700' : 'bg-green-50 border border-green-200 text-green-700'"
            aria-live="polite"
          >
            <template v-if="gpsError">GPS problem: {{ gpsError }}</template>
            <template v-else>Sharing location · {{ secondsAgoText(lastSentAt, now) }}</template>
            <span v-if="route.source === 'fallback'" class="block text-gray-500">Road routing unavailable — ETAs are estimates.</span>
          </div>

          <div v-for="stop in route.stops" :key="stop.orderId" class="border rounded-xl p-4 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                  {{ stop.position }}
                </span>
                <div>
                  <p class="font-semibold">{{ stop.customerName || 'Customer' }}</p>
                  <p class="text-xs text-gray-500">Order #{{ stop.orderNumber }} · ETA {{ formatClock(stop.etaAt) }}</p>
                </div>
              </div>
              <details class="relative">
                <summary class="cursor-pointer text-gray-500 px-2" aria-label="More actions">⋯</summary>
                <button
                  class="absolute right-0 mt-1 whitespace-nowrap bg-white border rounded-lg shadow px-3 py-2 text-sm text-red-600"
                  :disabled="busy[stop.orderId]"
                  @click="release(stop)"
                >
                  Release order
                </button>
              </details>
            </div>
            <p class="text-sm text-gray-600">{{ stop.deliveryAddress || 'No address notes' }}</p>
            <a v-if="stop.customerPhone" :href="`tel:${stop.customerPhone}`" class="text-sm text-blue-600">
              📞 {{ stop.customerPhone }}
            </a>
            <div class="grid grid-cols-2 gap-2">
              <button class="py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-medium" @click="navigate(stop)">
                Navigate
              </button>
              <button
                class="py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50"
                :disabled="busy[stop.orderId]"
                @click="markDelivered(stop)"
              >
                Delivered
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Remove the old delivery channel helpers**

In `src/lib/realtime.js`, delete the `subscribeDelivery` and `publishDriverLocation` functions (no caller remains after Tasks 11 and 12).

- [ ] **Step 5: Verify**

Run: `grep -rn "subscribeDelivery\|publishDriverLocation\|delivery:" src server`
Expected: no matches.

Run: `npm run build`
Expected: build succeeds.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useLocationSharing.js src/components/driver/DriverRouteMap.vue src/components/DriverView.vue src/lib/realtime.js
git commit -m "feat(driver): rebuild portal with multi-stop route, live list and auto location sharing"
```

---

### Task 13: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Make these edits:

1. **Routes** line: add `/api/driver` after `/api/users`.
2. In the **Auth middleware** / route-policy paragraph, add: "`/api/driver` (location posts) allows driver, manager and admin. `GET /api/orders/drivers` is cashier+kitchen+manager+admin."
3. Replace the **Realtime** bullet list with:

```markdown
Realtime (`server/realtime.js` + `server/routes/realtime.js`, client in `src/lib/realtime.js`). Browsers never publish; only the server does.
- `orders` channel (staff and drivers): `newOrder`, `orderStatusUpdated`, `orderDriverAssigned`, `driverRouteUpdated`
- `customer:{userId}` channel (that customer only): `orderStatusUpdated`, `orderDriverAssigned`, `deliveryUpdate` — built only by `buildPublishes` in `server/lib/driverRoute.js`, and never containing another customer's data
- `menu` channel: the server publishes an empty `menuChanged` after menu/option/inventory edits and when an order or cancellation moves stock across an availability threshold; clients refetch `GET /api/menu-items`.
- `GET /api/realtime/token` works for guests (subscribe-only on `menu`); customers get `menu` + their own `customer:{id}`; staff and drivers get `menu` + `orders`.
```

4. Replace the **Driver Portal** line in "Key views" with:

```markdown
- **Driver Portal** (`DriverView.vue`) — Available / My route tabs; drivers (and managers/admins) add several ready deliveries to one route; the portal posts GPS to `POST /api/driver/location` every 10 s while it has stops, and the server orders stops nearest-first (`server/lib/deliveryQueue.js`), gets road times/geometry from OpenRouteService (`server/lib/routing.js`), and stores `queue_position`/`eta_at` (driver, manager, admin)
```

5. Under **Data model note**, add: "Delivery status flow: `ready` → `out_for_delivery` (only via `PUT /api/orders/:id/driver`) → `completed`. Status permission rules live in `server/lib/orderRules.js`. `driver_location` holds one row per driver with a non-empty route and is deleted when the route empties."
6. Add to the **Environment Variables** table:

```markdown
| `ORS_API_KEY` | server | OpenRouteService key for road routes and ETAs (without it, straight-line ETAs and no route line) |
```

- [ ] **Step 2: Full verification**

Run: `npm test`
Expected: all suites PASS.

Run: `npm run build`
Expected: build succeeds.

Run: `node --check server/app.js && node --check server/routes/orders.js && node --check server/routes/driver.js && node --check server/migrate.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document multi-stop delivery, customer channels and ORS_API_KEY"
```

- [ ] **Step 4: Manual checklist (operator, against a preview deployment after the Rollout steps)**

Use one driver account and two customer accounts in separate browsers (or private windows), plus a kitchen account.

1. Checkout as a customer with location **blocked**: delivery shows "Try again" / "Switch to pickup" and Place order is disabled. Allow location: "Location captured" and the landmark field appear; the order places.
2. Place a second delivery order as the other customer from a different spot (or edit its `delivery_lat` in the DB so the two pins are far apart). Kitchen advances both to Ready. The kitchen card shows "Waiting for a driver" and no "Complete Order" button.
3. Driver portal: both orders appear in Available **without pressing anything**, with distances. Add both. My route shows numbered stops, the map with the route line (if `ORS_API_KEY` is set), and "Sharing location · updated Ns ago".
4. Customer at stop 1: "You're next", an arrival time, the driver's name. Track delivery shows the car, the home pin **and** a route line.
5. Customer at stop 2: "Your driver has 2 deliveries · you're stop 2". Track delivery shows the car and home pin, **no** route line, and "1 stop before you…". In devtools → Network → WS, confirm no message contains the other customer's coordinates.
6. Driver taps Delivered on stop 1: customer 1's timeline reaches Delivered; customer 2 becomes "You're next" and gets a route line.
7. Add an order, then Release it: it returns to Available for any driver and the customer's timeline goes back to "Waiting for a driver".
8. With a stop on the route, a manager cancels it from the kitchen/POS: it disappears from the driver's route and the other customer's position updates.
9. Kitchen assigns a ready delivery to the driver from the dropdown ("Name (N stops)"): it appears on the driver's route.
10. Two drivers press Add to route on the same order at the same time: one gets it; the other sees "Already taken".
11. Customer tries to cancel an order that is Preparing via `PUT /api/orders/:id/status` → 409.
12. Remove `ORS_API_KEY` (or set it wrong): ETAs still appear, no route lines, driver strip says "Road routing unavailable".

---

## Rollout (operator, after merge — not an implementation task)

1. Get a free key at openrouteservice.org and add `ORS_API_KEY` to Vercel (Preview and Production) and your local `.env`.
2. Run `node server/migrate.js` against the shared database (it is idempotent; step 9 is additive). Do this **before** the new server code serves traffic — the new code writes columns that step 9 creates.
3. Deploy the backend (Vercel) and the frontend (`npm run deploy`).
4. Run the manual checklist in Task 13 Step 4.
