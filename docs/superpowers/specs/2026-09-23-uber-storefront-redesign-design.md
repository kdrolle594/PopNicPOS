# PopNic POS — Storefront Redesign & Guest Ordering

**Status:** Approved design, ready for implementation planning
**Date:** 2026-09-23
**Scope:** Full-app visual redesign (10 views) + guest menu browsing and cart before login

---

## 1. Goal

Two outcomes, one project:

1. **Look and feel.** Rebuild the app's visual language around Uber's structural rules — heavy tight typography, high contrast, flat surfaces with hairline borders, restrained color — while keeping the existing PopNic blue (`#3A8FBA`) and brown (`#8B6B4A`) brand identity.
2. **Low-friction ordering.** A visitor who has never signed in can open the app, browse the menu, customize items, and fill a cart. They are prompted to authenticate exactly once, at checkout, and their cart survives that redirect intact.

**Governing constraint: low friction.** Where a design choice trades elegance against taps, taps win. Any change that adds a step to the customer's path to food is wrong unless it is legally or technically unavoidable.

---

## 2. Non-goals

Do not do these. They have been explicitly considered and excluded.

- **No dark mode.** One theme only. Do not add a dark token set, a theme toggle, `data-theme` switching, a `prefers-color-scheme` block, or a `dark:` Tailwind variant. Tokens remain CSS custom properties because that is how a palette stays changeable, not because a second palette is coming.
- **No image uploads.** `image_url` stores an external URL string. No blob storage, no upload widget. (Vercel Blob would be a separate project.)
- **No component library adoption.** `shadcn ^4.1.1` sits unused in `devDependencies`; it is the React CLI, and `shadcn-vue` is a different unrelated project. Do not install either. Do not add any UI dependency.
- **No router.** The app deliberately has no Vue Router. View switching stays a `currentView` ref over a `viewMap` object.
- **No Pinia.** Stores stay hand-rolled singletons matching the existing `usePosStore` / `useAuthStore` pattern.
- **No guest ordering.** Guests browse and build carts. Placing an order always requires authentication. Do not build a guest checkout.
- **No backend auth model changes.** Roles, `loadUser`, and `requireRole` behavior stay as they are apart from the one additive `optionalAuth` middleware described in §7.
- **No refactoring unrelated to this work.** Server route logic, the order transaction, inventory deduction, and realtime plumbing are out of scope except where §7 names them.

---

## 3. Current state (verified facts)

Every statement here was checked against the repo on 2026-09-23. Subagents should trust these rather than re-deriving them, but must re-read a file before editing it.

**Stack.** Vue 3 (`<script setup>`) + Vite 6 + Tailwind CSS v4 (CSS-first config, no `tailwind.config.js`) + Express 5 + MySQL2 + Auth0 + Ably. Frontend on GitHub Pages, backend on Vercel.

**Styling is split across two incompatible languages.**

- `Dashboard.vue` and `LoginView.vue` use scoped CSS with hex literals.
- The other nine components use raw Tailwind utilities with hardcoded palette classes.
- **266 hardcoded palette literals** (`bg-blue-600`, `text-gray-500`, `border-amber-200`, …) exist across nine files, none referencing a theme token:

| File | Count |
|---|---|
| `CustomerView.vue` | 79 |
| `UserManagement.vue` | 36 |
| `DriverView.vue` | 31 |
| `POSTerminal.vue` | 26 |
| `KitchenDisplay.vue` | 25 |
| `MenuManagement.vue` | 22 |
| `Inventory.vue` | 19 |
| `Analytics.vue` | 17 |
| `LoyaltyManagement.vue` | 11 |
| `Dashboard.vue`, `LoginView.vue` | 0 (already tokenized) |

**These literals are the look-and-feel problem, not a tidiness problem.** `bg-blue-600` is `#2563eb`; the brand primary is `#3A8FBA`. The app currently ships two different blues, two different greys, and two different greens depending on which file you are looking at. Converting them to semantic tokens is what makes the redesign actually land in the staff views rather than stopping at the storefront. It is also the largest mechanical work item in the project.

**File sizes.** `CustomerView.vue` 950 lines, `POSTerminal.vue` 585, `App.vue` 517, `Dashboard.vue` 425, `DriverView.vue` 327.

