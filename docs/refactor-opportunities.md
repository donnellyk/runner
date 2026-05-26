# Refactor Opportunities

Identified during a codebase-wide review on 2026-04-08. Each item includes scope (files affected, estimated LOC change), impact (correctness, maintainability, performance, security), and recommended priority.

Items are grouped by category and ordered by impact within each category.

---

## 1. Security & Correctness (do first)

### 1.1 Zone JSON saved without structural validation
**Severity:** High (security)

**Files:**
- `apps/web/src/routes/(protected)/(app)/settings/zones/+page.server.ts:38-43`

**Issue:** `JSON.parse(zonesJson)` is cast to `ZoneDefinition[]` without any structural validation. A malicious or buggy client could persist arbitrary JSON to the `user_zones.zones` JSONB column, which is then read back and rendered without further validation in `format.ts` and zone-display components.

**Scope:** ~20 LOC. Add a validation function (or Zod schema) that checks each entry has the expected fields (`index`, `name`, `color`, `min`, `max`) with correct types and ranges. Validate in the action before writing to the DB.

**Impact:**
- Eliminates a stored-XSS / data-corruption attack surface
- Catches client bugs at the boundary instead of in render
- Provides a typed error response for malformed input

---

### 1.2 `markPR` upsert TOCTOU race
**Severity:** Medium (correctness)

**Files:**
- `apps/web/src/routes/(protected)/(app)/activities/[id]/+page.server.ts:166-184`

**Issue:** `markPR` does a `select` to check for an existing row, then conditionally `insert` or `update`. Two concurrent requests for the same activity could both see no row and both attempt to insert, hitting the `idx_pr_user_activity` unique constraint and surfacing an unhandled error to the user.

**Scope:** ~10 LOC. Replace the select-then-insert with Drizzle's `onConflictDoUpdate` (the same pattern already used in `settings/zones/+page.server.ts`). No schema changes needed.

**Impact:**
- Eliminates the race condition
- Removes one round trip per `markPR` call
- Single statement is also easier to wrap in a transaction if needed later

---

### 1.3 `updateNote` skips validation that `createNote` enforces
**Severity:** Medium (correctness)

**Files:**
- `apps/web/src/routes/(protected)/(app)/activities/[id]/+page.server.ts:112-127`

**Issue:** `createNote` validates that `distanceEnd > distanceStart` and that distances don't exceed activity length (lines 75-81). `updateNote` does only partial parsing without those checks, and assigns into `Record<string, unknown>` which bypasses Drizzle's column types.

**Scope:** ~15 LOC. Extract a `validateNoteBounds(distStart, distEnd, activityDistance)` helper, call it from both actions, and type the `updates` object using Drizzle's inferred update type.

**Impact:**
- Prevents invalid notes from being persisted via the update path
- Restores type safety on the update set
- Establishes a reusable validation helper

---

### 1.4 Terminal layout POST has no length validation
**Severity:** Medium (security)

**Files:**
- `apps/web/src/routes/api/terminal-layouts/+server.ts:23-26`
- `apps/web/src/routes/api/terminal-layouts/[id]/+server.ts` (PUT — has validation, lines validated against 100/10000)

**Issue:** PUT validates `name.length <= 100` and `encoded.length <= 10000`. POST has no length limits at all. A user could create unbounded `name` or `encoded` payloads, eventually exhausting DB storage.

**Scope:** ~6 LOC. Add the same length checks to POST. Better: extract a shared `validateLayoutPayload(body)` function used by both handlers.

**Impact:** Closes a denial-of-service vector and harmonizes validation between create and update paths.

---

## 2. Architecture & DRY

### 2.1 Supplementary completion actions duplicated across two pages
**Severity:** High (maintainability)

**Files:**
- `apps/web/src/routes/(protected)/(app)/activities/+page.server.ts:48-67`
- `apps/web/src/routes/(protected)/(app)/plans/[id]/+page.server.ts:184-203`

