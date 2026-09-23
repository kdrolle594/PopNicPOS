# PopNic Storefront Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild PopNic's visual language on Uber's structural rules while keeping the existing blue/brown brand, and let guests browse the menu and fill a cart before being prompted to sign in exactly once, at checkout.

**Architecture:** A CSS custom-property token layer feeds Tailwind v4 via `@theme inline`. Ten hand-rolled Vue primitives consume those tokens. `App.vue` becomes a thin router over two shells — `StorefrontShell` (customers and guests, comfortable density) and `ConsoleShell` (staff, compact density). A new `useCartStore` singleton mirrors the cart to `sessionStorage` so it survives the Auth0 redirect, which is the feature's single point of failure and the only thing covered by automated tests.

**Tech Stack:** Vue 3 (`<script setup>`), Vite 6, Tailwind CSS v4 (CSS-first, no `tailwind.config.js`), Express 5, MySQL2, Auth0 (`@auth0/auth0-vue`), Ably, Leaflet, Chart.js. Vitest is added in Task 5 for one store.

**Spec:** `docs/superpowers/specs/2026-09-23-uber-storefront-redesign-design.md` — executors read both documents. Where this plan and the spec disagree, the spec wins; report the conflict rather than guessing.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **No new runtime dependencies.** The only permitted install in this entire plan is `vitest` as a devDependency (Task 5).
- **Do not install `shadcn` or `shadcn-vue`.** `shadcn ^4.1.1` already sits unused in `devDependencies`; it is the React CLI and is unrelated to this project. Leave it alone, do not `npx` it, do not build against it.
- **No Vue Router.** View switching stays a `currentView` ref over a `viewMap` object.
- **No Pinia.** Stores are hand-rolled singletons matching `usePosStore` / `useAuthStore`.
- **No Tailwind config file.** Tailwind v4 is configured in CSS only.
- **No dark mode.** One theme only. Do not add a dark token set, a theme toggle, `data-theme` switching, a `prefers-color-scheme` block, or a `dark:` Tailwind variant. Tokens stay CSS custom properties because that is how a palette stays changeable, not because a second palette is coming.
- **Never reference a Tailwind palette literal.** `bg-blue-600`, `text-gray-500`, `border-amber-200` and every sibling are banned in new code. Use the semantic classes from Task 1.
- **Guests never place orders.** Browsing and cart building are open; `POST /api/orders` always requires authentication.
- **Totals are computed server-side.** The client must never send a total it expects to be trusted.
- **Brand:** primary `#3A8FBA`, secondary `#8B6B4A`. Secondary is for loyalty and tier accents only and never competes with primary.
- **Accessibility:** all body text meets WCAG AA (4.5:1); `--ink-subtle` is decorative/redundant text only; every interactive control is keyboard reachable with a visible focus ring.
- **Motion:** all transitions disabled under `prefers-reduced-motion: reduce`.
- **Node >= 20.**
- **Commit at the end of every task.** Never bundle two tasks into one commit.
- **Re-read any file before editing it.** The spec's line numbers and counts were measured on 2026-09-23 and earlier tasks in this plan will have shifted them.

---

## Orchestration Guide

Read this before dispatching anything.

**Task 1 is a hard serialization point.** Every frontend task builds on its tokens. Do not fan out until it has landed and been reviewed, or parallel subagents will invent competing token vocabularies.

**Dependency graph:**

```
Task 0 (test harness) ─┬─ Task 5 (cart store) ──────────────────────── (feeds Tasks 7, 8)
                       └─ Task 6 (backend) ─────────────────────────── (feeds Task 7)

Task 1 (tokens) ─ Task 2 (static primitives) ─ Task 3 (interactive primitives) ─┬─ Task 4 (shells) ─ Task 7 ─ Task 8 ─ Task 9 ─ Task 10 ─ Task 11
                                                                                └─ Task 15 (Analytics)
```

**Parallelization:**

| Wave | Dispatch | Notes |
|---|---|---|
| 0 | Task 0 | ~5 minutes. Tasks 5 and 6 both need it |
| 1 | Task 1, Task 5, Task 6 | All independent of each other; backend never touches frontend |
| 2 | Task 2 | Needs Task 1 |
| 3 | Task 3 | Needs Task 2 |
| 4 | Task 4 | Needs Task 3 |
| 5 | Task 15 | Independent of the storefront chain |
| 6 | Tasks 7 → 8 → 9 → 10 → 11 | Strictly sequential; each builds on the last |

Waves 5 and 6 can run concurrently — they touch disjoint file sets.

---

## Verification Gates

**A subagent's self-report is not verification.** A subagent that just wrote code is the worst available judge of whether it works: it has motivated reasoning toward reporting success, and the code reads correctly to it because it is still holding the intent in context. Then its context is discarded and an unearned "verified visually" becomes load-bearing for every downstream task.

Three tiers. Do not collapse them.

### Tier 1 — the orchestrator runs these itself, after every task

Never accept a subagent's word on any of these. They take seconds and return objective numbers.

```bash
npm run build                      # must exit 0
npm test                           # must pass (from Task 0 onward)

# Palette-literal sweep — every survivor is a view still shipping the wrong blue
grep -rnE "(bg|text|border|ring|from|to|via)-(gray|blue|red|green|amber|yellow|slate|zinc|orange|purple|teal|indigo)-[0-9]{2,3}" <files the task touched>

# Blocking-dialog sweep
grep -rnE "alert\(|confirm\(" <files the task touched>
```

Plus the task's own numeric gates where it states one (for example `wc -l src/App.vue` under 100 in Task 4).

If a Tier 1 gate fails, the task is not done. Send it back with the failing output — do not fix it yourself, and do not proceed.

### Tier 2 — a fresh reviewer subagent, after every task

Dispatch a *separate* subagent that did not write the code. Give it the task block, the Global Constraints, and the diff. Ask it to check the work against the task's acceptance criteria and the constraints — particularly whether primitives were reused rather than re-implemented, and whether any token was bypassed with a raw hex value.

Fresh context is the entire point. Do not ask the implementing subagent to review itself.

### Tier 3 — the human, at two hard gates

Neither the orchestrator nor any subagent can *see* whether the design works. Visual quality is not agent-verifiable, and a plan that pretends otherwise just launders a guess into a checkmark.

**Halt and wait for the user after Tasks 1 and 2.**

| Gate | Why it is here |
|---|---|
| **After Task 1** | Every view inherits these tokens. A wrong type rhythm or a contrast miss costs 14 tasks to unwind |
| **After Task 2** | The primitives set the proportions and weight all ten views adopt. Same compounding |

At each gate, give the user a short list of exactly what to look at and stop. Do not dispatch the next wave until they respond.

Everything else proceeds on Tier 1 + Tier 2 alone.

**Scope note:** the staff console token conversion was cut (see the Deferred section). The plan now runs Tasks 0–11 plus Task 15. The staff views keep their current appearance.

**Subagent briefing.** Each subagent sees only what you pass it. Always include: the task block verbatim, the Global Constraints section, the spec sections its task cites, and the `Produces` blocks of every task it consumes.

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `src/styles/tokens.css` | Raw token values | 1 |
| `src/styles/theme.css` | Semantic roles + `@theme inline` Tailwind mapping | 1 |
| `src/styles/base.css` | Element resets, typography scale, reduced-motion | 1 |
| `src/styles/fonts.css` | Font import, `font-family` on `:root` | 1 |
| `src/styles/index.css` | Import order | 1 |
| `src/components/ui/UiIcon.vue` | Inline SVG by name | 2 |
| `src/components/ui/UiButton.vue` | 4 variants × 3 sizes, loading state | 2 |
| `src/components/ui/UiCard.vue` | Flat surface + hairline | 2 |
| `src/components/ui/UiChip.vue` | Filter pills | 2 |
| `src/components/ui/UiBadge.vue` | Order-status colors | 2 |
| `src/components/ui/UiSkeleton.vue` | Loading placeholder | 2 |
| `src/components/ui/UiEmptyState.vue` | Empty list messaging | 2 |
| `src/store/useUiStore.js` | Toast queue | 3 |
| `src/lib/useToast.js` | Toast ergonomics | 3 |
| `src/components/ui/UiToast.vue` | Toast viewport | 3 |
| `src/components/ui/UiModal.vue` | Dialog + mobile bottom sheet | 3 |
| `src/components/ui/UiField.vue` | Label + control + hint + error | 3 |
| `src/App.vue` | Thin shell router | 4 |
| `src/components/shell/StorefrontShell.vue` | Customer/guest chrome | 4 |
| `src/components/shell/ConsoleShell.vue` | Staff sidebar | 4 |
| `src/store/useAuthStore.js` | + guest-role handling | 4 |
| `tests/setup.js` | `sessionStorage` stub, vitest harness | 0 |
| `src/store/useCartStore.js` | Cart + persistence + auth hop | 5 |
| `tests/useCartStore.test.js` | Cart persistence across the auth redirect | 5 |
| `tests/menu.test.js` | `cost` gating + URL scheme validation | 6 |
| `server/migrate.js` | + `image_url`, `description` | 6 |
| `server/routes/menu.js` | + new fields, `cost` gating | 6 |
| `server/middleware/auth.js` | + `optionalAuth` | 6 |
| `server/app.js` | `optionalAuth` on menu GET | 6 |
| `src/components/storefront/MenuBrowser.vue` | Category filter + grid | 7 |
| `src/components/storefront/MenuItemCard.vue` | One-tap add | 7 |
| `src/components/storefront/ItemCustomizeSheet.vue` | Opt-in customization | 7 |
| `src/store/usePosStore.js` | Guest-aware loading | 7 |
| `src/components/storefront/CartPanel.vue` | Cart + auth hop trigger | 8 |
| `src/components/storefront/CheckoutPanel.vue` | Single-pass checkout | 9 |
| `src/components/storefront/OrderTracker.vue` | Authenticated order list | 10 |
| `src/components/storefront/DeliveryMap.vue` | Lazy Leaflet | 10 |
| `src/components/CustomerView.vue` | **Deleted** | 11 |
| `src/components/Analytics.vue` | Chart tokens | 15 |
| `src/components/MenuManagement.vue` | Image + description fields only | 6 |