**Typography bug.** `src/styles/theme.css` sets every heading `h1`–`h4` to `line-height: 1.5` and `font-weight: 500` (`var(--font-weight-medium)`). Headings have no hierarchy and no authority. `src/styles/fonts.css` applies `font-family` via the universal `*` selector, which fights every override.

**Blocking dialogs.** 16 `alert()` calls — 7 in `CustomerView.vue`, 5 in `POSTerminal.vue`, 1 each in `Inventory.vue`, `KitchenDisplay.vue`, `LoyaltyManagement.vue`, `MenuManagement.vue`. Plus 4 native `confirm()` calls guarding destructive deletes in `Inventory.vue:84`, `LoyaltyManagement.vue:99`, `MenuManagement.vue:126`, `UserManagement.vue:88`.

**Analytics ignores its own tokens.** `Analytics.vue` hardcodes five chart.js color arrays (`#2563eb`, `#7c3aed`, `#16a34a`, `#ea580c`, …) at lines 143–178, while `--chart-1` through `--chart-5` already exist unused in `theme.css`.

**Dead dark block.** `theme.css` has a `.dark` selector defining a generic greyscale palette, plus a `@custom-variant dark` declaration keyed to it. Nothing in the app ever applies the `.dark` class. Both are dead and get deleted.

**Menu schema has no imagery.** `menu_item` (`database/*.sql:59`) has `name`, `category`, `price`, `cost`, `available`, `is_combo`, `points_value`. No image, no description.

**`cost` leaks publicly.** `GET /api/menu-items` is unauthenticated (`server/app.js:39-45`) and returns `cost` (`server/routes/menu.js:34`) to any caller.

**Store loading is eager and auth-assuming.** `usePosStore()` calls `loadAll()` synchronously on first construction, firing four parallel requests — `/menu-items`, `/inventory-items`, `/orders`, `/customers`. Three require auth. This is tolerable today only because every view sits behind the login gate; a guest storefront would fire three guaranteed failures before rendering. `state.loading` is tracked but **no component renders a loading state**.

**Leaflet is eagerly loaded.** `CustomerView.vue` statically imports Leaflet and its CSS at module top. Every customer downloads the full mapping library on first paint for a map only shown during an active delivery.

**Auth flow.** `auth0.loginWithRedirect()` is a full page navigation. The cart currently lives in a `ref([])` local to `CustomerView` and would be destroyed by it.

**Auto-provisioning already works.** `server/middleware/auth.js` `loadUser` auto-creates an `app_user` + `customer_profile` row for an unrecognized Auth0 `sub`, defaulting to the customer role. New signups need no extra onboarding step.

**No test infrastructure.** No test script in `package.json`, no vitest, no test files anywhere.

---

## 4. Design language

### 4.1 Typography

Keep **DM Sans** (already loaded, good grotesque, has optical sizing). **Remove Playfair Display from all UI.** A high-contrast serif is the opposite of the target voice. It may survive only in the logo wordmark.

Fix `fonts.css`: move `font-family` off the universal `*` selector onto `:root` and let it inherit normally.

| Token | Size | Leading | Weight | Tracking |
|---|---|---|---|---|
| `--text-display` | 34px | 1.1 | 700 | -0.02em |
| `--text-h1` | 28px | 1.15 | 700 | -0.015em |
| `--text-h2` | 22px | 1.2 | 600 | -0.01em |
| `--text-h3` | 18px | 1.25 | 600 | 0 |
| `--text-body-lg` | 16px | 1.5 | 400 | 0 |
| `--text-body` | 15px | 1.5 | 400 | 0 |
| `--text-sm` | 13px | 1.45 | 400 | 0 |
| `--text-caption` | 12px | 1.4 | 500 | 0 |
| `--text-overline` | 11px | 1.3 | 600 | +0.08em, uppercase |

Replace the `@layer base` heading rules in `theme.css` with these. The current uniform `1.5` / weight `500` must not survive.

### 4.2 Color roles