**Issue:** `addCompletion` and `removeCompletion` form actions are character-for-character identical in both files (~50 lines duplicated). Any future change to either action must be made in two places.

**Scope:** ~50 LOC removed, ~30 LOC added. Create `apps/web/src/lib/server/actions/completion-actions.ts` exporting a `completionActions()` factory that returns the two action handlers. Both page servers spread it into their `actions` object:
```ts
export const actions: Actions = {
  ...completionActions(),
  // page-specific actions
};
```

**Impact:**
- Eliminates copy-paste drift risk
- Centralizes input validation and error handling for these actions
- Establishes a pattern for sharing form actions across pages

---

### 2.2 Supplementary completion UI duplicated across two components
**Severity:** High (maintainability)

**Files:**
- `apps/web/src/lib/components/CurrentWeekStrip.svelte:163-199`
- `apps/web/src/lib/components/WeekCalendar.svelte:276-312`

**Issue:** Nearly identical markup for the supplementary footer — completion counter, checkmark/empty buttons, `addCompletion`/`removeCompletion` form posts. ~35 lines duplicated per component.

**Scope:** ~70 LOC removed, ~50 LOC added. Extract a `SupplementaryFooter.svelte` component accepting `supplementary`, `completions`, `weekId` props. Render from both parent components.

**Impact:**
- Single source of truth for supplementary UI
- Future styling/UX changes only need one update
- Pairs well with #2.1 for a complete extraction

---

### 2.3 Workout types defined three times
**Severity:** High (type safety)

**Files:**
- `apps/web/src/lib/components/CurrentWeekStrip.svelte:11-48`
- `apps/web/src/lib/components/WorkoutDetail.svelte:14-53`
- `apps/web/src/lib/components/WeekCalendar.svelte:8-23`

**Issue:** `MatchedActivity`, `WorkoutMatch`, `Workout`, and `SupplementaryEntry` interfaces are defined independently with slight variations. `WeekCalendar` even has a runtime validator function `validMatchStatus()` to coerce strings into the union. The `MatchStatus` union (`'matched' | 'auto' | 'manual' | 'suggested' | 'close' | 'off' | 'upcoming' | 'skipped' | null`) appears in 3 files.

**Scope:** ~80 LOC removed, ~40 LOC added. Create `apps/web/src/lib/types/workout.ts` defining the canonical types. Components import from there. Use `Pick<>` or `Omit<>` for components that need a subset.

**Impact:**
- Adding a new field to `Workout` no longer requires editing 3 files
- Eliminates the runtime `validMatchStatus` cast helper
- TypeScript catches drift across components automatically

---

### 2.4 Date range filter logic duplicated across query files
**Severity:** Medium (maintainability)

**Files:**
- `apps/web/src/lib/server/queries/activity-list.ts:34-46`
- `apps/web/src/lib/server/queries/activity-detail.ts:73-85`

**Issue:** The `if (range === 'week') ... else if (range === 'month') ... else if (range === '90d')` block with identical date arithmetic appears in both `listActivities` and `searchActivities`. ~12 lines duplicated.

**Scope:** ~20 LOC removed, ~12 LOC added. Extract `dateRangeCondition(range: string): SQL | null` into `apps/web/src/lib/server/queries/filters.ts` (or inline into one of the existing query modules).

**Impact:** Adding a new range option (`'7d'`, `'30d'`, `'ytd'`) becomes a one-line change.

---

### 2.5 Centralize `formatTime` / `formatDuration` / `formatTtl`
**Severity:** Medium (maintainability)

**Files:**
- `apps/web/src/lib/ui-helpers.ts:18` — `formatTime` (no seconds)
- `apps/web/src/lib/format.ts:90` — `formatDuration` (with seconds)
- `apps/web/src/routes/(protected)/admin/strava/+page.svelte:34` — inline `formatTtl`