---

## Task 0: Test harness

Not in the spec — extracted because Tasks 5 and 6 both need it and neither should own it. Roughly five minutes of work.

This project has **no test infrastructure today**: no test script, no vitest, no test files. Automated testing stays deliberately narrow — two pure-logic surfaces where a regression is completely invisible. Everything else is verified by the gates in the Verification Gates section. Do not add component testing, jsdom, or `@vue/test-utils`.

**Files:**
- Create: `tests/setup.js`
- Modify: `vite.config.ts`, `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test`; `globalThis.sessionStorage` as an in-memory stub; `globalThis.__breakStorage()` / `__restoreStorage()` helpers for Task 5.

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

This is the only dependency installed anywhere in this plan.

- [ ] **Step 2: Add the test scripts**

In `package.json`, add to `scripts`: `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 3: Configure vitest**

Add to `vite.config.ts` inside `defineConfig({ … })`:

```ts
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
  },
```

`environment: 'node'` is deliberate — `tests/setup.js` stubs `sessionStorage` directly, so jsdom is not needed and is not installed.

- [ ] **Step 4: Create `tests/setup.js`**

```js
// Minimal sessionStorage stub so the cart store can be tested without jsdom.
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

globalThis.sessionStorage = new MemoryStorage();

// Swap in a storage that throws, to prove the cart degrades gracefully.
globalThis.__breakStorage = () => {
  globalThis.sessionStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
};

globalThis.__restoreStorage = () => {
  globalThis.sessionStorage = new MemoryStorage();
};
```

- [ ] **Step 5: Verify the harness runs**

Run: `npm test`
Expected: vitest starts and reports "No test files found" — exit code 0 or 1 is acceptable here, but vitest itself must run without a config error.

- [ ] **Step 6: Commit**

```bash
git add tests/setup.js vite.config.ts package.json package-lock.json
git commit -m "chore(test): add vitest harness"
```

---

## Task 1: Token layer and typography

Implements spec T1. **This is the foundation every other frontend task depends on. Do not dispatch anything else frontend until it lands.**

**TIER 3 HUMAN GATE.** When this task completes, halt. Ask the user to review the token system before any other frontend task is dispatched — every view inherits these decisions and unwinding them later costs 14 tasks.

**REQUIRED SKILL:** Invoke `frontend-design` before writing any CSS in this task. The spec fixes the token *values*; `frontend-design` governs how they compose into a coherent visual system — type rhythm, optical spacing, the restraint that keeps this from reading as templated. Announce "Using frontend-design to establish the visual system" and follow it.

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/base.css`
- Rewrite: `src/styles/theme.css`
- Modify: `src/styles/fonts.css`
- Modify: `src/styles/index.css`

**Interfaces:**
- Consumes: nothing.
- Produces: the semantic Tailwind class vocabulary every later task uses —
  `bg-surface`, `bg-surface-sunken`, `bg-surface-raised`, `text-ink`, `text-ink-muted`, `text-ink-subtle`, `border-line`, `bg-primary`, `hover:bg-primary-hover`, `text-primary`, `text-primary-ink`, `bg-secondary`, `text-secondary`, `text-positive`, `bg-positive`, `text-warning`, `bg-warning`, `text-danger`, `bg-danger`, `text-chart-1` … `text-chart-5`, and matching `rounded-sm|md|lg|xl|pill`.
  Also the CSS custom properties `--control-h`, `--card-pad`, `--row-gap` (redefined by density classes), `--elev-1`, `--elev-2`, `--motion-fast`, `--motion-base`, `--ease`, and the density classes `.density-comfortable` / `.density-compact`.

- [ ] **Step 1: Invoke the frontend-design skill**

Announce it, read it, and hold its guidance for the whole task.

- [ ] **Step 2: Create `src/styles/tokens.css`**

```css
/* ─────────────────────────────────────────────────────────────
   PopNic design tokens — raw values only.
   Semantic mapping lives in theme.css.
   Tailwind palette literals are banned everywhere in this app.
   ───────────────────────────────────────────────────────────── */

:root {
  /* ── Typography scale ────────────────────────────────────── */
  --text-display:   34px; --leading-display:   1.1;  --tracking-display:  -0.02em;  --weight-display:  700;
  --text-h1:        28px; --leading-h1:        1.15; --tracking-h1:       -0.015em; --weight-h1:       700;
  --text-h2:        22px; --leading-h2:        1.2;  --tracking-h2:       -0.01em;  --weight-h2:       600;
  --text-h3:        18px; --leading-h3:        1.25; --tracking-h3:        0;       --weight-h3:       600;
  --text-body-lg:   16px; --leading-body-lg:   1.5;
  --text-body:      15px; --leading-body:      1.5;
  --text-sm:        13px; --leading-sm:        1.45;
  --text-caption:   12px; --leading-caption:   1.4;
  --text-overline:  11px; --leading-overline:  1.3;  --tracking-overline:  0.08em;

  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;

  /* ── Spacing (4px base) ──────────────────────────────────── */
  --space-1:  4px;  --space-2:  8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px;  --space-6: 24px;  --space-8: 32px; --space-10: 40px;
  --space-14: 56px; --space-18: 72px;

  /* ── Radii ───────────────────────────────────────────────── */
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;
  --radius-xl: 16px; --radius-pill: 999px;

  /* ── Motion ──────────────────────────────────────────────── */
  --motion-fast: 140ms;
  --motion-base: 220ms;
  --ease: cubic-bezier(.4, 0, .2, 1);

  /* ── Elevation — flat by default; structure comes from --line.
        Never blue-tinted. ───────────────────────────────────── */
  --elev-1: 0 1px 2px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04);
  --elev-2: 0 4px 12px rgba(0,0,0,.10), 0 12px 32px rgba(0,0,0,.10);

  /* ── Color: light ────────────────────────────────────────── */
  --surface:        #FFFFFF;
  --surface-sunken: #F7FAFC;
  --surface-raised: #FFFFFF;
  --ink:            #0E2434;
  --ink-muted:      #4A6878;
  --ink-subtle:     #7C99AA;
  --line:           #E3EBF1;
  --primary:        #3A8FBA;
  --primary-hover:  #2E6F96;
  --primary-ink:    #FFFFFF;
  --secondary:      #8B6B4A;
  --positive:       #0E9E7A;
  --warning:        #B45309;
  --danger:         #D4183D;
  --chart-1: #3A8FBA; --chart-2: #8B6B4A; --chart-3: #0E9E7A;
  --chart-4: #B45309; --chart-5: #6B4FA8;

  color-scheme: light;
}

/* ── Density — one token system, two products ──────────────── */
.density-comfortable {
  --control-h: 44px;
  --card-pad:  20px;
  --row-gap:   16px;
  --text-body: 15px;
}

.density-compact {
  --control-h: 34px;
  --card-pad:  14px;
  --row-gap:    8px;
  --text-body: 14px;
}
```

- [ ] **Step 3: Rewrite `src/styles/theme.css`**

Delete the entire existing file contents — including the dead `.dark` greyscale block, the `@custom-variant dark` declaration keyed to it, and the `@layer base` heading rules that set every heading to `line-height: 1.5` / `font-weight: 500`. Replace with:

```css
@theme inline {
  --color-surface:        var(--surface);
  --color-surface-sunken: var(--surface-sunken);
  --color-surface-raised: var(--surface-raised);
  --color-ink:            var(--ink);
  --color-ink-muted:      var(--ink-muted);
  --color-ink-subtle:     var(--ink-subtle);
  --color-line:           var(--line);
  --color-primary:        var(--primary);
  --color-primary-hover:  var(--primary-hover);
  --color-primary-ink:    var(--primary-ink);
  --color-secondary:      var(--secondary);
  --color-positive:       var(--positive);
  --color-warning:        var(--warning);
  --color-danger:         var(--danger);
  --color-chart-1:        var(--chart-1);
  --color-chart-2:        var(--chart-2);
  --color-chart-3:        var(--chart-3);
  --color-chart-4:        var(--chart-4);
  --color-chart-5:        var(--chart-5);

  --radius-sm:   var(--radius-sm);
  --radius-md:   var(--radius-md);
  --radius-lg:   var(--radius-lg);
  --radius-xl:   var(--radius-xl);
  --radius-pill: var(--radius-pill);
}
```

- [ ] **Step 4: Create `src/styles/base.css`**

```css
@layer base {
  html {
    font-size: 16px;
    -webkit-text-size-adjust: 100%;
  }

  body {
    background: var(--surface-sunken);
    color: var(--ink);
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: var(--text-body);
    line-height: var(--leading-body);
    font-weight: var(--weight-regular);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Headings carry real hierarchy. The previous uniform
     1.5 leading / 500 weight is what made everything read mushy. */
  h1 {
    font-size: var(--text-h1);
    line-height: var(--leading-h1);
    font-weight: var(--weight-h1);
    letter-spacing: var(--tracking-h1);
  }

  h2 {
    font-size: var(--text-h2);
    line-height: var(--leading-h2);
    font-weight: var(--weight-h2);
    letter-spacing: var(--tracking-h2);
  }

  h3 {
    font-size: var(--text-h3);
    line-height: var(--leading-h3);
    font-weight: var(--weight-h3);
  }

  h4 {
    font-size: var(--text-body-lg);
    line-height: var(--leading-body-lg);
    font-weight: var(--weight-semibold);
  }

  * {
    border-color: var(--line);
  }

  :focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
}

@layer utilities {
  .text-display {
    font-size: var(--text-display);
    line-height: var(--leading-display);
    font-weight: var(--weight-display);
    letter-spacing: var(--tracking-display);
  }

  .text-overline {
    font-size: var(--text-overline);
    line-height: var(--leading-overline);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-overline);
    text-transform: uppercase;
  }

  .text-caption {
    font-size: var(--text-caption);
    line-height: var(--leading-caption);
    font-weight: var(--weight-medium);
  }

  .elev-1 { box-shadow: var(--elev-1); }
  .elev-2 { box-shadow: var(--elev-2); }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Fix `src/styles/fonts.css`**

Playfair Display is dropped entirely — a high-contrast serif is the opposite of this design's voice, and removing it saves a font request on first paint. The logo wordmark uses DM Sans 700.

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');

/* font-family lives on :root and inherits normally.
   The previous `* { font-family: … }` fought every override. */
:root {
  font-family: 'DM Sans', system-ui, sans-serif;
}
```