```
--surface           #FFFFFF
--surface-sunken    #F7FAFC   /* page bg; was #EEF6FB — too blue, tints food photography */
--surface-raised    #FFFFFF
--ink               #0E2434
--ink-muted         #4A6878   /* ~7:1; was #5B7A8F at ~4.3:1, borderline */
--ink-subtle        #7C99AA   /* non-essential text only */
--line              #E3EBF1   /* solid hairline; was rgba(58,143,186,.15) */
--primary           #3A8FBA
--primary-hover     #2E6F96
--primary-ink       #FFFFFF
--secondary         #8B6B4A   /* loyalty/tier accents ONLY — never competes with primary */
--positive          #0E9E7A
--warning           #B45309
--danger            #D4183D
--chart-1..5        #3A8FBA  #8B6B4A  #0E9E7A  #B45309  #6B4FA8
```

All body-text pairings must meet WCAG AA (4.5:1); `--ink-subtle` is reserved for decorative or redundant text only.

**There is no dark theme.** This is a deliberate scope decision, not an oversight — see §2. Tokens are still defined as CSS custom properties on `:root` rather than hardcoded, because that is what makes the palette changeable at all, but only one set of values exists.

### 4.3 Stylesheet structure

Split `src/styles/` into:

- `tokens.css` — raw values on `:root`.
- `theme.css` — semantic roles + `@theme inline` mapping for Tailwind.
- `base.css` — element resets and the typography scale from §4.1.
- `index.css` — imports in order: `fonts` → `tailwind` → `tokens` → `theme` → `base`.

Delete the dead `.dark` greyscale block from `theme.css` and the `@custom-variant dark (&:is(.dark *))` declaration alongside it. Nothing applies the `.dark` class today and nothing will.

### 4.4 Elevation, radii, motion, density

**Elevation** — flat by default. Structure comes from `--line` hairlines. Shadows only on genuinely floating elements, and **never blue-tinted** (the current `0 4px 16px rgba(58,143,186,.38)` login button glow is exactly what to remove).

```
--elev-0  none + 1px solid var(--line)
--elev-1  0 1px 2px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04)     /* hover lift */
--elev-2  0 4px 12px rgba(0,0,0,.10), 0 12px 32px rgba(0,0,0,.10)  /* modals, sheets */
```

**Radii:** `--radius-sm 6px`, `--radius-md 8px`, `--radius-lg 12px`, `--radius-xl 16px`, `--radius-pill 999px`.

**Motion:** `--motion-fast 140ms` (state changes), `--motion-base 220ms` (entrances), shared easing `cubic-bezier(.4, 0, .2, 1)`. All transitions must be disabled under `@media (prefers-reduced-motion: reduce)`.

**Spacing:** 4px base — 4, 8, 12, 16, 20, 24, 32, 40, 56, 72.

**Density is how one token system serves both the storefront and the console.** Two classes redefine a small set of component tokens:

| Token | `.density-comfortable` (storefront) | `.density-compact` (console) |
|---|---|---|
| `--control-h` | 44px | 34px |
| `--card-pad` | 20px | 14px |
| `--row-gap` | 16px | 8px |
| `--text-body` | 15px | 14px |

`StorefrontShell` sets comfortable; `ConsoleShell` sets compact. Without this, the storefront ends up cramped or the Kitchen Display unusable.

---

## 5. Architecture

### 5.1 Target file structure

```
src/
  styles/
    fonts.css      (modified)  tailwind.css  (unchanged)
    tokens.css     (new)       theme.css     (rewritten)
    base.css       (new)       index.css     (modified)
  components/
    ui/            UiButton UiCard UiField UiChip UiBadge
                   UiModal UiToast UiEmptyState UiSkeleton UiIcon
    shell/         StorefrontShell ConsoleShell
    storefront/    MenuBrowser MenuItemCard ItemCustomizeSheet
                   CartPanel CheckoutPanel OrderTracker DeliveryMap
    (existing 10 views — restyled in place)
  store/
    useCartStore.js  (new)       useUiStore.js   (new)
    usePosStore.js   (modified)  useAuthStore.js (modified)
  lib/
    useToast.js      (new)       realtime.js     (unchanged)
```

### 5.2 Shell split

`App.vue` drops from 517 lines to roughly 60 — a thin router. Sidebar markup, sidebar CSS, and the inlined SVG icon strings move out.