**Issue:** Three near-duplicate time formatters with subtle differences (with/without seconds, with/without "expired" handling). Two admin pages import `formatTime` from `ui-helpers`, the rest of the app uses `formatDuration` from `format.ts`.

**Scope:** ~30 LOC removed, ~15 LOC added. Add a `{ short?: boolean }` option to `formatDuration` to control whether seconds are shown. Delete `formatTime` from `ui-helpers.ts`. Convert `formatTtl` to wrap `formatDuration` and handle the "expired" edge case.

**Impact:**
- One canonical time formatter, two switches
- Removes confusion about which helper to import
- `format.ts` becomes the single home for all display formatting

---

### 2.6 Centralize date formatting
**Severity:** Medium (consistency)

**Files:** ~12 call sites across activity, plan, stats, and admin pages.

**Issue:** `toLocaleDateString` is called with at least 5 different option combinations (e.g. `{month: 'short', day: 'numeric', year: '2-digit'}`, `{weekday: 'short', month: 'short', day: 'numeric'}`). `format.ts` centralizes distance/pace formatting but has no date helpers, so date format conventions drift across pages.

**Scope:** ~15 LOC added. Add `formatDateShort()`, `formatDateFull()`, `formatDateWithWeekday()` to `apps/web/src/lib/format.ts`. Replace inline `toLocaleDateString` calls.

**Impact:** Switching to a different display locale or format style becomes a one-line change.

---

### 2.7 `RACE_DISTANCE_PRESETS` computed twice
**Severity:** Low (cleanup)

**Files:**
- `apps/web/src/lib/server/queries/activity-list.ts:9` (exported)
- `apps/web/src/lib/server/queries/activity-detail.ts:7` (private const, identical)

**Scope:** 3 LOC removed. Delete the local copy in `activity-detail.ts` and import from `activity-list.ts`.

---

### 2.8 `selectDistinct({ sportType })` query repeated
**Severity:** Low (cleanup)

**Files:**
- `apps/web/src/lib/server/queries/activity-list.ts:118`
- `apps/web/src/routes/(protected)/(app)/stats/+page.server.ts:16`
- `apps/web/src/routes/(protected)/admin/activities/+page.server.ts:54`

**Scope:** ~15 LOC removed, ~8 LOC added. Extract `getUserSportTypes(userId?: number)` to the query layer.

---

### 2.9 `data.user.distanceUnit as Units` cast in 7 pages
**Severity:** Low (type hygiene)

**Files:** `activities/+page.svelte`, `activities/[id]/+page.svelte`, `stats/+page.svelte`, `admin/activities/+page.svelte`, `admin/activities/[id]/+page.svelte`, `settings/zones/+page.svelte`, `terminal/layout/[[hash]]/+page.svelte`.

**Issue:** Each page does `const units = $derived(data.user.distanceUnit as Units)`. The cast exists because the DB column is typed as `string`.

**Scope:** ~7 LOC removed, ~3 LOC added. In `packages/db/src/schema/users.ts`, type `distanceUnit` as `'metric' | 'imperial'` (Drizzle supports `$type<Units>()` on text columns). All 7 casts become unnecessary.

**Impact:** Catches invalid `distanceUnit` values at the type level instead of trusting runtime data.

---

## 3. SvelteKit Best Practices

### 3.1 Admin POST forms missing `use:enhance`
**Severity:** Medium (UX)

**Files:**
- `apps/web/src/routes/(protected)/admin/queues/+page.svelte:33,56,74,80,134` (5 forms)
- `apps/web/src/routes/(protected)/admin/users/+page.svelte:28` (toggleAdmin)
- `apps/web/src/routes/(protected)/admin/activities/+page.svelte:108` (re-queue)

**Issue:** 7 admin POST forms submit without `use:enhance`, causing a full page reload on every action. This is jarring UX and loses scroll position.

**Scope:** ~14 LOC. Add `use:enhance` to each form.