- [ ] **Step 6: Update `src/styles/index.css`**

```css
@import './fonts.css';
@import './tailwind.css';
@import './tokens.css';
@import './theme.css';
@import './base.css';
```

- [ ] **Step 7: Verify the build compiles**

Run: `npm run build`
Expected: exits 0, no CSS errors, no "unknown utility" warnings.

- [ ] **Step 8: Eyeball every token**

Create a throwaway page in the scratchpad directory (**not** in the repo, and not committed) that renders a swatch for each color token, each type role, both elevations, and both density classes. Confirm every text-on-background pairing is legible and that the type scale reads as a hierarchy rather than four similar sizes. Delete the file.

- [ ] **Step 9: Confirm Playfair is gone**

Run: `grep -rn "Playfair" src/`
Expected: matches only in `App.vue` and `LoginView.vue` scoped styles, which Task 4 removes. No match in `src/styles/`.

- [ ] **Step 10: Commit**

```bash
git add src/styles/
git commit -m "feat(design): token layer and typography scale"
```

**Do not** touch any component file in this task.

---

## Task 2: Static UI primitives

Implements the first half of spec T2.

**TIER 3 HUMAN GATE.** When this task completes, halt. These seven primitives set the proportions, weight and restraint that all ten views adopt — the same compounding as Task 1. Ask the user to review before dispatching Task 3.

**REQUIRED SKILL:** Invoke `frontend-design` before writing these components. Announce "Using frontend-design to shape the component language" and follow it. These seven primitives set the vocabulary all ten views inherit — their proportions, weight and restraint are the design.

**Files:**
- Create: `src/components/ui/UiIcon.vue`, `UiButton.vue`, `UiCard.vue`, `UiChip.vue`, `UiBadge.vue`, `UiSkeleton.vue`, `UiEmptyState.vue`

**Interfaces:**
- Consumes: Task 1's token vocabulary and density classes.
- Produces:
  - `UiIcon` — props: `name: string` (required), `size?: number = 18`. Names available: `dashboard, pos, kitchen, inventory, menu, loyalty, analytics, customer, driver, users, cart, plus, minus, close, check, chevron-right, chevron-left, search, signout, location, clock, alert`.
  - `UiButton` — props: `variant?: 'primary'|'secondary'|'ghost'|'danger' = 'primary'`, `size?: 'sm'|'md'|'lg' = 'md'`, `loading?: boolean`, `disabled?: boolean`, `block?: boolean`, `type?: string = 'button'`. Default slot is the label. Emits native `click`.
  - `UiCard` — props: `interactive?: boolean`, `padded?: boolean = true`. Slots: `default`, `header`, `footer`.
  - `UiChip` — props: `selected?: boolean`, `as?: 'button'|'span' = 'button'`. Default slot is the label.
  - `UiBadge` — props: `tone?: 'neutral'|'primary'|'positive'|'warning'|'danger' = 'neutral'`. Default slot is the label.
  - `UiSkeleton` — props: `width?: string = '100%'`, `height?: string = '1em'`, `radius?: string` (defaults to `var(--radius-sm)`), `circle?: boolean`.
  - `UiEmptyState` — props: `icon?: string`, `title: string` (required), `description?: string`. Slot: `action`.

- [ ] **Step 1: Invoke the frontend-design skill**

- [ ] **Step 2: Create `UiIcon.vue`**

Move the ten SVG path sets currently inlined as HTML strings in `App.vue`'s `ICONS` constant into this component's internal map, and add the fourteen new names listed in Produces above. Render inline `<svg>` — no `v-html`.

```vue
<script setup>
const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 18 },
});

// Each entry is the inner markup of a 24x24 stroked icon.
const PATHS = {
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  // …remaining names, including the ten migrated from App.vue's ICONS map
};
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    :width="size"
    :height="size"
    aria-hidden="true"
    focusable="false"
    v-html="PATHS[name] || ''"
  />
</template>
```

Note: `v-html` here renders only this component's own hardcoded constant, never user input — that is safe. Do not pass a `name` derived from API data without checking it against the map.

- [ ] **Step 3: Create `UiButton.vue`**

```vue
<script setup>
defineProps({
  variant: { type: String, default: 'primary' },
  size:    { type: String, default: 'md' },
  loading: Boolean,
  disabled: Boolean,
  block:   Boolean,
  type:    { type: String, default: 'button' },
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    class="ui-btn"
    :class="[`ui-btn--${variant}`, `ui-btn--${size}`, { 'ui-btn--block': block }]"
  >
    <span v-if="loading" class="ui-btn__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: var(--control-h, 44px);
  padding: 0 var(--space-5);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--motion-fast) var(--ease),
              border-color var(--motion-fast) var(--ease),
              color var(--motion-fast) var(--ease);
}

.ui-btn:disabled { opacity: .55; cursor: not-allowed; }
.ui-btn--block { width: 100%; }

.ui-btn--sm { height: calc(var(--control-h, 44px) - 10px); padding: 0 var(--space-3); font-size: var(--text-sm); }
.ui-btn--lg { height: calc(var(--control-h, 44px) + 6px); padding: 0 var(--space-6); font-size: var(--text-body-lg); }

.ui-btn--primary { background: var(--primary); color: var(--primary-ink); }
.ui-btn--primary:hover:not(:disabled) { background: var(--primary-hover); }

.ui-btn--secondary { background: var(--surface); color: var(--ink); border-color: var(--line); }
.ui-btn--secondary:hover:not(:disabled) { background: var(--surface-sunken); }

.ui-btn--ghost { background: transparent; color: var(--ink-muted); }
.ui-btn--ghost:hover:not(:disabled) { background: var(--surface-sunken); color: var(--ink); }

.ui-btn--danger { background: var(--danger); color: #FFFFFF; }
.ui-btn--danger:hover:not(:disabled) { filter: brightness(.92); }

.ui-btn__spinner {
  width: 14px; height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ui-btn-spin .7s linear infinite;
}

@keyframes ui-btn-spin { to { transform: rotate(360deg); } }
</style>
```

- [ ] **Step 4: Create `UiCard.vue`, `UiChip.vue`, `UiBadge.vue`**

Follow the `UiButton` pattern — scoped CSS, tokens only, no palette literals.

- `UiCard`: `background: var(--surface-raised)`, `border: 1px solid var(--line)`, `border-radius: var(--radius-lg)`, `padding: var(--card-pad)` when `padded`. When `interactive`, add `cursor: pointer` and a hover state of `box-shadow: var(--elev-1)` plus `transform: translateY(-1px)`. Header and footer slots sit above/below the default slot separated by a `--line` hairline.
- `UiChip`: pill, `height: calc(var(--control-h) - 12px)`, `padding: 0 var(--space-4)`, `border: 1px solid var(--line)`, `font-size: var(--text-sm)`, `font-weight: var(--weight-medium)`. Selected state: `background: var(--primary)`, `color: var(--primary-ink)`, `border-color: var(--primary)`. When `as === 'button'` render a `<button>` with `:aria-pressed="selected"`.
- `UiBadge`: pill, `font-size: var(--text-caption)`, `font-weight: var(--weight-semibold)`, `padding: 2px var(--space-2)`. Each tone uses `color-mix(in srgb, var(--<tone>) 14%, transparent)` as background with the solid token as text color, so a tone change needs one value, not two.

- [ ] **Step 5: Create `UiSkeleton.vue` and `UiEmptyState.vue`**

`UiSkeleton` animates a subtle shimmer between `var(--surface-sunken)` and `color-mix(in srgb, var(--line) 60%, var(--surface))`. It must respect the reduced-motion rule from Task 1 — the shimmer stops, the block stays.

`UiEmptyState` centers an optional `UiIcon` at 32px in `var(--ink-subtle)`, the title at `--text-h3`, the description at `--text-sm` in `var(--ink-muted)`, and the `action` slot beneath.

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Check every primitive at both densities**

Build a throwaway scratchpad page (not committed) rendering all seven primitives, every variant and every size, wrapped once in `.density-comfortable` and once in `.density-compact`. Confirm `UiButton` reaches focus by keyboard and shows the focus ring.

- [ ] **Step 8: Confirm no palette literals leaked in**

Run:
```bash
grep -rnE "(bg|text|border|ring|from|to|via)-(gray|blue|red|green|amber|yellow|slate|zinc|orange|purple|teal|indigo)-[0-9]{2,3}" src/components/ui/
```
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/
git commit -m "feat(ui): static primitives — icon, button, card, chip, badge, skeleton, empty state"
```

**Do not** modify any existing view in this task.

---

## Task 3: Interactive primitives and toasts

Implements the second half of spec T2. This task retires the mechanism behind all 16 `alert()` calls.

**Files:**
- Create: `src/store/useUiStore.js`, `src/lib/useToast.js`
- Create: `src/components/ui/UiToast.vue`, `UiModal.vue`, `UiField.vue`

**Interfaces:**
- Consumes: Task 1 tokens; `UiButton`, `UiIcon` from Task 2.
- Produces:
  - `useUiStore()` → `{ state, pushToast, dismissToast }` where `state = reactive({ toasts: [] })`.
  - `useToast()` → `{ success(message), error(message), info(message) }`. Each returns the toast id. Toasts auto-dismiss after 5000ms; `error` does not auto-dismiss.
  - `UiModal` — props: `open: boolean` (required), `title?: string`, `sheet?: boolean` (bottom sheet on viewports under 640px), `dismissible?: boolean = true`. Emits `close`. Slots: `default`, `footer`.
  - `UiField` — props: `label: string` (required), `hint?: string`, `error?: string`, `required?: boolean`, `id?: string` (auto-generated when absent). Default slot receives `{ id, describedBy, invalid }` via slot props so the caller can bind them to its own control.

- [ ] **Step 1: Create `src/store/useUiStore.js`**

```js
import { reactive } from 'vue';

let storeInstance;
let nextToastId = 1;