```
auth0.isLoading            → splash
!isAuthenticated           → StorefrontShell   (guest)
role === 'customer'        → StorefrontShell
any staff role             → ConsoleShell
```

- **`StorefrontShell`** — top bar (brand, category scroller, cart button with live count, Sign in link), mobile bottom bar, `density-comfortable`.
- **`ConsoleShell`** — the existing sidebar restyled, `density-compact`. Nav still filtered by `auth.allowedViews()`.
- **Admin cross-over.** `ROLE_VIEWS.admin` includes `customer`. Selecting that nav item swaps to `StorefrontShell` with a persistent "Back to console" affordance.

Icons move from `v-html`-ed SVG strings in `App.vue` into `UiIcon.vue` with a `name` prop over an internal map.

### 5.3 New stores

**`useCartStore.js`** — singleton matching the existing pattern.

State: `items[]`, `orderType` (`'delivery' | 'pickup'`), `deliveryInstructions`, `deliveryLat`, `deliveryLng`, `phone`, `pendingCheckout`.

Behavior:

- Mirrors to `sessionStorage` on every mutation. **sessionStorage, not localStorage** — a cart should not resurrect a week later.
- Every read wrapped in try/catch; the store must function with storage blocked or unavailable.
- `pendingCheckout` is set immediately before `loginWithRedirect()` and consumed on the next boot.
- Owns cart line identity via the existing `optionSignature()` logic (move it here from `CustomerView`), so an item with different options is a distinct line.

**`useUiStore.js`** — the toast queue.

### 5.4 Guest-aware data loading

`usePosStore.loadAll()` stops firing eagerly at construction. Instead:

- **Guest:** fetch `/menu-items` only.
- **On auth resolve:** hydrate the rest, tolerating 403s exactly as `Promise.allSettled` does today.
- `state.loading` becomes real and drives `UiSkeleton` in `MenuBrowser`.

### 5.5 Performance

`DeliveryMap.vue` isolates Leaflet behind a **dynamic import** (both the library and its CSS). The storefront must not ship the mapping library on first paint.

---

## 6. The customer flow

### 6.1 The eight friction points

| # | Today | Required outcome |
|---|---|---|
| 1 | Nothing visible without login | Guest lands directly on the menu |
| 2 | Phone is a separate blocking pre-step | One field inside checkout |
| 3 | GPS is a manual button + blocking alert | Requested inline on delivery select, with fallback |
| 4 | Forced modal to add a Coke | One-tap `+`; customization opt-in |
| 5 | 16 `alert()` + 4 `confirm()` | Toasts and `UiModal` |
| 6 | User types their own order number to track | Their orders are simply listed |
| 7 | Cart is a desktop-only side column | Pinned cart bar on mobile |
| 8 | Errors swallowed to a generic alert | Loading states + real error text |

**Detail on #2 (the worst).** The current path is: add items → *Place Order* → `alert("Please save your phone number before placing an order")` → scroll up → type phone → click **Save** → wait for a `PUT /api/customers/me` round-trip → *Place Order* again. Replace with a single phone field in the checkout form, persisted as part of order submission. The standalone amber "Add a phone number for delivery" card and its Save button are deleted.

**Detail on #4.** `addToCart()` currently opens the customization modal when `isPizzaItem || isWingsItem || isSodaItem`, and `isSodaItem` matches any name containing `soda`, `cola`, `coke`, `sprite`, or `root beer` — so adding a Coke forces a modal whose only choice is the flavor already named on the item. New rule:

- Every card has a one-tap `+` that adds immediately using defaults.
- Tapping the card **body** opens `ItemCustomizeSheet`.
- The sheet opens with defaults preselected, so **Add** is always one tap from open.

**Detail on #6.** The order-number + phone lookup form (`findOrder()`, `trackOrderNumber`, `trackPhone`) is **deleted entirely**. Since ordering requires authentication, every order belongs to an account. Signed-in customers see their orders listed automatically, updating live over the existing Ably `orders` channel. Accepted tradeoff: someone whose order was rung up at the POS under only a phone number loses self-serve tracking.

### 6.2 The auth hop