**Impact:** Smoother admin UX, no full page navigations on routine actions.

---

### 3.2 Programmatic form submission in `WeekCalendar`
**Severity:** Medium (architecture)

**Files:**
- `apps/web/src/lib/components/WeekCalendar.svelte:140-155`

**Issue:** `submitForm()` creates a `<form>` via `document.createElement`, appends it to `document.body`, and calls `.requestSubmit()`. This bypasses `use:enhance` entirely, causing full page reloads on every workout drag-and-drop operation.

**Scope:** ~30 LOC. Either (a) refactor to use `fetch('?/swapWorkouts', { method: 'POST', body: formData })` directly with `invalidateAll()`, or (b) render a hidden form in the template with `use:enhance` and trigger it programmatically.

**Impact:** Drag-and-drop becomes seamless instead of triggering a navigation.

---

### 3.3 Admin table rows missing keyboard accessibility
**Severity:** Medium (a11y)

**Files:**
- `apps/web/src/routes/(protected)/admin/activities/+page.svelte:92`
- `apps/web/src/routes/(protected)/admin/users/+page.svelte:24`
- `apps/web/src/routes/(protected)/admin/users/[id]/+page.svelte:79`

**Issue:** `<tr>` elements have `onclick` handlers but no `role="button"`, `tabindex="0"`, or `onkeydown`. Compare to `activities/+page.svelte:291-299` which does it correctly. Keyboard users can't navigate these tables.

**Scope:** ~12 LOC. Add the missing attributes to each row.

---

### 3.4 Stats page dead conditional
**Severity:** Low (cleanup)

**Files:**
- `apps/web/src/routes/(protected)/(app)/stats/+page.svelte:117`

**Issue:** `label: m === "total" ? "Total Elevation" : "Total Elevation"` — both branches return the same string.

**Scope:** 1 LOC. Replace with the literal.

---

### 3.5 `selectedDistance` missing `svelte-ignore`
**Severity:** Low (consistency)

**Files:**
- `apps/web/src/routes/(protected)/(app)/activities/[id]/+page.svelte:32`

**Issue:** `let selectedDistance = $state(data.suggestedDistance ?? RACE_DISTANCES[0].label)` reads `data` in a `$state()` initializer. CLAUDE.md documents this pattern and requires `// svelte-ignore state_referenced_locally`.

**Scope:** 1 LOC.

---

## 4. Server / Query Layer

### 4.1 N+1 on supplementary completions
**Severity:** Medium (performance)

**Files:**
- `apps/web/src/routes/(protected)/(app)/plans/[id]/+page.server.ts:61-63`
- `apps/web/src/lib/server/queries/plan-queries.ts:476-483` (`getSupplementaryCompletions`)

**Issue:** `Promise.all(weekIds.map(wid => getSupplementaryCompletions(wid)))` fires one query per week. For an 18-week Pfitz plan, that's 18 round trips per page load.

**Scope:** ~15 LOC. Modify `getSupplementaryCompletions` to accept `weekIds: number[]` and use `inArray()`. Group results in app code.

**Impact:** Plan detail page goes from 18+ queries to 1 for completions. Becomes especially relevant for the active plan strip on the activities list.

---

### 4.2 Note CRUD inline in route handler
**Severity:** Medium (architecture)

**Files:**
- `apps/web/src/routes/(protected)/(app)/activities/[id]/+page.server.ts:42-201`

**Issue:** All note CRUD operations and PR mutations live as raw `getDb()` calls in the route handler instead of in the query layer. The local `verifyActivityOwnership` function duplicates the ownership-check pattern that should be a query helper.

**Scope:** ~150 LOC moved. Create `apps/web/src/lib/server/queries/note-queries.ts` (`createNote`, `updateNote`, `deleteNote`, all enforcing `userId` ownership). Move PR functions into `pr-queries.ts` (`markPR`, `removePR`). Route handler becomes thin orchestration.