export function useUiStore() {
  if (storeInstance) return storeInstance;

  const state = reactive({ toasts: [] });

  function pushToast({ message, tone = 'info', timeout = 5000 }) {
    const id = nextToastId++;
    state.toasts = [...state.toasts, { id, message, tone }];
    if (timeout > 0) setTimeout(() => dismissToast(id), timeout);
    return id;
  }

  function dismissToast(id) {
    state.toasts = state.toasts.filter((t) => t.id !== id);
  }

  storeInstance = { state, pushToast, dismissToast };
  return storeInstance;
}
```

- [ ] **Step 2: Create `src/lib/useToast.js`**

```js
import { useUiStore } from '../store/useUiStore.js';

export function useToast() {
  const ui = useUiStore();
  return {
    success: (message) => ui.pushToast({ message, tone: 'positive' }),
    info:    (message) => ui.pushToast({ message, tone: 'info' }),
    // Errors persist until dismissed — they usually require the user to act.
    error:   (message) => ui.pushToast({ message, tone: 'danger', timeout: 0 }),
  };
}
```

- [ ] **Step 3: Create `UiToast.vue`**

A fixed viewport, `bottom: var(--space-6)` centered on mobile and `top: var(--space-6); right: var(--space-6)` on desktop, `z-index: 80`, holding one card per toast. Each has `role="status"` (`role="alert"` for the danger tone), the message, and a dismiss button using `UiIcon name="close"`. Tone maps to a 3px left border in the matching token color. Stack with `<TransitionGroup>`.

- [ ] **Step 4: Create `UiModal.vue`**

Requirements — each is load-bearing and must actually work:

1. Renders via `<Teleport to="body">`, `z-index: 90`, scrim `rgba(0,0,0,.45)` with a 2px backdrop blur.
2. **Focus trap:** on open, focus the first focusable child; Tab and Shift+Tab cycle within the dialog; on close, restore focus to the element that was focused before opening.
3. **Escape closes** when `dismissible`; clicking the scrim closes when `dismissible`.
4. **Scroll lock:** set `overflow: hidden` on `document.body` while open, restore the previous value on close (do not blindly set it to `''`).
5. `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at the title when `title` is set.
6. When `sheet` is true, on viewports under 640px it anchors to the bottom with `border-radius: var(--radius-xl) var(--radius-xl) 0 0` and slides up; above 640px it is a centered dialog.
7. `box-shadow: var(--elev-2)`.

- [ ] **Step 5: Create `UiField.vue`**

Renders `<label :for="id">` with the label text and a `*` in `var(--danger)` when `required`, then the default slot, then the hint in `var(--ink-muted)` at `--text-caption`, then the error in `var(--danger)` at `--text-caption` when present. The slot exposes `{ id, describedBy, invalid }`; `describedBy` is the id of whichever of hint/error is currently rendered, and callers bind `:aria-describedby="describedBy"` and `:aria-invalid="invalid"` on their control. Generate the id from a module-level counter when none is passed.

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Manually verify the interactive behavior**

On a throwaway scratchpad page (not committed):
1. Open a `UiModal`, press Tab repeatedly — focus must never leave the dialog.
2. Press Escape — it closes and focus returns to the trigger button.
3. With the modal open, confirm the page behind does not scroll.
4. At 375px width with `sheet`, confirm it anchors to the bottom.
5. Fire one of each toast tone; confirm info and success auto-dismiss at ~5s and error persists.

- [ ] **Step 8: Confirm no palette literals**

Run:
```bash
grep -rnE "(bg|text|border|ring)-(gray|blue|red|green|amber|yellow|slate|zinc|orange|purple|teal|indigo)-[0-9]{2,3}" src/components/ui/ src/lib/ src/store/useUiStore.js
```
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/ src/lib/useToast.js src/store/useUiStore.js
git commit -m "feat(ui): modal, toasts, and fields"
```

---

## Task 4: Shell split

Implements spec T3 (spec §5.2). `App.vue` drops from 517 lines to roughly 60.

**Files:**
- Rewrite: `src/App.vue`
- Create: `src/components/shell/StorefrontShell.vue`, `ConsoleShell.vue`
- Modify: `src/store/useAuthStore.js`

**Interfaces:**
- Consumes: all Task 2 and Task 3 primitives; `useUiStore` from Task 3.
- Produces:
  - `useAuthStore()` gains `isGuest` (computed: `!isAuthenticated.value`) and `defaultView()` returns `'storefront'` when there is no role.
  - `StorefrontShell` — props: none. Slot: `default` (the active storefront view). Carries `density-comfortable` on its root.
  - **`storefrontView` is owned by `App.vue`**, not by the shell: `const storefrontView = ref('browse')` with values `'browse' | 'checkout' | 'orders'`, published with `provide('storefrontView', storefrontView)`. `StorefrontShell` and Tasks 8–10 `inject('storefrontView')` to read and set it. App.vue owns it because Task 8 flips it to `'checkout'` from the auth watcher, which lives in `App.vue`.
  - `ConsoleShell` — props: `currentView: string`, `menuItems: Array<{id, label}>`. Emits `navigate(id)`. Provides `density-compact`.

- [ ] **Step 1: Add guest handling to `useAuthStore.js`**

A guest has `state.role === null`. Today `allowedViews()` returns `[]` and `defaultView()` returns `'dashboard'` — a view a guest must never reach. Add:

```js
const isGuest = computed(() => !auth0().isAuthenticated.value);

function defaultView() {
  if (!state.role) return 'storefront';
  return ROLE_DEFAULT_VIEW[state.role] || 'dashboard';
}
```

Export `isGuest` alongside the existing members. Do **not** change `ROLE_VIEWS` or `ROLE_DEFAULT_VIEW` for real roles.

- [ ] **Step 2: Create `StorefrontShell.vue`**

Root element carries `class="density-comfortable"`. Contains:
- A sticky top bar: wordmark (DM Sans 700, not Playfair), a cart button showing the live item count from `useCartStore` (Task 5) as a `UiBadge`, and either a "Sign in" `UiButton variant="ghost"` when `auth.isGuest` or the user's initials avatar when not.
- A horizontally scrollable category chip row beneath, which `MenuBrowser` (Task 7) fills.
- A `<slot />` for the active view.
- A mobile bottom bar under 640px.
- `<UiToast />` mounted once, at the shell level.

Until Task 5 lands, stub the cart count as `0` and leave a `// TASK 5` comment at the exact line — the Task 8 subagent wires it.

- [ ] **Step 3: Create `ConsoleShell.vue`**

Move the entire sidebar — markup and scoped CSS — out of `App.vue`. Root carries `class="density-compact"`. Convert every hex literal in the moved CSS to a token (`#EEF6FB` → `var(--surface-sunken)`, `#1A3D56` → `var(--ink)`, `#3A8FBA` → `var(--primary)`, `#8B6B4A` → `var(--secondary)`, `rgba(58,143,186,.12)` → `var(--line)`, and so on). Delete the blue-tinted box-shadows; use `var(--elev-1)` or a plain `--line` border. Nav items render `UiIcon`. Keep the mobile drawer behavior and the `auth.allowedViews()` filter exactly as they are. Mount `<UiToast />` here too.

- [ ] **Step 4: Rewrite `App.vue`**

```vue
<script setup>
import { computed, ref, watch } from 'vue';
import { useAuth0 } from '@auth0/auth0-vue';
import { useAuthStore } from './store/useAuthStore';
import StorefrontShell from './components/shell/StorefrontShell.vue';
import ConsoleShell from './components/shell/ConsoleShell.vue';
// …view imports unchanged…

const auth0 = useAuth0();
const auth = useAuthStore();
const currentView = ref('storefront');

const STAFF_ROLES = ['cashier', 'kitchen', 'manager', 'admin', 'driver'];

const isStaff = computed(() => STAFF_ROLES.includes(auth.state.role));
// Admins can preview the storefront via their existing `customer` nav entry.
const showStorefront = computed(
  () => !auth0.isAuthenticated.value || !isStaff.value || currentView.value === 'customer'
);

watch(
  () => auth0.isAuthenticated.value,
  async (authenticated) => {
    if (authenticated && !auth.state.role) {
      await auth.fetchRole();
      currentView.value = auth.defaultView();
    }
  },
  { immediate: true }
);
</script>
```

The template renders the loading splash while `auth0.isLoading`, then `StorefrontShell` or `ConsoleShell`. **`LoginView` is no longer a gate** — it is reached only by the Sign in action, which calls `auth.login()` directly. All sidebar markup and CSS are gone from this file.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Verify every role lands correctly**

Run `npm start`. Check each case:

| State | Expected |
|---|---|
| Logged out | `StorefrontShell`, no console nav reachable |
| customer | `StorefrontShell` |
| cashier | `ConsoleShell`, POS + Kitchen nav only |
| kitchen | `ConsoleShell`, Kitchen only |
| driver | `ConsoleShell`, Driver only |
| manager | `ConsoleShell`, 8 nav items |
| admin | `ConsoleShell`, 10 items; "Customer View" swaps to `StorefrontShell` with a back affordance |

- [ ] **Step 7: Confirm `App.vue` shrank**

Run: `wc -l src/App.vue`
Expected: under 100 lines (was 517).

- [ ] **Step 8: Commit**

```bash
git add src/App.vue src/components/shell/ src/store/useAuthStore.js
git commit -m "feat(shell): split storefront and console shells, open the storefront to guests"
```

---

## Task 5: Cart store with automated tests

Implements spec T4. **This is the only task in the plan with a real TDD cycle**, because cart loss across the Auth0 redirect is the feature's single point of failure.

**Files:**
- Create: `src/store/useCartStore.js`, `tests/useCartStore.test.js`

**Interfaces:**
- Consumes: Task 0's test harness (`npm test`, the `sessionStorage` stub, `__breakStorage`/`__restoreStorage`). Nothing else beyond Vue — this store has no styling or component dependencies, which is why it runs in wave 1.
- Produces:
  - `optionSignature(options) => string` — named export, moved verbatim from `CustomerView.vue`.
  - `useCartStore()` → `{ state, itemCount, total, addLine, setQuantity, removeLine, clear, beginCheckout, consumePendingCheckout, reconcileWithMenu }`
  - `state = reactive({ items: [], orderType: 'delivery', deliveryInstructions: '', deliveryLat: null, deliveryLng: null, phone: '', pendingCheckout: false })`
  - A line is `{ menuItemId: number, name: string, price: number, quantity: number, options: object, notes?: string }`.
  - `addLine({ menuItemId, name, price, options, notes })` → increments quantity when an existing line has an equal `optionSignature`, otherwise appends with `quantity: 1`.
  - `reconcileWithMenu(menuItems)` → `{ removed: string[] }` — drops lines whose `menuItemId` is absent from `menuItems` or whose item has `available === false`, returning the removed display names.
  - `consumePendingCheckout()` → `boolean`, clearing the flag as a side effect.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The store is a module-level singleton, so each test gets a fresh module.