```
guest browses  →  taps +  →  cart fills (mirrored to sessionStorage)
      →  "Place order"  →  pendingCheckout = true
      →  Auth0 redirect  →  returns to app
      →  cart restored, checkout panel open, phone prefilled from profile
      →  one confirm  →  order placed
```

**One redirect, one confirm.** Login is the only interruption in the entire path.

### 6.3 Required edge-case handling

- **Abandoned login.** On boot, if `pendingCheckout` is set but the user is still unauthenticated: clear the flag, **keep the cart**. They return to the menu with items intact.
- **Stale cart at checkout.** A guest may build a cart, then log in to find an item deleted or marked unavailable. Server-side totals mean there is no pricing exploit, but a deleted item fails the whole order. Therefore: re-validate the cart against a fresh `/menu-items` fetch at checkout entry, drop missing or unavailable lines, and surface what was dropped in a toast. Never let the user hit submit on a cart that cannot succeed.
- **Storage unavailable.** Private browsing or blocked site data must degrade to an in-memory cart, not a crash.
- **Staff mid-cart.** `POST /api/orders` already permits `cashier`/`manager`/`admin`, so a staff member who authenticates mid-cart simply completes the order. No special handling.

### 6.4 Order submission contract

`POST /api/orders` accepts exactly: `orderType`, `customerName`, `customerPhone`, `tableNumber`, `deliveryAddress`, `deliveryLat`, `deliveryLng`, `notes`, `paymentMethod`, `pointsEarned`, `pointsRedeemed`, `items`.

Totals are computed server-side from DB prices. `paidWithPoints`, custom line items, and `pointsEarned`/`pointsRedeemed` are staff-only and forced to 0 for customers. **Do not change this.** The client must not attempt to send a trusted total.

---

## 7. Backend changes

Four items, all additive.

1. **Migration** — append to `server/migrate.js` following its existing idempotent `information_schema` probe-then-alter pattern:
   - `menu_item.image_url VARCHAR(512) NULL`
   - `menu_item.description VARCHAR(280) NULL`

2. **`server/routes/menu.js`** — include `imageUrl` and `description` in the GET mapping and in the POST/PUT column lists and response bodies. Extend `validateMenuPayload` to reject an `image_url` whose scheme is not `http:` or `https:`, and to enforce the 280-char description limit.

3. **`optionalAuth` middleware** in `server/middleware/auth.js` (~8 lines) — if no `Authorization` header, call `next()` with `req.user` unset; if present, run `jwtCheck` + `loadUser` normally. `jwtCheck` cannot do this today because it 401s outright.

4. **Strip `cost`** from `GET /api/menu-items` unless `optionalAuth` resolved a `manager` or `admin`. `MenuManagement.vue` continues to see it; the public storefront does not.

`MenuManagement.vue` gains image-URL and description fields.

---

## 8. Staff console re-skin

All nine non-tokenized views convert their 266 hardcoded palette literals to semantic token classes. `Dashboard.vue` and `LoginView.vue` are the reference pattern — they already use tokens.

- **`KitchenDisplay.vue`** needs its order-status colors mapped to the semantic tokens and checked for AA contrast — it is read at a glance, from a distance, in a bright room.
- **`Analytics.vue`** reads its chart palette from `--chart-1..5` via `getComputedStyle` rather than hardcoding hex arrays, so the charts match the brand instead of Tailwind defaults. Hardcoded arrays at lines 143–178 are removed.
- **The 4 `confirm()` calls** become `UiModal` confirmations. These guard destructive deletes — including "Remove user, they lose access immediately" — and a native confirm is easy to fat-finger past.
- **The 16 `alert()` calls** become toasts.

---

## 9. Work breakdown

Tasks are ordered by dependency. Each is sized for a single subagent. `Depends on` must be complete before a task starts.

**How the 266 literals split across tasks** — so the completion grep in §11 is interpreted correctly:

| Owner | Literals | Which |
|---|---|---|
| T6–T10 | 79 | `CustomerView.vue` — not converted, *replaced* by the new storefront components and then deleted |
| T11–T13 | 170 | the seven staff views |
| T14 | 17 | `Analytics.vue` |
| **Total** | **266** | |

### T1 — Token layer and typography

