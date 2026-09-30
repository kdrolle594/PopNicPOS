# PopNic POS — Multi-Stop Driver Portal & Private Delivery Tracking

**Status:** Approved design, ready for implementation planning
**Date:** 2026-09-30
**Branch:** `feat/driver-portal` (from `main`)
**Scope:** Fix the broken driver portal. Let one driver carry several delivery orders at once, ordered nearest-first from the driver's live location. Show each customer their place in line, an ETA, the driver's position and (when they are next) the road route to them, without ever revealing another customer's location. Close the existing realtime leak that broadcasts every order to every customer.

---

## 1. Goal

- A driver adds any number of ready delivery orders to their route. The server orders the stops nearest-first from the driver's GPS and recalculates as the driver moves.
- Each customer sees "Your driver has 3 deliveries · you're stop 2", an ETA, the driver's dot on a map, and a road path from the driver to them **only when they are the next stop**.
- No customer ever receives another customer's coordinates, address, name or phone, over any channel.
- Kitchen and cashier staff can assign an order to a driver from a dropdown.
- Managers and admins can use the driver portal and deliver orders themselves.

## 2. Why the portal is broken today

1. **Customers can never open the tracking map.** `OrderTracker.vue` shows "Track delivery" only when `status === 'out_for_delivery'` and `order.driverId` is set. The server rejects that status (`VALID_STATUSES` in `server/routes/orders.js`) and never sends a `driverId`, so the driver's GPS broadcast has no listener.
2. **"End Delivery" never marks the order delivered.** It stops GPS and resets the screen; the order stays `ready`, stays in the driver's list, and the customer's timeline sticks.
3. **Drivers are identified by display name.** Claims compare `driver_name` strings (`PUT /orders/:id/driver`). Two drivers with the same name can take each other's orders; a driver with no name gets a 400.
4. **The driver's list doesn't update itself.** `DriverView.vue` has no realtime subscription; new ready orders appear only after pressing Refresh.
5. **Realtime leak.** `capabilityFor` in `server/realtime.js` gives every signed-in user, customers included, subscribe rights on `orders`, which carries every order's customer name, phone and delivery coordinates.

## 3. Decisions

| Question | Decision |
|---|---|
| Delivery orders without a GPS pin | **Not allowed.** Checkout requires a pin for delivery; the server returns 400 without one. |
| Route line for a customer who is not next | **Hidden.** The route line appears only when the customer is stop 1. Before that: driver dot, stops ahead, ETA. |
| Routing service | **OpenRouteService (ORS)**, free tier (2,000 directions calls/day, 40/min), called **only from the server**. Straight-line fallback when unavailable. |
| Stop ordering | **Straight-line nearest-neighbour chain** from the driver (nearest stop, then nearest remaining to that stop, …). No distance-matrix call. |
| Architecture | **Server relays driver location.** The driver's phone posts GPS to the server; the server orders stops, calls ORS, and publishes a per-customer payload. The ORS key never reaches a browser. |
| Customer realtime | Customers lose `orders`; each gets a private `customer:{userId}` channel. Nobody publishes to Ably from a browser. |
| Managers and admins | May claim and deliver orders as themselves. The kitchen dropdown lists driver-role accounts only. |
| Customer cancellation | Customers may cancel their own order only while it is `pending`. Staff may cancel until `completed`. |

## 4. Data model (migration step 9 in `server/migrate.js`)

All changes are idempotent, following the existing step pattern (check `INFORMATION_SCHEMA`, log "skipping" when already applied).

**`customer_order`**
- `status` enum gains `out_for_delivery`: `('pending','preparing','ready','out_for_delivery','completed','cancelled')`. Preserve existing members when rewriting the enum, as step 2 does for `order_type`.
- `driver_user_id BIGINT NULL`, FK → `app_user(id)` `ON DELETE SET NULL`, indexed. The claimant's identity. `driver_name` / `driver_phone` remain as display fields copied at claim time.
- `queue_position SMALLINT NULL` — the order's current 1-based place on its driver's route.
- `eta_at DATETIME NULL` — latest calculated arrival time (UTC).