async function freshStore() {
  vi.resetModules();
  const mod = await import('../src/store/useCartStore.js');
  return mod.useCartStore();
}

const MARGHERITA = { menuItemId: 1, name: 'Margherita', price: 12, options: {} };
const PEPPERONI_L = { menuItemId: 2, name: 'Pepperoni', price: 15, options: { pizzaSize: 'large' } };
const PEPPERONI_M = { menuItemId: 2, name: 'Pepperoni', price: 12, options: { pizzaSize: 'medium' } };

beforeEach(() => {
  globalThis.__restoreStorage();
});

describe('line identity', () => {
  it('increments quantity for an identical line', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    cart.addLine(MARGHERITA);
    expect(cart.state.items).toHaveLength(1);
    expect(cart.state.items[0].quantity).toBe(2);
  });

  it('keeps the same item with different options as separate lines', async () => {
    const cart = await freshStore();
    cart.addLine(PEPPERONI_L);
    cart.addLine(PEPPERONI_M);
    expect(cart.state.items).toHaveLength(2);
  });

  it('treats topping order as irrelevant', async () => {
    const cart = await freshStore();
    cart.addLine({ ...MARGHERITA, options: { pizzaToppings: ['ham', 'bacon'] } });
    cart.addLine({ ...MARGHERITA, options: { pizzaToppings: ['bacon', 'ham'] } });
    expect(cart.state.items).toHaveLength(1);
  });
});

describe('totals', () => {
  it('sums price by quantity', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    cart.addLine(MARGHERITA);
    cart.addLine(PEPPERONI_L);
    expect(cart.itemCount.value).toBe(3);
    expect(cart.total.value).toBe(39);
  });

  it('removes a line when quantity drops to zero', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    cart.setQuantity(cart.state.items[0], 0);
    expect(cart.state.items).toHaveLength(0);
  });
});

describe('persistence across the auth redirect', () => {
  it('restores the cart in a new module instance', async () => {
    const first = await freshStore();
    first.addLine(MARGHERITA);
    first.state.phone = '5551234';
    first.beginCheckout();

    // Simulates the full page navigation Auth0 performs.
    const second = await freshStore();
    expect(second.state.items).toHaveLength(1);
    expect(second.state.phone).toBe('5551234');
    expect(second.consumePendingCheckout()).toBe(true);
  });

  it('consumes pendingCheckout exactly once', async () => {
    const first = await freshStore();
    first.beginCheckout();
    const second = await freshStore();
    expect(second.consumePendingCheckout()).toBe(true);
    expect(second.consumePendingCheckout()).toBe(false);
  });

  it('keeps the cart when login is abandoned', async () => {
    const first = await freshStore();
    first.addLine(MARGHERITA);
    first.beginCheckout();

    const second = await freshStore();
    second.consumePendingCheckout();          // guest never authenticated
    const third = await freshStore();
    expect(third.state.items).toHaveLength(1); // cart survives
    expect(third.state.pendingCheckout).toBe(false);
  });
});

describe('reconcileWithMenu', () => {
  it('drops deleted and unavailable items and reports them', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    cart.addLine(PEPPERONI_L);
    const { removed } = cart.reconcileWithMenu([{ id: 1, available: true }]);
    expect(cart.state.items).toHaveLength(1);
    expect(removed).toEqual(['Pepperoni']);
  });

  it('keeps everything when the menu still has it', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    const { removed } = cart.reconcileWithMenu([{ id: 1, available: true }]);
    expect(removed).toEqual([]);
    expect(cart.state.items).toHaveLength(1);
  });
});