**Impact:**
- Note logic becomes testable independently of HTTP
- Ownership checks centralized
- Sets up the pattern for note management from other places (e.g. importer, API)

---

### 4.3 Stats aggregation query inline in load function
**Severity:** Medium (architecture)

**Files:**
- `apps/web/src/routes/(protected)/(app)/stats/+page.server.ts:16-74`

**Issue:** A 60-line raw SQL query with percentiles, filtered aggregates, and grouping is inline in the page load. Hard to test, hard to reuse if other pages need the same shape.

**Scope:** ~80 LOC moved. Create `apps/web/src/lib/server/queries/stats-queries.ts` exporting `getActivityStatsByPeriod(userId, sport, period)`. Add the `numify` helper there too.

**Impact:** The page load becomes a one-line call. The query function gains a single test suite. New stats consumers (admin dashboards, export jobs) can reuse it.

---

### 4.4 `getSupplementaryCompletions` lacks ownership check
**Severity:** Low (defensive)

**Files:**
- `apps/web/src/lib/server/queries/plan-queries.ts:476-483`

**Issue:** Function accepts a `weekId` and queries without verifying the week belongs to the calling user. Currently safe because all callers verify ownership first via `getInstance`, but a future caller could leak data by skipping that check.

**Scope:** ~10 LOC. Add a `userId` parameter and join through `planWeeks` → `planInstances` to enforce ownership in the query itself.

---

## 5. Component Quality

### 5.1 `TerminalLineChart.svelte` is 930 lines
**Severity:** High (file size)

**Files:**
- `apps/web/src/lib/terminal/charts/TerminalLineChart.svelte`

**Issue:** Approaching the 1000 LOC limit defined in CLAUDE.md. Already has shared logic extracted, but the remaining template is large.

**Scope:** ~300 LOC moved. Extract sub-components for: axis rendering (`ChartAxes.svelte`), tooltip overlay (`ChartTooltip.svelte`), zone dot grid (`ZoneDots.svelte`), and zoom/pan interaction layer. Each becomes ~100 lines.

**Impact:** Stays under the size limit, makes individual layers easier to modify, opens the door to reusing axes/tooltip in other terminal charts.

---

### 5.2 `plan-queries.ts` is 688 lines
**Severity:** Medium (file size)

**Files:**
- `apps/web/src/lib/server/queries/plan-queries.ts`

**Scope:** Split into 3 modules:
- `plan-template-queries.ts` — template CRUD
- `plan-instance-queries.ts` — instance CRUD, current week, mark complete
- `plan-workout-queries.ts` — workout matching, swap, manual match, candidate listing

Re-export from a barrel `plan-queries.ts` for backward compatibility during the migration.

**Impact:** Each file becomes <300 lines, easier to navigate and test.

---

### 5.3 Pfitz pace calculator embedded in page component
**Severity:** Medium (separation of concerns)

**Files:**
- `apps/web/src/routes/(protected)/(app)/plans/start/[id]/+page.svelte:83-201`

**Issue:** ~120 lines of pure pace-calculation business logic (race time parsing, equivalence ratios, pace table generation) live in a Svelte page component. Untestable in isolation.

**Scope:** ~120 LOC moved. Extract to `apps/web/src/lib/pfitz-calculator.ts` with pure functions. Add unit tests. Page imports and calls.

**Impact:** Pace logic becomes testable, reusable for any future plan that uses Pfitz formulas, and the page shrinks to ~360 lines of mostly markup.

---

### 5.4 PRCard animation utilities
**Severity:** Low (reusability)

**Files:**
- `apps/web/src/lib/components/PRCard.svelte:42-112` (`animateValue`, `easeOutCubic`, `easeInCubic`, `playGlowAnimation`)

**Issue:** `animateValue` and the easing functions are generic — they don't reference anything PR-specific. If another component wants the same animation primitives, they'd have to be copy-pasted.