**New table `driver_location`** — one row per driver with a non-empty route.

| Column | Type | Purpose |
|---|---|---|
| `driver_user_id` | `BIGINT` PK, FK → `app_user(id)` `ON DELETE CASCADE` | |
| `lat`, `lng` | `DECIMAL(10,7)` | Latest reported position (same type as `delivery_lat`) |
| `updated_at` | `DATETIME` | When the latest position arrived |
| `route_calc_at` | `DATETIME NULL` | When the route was last calculated |
| `route_calc_lat`, `route_calc_lng` | `DECIMAL(10,7) NULL` | Driver position used for that calculation |
| `route_stop_ids` | `VARCHAR(512) NULL` | Comma-separated order ids, in route order, used for that calculation |
| `route_json` | `JSON NULL` | Cached result: full geometry, per-leg durations, per-stop geometry slice indexes, and whether it came from ORS or the fallback |

The row is **deleted** when the driver's route becomes empty. We do not keep a driver's location once they have no stops.

`database/phase1_schema.sql` is updated to match so fresh databases get the same shape.

## 5. Server

### 5.1 New modules

**`server/lib/deliveryQueue.js`** — pure functions, no I/O.
- `haversineMeters(a, b)`.
- `orderStops(driver, stops)` → stops in nearest-neighbour chain order starting from `driver`. Each stop is `{ orderId, lat, lng }`. Ties broken by lower `orderId` for determinism.
- `isRouteStale(cache, driver, stopIds, now)` → true when there is no cache, `now − route_calc_at > 60 s`, the driver is more than 150 m from `route_calc_lat/lng`, or `stopIds` (in order) differ from `route_stop_ids`.
- `computeEtas(legDurationsSec, now)` → one ETA per stop. Stop *n*'s ETA = `now` + sum of leg durations to stop *n* + **120 s handoff for each earlier stop**.
- `fallbackLegDurations(driver, orderedStops)` → per-leg seconds from straight-line distance × **1.3 road factor** ÷ **30 km/h**.
- `buildCustomerUpdate({ orderId, driver, position, totalStops, etaAt, routeToNext })` → the exact `deliveryUpdate` payload (see 5.4). `route` is `routeToNext` when `position === 1`, else `null`. It takes no other stops as input, so it cannot leak them.

**`server/lib/routing.js`** — the only module that talks to ORS.
- `getRoute(points)` where `points[0]` is the driver and the rest are stops in order. Calls `POST https://api.openrouteservice.org/v2/directions/driving-car/geojson` with header `Authorization: ${ORS_API_KEY}` and body `{ coordinates: [[lng, lat], …] }`.
- Returns `{ source: 'ors', legDurationsSec: [...], geometry: [[lat, lng], …], wayPointIndexes: [...] }`, taking leg durations from `features[0].properties.segments[i].duration` and the index of each waypoint in the geometry from `features[0].properties.way_points` (converting ORS `[lng, lat]` to Leaflet `[lat, lng]`).
- `sliceToFirstStop(geometry, wayPointIndexes)` → the geometry from the driver to stop 1 only (`wayPointIndexes[0]..wayPointIndexes[1]`).
- Returns `null` (the caller uses the fallback) when `ORS_API_KEY` is unset, the request exceeds **5 s** (`AbortController`), the response is not OK, or the body is malformed. A **429** also sets a module-level `backoffUntil = now + 5 min`; while backing off, `getRoute` returns `null` without calling ORS. The backoff is per serverless instance and best-effort.
- Logs one warning per failure, like `server/realtime.js` does.