**Files:** `src/styles/tokens.css` (new), `theme.css` (rewrite), `base.css` (new), `index.css`, `fonts.css`
**Depends on:** nothing
**Do:** Implement §4.1–§4.4 in full — the color roles, type scale, elevation, radii, motion, spacing, density classes. Delete the dead `.dark` greyscale block. Remove Playfair from UI. Move `font-family` off the `*` selector.
**Done when:** `npm run build` is clean; every token has been eyeballed on a throwaway scratch page (**not committed** — build it in the scratchpad and delete it); no existing view has visually regressed beyond typography weight/leading.
**Do not:** touch any component file.

### T2 — UI primitives

**Files:** `src/components/ui/*`, `src/lib/useToast.js`, `src/store/useUiStore.js`
**Depends on:** T1
**Do:** Build `UiButton` (variants primary/secondary/ghost/danger, sizes sm/md/lg, loading + disabled states), `UiCard`, `UiField` (label + hint + error, correctly associated for a11y), `UiChip`, `UiBadge` (order-status colors), `UiModal` (focus trap, Esc, scroll lock, mobile bottom-sheet variant), `UiToast` + `useToast`, `UiEmptyState`, `UiSkeleton`, `UiIcon`. `useUiStore` handles theme persistence and the toast queue.
**Done when:** every primitive renders correctly at both density classes; `UiModal` traps focus and restores it on close; keyboard navigation works throughout.
**Do not:** modify existing views yet.

### T3 — Shell split

**Files:** `src/App.vue`, `src/components/shell/*`, `src/store/useAuthStore.js`
**Depends on:** T2
**Do:** Reduce `App.vue` to the §5.2 router. Build `StorefrontShell` and `ConsoleShell`. Move icons into `UiIcon`. Guests reach `StorefrontShell`. Preserve `auth.allowedViews()` filtering and the admin cross-over affordance.
**`useAuthStore` needs guest handling.** A guest has `state.role === null`, for which `allowedViews()` currently returns `[]` and `defaultView()` returns `'dashboard'` — a view a guest must never reach. Add an explicit unauthenticated case that resolves to the storefront, without changing `ROLE_VIEWS` or `ROLE_DEFAULT_VIEW` for real roles.
**Done when:** every role lands on its correct shell and default view; logged-out visitors see the storefront shell and can never reach a console view.

### T4 — Cart store

**Files:** `src/store/useCartStore.js`, plus vitest setup
**Depends on:** T1
**Do:** Implement §5.3 and the §6.3 edge cases. Move `optionSignature()` out of `CustomerView`. Add vitest and cover this store only: add/remove/quantity, option-signature line identity, sessionStorage round-trip, `pendingCheckout` lifecycle, abandoned-login recovery, stale-item validation, storage-unavailable fallback.
**Done when:** tests pass; the store works with `sessionStorage` throwing.
**Note:** This is the riskiest new logic in the project and the only part with automated tests. Everything else verifies manually.

### T5 — Backend

**Files:** `server/migrate.js`, `server/routes/menu.js`, `server/middleware/auth.js`
**Depends on:** nothing (parallel with T1–T4)
**Do:** All four items in §7.
**Done when:** `node server/migrate.js` is idempotent across repeated runs; unauthenticated `GET /api/menu-items` returns `imageUrl`/`description` and **no** `cost`; the same request as a manager includes `cost`; a non-http(s) `image_url` is rejected with 400.

### T6 — Storefront: browse