**Scope:** ~70 LOC moved. Extract to `apps/web/src/lib/animation.ts`.

---

### 5.5 Stats page hand-rolled SVG chart
**Severity:** Medium (DRY)

**Files:**
- `apps/web/src/routes/(protected)/(app)/stats/+page.svelte:303-458`
- `apps/web/src/lib/components/ActivityChart.svelte` (related)
- `apps/web/src/lib/components/SparkLine.svelte` (related)

**Issue:** ~155 lines of inline SVG with grid lines, polylines, hover tooltips, and axis labels. Significant overlap with `ActivityChart.svelte`'s rendering primitives.

**Scope:** ~155 LOC moved/refactored. Create a `TimeSeriesChart.svelte` component that handles the shared SVG scaffolding. Stats page passes data and formatters as props.

**Impact:** Removes ~150 lines of duplication. Adding a new stats chart type becomes trivial.

---

### 5.6 Inconsistent form error display
**Severity:** Low (consistency)

**Files:** ~8 pages with form actions; 4 different error display patterns (single string, array, no display, mixed).

**Scope:** ~50 LOC removed, ~30 LOC added. Create `apps/web/src/lib/components/FormAlert.svelte` accepting `{ error?: string; errors?: string[]; success?: string }` props with consistent styling.

**Impact:** All form pages share the same error UX. Adding new alert variants (warning, info) becomes a one-line change.

---

## 6. Package Boundaries

### 6.1 `packages/strava` depends on `packages/db`
**Severity:** Medium (coupling)

**Files:**
- `packages/strava/src/tokens.ts:2-3`

**Issue:** `getValidToken()` reads/writes the `oauth_accounts` table directly, hardcoding a DB dependency into what should be a pure API client. Means `packages/strava` cannot be used in isolation (e.g., scripts, tests, alternate storage backends).

**Scope:** ~40 LOC refactored. Apply dependency inversion: change `getValidToken()` to accept a `TokenStore` interface (`{ get(userId), save(userId, tokens) }`). Move the DB-backed implementation to `apps/web/src/lib/server/strava-token-store.ts`. The strava package becomes pure.

**Impact:**
- `packages/strava` becomes a clean API client
- Easier to test (can pass an in-memory token store)
- Removes a circular-feeling dependency from the graph
- Largest structural change in this list — schedule alongside other strava work

---

### 6.2 `packages/db` imports `@web-runner/shared` without declaring it
**Severity:** Medium (correctness)

**Files:**
- `packages/db/package.json` — missing `@web-runner/shared` in `dependencies`
- `packages/db/src/schema/user-zones.ts:3` — imports `ZoneDefinition`

**Issue:** Works due to pnpm hoisting but is an implicit dependency. Stricter resolution modes or workspace topology changes would break the build.

**Scope:** 1 LOC. Add `"@web-runner/shared": "workspace:*"` to `packages/db/package.json`.

---

### 6.3 `StravaAthlete` type and direct fetch in OAuth callback
**Severity:** Medium (architecture)

**Files:**
- `apps/web/src/routes/auth/strava/callback/+server.ts:14` (inline type)
- `apps/web/src/routes/auth/strava/callback/+server.ts:42` (raw fetch)

**Issue:** A Strava API response type is defined inline in a route handler, and a raw `fetch('https://www.strava.com/api/v3/athlete', ...)` bypasses `StravaClient`.

**Scope:** ~20 LOC. Move `StravaAthlete` to `packages/strava/src/types.ts`. Add a `getAthlete()` method to `StravaClient`. Replace the raw fetch with `client.getAthlete()`.

**Impact:** Strava API access is uniformly routed through `StravaClient`, which already handles rate limiting and error mapping.

---

### 6.4 `parseStravaTimezone` in wrong package
**Severity:** Low (cleanup)

**Files:**
- `apps/web/src/lib/server/strava-utils.ts`