**`server/lib/driverRoute.js`** — `recalculateDriverRoute(conn, driverUserId, { force })`, shared by every endpoint that changes a route. Inside the caller's transaction:
1. `SELECT … FROM driver_location WHERE driver_user_id = ? FOR UPDATE`. If there is no row (the driver has not sent a location yet), stops keep their existing `queue_position` order with newly claimed stops appended (ties by order id), `eta_at` stays `NULL`, and customer payloads carry `driver: null`.
2. Load the driver's `out_for_delivery` orders (`id`, `delivery_lat`, `delivery_lng`, `customer_user_id`).
3. If none: delete the `driver_location` row and return an empty route.
4. `orderStops`, then if `force` or `isRouteStale`: `getRoute` → on `null`, `fallbackLegDurations` with no geometry. Save `route_*` columns.
5. `computeEtas`; update each order's `queue_position` and `eta_at`.
6. Return `{ route, publishes }`: the driver-facing route plus the list of messages to send (see 5.4). The caller commits the transaction first, then sends `publishes`, so nothing is announced for a rolled-back change.

**`server/lib/orderRules.js`** — pure `canChangeStatus({ role, userId }, order, nextStatus)` → `{ ok: true }` or `{ ok: false, code, error }`:
- Nobody sets `out_for_delivery` through the status endpoint (claim only) → 400.
- `cancelled` is terminal → 409 (existing rule).
- From `out_for_delivery`, only `completed` or `cancelled` → 400.
- **Customer:** own order only (403), only `cancelled` (403), only from `pending` (409 "This order can no longer be cancelled").
- **Driver:** only an order where `driver_user_id === userId` and status `out_for_delivery`, only to `completed` → 403 otherwise.
- **Cashier, kitchen, manager, admin:** any other transition.
- Managers and admins delivering their own orders are covered by the staff rule.

### 5.2 Endpoints