describe('storage unavailable', () => {
  it('still works in memory when sessionStorage throws', async () => {
    globalThis.__breakStorage();
    const cart = await freshStore();
    expect(() => cart.addLine(MARGHERITA)).not.toThrow();
    expect(cart.state.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/store/useCartStore.js'`.

- [ ] **Step 3: Implement the store**

```js
import { reactive, computed, watch } from 'vue';

const STORAGE_KEY = 'popnic.cart.v1';

export function optionSignature(options = {}) {
  return JSON.stringify({
    pizzaSize: options.pizzaSize || null,
    pizzaStyle: options.pizzaStyle || null,
    pizzaToppings: (options.pizzaToppings || []).slice().sort(),
    wingFlavor: options.wingFlavor || null,
    sodaFlavor: options.sodaFlavor || null,
  });
}

const EMPTY = () => ({
  items: [],
  orderType: 'delivery',
  deliveryInstructions: '',
  deliveryLat: null,
  deliveryLng: null,
  phone: '',
  pendingCheckout: false,
});

function readStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(snapshot) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Private browsing or blocked site data — the cart stays in memory.
  }
}

let storeInstance;

export function useCartStore() {
  if (storeInstance) return storeInstance;

  const state = reactive({ ...EMPTY(), ...(readStorage() || {}) });

  watch(state, () => writeStorage({ ...state }), { deep: true });

  const itemCount = computed(() => state.items.reduce((n, i) => n + i.quantity, 0));
  const total = computed(() =>
    Number(state.items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2))
  );

  function addLine({ menuItemId, name, price, options = {}, notes }) {
    const signature = optionSignature(options);
    const existing = state.items.find(
      (i) => i.menuItemId === menuItemId && optionSignature(i.options) === signature
    );
    if (existing) {
      existing.quantity += 1;
      return;
    }
    state.items.push({ menuItemId, name, price, options, notes, quantity: 1 });
  }

  function setQuantity(line, quantity) {
    const signature = optionSignature(line.options);
    if (quantity <= 0) return removeLine(line);
    const target = state.items.find(
      (i) => i.menuItemId === line.menuItemId && optionSignature(i.options) === signature
    );
    if (target) target.quantity = quantity;
  }

  function removeLine(line) {
    const signature = optionSignature(line.options);
    state.items = state.items.filter(
      (i) => !(i.menuItemId === line.menuItemId && optionSignature(i.options) === signature)
    );
  }

  function clear() {
    Object.assign(state, EMPTY());
  }

  function beginCheckout() {
    state.pendingCheckout = true;
    // Written synchronously — the Auth0 redirect may fire before the watcher.
    writeStorage({ ...state });
  }

  function consumePendingCheckout() {
    const was = state.pendingCheckout;
    state.pendingCheckout = false;
    writeStorage({ ...state });
    return was;
  }

  function reconcileWithMenu(menuItems) {
    const live = new Map(menuItems.map((m) => [m.id, m]));
    const removed = [];
    state.items = state.items.filter((line) => {
      const match = live.get(line.menuItemId);
      if (!match || match.available === false) {
        removed.push(line.name);
        return false;
      }
      return true;
    });
    return { removed };
  }

  storeInstance = {
    state, itemCount, total,
    addLine, setQuantity, removeLine, clear,
    beginCheckout, consumePendingCheckout, reconcileWithMenu,
  };
  return storeInstance;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 11 tests across 5 suites.

- [ ] **Step 5: Commit**

```bash
git add src/store/useCartStore.js tests/useCartStore.test.js
git commit -m "feat(cart): persistent cart store surviving the Auth0 redirect"
```

---

## Task 6: Backend — menu imagery, optional auth, cost gating

Implements spec T5 (spec §7). **Dispatch in wave 1 alongside Task 1 — this task never touches frontend code.**

This task carries automated tests for one reason: **`cost` gating is a security boundary that fails silently.** If it regresses there is no visual symptom and no error — margin data just quietly starts shipping to the public storefront again. Same for the URL scheme check. These are the only two backend surfaces where that is true, so they are the only two that get tests.

**Files:**
- Modify: `server/migrate.js`, `server/routes/menu.js`, `server/middleware/auth.js`, `server/app.js`
- Create: `tests/menu.test.js`

**Interfaces:**
- Consumes: Task 0's test harness.
- Produces:
  - `GET /api/menu-items` returns each item with `imageUrl: string|null` and `description: string|null`; `cost` is present **only** when the caller is an authenticated manager or admin.
  - `optionalAuth(req, res, next)` — exported from `server/middleware/auth.js`. Leaves `req.user` unset when no `Authorization` header is present; otherwise behaves exactly like `jwtCheck` + `loadUser`, including its 401 on an invalid token.
  - `POST`/`PUT /api/menu-items` accept `imageUrl` and `description`.

- [ ] **Step 1: Add the migration**

Append inside `run()` in `server/migrate.js`, before the final `console.log('✔  Migration complete')`, following the file's existing probe-then-alter pattern:

```js
    // N. Add image_url + description to menu_item
    for (const [column, ddl] of [
      ['image_url',   'ALTER TABLE menu_item ADD COLUMN image_url VARCHAR(512) NULL'],
      ['description', 'ALTER TABLE menu_item ADD COLUMN description VARCHAR(280) NULL'],
    ]) {
      const [existing] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = 'menu_item'
           AND COLUMN_NAME  = ?`,
        [column]
      );
      if (existing.length === 0) {
        await conn.query(ddl);
        console.log(`✔  Added ${column} to menu_item`);
      } else {
        console.log(`✔  menu_item.${column} already exists — skipping`);
      }
    }
```

- [ ] **Step 2: Add `optionalAuth` to `server/middleware/auth.js`**

```js
// Resolves req.user when a token is supplied, and stays silent when one is not.
// jwtCheck cannot do this alone — it 401s on a missing header.
// An invalid token still 401s: silently downgrading a bad token to guest
// would mask real auth bugs.
export function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  jwtCheck(req, res, (err) => {
    if (err) return next(err);
    loadUser(req, res, next);
  });
}
```

- [ ] **Step 3: Apply `optionalAuth` to menu reads in `server/app.js`**

Import `optionalAuth` alongside the existing middleware, then change the menu guard so reads resolve an optional user instead of skipping auth entirely:

```js
app.use('/api/menu-items', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return optionalAuth(req, res, next);
  }
  let i = 0;
  const run = (err) => { if (err) return next(err); if (i < menuWriteAuth.length) menuWriteAuth[i++](req, res, run); else next(); };
  run();
});
```

- [ ] **Step 4: Gate `cost` behind an extracted, testable serializer**

The serialization must be a pure function with no database and no `req`/`res`, so Step 7 can test the `cost` boundary directly. Add to `server/routes/menu.js` and export it:

```js
// Exported for tests. Pure — no db, no req/res.
export function serializeMenuItem(item, links, isPrivileged) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    price: Number(item.price),
    // Margin data is staff-only — the storefront is a public surface.
    ...(isPrivileged ? { cost: Number(item.cost) } : {}),
    available: Boolean(item.available),
    isCombo: Boolean(item.is_combo),
    pointsValue: item.points_value,
    imageUrl: item.image_url || null,
    description: item.description || null,
    inventoryItems: links
      .filter((l) => l.menu_item_id === item.id)
      .map((l) => ({ id: l.inventory_item_id, quantity: Number(l.quantity_used) })),
  };
}
```

Then change the GET handler's signature from `async (_req, res)` to `async (req, res)` and use it:

```js
    const isPrivileged = !!req.user && ['manager', 'admin'].includes(req.user.role);
    const result = items.map((item) => serializeMenuItem(item, links, isPrivileged));
```

- [ ] **Step 5: Validate and persist the new fields**

Extend `validateMenuPayload` to accept `imageUrl` and `description`:

```js
  if (imageUrl != null && imageUrl !== '') {
    if (typeof imageUrl !== 'string' || imageUrl.length > 512) {
      return 'imageUrl must be a string of at most 512 characters';
    }
    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return 'imageUrl must be a valid URL';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'imageUrl must use http or https';
    }
  }
  if (description != null && (typeof description !== 'string' || description.length > 280)) {
    return 'description must be a string of at most 280 characters';
  }
```

Add `imageUrl` and `description` to the destructuring, the `INSERT` column list and values, the `UPDATE` `SET` clause, and both response bodies in POST and PUT. Store empty strings as `NULL`.

- [ ] **Step 6: Export `validateMenuPayload`**

Add `export` to the existing `validateMenuPayload` declaration so the tests can import it. It is currently module-private. No behavior change.

- [ ] **Step 7: Write `tests/menu.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { serializeMenuItem, validateMenuPayload } from '../server/routes/menu.js';

const ROW = {
  id: 1, name: 'Margherita', category: 'Pizza',
  price: '12.00', cost: '4.50', available: 1, is_combo: 0, points_value: 10,
  image_url: null, description: null,
};

describe('serializeMenuItem — cost gating', () => {
  it('omits cost for an unauthenticated caller', () => {
    const out = serializeMenuItem(ROW, [], false);
    expect(out).not.toHaveProperty('cost');
    expect(out.price).toBe(12);
  });

  it('includes cost for a privileged caller', () => {
    const out = serializeMenuItem(ROW, [], true);
    expect(out.cost).toBe(4.5);
  });

  it('normalises absent imagery to null, not undefined', () => {
    const out = serializeMenuItem(ROW, [], false);
    expect(out.imageUrl).toBeNull();
    expect(out.description).toBeNull();
  });

  it('maps only this item\'s inventory links', () => {
    const links = [
      { menu_item_id: 1, inventory_item_id: 7, quantity_used: '2' },
      { menu_item_id: 2, inventory_item_id: 9, quantity_used: '1' },
    ];
    const out = serializeMenuItem(ROW, links, false);
    expect(out.inventoryItems).toEqual([{ id: 7, quantity: 2 }]);
  });
});

describe('validateMenuPayload — imageUrl scheme', () => {
  const base = { name: 'X', price: 5 };

  it('rejects a javascript: URL', () => {
    expect(validateMenuPayload({ ...base, imageUrl: 'javascript:alert(1)' }))
      .toBe('imageUrl must use http or https');
  });

  it('rejects a data: URL', () => {
    expect(validateMenuPayload({ ...base, imageUrl: 'data:text/html;base64,PHA+' }))
      .toBe('imageUrl must use http or https');
  });

  it('rejects a string that is not a URL at all', () => {
    expect(validateMenuPayload({ ...base, imageUrl: 'not a url' }))
      .toBe('imageUrl must be a valid URL');
  });

  it('accepts an https URL', () => {
    expect(validateMenuPayload({ ...base, imageUrl: 'https://cdn.example.com/a.jpg' }))
      .toBeNull();
  });

  it('accepts an empty string as "no image"', () => {
    expect(validateMenuPayload({ ...base, imageUrl: '' })).toBeNull();
  });

  it('rejects a description over 280 characters', () => {
    expect(validateMenuPayload({ ...base, description: 'x'.repeat(281) }))
      .toBe('description must be a string of at most 280 characters');
  });

  it('accepts a description of exactly 280 characters', () => {
    expect(validateMenuPayload({ ...base, description: 'x'.repeat(280) })).toBeNull();
  });
});
```

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: PASS, 11 tests across 2 suites in this file (plus Task 5's if it has landed).

- [ ] **Step 9: Verify the migration is idempotent**

Run: `node server/migrate.js` twice.
Expected first run: `✔  Added image_url to menu_item` and `✔  Added description to menu_item`.
Expected second run: `✔  menu_item.image_url already exists — skipping` and the same for description. Exit 0 both times.

- [ ] **Step 10: Verify `cost` gating end to end**

Start the server with `npm run server`, then:

```bash
curl -s localhost:3000/api/menu-items | head -c 400
```
Expected: items include `imageUrl` and `description`, and **no `cost` key**.

```bash
curl -s -H "Authorization: Bearer <manager token>" localhost:3000/api/menu-items | head -c 400
```
Expected: same items, now **with** `cost`.

- [ ] **Step 11: Verify URL validation end to end**

```bash
curl -s -X POST localhost:3000/api/menu-items \
  -H "Authorization: Bearer <manager token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","price":5,"imageUrl":"javascript:alert(1)"}'
```
Expected: HTTP 400, `{"error":"imageUrl must use http or https"}`.

- [ ] **Step 12: Add the image and description fields to `MenuManagement.vue`**

Without this there is no way to populate menu imagery, and every storefront card falls back to the gradient treatment permanently. This is the one piece rescued from the deferred staff console conversion.

Add to the create/edit form:
- An `imageUrl` field (`type="url"`, optional) with a live preview thumbnail that falls back to the gradient-and-initial treatment on load error.
- A `description` field (textarea, `maxlength="280"`, optional) with a live character counter.

**Scope discipline:** touch only these two new fields. Do not convert this file's other 22 palette literals, its `alert()`, or its `confirm()` — that work is deliberately deferred and doing it here would smuggle a cut task back in. Match the file's existing utility-class style for the new fields so they do not look transplanted.

Confirm a manager still sees `cost` in this form after the Step 4 gating change.

- [ ] **Step 13: Commit**

```bash
git add server/ src/components/MenuManagement.vue
git commit -m "feat(api): menu imagery, optional auth, and staff-only cost"
```

---

## Task 7: Storefront browse

Implements spec T6 (spec §5.4, §6.1 #4). Delivers the guest menu.

**Files:**
- Create: `src/components/storefront/MenuBrowser.vue`, `MenuItemCard.vue`, `ItemCustomizeSheet.vue`
- Modify: `src/store/usePosStore.js`

**Interfaces:**
- Consumes: Task 2 and 3 primitives; `useCartStore`, `optionSignature` from Task 5; `imageUrl`/`description` from Task 6; `StorefrontShell` from Task 4.
- Produces:
  - `usePosStore()` gains `loadPublic()` (menu only) and `loadAuthenticated()` (the remaining three collections), replacing the eager `loadAll()` call at construction. `loadAll()` stays exported for existing callers but no longer self-invokes.
  - `MenuItemCard` — props: `item` (a menu item). Emits `add(item)` and `customize(item)`.
  - `ItemCustomizeSheet` — props: `open: boolean`, `item: object|null`. Emits `close` and `confirm({ menuItemId, name, price, options, notes })`, shaped exactly for `cart.addLine`.

- [ ] **Step 1: Make `usePosStore` guest-aware**

Remove the bare `loadAll();` call from the store factory. Split into:

```js
  async function loadPublic() {
    state.loading = true;
    try {
      state.menuItems = await api('/menu-items');
    } catch (err) {
      console.error('Failed to load menu:', err);
    } finally {
      state.loading = false;
    }
  }

  async function loadAuthenticated() {
    const results = await Promise.allSettled([
      api('/inventory-items'), api('/orders'), api('/customers'),
    ]);
    const [inventoryItems, orders, loyaltyCustomers] = results;
    if (inventoryItems.status === 'fulfilled')   state.inventoryItems = inventoryItems.value;
    if (orders.status === 'fulfilled')           state.orders = orders.value;
    if (loyaltyCustomers.status === 'fulfilled') state.loyaltyCustomers = loyaltyCustomers.value;
  }
```

Call `loadPublic()` from `StorefrontShell` on mount, and `loadAuthenticated()` from the `App.vue` auth watcher after `fetchRole()` resolves. A guest must fire exactly one request.

- [ ] **Step 2: Build `MenuItemCard.vue`**

A `UiCard interactive` whose body click emits `customize` and whose corner `+` button emits `add` with `@click.stop`.

- 16:9 image via `<img :src="item.imageUrl" loading="lazy" alt="">` when `imageUrl` is set.
- **Fallback when it is not:** a gradient block from `color-mix(in srgb, var(--primary) 18%, var(--surface))` to `color-mix(in srgb, var(--secondary) 18%, var(--surface))` with the item's first initial centered at `--text-display` in `var(--ink-subtle)`. This must look deliberate, not broken — day one has zero photos.
- Name at `--text-h3`, description clamped to two lines at `--text-sm` in `var(--ink-muted)`, price at `--text-body-lg` weight 700.
- The `+` button is at least 44×44px.

- [ ] **Step 3: Build `ItemCustomizeSheet.vue`**

A `UiModal sheet` containing the pizza size / style / topping, wing flavor and soda flavor controls. Move `pizzaSizeOptions`, `pizzaToppingOptions`, `pizzaPresetStyles`, `wingFlavorOptions`, `sodaFlavorOptions`, `isPizzaItem`, `isWingsItem`, `isSodaItem`, `calculateCustomPrice`, `buildDisplayName`, `formatToppingLabel`, `applyPizzaPreset` and `togglePizzaTopping` across from `CustomerView.vue` **unchanged** — they are correct, just misplaced.

**Defaults are always preselected** (`medium`, `custom`, `['pepperoni']`, `buffalo`, `coke cola`), so the confirm button is one tap from open. The confirm button shows the live computed price.

- [ ] **Step 4: Build `MenuBrowser.vue`**

Category chips from `['All', ...new Set(categories)]` using `UiChip`. Responsive grid: 1 column under 480px, 2 under 768px, 3 under 1200px, 4 above. While `state.loading`, render 8 `UiSkeleton` cards. When the filter yields nothing, render `UiEmptyState`.

A one-tap `+` calls `cart.addLine` directly with no options; the card body opens the sheet.

- [ ] **Step 5: Verify a guest sees the menu**

Run `npm start`, open a private window, do not sign in.
Expected: the menu renders. In the Network tab, exactly one `/api/` request (`/api/menu-items`), status 200, **no 401 or 403 anywhere**.

- [ ] **Step 6: Verify the one-tap rule**

Add a Coke to the cart.
Expected: exactly one tap. No modal. This is the friction point the spec calls out by name.

Then tap a pizza's card body.
Expected: the sheet opens with medium/custom/pepperoni preselected and confirm is one tap away.

- [ ] **Step 7: Verify the image fallback**

With no `image_url` set on any item, confirm every card shows the gradient-and-initial treatment and the grid reads as intentional.

- [ ] **Step 8: Commit**

```bash
git add src/components/storefront/ src/store/usePosStore.js
git commit -m "feat(storefront): guest menu browsing with one-tap add"
```

---

## Task 8: Cart panel and the auth hop

Implements spec T7 (spec §6.2, §6.3). **This is the feature's critical mechanic.**

**Files:**
- Create: `src/components/storefront/CartPanel.vue`
- Modify: `src/components/shell/StorefrontShell.vue`

**Interfaces:**
- Consumes: `useCartStore` (Task 5), `useAuthStore` (Task 4), Task 2/3 primitives.
- Produces: `CartPanel` — props: `open: boolean`. Emits `close` and `checkout`. `StorefrontShell`'s cart count is now live.

- [ ] **Step 1: Wire the live cart count into `StorefrontShell`**

Replace the `// TASK 5` stub from Task 4 with `useCartStore().itemCount`.

- [ ] **Step 2: Build `CartPanel.vue`**

Desktop (≥1024px): a panel docked right, `border-left: 1px solid var(--line)`. Mobile: a `UiModal sheet`.

Each line shows name, the options summary from `notes`, a `−`/quantity/`+` stepper wired to `cart.setQuantity`, a remove button, and the line total. Empty state via `UiEmptyState`. Footer shows the subtotal and a full-width `UiButton size="lg" block` reading **"Place order"** for authenticated users and **"Sign in to order"** for guests.

- [ ] **Step 3: Add the mobile pinned bar to `StorefrontShell`**

Under 1024px, when `itemCount > 0`, pin a bar above the bottom nav showing item count, total, and "View cart". It must not obscure the last card — add bottom padding to the scroll container equal to the bar's height.

- [ ] **Step 4: Implement the auth hop**

In `CartPanel`'s checkout handler:

```js
function onCheckout() {
  if (!auth.isAuthenticated.value) {
    cart.beginCheckout();   // persists synchronously before navigation
    auth.login();           // full page redirect — nothing after this runs
    return;
  }
  emit('checkout');
}
```

In `App.vue`'s auth watcher, after `fetchRole()` resolves:

```js
  if (cart.consumePendingCheckout()) {
    storefrontView.value = 'checkout';
  }
```

- [ ] **Step 5: Handle the abandoned login**

Also in `App.vue`, once Auth0 has finished loading and the user is **not** authenticated, call `cart.consumePendingCheckout()` and discard the result. This clears the stale flag while leaving the cart intact, so a user who backed out of Auth0 returns to the menu with their items.

- [ ] **Step 6: Verify the hop end to end**

In a private window, signed out:
1. Add three items.
2. Reload the page. Expected: cart still shows 3 (sessionStorage).
3. Open the cart, tap "Sign in to order".
4. Complete Auth0 sign-in.
5. Expected on return: **cart still holds all three items** and the checkout panel is open.

- [ ] **Step 7: Verify the abandoned login**

Sign out. Add two items. Tap "Sign in to order". On the Auth0 screen, press the browser back button.
Expected: back on the menu, cart still holds two items, and no checkout panel opens.

- [ ] **Step 8: Verify degraded storage**

In devtools, block site data, then add an item.
Expected: the cart works in memory; no console exception. The cart is lost on reload, which is the accepted degradation.

- [ ] **Step 9: Commit**

```bash
git add src/components/storefront/CartPanel.vue src/components/shell/StorefrontShell.vue src/App.vue
git commit -m "feat(storefront): cart panel and cart-preserving auth hop"
```

---

## Task 9: Checkout

Implements spec T8 (spec §6.1 #2, §6.3, §6.4). Retires the phone-number pre-step.

**Files:**
- Create: `src/components/storefront/CheckoutPanel.vue`

**Interfaces:**
- Consumes: `useCartStore`, `usePosStore.addOrder`, `useToast`, `UiField`, `UiButton`, `UiChip`.
- Produces: `CheckoutPanel` — props: none. Emits `placed(order)` and `back`.

- [ ] **Step 1: Reconcile the cart on entry**

In `onMounted`, refetch the menu and repair the cart before the user can submit:

```js
onMounted(async () => {
  await pos.loadPublic();
  const { removed } = cart.reconcileWithMenu(pos.state.menuItems);
  if (removed.length) {
    toast.error(`No longer available: ${removed.join(', ')}. We removed ${removed.length === 1 ? 'it' : 'them'} from your cart.`);
  }
  const me = await pos.fetchMe();
  if (me) {
    customerName.value = me.name || '';
    if (!cart.state.phone) cart.state.phone = me.phone || '';
  }
});
```

- [ ] **Step 2: Build the single-pass form**

Order: order type (two `UiChip`s, pickup / delivery) → phone `UiField` → delivery block when delivery → notes → submit.

**The phone field is an ordinary form field.** There is no separate Save button and no `PUT /api/customers/me` round-trip before ordering. The standalone amber "Add a phone number for delivery" card from `CustomerView` is not reproduced.

- [ ] **Step 3: Request location inline**

When the user selects delivery, call `navigator.geolocation.getCurrentPosition` immediately — do not wait for a separate button press. Show status inline: locating (spinner), captured (coordinates plus a "Use a different location" link), or denied. **On denial, reveal a free-text address field rather than blocking.** Never `alert()`.

- [ ] **Step 4: Validate inline, never with a dialog**

Submit is disabled while the cart is empty. On submit, set per-field `error` props on the relevant `UiField` and focus the first invalid control. Required: phone always; a location *or* a typed address when delivery.

- [ ] **Step 5: Submit per the spec contract**

Send exactly the fields listed in spec §6.4. Do not send a `total` — the server computes it. Set `paymentMethod: 'digital'`. Show the submit button's loading state while in flight. On failure, surface the real error text from the API via `toast.error`, not a generic message.

On success: `cart.clear()`, emit `placed`, and route to the tracker.

- [ ] **Step 6: Verify the fresh-signup path**

With a brand-new Auth0 account that has never ordered:
1. Browse as guest, add items, sign in at checkout.
2. Expected: checkout opens with the name prefilled from the token and an empty phone field.
3. Enter a phone, select delivery, allow location, submit.
4. Expected: **the order is placed with zero blocking dialogs anywhere in the path.**

- [ ] **Step 7: Verify the stale-cart repair**

Add an item to a guest cart. In another window as a manager, delete that menu item. Return and proceed to checkout.
Expected: a toast naming the removed item, that line gone from the cart, and the remaining order submits successfully. No failed submit.

- [ ] **Step 8: Verify the location denial fallback**

Select delivery and deny the browser location prompt.
Expected: an address text field appears and checkout is still completable. No alert.

- [ ] **Step 9: Commit**

```bash
git add src/components/storefront/CheckoutPanel.vue
git commit -m "feat(storefront): single-pass checkout with inline phone and location"
```

---

## Task 10: Order tracking and lazy map

Implements spec T9 (spec §6.1 #6, §5.5).

**Files:**
- Create: `src/components/storefront/OrderTracker.vue`, `DeliveryMap.vue`

**Interfaces:**
- Consumes: `usePosStore.state.orders`, `subscribeOrders`/`subscribeDelivery` from `src/lib/realtime.js`, `UiBadge`, `UiEmptyState`.
- Produces: `OrderTracker` — props: none. `DeliveryMap` — props: `orderId: number`, `customerLat: number|null`, `customerLng: number|null`.

- [ ] **Step 1: Build `OrderTracker.vue`**

List the signed-in customer's orders, newest first. **Do not build an order-number or phone lookup form** — `findOrder`, `trackOrderNumber` and `trackPhone` from `CustomerView` are deliberately cut per spec §6.1 #6.

Each order shows its number, a `UiBadge` for status, the item summary, the total, and the four-step timeline. Port `etaMap`, `timelineSteps`, `statusOrder`, `stepState` and `timelineLineWidth` from `CustomerView` unchanged. Subscribe via `subscribeOrders` and update in place. Empty state: "No orders yet" with a "Browse the menu" action.

- [ ] **Step 2: Build `DeliveryMap.vue` with a dynamic import**

Leaflet and its CSS must **not** be in the initial bundle:

```js
let L = null;

onMounted(async () => {
  const [leaflet] = await Promise.all([
    import('leaflet'),
    import('leaflet/dist/leaflet.css'),
  ]);
  L = leaflet.default;

  const [icon2x, icon, shadow] = await Promise.all([
    import('leaflet/dist/images/marker-icon-2x.png'),
    import('leaflet/dist/images/marker-icon.png'),
    import('leaflet/dist/images/marker-shadow.png'),
  ]);
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: icon.default,
    iconRetinaUrl: icon2x.default,
    shadowUrl: shadow.default,
  });

  initMap();
});
```

Port `initMap`, `placeCustomerMarker` and `geocodeAddress` from `CustomerView`. Render only when the order is a delivery and is `ready` or has a driver location — matching the existing `showMap` condition. Call `leafletMap.remove()` in `onUnmounted`.

- [ ] **Step 3: Verify Leaflet is out of the initial bundle**

Run: `npm run build`
Then: `grep -l "leaflet" dist/assets/*.js | head`
Expected: Leaflet appears only in a lazily-loaded chunk, never in the entry chunk. Confirm by loading the storefront with the Network tab open — no Leaflet request until a tracked delivery reaches `ready`.

- [ ] **Step 4: Verify live tracking still works**

Place a delivery order, advance it to `ready` from the Kitchen Display, and broadcast a driver position from the Driver Portal.
Expected: the map appears, the driver marker moves, the timeline advances.

- [ ] **Step 5: Confirm the lookup form is gone**

Run: `grep -rn "trackOrderNumber\|trackPhone\|findOrder" src/components/storefront/`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/storefront/OrderTracker.vue src/components/storefront/DeliveryMap.vue
git commit -m "feat(storefront): authenticated order tracking with lazily loaded map"
```

---

## Task 11: Retire `CustomerView.vue`

Implements spec T10.

**Files:**
- Delete: `src/components/CustomerView.vue`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: Tasks 7–10.
- Produces: nothing new.

- [ ] **Step 1: Diff old against new before deleting**

Read `CustomerView.vue` in full one last time. Build a checklist of every behavior it implements and tick off where each now lives across `MenuBrowser`, `ItemCustomizeSheet`, `CartPanel`, `CheckoutPanel`, `OrderTracker` and `DeliveryMap`.

The only permitted omission is the order-number/phone lookup form (spec §6.1 #6). **If you find any other behavior with no new home, stop and report it — do not delete the file.**

- [ ] **Step 2: Delete the file and update the view map**

```bash
git rm src/components/CustomerView.vue
```

Remove its import and its `viewMap` entry from `App.vue`. The `customer` view id now resolves to the storefront.

- [ ] **Step 3: Verify nothing references it**

Run: `grep -rn "CustomerView" src/`
Expected: no output.

- [ ] **Step 4: Verify the build and the admin path**

Run `npm run build` (expected: exits 0), then sign in as admin and open "Customer View".
Expected: the storefront renders with a working "Back to console" affordance.

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "refactor(storefront): retire CustomerView in favor of storefront components"
```

---

## Deferred: staff console token conversion

**Cut from this plan on 2026-09-23.** Originally Tasks 12–14, covering `POSTerminal`, `KitchenDisplay`, `Inventory`, `MenuManagement`, `LoyaltyManagement`, `UserManagement`, `DriverView` and `Dashboard`.

**Why it was cut:** the work was originally justified by dark mode — semantic tokens were a prerequisite for a second palette. With dark mode out of scope, the remaining case is visual consistency, which did not justify the largest mechanical item in the project.

**What that leaves in the codebase**, stated plainly so nobody discovers it by surprise:

- **~170 hardcoded palette literals remain** across seven staff views. They render `#2563eb` where the brand primary is `#3A8FBA`, plus off-brand greys and greens.
- **9 `alert()` calls and 4 `confirm()` calls remain** — 5 in `POSTerminal`, 1 each in `KitchenDisplay`, `Inventory`, `LoyaltyManagement`, `MenuManagement`; confirms in `Inventory:84`, `LoyaltyManagement:99`, `MenuManagement:126`, `UserManagement:88`. The storefront has none.
- **The staff console will visibly differ from the storefront.** Same app, two visual languages. This is the accepted cost.

**One piece survived the cut:** `MenuManagement.vue` still needs the image-URL and description fields from Task 6, or menu imagery can never be populated and every storefront card falls back to the gradient treatment forever. That moved into Task 6 as its own step rather than dying with this section.

**If this is revived**, the conversion mapping and procedure are preserved in Task 15, which applies them to `Analytics.vue`. The per-view counts are in spec §3.

---

## Task 15: Analytics chart tokens

Implements spec T14 (spec §8). Depends on Task 2 only — dispatch any time after it lands.

`Analytics.vue` is kept despite the staff console conversion being deferred, because it has an actual defect rather than just inconsistency: it hardcodes five chart.js color arrays that match neither the brand nor each other, while `--chart-1` through `--chart-5` sit unused in `theme.css`.

**Files:**
- Modify: `src/components/Analytics.vue`

**Interfaces:**
- Consumes: Task 1's `--chart-1` … `--chart-5`.
- Produces: nothing new.

- [ ] **Step 1: Read the chart palette from tokens at runtime**

Replace all five hardcoded arrays (around lines 143–178 as measured on 2026-09-23 — re-read, they will have moved):

```js
function chartPalette() {
  const styles = getComputedStyle(document.documentElement);
  return [1, 2, 3, 4, 5].map((n) => styles.getPropertyValue(`--chart-${n}`).trim());
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
```

Line `borderColor` uses `chartPalette()[0]`; its fill uses `withAlpha(chartPalette()[0], 0.2)`. Bar and doughnut datasets consume the palette in order.

- [ ] **Step 2: Pull chart chrome from tokens too**

Axis ticks, grid lines and legend labels are currently Chart.js defaults, which are a different grey from `--ink-muted`. Set ticks and legend to `--ink-muted` and the grid to `--line`, read the same way as the palette.

- [ ] **Step 3: Convert the remaining 17 literals**

| Literal | Replacement |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-gray-50`, `bg-gray-100` | `bg-surface-sunken` |
| `text-gray-900`, `text-gray-800` | `text-ink` |
| `text-gray-600`, `text-gray-500` | `text-ink-muted` |
| `text-gray-400` | `text-ink-subtle` |
| `border`, `border-gray-200`, `border-gray-300` | `border border-line` |
| `bg-blue-600`, `bg-blue-500` | `bg-primary` |
| `hover:bg-blue-700` | `hover:bg-primary-hover` |
| `text-blue-600` | `text-primary` |
| `text-white` on a primary surface | `text-primary-ink` |
| `bg-green-*`, `text-green-*` | `bg-positive` / `text-positive` |
| `bg-amber-*`, `bg-yellow-*`, `text-amber-*` | `bg-warning` / `text-warning` |
| `bg-red-*`, `text-red-*` | `bg-danger` / `text-danger` |
| `rounded`, `rounded-lg`, `rounded-xl` | `rounded-md` / `rounded-lg` / `rounded-xl` from the token scale |

For tinted backgrounds, use `color-mix(in srgb, var(--<token>) 14%, transparent)` rather than a lighter palette step.

This table is the reference for the deferred staff console conversion too — if that work is revived, it starts here.

- [ ] **Step 4: Verify the charts are on-brand**

Expected: series colors match the brand palette rather than Tailwind defaults; axes, grid and legend sit in the same grey as the surrounding UI; nothing renders in `#2563eb`.

- [ ] **Step 5: Verify zero literals remain**

```bash
grep -rnE "(bg|text|border)-(gray|blue|red|green|amber|yellow|slate|zinc|orange|purple|teal|indigo)-[0-9]{2,3}|#[0-9A-Fa-f]{6}" src/components/Analytics.vue
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/Analytics.vue
git commit -m "refactor(analytics): brand chart palette from design tokens"
```

---

## Final Verification

Run after every task has landed. This is spec §10.

- [ ] **Build:** `npm run build` exits 0.
- [ ] **Tests:** `npm test` passes.
- [ ] **In-scope literal sweep.** Scoped deliberately — the staff console conversion was cut, so a bare `src/` sweep would fail by design and stop being a useful signal:

```bash
grep -rnE "(bg|text|border|ring|from|to|via)-(gray|blue|red|green|amber|yellow|slate|zinc|orange|purple|teal|indigo)-[0-9]{2,3}"   src/styles/ src/components/ui/ src/components/shell/ src/components/storefront/   src/store/ src/App.vue src/components/Analytics.vue
```
Expected: no output.

- [ ] **Out-of-scope baseline, to confirm the cut did not drift.** The seven deferred staff views should be *unchanged*, not partially converted:

```bash
grep -rcE "(bg|text|border|ring|from|to|via)-(gray|blue|red|green|amber|yellow|slate|zinc|orange|purple|teal|indigo)-[0-9]{2,3}"   src/components/POSTerminal.vue src/components/KitchenDisplay.vue src/components/Inventory.vue   src/components/MenuManagement.vue src/components/LoyaltyManagement.vue   src/components/UserManagement.vue src/components/DriverView.vue
```
Expected: 26, 25, 19, 22, 11, 36, 31 — totalling 170. A *lower* number means a subagent converted a deferred file; a higher one means new literals were introduced. Both are defects.

- [ ] **In-scope blocking-dialog sweep:**

```bash
grep -rnE "alert\(|confirm\(" src/components/storefront/ src/components/ui/ src/App.vue
```
Expected: no output. The storefront was the source of 7 of the original 16 `alert()` calls; all die with `CustomerView`. The 9 alerts and 4 confirms in the deferred staff views remain by design.

- [ ] **Per-role smoke pass:** guest, customer, cashier, kitchen, driver, manager, admin — each lands on the right shell and default view, and every nav item renders without error.
- [ ] **Three breakpoints:** 375px, 768px, 1440px — no horizontal scroll, no clipped controls.
- [ ] **The guest path end to end:** browse → customize → cart → reload (cart survives) → sign in → return (cart survives) → checkout → order placed → tracked live.
- [ ] **Network check:** a logged-out visitor fires exactly one `/api/` request and no 401/403; the initial bundle contains no Leaflet.
- [ ] **Accessibility:** full keyboard path through checkout; focus trapped and restored in every modal; AA contrast on all body text; `prefers-reduced-motion` honored.