**Files:** `src/components/storefront/MenuBrowser.vue`, `MenuItemCard.vue`, `ItemCustomizeSheet.vue`; `src/store/usePosStore.js`
**Depends on:** T3, T4, T5
**Do:** Guest-aware loading (§5.4). Card grid with 16:9 image and a gradient + initial fallback when `imageUrl` is empty. One-tap `+`; card body opens the sheet with defaults preselected (§6.1 #4). Skeletons while loading.
**Done when:** a logged-out visitor sees the menu with no failed auth requests in the network log; adding a Coke takes exactly one tap.

### T7 — Storefront: cart and the auth hop

**Files:** `CartPanel.vue`, `StorefrontShell.vue`
**Depends on:** T6
**Do:** Desktop sliding panel, mobile pinned bar (count + total + View cart) opening a bottom sheet. Wire "Place order" to the §6.2 sequence.
**Done when:** a guest builds a cart, is redirected through Auth0, returns, and finds the cart intact with checkout open. Abandoning login keeps the cart and clears the flag.

### T8 — Storefront: checkout

**Files:** `CheckoutPanel.vue`
**Depends on:** T7
**Do:** Single-pass form — phone inline (no separate save step), order type, inline GPS with manual fallback, notes. Stale-cart re-validation on entry (§6.3). Submit per the §6.4 contract. Inline field errors, no alerts.
**Done when:** a brand-new Auth0 signup completes an order without ever hitting a blocking dialog; a cart containing a since-deleted item is repaired with a toast rather than a failed submit.

### T9 — Storefront: tracking and map

**Files:** `OrderTracker.vue`, `DeliveryMap.vue`
**Depends on:** T8
**Do:** List the signed-in customer's orders; live updates over the Ably `orders` channel. **Delete the lookup form** (`findOrder`, `trackOrderNumber`, `trackPhone`). Leaflet behind a dynamic import.
**Done when:** the storefront's initial bundle contains no Leaflet; the map still works on an active delivery.

### T10 — Retire `CustomerView.vue`

**Depends on:** T9
**Do:** Delete the old 950-line component once T6–T9 cover its behavior. Update `viewMap`.
**Done when:** no behavior from the original is lost except the deliberately-cut lookup form.

### T11–T13 — Staff console re-skin *(the long pole)*

**Depends on:** T2
Split by view so subagents can run in parallel; each converts hardcoded literals to tokens, replaces `alert()`/`confirm()`, and verifies the result at compact density.

- **T11:** `POSTerminal` (26 literals, 5 alerts), `KitchenDisplay` (25, 1 alert, status-color contrast check)
- **T12:** `Inventory` (19, 1 alert, 1 confirm), `MenuManagement` (22, 1 alert, 1 confirm, **plus the new image/description fields**), `LoyaltyManagement` (11, 1 alert, 1 confirm)
- **T13:** `UserManagement` (36, 1 confirm), `DriverView` (31), `Dashboard` (already tokenized — align only)

### T14 — Analytics

**Depends on:** T2
**Do:** §8 chart-token work. Remove the five hardcoded arrays at lines 143–178; read `--chart-1..5` at runtime.
**Done when:** charts are legible and on-brand.

### Natural delivery split

**T1–T10 deliver everything the user asked for** and can ship independently. **T11–T14 are the consistency debt that carries the redesign into the staff views.** If the storefront needs to be seen working before committing to the full sweep, that is the seam.

---

## 10. Verification

There is no test infrastructure today, and TDD is not available as a workflow for this project. Automated tests are added for `useCartStore` only (T4), because it is the riskiest logic and the only part that is genuinely unit-testable rather than visual.

Everything else verifies as:

1. `npm run build` clean.
2. **Per-role smoke pass** — guest, customer, cashier, kitchen, driver, manager, admin. Each lands on the right shell and default view, and every nav item renders.
3. **Visual pass**, every view.
4. **Three breakpoints** — 375px, 768px, 1440px.
5. **The guest path end to end** — browse → customize → cart → redirect → return → checkout → order placed → tracked.
6. **Network check** — a logged-out visitor triggers no failed authenticated requests, and the initial bundle contains no Leaflet.
7. **Accessibility** — keyboard path through checkout, focus trapped and restored in modals, AA contrast on all body text.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| 266 literal conversions is a large mechanical surface with real regression potential | Split across T11–T13 by view; one subagent per group; per-view visual check |
| Cart loss across the Auth0 redirect is the feature's single point of failure | The only automated-test coverage in the project (T4) targets exactly this |
| A palette literal survives and a staff view keeps shipping the wrong blue | Grep for the palette-literal pattern as a completion gate on T11–T14 |
| `CustomerView` deletion (T10) drops behavior nobody noticed | T10 gated behind T6–T9; diff old component against new surface before deleting |
| Storefront regresses first paint | Leaflet dynamic import verified in T9; guest loads menu only (T6) |