**Issue:** Strava-specific parser for `"(GMT-08:00) America/Los_Angeles"` format lives in `apps/web` but is Strava domain logic.

**Scope:** ~15 LOC moved. Move to `packages/strava/src/timezone.ts`. Update the OAuth callback import.

---

### 6.5 `WebhookEvent` type defined three times
**Severity:** Low (type drift)

**Files:**
- `packages/strava/src/types.ts:75` (`WebhookEvent`, never imported)
- `packages/shared/src/queue.ts:26` (`WebhookEventJobData.event` inline shape)
- `apps/web/src/routes/api/webhooks/strava/+server.ts:22` (`validateWebhookEvent` type guard)

**Scope:** ~20 LOC removed. Have `WebhookEventJobData.event` reference `WebhookEvent` from `@web-runner/strava`. Update the type guard to validate against the canonical type.

---

### 6.6 Redis URL parsing duplicated
**Severity:** Low (cleanup)

**Files:**
- `apps/web/src/lib/server/queue.ts:4-13`
- `apps/worker/src/index.ts:15-24`

**Scope:** ~20 LOC removed, ~10 LOC added. Extract `parseRedisUrl(url)` to `packages/shared/src/redis.ts`. Both apps import.

**Impact:** Future Redis URL handling changes (TLS, sentinel, replicas) only need to be made once.

---

## Recommended Sequencing

### Wave 1 — Security & quick wins (≤1 day)
1. **1.1** Zone JSON validation (security)
2. **1.2** `markPR` `onConflictDoUpdate` (race fix)
3. **1.4** Terminal layout POST validation
4. **2.7** Delete duplicate `RACE_DISTANCE_PRESETS`
5. **3.4** Stats page dead conditional
6. **3.5** `selectedDistance` svelte-ignore
7. **6.2** `packages/db` missing dependency
8. **2.9** Type `distanceUnit` as `Units` in schema

### Wave 2 — High-impact DRY (2-3 days)
9. **2.1 + 2.2** Extract supplementary completion actions and `SupplementaryFooter.svelte` (do together)
10. **2.3** Extract `$lib/types/workout.ts`
11. **1.3** `updateNote` validation + types
12. **3.1** Add `use:enhance` to admin POST forms
13. **3.3** Admin table row keyboard accessibility

### Wave 3 — Architecture & file sizes (3-5 days)
14. **5.1** Split `TerminalLineChart.svelte`
15. **5.2** Split `plan-queries.ts`
16. **4.2** Extract note CRUD to query layer
17. **4.3** Extract stats aggregation to query layer
18. **5.3** Extract Pfitz calculator
19. **3.2** Refactor `WeekCalendar` drag-drop to use `use:enhance`
20. **4.1** Batch supplementary completion queries

### Wave 4 — Polish (1-2 days)
21. **2.4** Date range filter helper
22. **2.5** Centralize time formatting
23. **2.6** Add date formatters to `format.ts`
24. **2.8** `getUserSportTypes` helper
25. **5.4** Extract animation utilities
26. **5.5** `TimeSeriesChart.svelte` component
27. **5.6** `FormAlert.svelte`

### Wave 5 — Package hygiene (1 day)
28. **6.3** Move `StravaAthlete` + add `getAthlete()`
29. **6.4** Move `parseStravaTimezone`
30. **6.5** Unify `WebhookEvent` type
31. **6.6** Extract Redis URL parsing
32. **6.1** Decouple `packages/strava` from `packages/db` (largest, schedule carefully)

---

## Total Estimated Impact

- **~600 lines of duplicated/dead code removed**
- **~200 lines of new shared utilities added**
- **2 race conditions fixed**
- **1 unbounded validation gap closed**
- **2 large files split into smaller modules**
- **3 N+1 / inefficient query patterns fixed**
- **All admin forms gain progressive enhancement**
- **Type drift eliminated across 3 component sets and 2 package boundaries**