**`GET /api/orders`** (existing) adds `driverUserId`, `queuePosition` and `etaAt` to every order, and for customers also `totalStops` (the number of `out_for_delivery` orders sharing the order's `driver_user_id`). For customers, `driverUserId` is omitted.

**`POST /api/orders`** (existing) returns **400** for `orderType: 'delivery'` without numeric `deliveryLat` and `deliveryLng`. `deliveryAddress` stays optional (it carries the "Apartment, building or landmark" text).

**`GET /api/orders/drivers`** (new; cashier, kitchen, manager, admin). Declared **before** any `/:id` route. Returns `[{ id, name, phone, activeStops }]` for `app_user.is_active = 1` users whose `employee_profile.role = 'driver'`, where `name` is `display_name || email` and `activeStops` counts their `out_for_delivery` orders.

**`PUT /api/orders/:id/driver`** (rewritten) — claim.
- Body `{}` from a driver, manager or admin → claim for themselves.
- Body `{ driverUserId }` from cashier, kitchen, manager or admin → assign to that user, who must be an active driver-role account (400 otherwise).
- Kitchen or cashier without `driverUserId` → 400. Driver sending `driverUserId` for someone else → 403.
- In one transaction: `UPDATE customer_order SET driver_user_id = ?, driver_name = ?, driver_phone = ?, status = 'out_for_delivery' WHERE id = ? AND order_type = 'delivery' AND status = 'ready' AND delivery_lat IS NOT NULL AND driver_user_id IS NULL`. `driver_name` = claimant's `display_name || email`; `driver_phone` = their `phone`. `affectedRows = 0` → re-read the order: 404 if missing, else **409** "Already taken or not ready for delivery". Then `recalculateDriverRoute(conn, driverUserId, { force: true })`.
- Publishes `orderStatusUpdated` and `orderDriverAssigned` (see 5.4). Returns the claimed order.

**`DELETE /api/orders/:id/driver`** (new) — release. Only the assigned driver (403 otherwise). Sets `status = 'ready'`, clears `driver_user_id`, `driver_name`, `driver_phone`, `queue_position`, `eta_at`; recalculates the driver's route with `force: true`; publishes `orderStatusUpdated` (`ready`) and `orderDriverAssigned` with null driver fields.

**`PUT /api/orders/:id/status`** (existing) uses `canChangeStatus`. When an order leaves `out_for_delivery` (completed or cancelled), clear its `queue_position` and `eta_at` and call `recalculateDriverRoute(conn, driverUserId, { force: true })` for its driver. Cancellation restocking is unchanged.

**`POST /api/driver/location`** (new router `server/routes/driver.js`, mounted in `server/app.js` as `app.use('/api/driver', jwtCheck, loadUser, requireRole('driver', 'manager', 'admin'), driverRoutes)`).
- Body `{ lat, lng }`: finite numbers, lat in [-90, 90], lng in [-180, 180] → 400 otherwise.
- Upserts `driver_location` (`lat`, `lng`, `updated_at`) inside a transaction, then `recalculateDriverRoute(conn, req.user.id, { force: false })`.
- If the driver has no `out_for_delivery` orders, the row is deleted and `{ stops: [] }` is returned. The portal stops posting.
- Returns the driver-facing route: `{ stops: [{ orderId, orderNumber, position, customerName, customerPhone, deliveryAddress, lat, lng, etaAt }], geometry: [[lat, lng], …] | null, source: 'ors' | 'fallback' }`.
- Route-changing endpoints (claim, release, status) return the same route shape under a `route` key, so the portal updates without waiting for its next GPS post.

### 5.3 Realtime capabilities (`capabilityFor`)

| Caller | Channels |
|---|---|
| Guest | `menu: ['subscribe']` |
| Customer | `menu: ['subscribe']`, `customer:{id}: ['subscribe']` |
| Cashier, kitchen, manager, admin, driver | `menu: ['subscribe']`, `orders: ['subscribe']` |

No caller gets `publish`. `delivery:*` is removed.

### 5.4 What the server publishes (`server/realtime.js`)

**`orders`** (staff): `newOrder`, `orderStatusUpdated`, `orderDriverAssigned` as today, with `driverUserId` added to the driver event. After any recalculation, also `driverRouteUpdated: { driverUserId, stops: [{ orderId, position, etaAt }] }` so the kitchen dropdown's stop counts and the portal stay current.

**`customer:{customerUserId}`** — only for orders with a `customer_user_id` (walk-in POS orders are skipped):
- `orderStatusUpdated: { orderId, status }`
- `orderDriverAssigned: { orderId, driverName, driverPhone }` (no driver id)
- `deliveryUpdate: { orderId, driver: { lat, lng } | null, position, totalStops, etaAt, route }` — built only by `buildCustomerUpdate`. Sent to every customer on the route after each recalculation, and after each location post even when the route was not recalculated (driver dot moves; `route` for stop 1 comes from the cached geometry slice). `route` is `[[lat, lng], …]` from the driver to this customer only when `position === 1`, otherwise `null`. `driver` is `null` when no location is known.

New helpers: `emitToCustomer(customerUserId, event, data)`, `emitDriverRouteUpdated(driverUserId, stops)`, and customer-channel variants called alongside the existing `emitOrderStatusUpdated` / `emitOrderDriverAssigned`. Publishing happens after the transaction commits. Failures are logged and ignored, as today.

## 6. Frontend

### 6.1 `src/lib/realtime.js`
- Remove `subscribeDelivery` and `publishDriverLocation`.
- Add `subscribeCustomer(userId, handlers)` for `customer:{userId}`, with the same handler-map shape as `subscribeOrders`.

### 6.2 Driver portal (`src/components/DriverView.vue`, rebuilt)

Two tabs. **My route** opens first when the driver has stops; otherwise **Available**.

**Available**
- `ready` delivery orders with no `driverUserId`, from `GET /api/orders`, kept live through `subscribeOrders` (`newOrder`, `orderStatusUpdated`, `orderDriverAssigned`). No Refresh button.
- Card: order number, item count, `deliveryAddress` (or "No address notes"), straight-line distance from the driver's last GPS fix ("1.8 km away"; hidden until a fix exists).
- **Add to route** → `PUT /orders/:id/driver` with `{}`. On 409 the card is removed and a toast says "Already taken". The driver can add several in a row.
- Disabled, with an explanation banner, when location access is blocked or unavailable.

**My route**
- Map (Leaflet, as today): the driver's car, numbered pins for every stop, and the full route geometry as an `L.polyline` when `geometry` is present.
- Stop list in route order: number, customer name, address notes, ETA ("6:42 PM"), tap-to-call phone (`tel:`), **Navigate** (Google Maps directions to that stop's pin, new tab), **Delivered** (confirm dialog → `PUT /orders/:id/status` `completed`), and an overflow menu with **Release** (confirm → `DELETE /orders/:id/driver`).
- Status strip: "Sharing location · updated 8s ago", or a warning when GPS fails.

**Location sharing**
- Starts automatically when the route has ≥ 1 stop and stops when it is empty. No Start/End buttons.
- `navigator.geolocation.watchPosition` keeps the latest fix; every **10 s** the portal posts the latest fix to `POST /api/driver/location` and replaces its route state with the response.
- Requests a Screen Wake Lock (`navigator.wakeLock.request('screen')`) while sharing, re-requested on `visibilitychange` back to visible; silently skipped where unsupported.
- On page load, the route is rebuilt from `GET /api/orders` (the caller's `out_for_delivery` orders, sorted by `queuePosition`) until the first location response arrives.

Works for driver, manager and admin roles (all already have the `driver` view in `ROLE_VIEWS`).

### 6.3 Customer tracker (`src/components/storefront/OrderTracker.vue`)
- Delivery timeline becomes 5 steps: Received (`pending`) → Preparing → Ready ("Waiting for a driver") → On the way (`out_for_delivery`) → Delivered (`completed`). Pickup keeps its 4 steps.
- For `out_for_delivery`, the fixed ETA text is replaced by a live block: "Your driver has N deliveries · you're stop P" or "You're next" (when `position === 1`; when `totalStops === 1`, just "You're next"), "Arriving around 6:42 PM (~12 min)" from `etaAt`, and the driver's name with a `tel:` link.
- **Track delivery** shows for any `out_for_delivery` order (no `driverId` condition).
- Replaces `subscribeOrders` with `subscribeCustomer(auth.state.appUser.id, …)`, handling `orderStatusUpdated`, `orderDriverAssigned` and `deliveryUpdate`. It keeps the latest `deliveryUpdate` per order and passes it to the map as a prop, so there is one subscription.
- Initial `queuePosition`, `totalStops` and `etaAt` come from `GET /api/orders`.
- Customers may cancel only while `pending` (hide or disable any cancel control otherwise).

### 6.4 Customer map (`src/components/storefront/DeliveryMap.vue`)
- Receives `update` (the latest `deliveryUpdate` or `null`) instead of subscribing itself.
- Shows the driver's dot and the customer's pin, fitting both in view.
- When `update.route` is present, draws it as an `L.polyline`, replacing the previous one. When absent, caption: "N stop(s) before you. Your route appears when you're next."
- No update yet: "Waiting for your driver's location…". No update for > 60 s: "Last updated N min ago".

### 6.5 Checkout (`src/components/storefront/CheckoutPanel.vue`)
- Delivery requires a pin. The `denied` state no longer shows a typed-address field; it shows how to enable location, a **Try again** button (`retryLocation`) and a **Switch to pickup** button. "Place order" is disabled for delivery until `geoStatus === 'captured'`.
- When captured, an optional field **"Apartment, building or landmark"** (max 200 chars) is shown; its value is sent as `deliveryAddress`.

### 6.6 Kitchen (`src/components/KitchenDisplay.vue`) and `usePosStore`
- The free-text name/phone form becomes a driver `<select>` fed by `GET /api/orders/drivers`, labelled "Sam (2 stops)". Stop counts refresh on `driverRouteUpdated` and `orderDriverAssigned`.
- A `ready` delivery card shows "Waiting for a driver" and **no** "Complete Order" button (the driver completes delivery orders). Pickup and dine-in cards are unchanged.
- `out_for_delivery` orders leave the kitchen board (it already filters to pending/preparing/ready).
- `usePosStore.updateOrderDriver(orderId, driverUserId)` sends `{ driverUserId }` and applies the returned order.

## 7. Edge cases

1. **Order on a route is cancelled.** Only staff can do this (customers only while `pending`). The order leaves the route, remaining stops are recalculated, and the driver's portal updates through `orders` events and the next location response.
2. **Two drivers claim the same order.** The conditional `UPDATE` lets exactly one win; the other gets 409 and the "Already taken" toast.
3. **Driver's GPS goes quiet.** No recalculation happens. Customers keep the last dot and ETA with "Last updated N min ago". Orders stay on the route; reopening the portal resumes sharing. No automatic reassignment.
4. **ORS limits or outage.** The staleness rule keeps calls well under 40/min and 2,000/day. Timeout (5 s), error or 429 → straight-line ETAs and no geometry; 429 also pauses ORS for 5 minutes. Customers and the driver see no path line during a fallback.
5. **Overlapping location posts** from one driver are serialized by `SELECT … FOR UPDATE` on the `driver_location` row.
6. **Last stop delivered.** The route is empty, the `driver_location` row is deleted, and the portal stops posting.
7. **Realtime disabled** (no `ABLY_API_KEY`). Queue position and ETA still arrive through `GET /api/orders`; the live dot and path need realtime.
8. **Staff assign an order to a driver who has no GPS fix yet.** The claim succeeds; the stop is appended to the route with no ETA until the driver's first location post. (A driver's own portal blocks "Add to route" without location, per 6.2.)

## 8. Environment

New server variable **`ORS_API_KEY`** (OpenRouteService free key). Without it, routing silently uses the straight-line fallback. Add it to the `CLAUDE.md` environment table, to Vercel (preview and production), and to local `.env`.

`CLAUDE.md` updates: the new route `/api/driver`, the channel table (customer channel, `delivery:*` removed, no browser publishing), the `out_for_delivery` status, and the new `server/lib` modules.

## 9. Testing

Vitest, pure-function style like the existing `tests/`:

- **`tests/deliveryQueue.test.js`** — chain ordering (including a case where chain order differs from sorting by distance to the driver), tie-break by id, `isRouteStale` for each of its four triggers, `computeEtas` with the 120 s handoff, `fallbackLegDurations`.
- **`tests/routing.test.js`** (mocked `fetch`) — parses an ORS GeoJSON response into leg durations, `[lat, lng]` geometry and waypoint indexes; `sliceToFirstStop`; returns `null` on missing key, non-OK, malformed body and timeout; 429 sets the 5-minute backoff and suppresses the next call.
- **Privacy test** on `buildCustomerUpdate` — for a 3-stop route, no payload contains another stop's coordinates or order id; `route` is `null` unless `position === 1`.
- **`tests/realtimeCapability.test.js`** — rewritten for the table in 5.3: customer gets only `menu` + `customer:{id}`; staff and drivers get `menu` + `orders`; no capability contains `publish`.
- **`tests/orderRules.test.js`** — every rule in `canChangeStatus`.

**Manual checklist** (in the plan): one driver and two customers in separate browsers. Both orders claimed; positions and ETAs appear; the path shows only for stop 1; delivering stop 1 promotes stop 2, which then gets a path; Release returns an order to Available; a staff cancel mid-route updates the remaining customer; the kitchen dropdown shows stop counts; checkout blocks delivery without location.

## 10. Out of scope

- Delivery zones or maximum distance.
- Live traffic in ETAs.
- Automatic reassignment when a driver goes quiet.
- Background GPS when the phone is locked (browser limitation; mitigated by Wake Lock).
- A draggable pin at checkout.
- Driver location history.
