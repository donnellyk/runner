# Training Plans

## Overview

Users can define, import, and follow structured training plans anchored to a target race date. Plans are user-specific — there is no global plan library.

The system separates **plan templates** (the YAML definition of weeks and workouts) from **plan instances** (a specific execution of a template anchored to a race date). Users upload templates to a library, then "start" a template to create an instance with concrete dates and effort mappings.

## Design Decisions

| Question | Decision |
|----------|----------|
| Plan storage | Normalized tables; template vs instance separation with copy-on-start |
| YAML import format | Custom schema — no universal standard exists |
| Validation | Manual validation matching existing codebase patterns (no Zod) |
| Effort zones | Custom slug-to-pace mappings defined per plan instance |
| Week start day | Monday (standard in running) |
| Week numbering | Countdown to race week: race week = 0, earlier weeks count up (e.g. 17, 16, ... 1, 0) |
| Day-of-week | ISO 8601: 1=Mon, 7=Sun; YAML accepts both names (`tue`) and numbers (`2`) |
| Workouts per day | One primary run per day; cross-training can stack |
| Activity matching | Distance + date heuristic, auto-match within 20% tolerance, manual override |
| Active plans | One active plan instance per user at a time |
| Missed workouts | Mark as skipped, never auto-reschedule |
| Taper protection | Taper/race weeks are never compressed or rescheduled |
| Drag-and-drop | Within a week only (no cross-week moves) |

## Plan Definition (YAML)

Plans are defined in YAML and uploaded as templates. The YAML defines the structure — weeks, workouts, distances, efforts — but not race-specific details like race date or effort paces. Those are configured when starting a plan instance.

### Structure

- A plan is a list of **weeks**, each with an explicit `week` number counting down to race week (0 = race week)
- Each week has a **phase** label (base, build, peak, taper, race)
- Each week contains a list of **workouts**
- Each workout has a **day assignment** (1-7 ISO or name) that can be reordered via drag and drop

### Workout Format

Workouts are defined simply — a top-level distance and effort, with optional **targets** for specific sub-sections. There is no need to define the entire workout as a series of segments.

#### Simple workout:
```yaml
- day: 2  # Tuesday
  name: "Recovery"
  distance: 5mi
  effort: easy
```

#### Workout with a target:
```yaml
- day: thu
  name: "LT Run"
  distance: 8-9mi
  targets:
    - duration: 20-30min
      effort: lt
```

#### Structured intervals with warmup, cooldown, and recovery:
```yaml
- day: 3  # Wednesday
  name: "VO2max Intervals"
  distance: 8mi
  targets:
    - type: warmup
      duration: 15min
      effort: easy
    - type: interval
      repeat: 6
      distance: 800m
      effort: vo2max
      recovery_distance: 400m
    - type: cooldown
      duration: 10min
      effort: easy
```

### Full Plan Example

```yaml
name: "Pfitz 18/55"
race_distance: marathon
sport_type: run

weeks:
  - week: 17
    phase: base
    workouts:
      - day: 1
        name: "Recovery"
        distance: 5mi
        effort: easy
      - day: 3
        name: "LT Run"
        distance: 9mi
        targets:
          - duration: 20min
            effort: lt
      - day: 6
        name: "Long Run"
        distance: 14mi
        effort: ga

  - week: 10
    phase: build
    workouts:
      - day: 2
        name: "VO2max Intervals"
        distance: 8mi
        targets:
          - type: warmup
            duration: 15min
            effort: easy
          - type: interval
            repeat: 6
            distance: 800m
            effort: vo2max
            recovery_distance: 400m
          - type: cooldown
            duration: 10min
            effort: easy
      - day: 4
        name: "Race Pace"
        distance: 14mi
        effort: marathon
      - day: 6
        name: "Long Run"
        distance: 20mi

  - week: 2
    phase: taper
    workouts:
      - day: 2
        name: "Easy"
        distance: 6mi
        effort: easy
      - day: 4
        name: "Easy"
        distance: 5mi
        effort: easy
      - day: 6
        name: "Shakeout"
        distance: 4mi
        effort: easy

  - week: 0
    phase: race
    workouts:
      - day: 7
        name: "Race Day"
        category: race
        distance: marathon
```

### Distance Shorthand

Distances must include an explicit unit suffix — bare numbers are rejected to avoid ambiguity:
- `8km`, `5mi` — with unit suffix
- `800m` — meters
- `marathon`, `half_marathon`, `10k`, `5k` — named distances (mapped via `DISTANCE_ALIASES` in `plan-types.ts`)
- `8-9mi` — range (stored as min/max, both converted to meters)

### Duration Shorthand

`15min`, `90sec`, `20-30min` (range)

### Day Values

Both formats accepted, normalized to internal 0-6 (0=Mon):
- **Names**: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`
- **ISO numbers**: `1`=Mon, `2`=Tue, ... `7`=Sun

### Import Validation

- Each week must have an explicit `week` number (>= 0)
- Week 0 must exist (race week)
- Each week must have at least one workout
- Workout categories must be recognized
- Distances and durations must be positive with explicit units
- Day values must be valid (1-7 or recognized name)
- Effort slugs are not validated at upload time (they're mapped when starting an instance)

## Effort Zones

Effort references in plan YAMLs use free-form slug strings (e.g. `easy`, `ga`, `lt`, `marathon`, `vo2max`). These slugs are **not tied to the existing 5-zone system**. Instead, each plan instance defines its own slug-to-pace mapping when the user starts the plan.

### Effort Map (per plan instance)

When starting a plan, the user configures an effort map — a set of slug-to-pace/HR pairings:

```
easy       → 9:00-10:00 /mi
ga         → 8:00-8:30 /mi
lt         → 6:40-7:00 /mi
marathon   → 7:15-7:25 /mi
vo2max     → 5:40-6:00 /mi
```

This is stored as a JSONB field on the plan instance. The system extracts all unique effort slugs from the template's YAML and presents them to the user during the "start plan" flow for mapping.

Effort maps can be updated mid-cycle as fitness changes. The plan YAML references slugs, not explicit paces, keeping templates portable and targets personal.

All effort slugs used in the template must be mapped before a plan can be started. The "Start" button is disabled until every slug has a pace range.

### Zone Copy Helper

The start-plan effort mapping UI includes a "Copy from my zones" button. It looks up the user's existing `user_zones` pace zones and pre-fills effort slug fields by matching the zone `name` field case-insensitively (e.g., slug `easy` matches zone name "Easy", slug `vo2max` matches "VO2max"). Slugs that don't match any zone name (e.g. `marathon`) stay empty for manual entry. Frontend-only convenience — no schema changes. Note: the existing zone system uses `index` (1-5) and `name` (display string) — there is no `slug` field on `ZoneDefinition`.

### Plan Zones in Terminal

When viewing an activity matched to a plan workout, the terminal charts can display the plan instance's effort zones as zone bands. A "Plan zones" toggle in the terminal display controls (alongside the existing "Zones" toggle) enables this. When active, it loads the matched workout's instance `effortMap` and renders the effort targets as zone bands on pace/HR charts.

This requires the terminal page load to check for a plan workout match and load the instance's `effortMap` when the toggle is available. Added to Phase 5e (Polish).

## Data Model

### New Tables

#### `plan_templates`

The uploaded plan definition. Immutable after upload (source of truth is the YAML).

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| userId | int FK → users | cascade delete |
| name | text | from YAML `name` field |
| sportType | text | default `'run'` |
| raceDistance | double precision | meters, nullable (from YAML `race_distance`) |
| weekCount | int | number of weeks in the plan |
| sourceYaml | text | original YAML |
| createdAt | timestamptz | |

Indexes: `(userId)`.

#### `plan_instances`

A started execution of a template, anchored to a race date.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| userId | int FK → users | cascade delete |
| templateId | int FK → plan_templates | set null on delete |
| name | text | copied from template, user-editable |
| sportType | text | copied from template |
| raceDistance | double precision | meters, nullable |
| raceDate | timestamp(tz) | anchor point |
| startDate | timestamp(tz) | computed: Monday of (raceDate - weekCount * 7) |
| status | text | `active`, `completed`, `archived` |
| effortMap | jsonb | slug → { paceMin, paceMax, hrMin?, hrMax? } |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

Indexes: `(userId)`, partial unique `(userId) WHERE status = 'active'`.

The partial unique index enforces one active instance per user at the database level.

#### `plan_weeks`

Concrete weeks for a plan instance (created by copying from parsed template).

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| instanceId | int FK → plan_instances | cascade delete |
| weekNumber | int | countdown: 0 = race week, higher = earlier |
| phase | text | `base`, `build`, `peak`, `taper`, `race` |
| description | text | nullable |
| startDate | timestamp(tz) | Monday of this week |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

Indexes: `(instanceId, weekNumber)` unique, `(instanceId, startDate)`.

#### `plan_workouts`

Concrete workouts for a plan instance (created by copying from parsed template).

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| weekId | int FK → plan_weeks | cascade delete |
| dayOfWeek | int | 0=Mon ... 6=Sun |
| sortOrder | int | ordering within a day |
| category | text | plan workout category (see below), distinct from Strava's workoutType |
| name | text | display name |
| description | text | nullable, free text instructions |
| targetDistanceMin | double precision | meters, nullable |
| targetDistanceMax | double precision | meters, nullable (same as min if exact) |
| targetDurationMin | int | seconds, nullable |
| targetDurationMax | int | seconds, nullable |
| effort | text | nullable, slug reference into instance's effortMap |
| targets | jsonb | nullable, structured target/interval data |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

Index: `(weekId, dayOfWeek, sortOrder)`.

#### `plan_workout_matches`

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| workoutId | int FK → plan_workouts | cascade delete, unique |
| activityId | int FK → activities | cascade delete |
| matchType | text | `auto`, `manual` |
| confidence | double precision | 0-1, for auto matches |
| createdAt | timestamptz | |

Index: `(activityId)`. The unique constraint on `workoutId` is implicit from the column definition.

### Workout Categories

Plan workout categories (distinct from Strava's `workoutType` field which is `default`/`race`/`long_run`/`workout`):

`easy`, `long_run`, `tempo`, `intervals`, `recovery`, `hills`, `fartlek`, `progression`, `race_pace`, `cross_training`, `rest`, `race`

Matching does not use category — it matches on date and distance only. Category is for display and future scoring.

### Targets JSONB Schema

```typescript
interface TargetStep {
  type?: 'warmup' | 'cooldown' | 'interval';  // step classification
  repeat?: number;              // for intervals
  distanceMin?: number;         // meters
  distanceMax?: number;         // meters (same as min if exact)
  durationMin?: number;         // seconds
  durationMax?: number;         // seconds (same as min if exact)
  effort?: string;              // slug reference into instance's effortMap
  description?: string;
  recoveryDistance?: number;     // meters, for intervals
  recoveryDuration?: number;    // seconds, for intervals
}
```

Example for "15min warmup, 6x800m at VO2max pace with 400m jog recovery, 10min cooldown":
```json
[
  { "type": "warmup", "durationMin": 900, "durationMax": 900, "effort": "easy" },
  {
    "type": "interval",
    "repeat": 6,
    "distanceMin": 800,
    "distanceMax": 800,
    "effort": "vo2max",
    "recoveryDistance": 400
  },
  { "type": "cooldown", "durationMin": 600, "durationMax": 600, "effort": "easy" }
]
```

## Race Day Anchoring

- Weeks count down to race week (week 0)
- User sets a race date when starting a plan instance
- `startDate` = the Monday that is `max(weekNumber) * 7` days before the Monday of race week
- Each week's `startDate` = instance startDate + (max(weekNumber) - weekNumber) * 7
- If the calculated start date is in the past, warn the user and allow jumping in mid-cycle
- Earlier weeks are created but workouts show as past/skipped

## Active Plan Lifecycle

- **One active plan instance at a time** per user (enforced by partial unique index)
- While active, the weekly view highlights the current week based on today's date
- After race day passes, the instance auto-completes (checked on page load)
- Completed/archived instances remain viewable for historical reference
- Starting a new instance archives the previous active one

## Activity Matching

### Automatic Matching

When a new Strava activity arrives via webhook:

1. Find the user's active plan instance
2. Find unmatched workouts for the activity's date (map startDate to the week and dayOfWeek)
3. Filter to matching sport type (runs only for run plans)
4. Score by distance proximity:
   - Compute ratio: `activity.distance / workout.targetDistanceMin`
   - **Auto-match** (ratio 0.80-1.20): confidence = `1 - |1 - ratio|`
   - **Suggest** (ratio 0.65-0.80 or 1.20-1.35): low confidence, surface for user confirmation
   - **No match**: ratio outside 0.65-1.35
5. If multiple activities on the same day, match the closest by distance
6. Store in `plan_workout_matches`

### Manual Matching

Users can:
- Link any activity to any unmatched workout
- Unlink an existing match
- Override an auto-match

### Match Triggers

1. **Activity sync completion**: After activity streams are imported (in `activity-streams.ts`), enqueue a `plan-match` job on the plan queue. Also trigger after bulk import completes for each activity. Only match activities with `syncStatus = 'complete'`.
2. **Backfill on plan start**: Enqueued as a background `plan-backfill-matches` job on the plan queue. Retroactively matches existing activities (where `syncStatus = 'complete'`) to plan workouts for weeks that are already in the past. Iterates week by week, querying activities only on days that have workouts.
3. **On-demand "Re-match"**: Button on plan page triggers a form action that enqueues a `plan-backfill-matches` job. Same backfill logic — useful after manual unlinks or if matching logic improves.

Plan matching jobs run on a **separate BullMQ queue** (`plan` queue), following the pattern established by the bulk-import feature. This prevents plan matching from blocking webhook processing or activity imports on the main `strava` queue.

## UI

### Plans Page (`/plans`)

Two sections:

**My Templates** — uploaded plan templates with name, sport, week count, race distance. Actions: upload new, delete.

**Active / Past Plans** — plan instances with name, race date, status badge, progress (week X of Y). Actions: start from template, archive, delete.

### Template Upload Page (`/plans/upload`)

1. YAML text area (paste or upload file)
2. Preview of parsed weeks and workouts
3. Validation errors inline
4. "Upload" button saves as template

### Start Plan Flow

From a template, user clicks "Start":
1. Race date picker
2. Effort mapping — system extracts all unique effort slugs from the template and presents input fields for each (pace range, optional HR range)
3. Preview of computed week dates
4. "Start" button creates instance with copied week/workout data

### Plan Instance Detail Page (`/plans/[id]`)

Weekly calendar view — one row per week, 7 columns (Mon-Sun).

**Current week** renders at full height with full workout details. **Past and future weeks** render as compact rows (workout names and match indicators only). Show 2 past + 2 future weeks by default, with expand controls to view all.

Each cell shows a `WorkoutCard`:
- Colored badge by workout category
- Target distance
- Match status indicator:
  - Green: matched, distance within 20%
  - Yellow: matched, distance 20-35% off
  - Red: matched, distance >35% off
  - Empty: upcoming or skipped
- Click to expand detail panel

Past weeks with unmatched workouts show as muted/skipped.

#### Drag and Drop

- Workouts can be dragged to different days within the same week
- Uses pointer capture pattern (same as terminal grid panels)
- Updates `dayOfWeek` via form action; sets `sortOrder` to `max(sortOrder) + 1` for the target day
- Cannot drag across weeks
- Gaps in `sortOrder` are fine — it is only used for ordering, not identity

#### Workout Detail Panel

Shows on workout click:
- Full description and targets
- Interval structure (if any)
- Matched activity comparison (planned vs actual distance, pace, HR)
- Link/unlink activity controls

### Current Week on Activities Page

When the user has an active plan instance, show the current week's workouts on the Activities page between the mileage stats and the filter bar. Reuses `WorkoutCard` in a Mon-Sun row. Only renders when an active instance exists.

### Navigation

Add "Plans" to the top nav in `(app)/+layout.svelte`, between "Statistics" and "Settings" (current nav order: Activities, Statistics, Settings). Import has moved to a section within Settings (`/settings/import`).

### Feature Flag

Gate training plans behind a `training_plans` feature flag (using the existing `isFeatureEnabled()` system in `$lib/server/feature-flags.ts`). The "Plans" nav link and all plan routes should check the flag. This allows incremental rollout.

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `packages/db/src/schema/training-plans.ts` | Schema: plan_templates, plan_instances, plan_weeks, plan_workouts, plan_workout_matches |
| `packages/shared/src/plan-types.ts` | Shared types: workout categories, phases, distance aliases, effort map type |
| `apps/web/src/lib/server/plan-import.ts` | YAML parser and validator |
| `apps/web/src/lib/server/queries/plan-queries.ts` | Plan CRUD query functions |
| `apps/worker/src/jobs/plan-matching.ts` | Activity-to-workout matching algorithm (runs in worker) |
| `apps/web/src/routes/(protected)/(app)/plans/+page.svelte` | Plans page (templates + instances) |
| `apps/web/src/routes/(protected)/(app)/plans/+page.server.ts` | Plans page load + actions |
| `apps/web/src/routes/(protected)/(app)/plans/[id]/+page.svelte` | Plan instance detail / weekly calendar |
| `apps/web/src/routes/(protected)/(app)/plans/[id]/+page.server.ts` | Plan instance detail load + actions |
| `apps/web/src/routes/(protected)/(app)/plans/upload/+page.svelte` | Template upload page |
| `apps/web/src/routes/(protected)/(app)/plans/upload/+page.server.ts` | Upload action |
| `apps/web/src/lib/components/WeekCalendar.svelte` | Weekly calendar grid |
| `apps/web/src/lib/components/WorkoutCard.svelte` | Workout card |
| `apps/web/src/lib/components/WorkoutDetail.svelte` | Workout detail panel |
| `apps/web/src/lib/components/CurrentWeekStrip.svelte` | Current week widget for activities page |
| `apps/web/src/lib/server/plan-import.test.ts` | YAML parsing tests |
| `apps/worker/src/__tests__/plan-matching.test.ts` | Matching algorithm tests |

### Modified Files

| File | Changes |
|------|---------|
| `packages/db/src/schema/index.ts` | Export new tables |
| `packages/shared/src/index.ts` | Export plan types (use `.js` extension in export path, matching existing pattern) |
| `packages/shared/src/queue.ts` | Add `PLAN_QUEUE_NAME` constant and `PlanMatchJobData`, `PlanBackfillJobData` types |
| `apps/web/src/lib/server/queue.ts` | Add `getPlanQueue()` function (following `getBulkImportQueue()` pattern) |
| `apps/web/src/routes/(protected)/(app)/+layout.svelte` | Add "Plans" to top nav (between Statistics and Settings) |
| `apps/web/src/routes/(protected)/(app)/activities/+page.svelte` | Add CurrentWeekStrip (between mileage stats and filter bar) |
| `apps/web/src/routes/(protected)/(app)/activities/+page.server.ts` | Load current week data |
| `apps/web/src/lib/terminal/terminal-state.svelte.ts` | Add plan zones toggle |
| `apps/worker/src/index.ts` | Create plan queue Worker instance (following bulk-import pattern) |
| `apps/worker/src/jobs/activity-streams.ts` | Enqueue plan-match job after streams complete |
| `apps/worker/src/jobs/bulk-import.ts` | Enqueue plan-match job after each activity import |

## Implementation Order

### Phase 5a: Data Model & Import
1. Create `plan-types.ts` in shared package (categories, phases, effort map type). Reference existing `RACE_DISTANCES` from `zones.ts` for distance aliases rather than duplicating. Import `SportType` from `activity-types.ts`.
2. Create `training_plans` feature flag in the admin flags page
3. Create DB schema tables (plan_templates, plan_instances, plan_weeks, plan_workouts, plan_workout_matches)
4. Generate migration via `drizzle-kit generate` (never create migration files manually)
5. Add `yaml` npm package to `apps/web`
6. Implement `plan-import.ts` — YAML parser with distance/duration shorthand, day normalization, countdown week validation
7. Tests for YAML parsing
8. Create plan query functions (templates CRUD, instance create/get/list/update status)

### Phase 5b: Upload & Plan List UI
8. Create plans page with templates and instances sections
9. Create upload page with YAML editor and preview
10. Wire upload form action
11. Add "Plans" to top nav
12. Template management (delete)

### Phase 5c: Start Plan Flow & Calendar
13. Start plan flow (race date, effort mapping, instance creation with copy-on-start)
14. Create `WeekCalendar.svelte` and `WorkoutCard.svelte`
15. Create plan instance detail page with weekly calendar (current week prominent, past/future compact)
16. Workout detail panel
17. Drag-and-drop rescheduling within a week
18. Instance status management (archive, complete)

### Phase 5d: Activity Matching
19. Add `PLAN_QUEUE_NAME` and job types to shared queue (following `BULK_IMPORT_QUEUE_NAME` pattern)
20. Add plan queue Worker in `apps/worker/src/index.ts` (following bulk-import worker pattern)
21. Implement matching algorithm in `apps/worker/src/jobs/plan-matching.ts`
22. Add matching trigger to `activity-streams.ts` (after streams complete, enqueue plan-match)
23. Add matching trigger to `bulk-import.ts` (after each activity, enqueue plan-match)
24. Backfill matching on plan start
25. Match/unmatch UI on plan detail page
26. Match status indicators on workout cards
27. Tests for matching algorithm

### Phase 5e: Polish
26. Current week strip on activities page
27. Plan progress indicators
28. Weekly summary stats (planned vs completed distance)
29. Compliance colors
30. Auto-complete after race day
31. Plan zones toggle in terminal charts (show matched workout effort bands)
32. Empty states and error handling

## Edge Cases

- **No race date**: Not allowed — race date is required when starting an instance
- **Race date in past**: Warn when starting, allow anyway
- **Multiple activities on workout day**: Match closest by distance
- **Activity on non-workout day**: Not matched
- **Workout with no target distance**: Cannot auto-match; manual link only
- **Deleting a matched activity**: Cascade removes the match; workout reverts to unmatched
- **Deleting an instance**: Cascade removes all weeks, workouts, and matches
- **Deleting a template**: Existing instances retain their data (templateId set null)
- **Overlapping instances**: Starting a new instance archives the previous active one
- **Reordering workouts**: Within a week only, updates dayOfWeek and sortOrder
- **Plan with 0 weeks**: Rejected during validation (must have at least week 0)
- **Distance ranges** (e.g. "8-9mi"): Store as min/max; matching uses midpoint
- **Unknown effort slug**: Allowed in YAML; all slugs must be mapped to paces before starting. Start button disabled until every slug has a pace range.
- **Activity not yet synced**: Only match activities with `syncStatus = 'complete'`. Pending/failed activities are ignored.
- **Bulk-imported activities**: Bulk import also triggers plan matching for each imported activity, same as webhook-imported ones.

## Changelog

### 2026-03-26
- **Codebase alignment**: Updated doc to match current codebase patterns.
- **Nav update**: "Plans" positioned between Statistics and Settings (Import moved to `/settings/import`, Statistics page added at `/stats`).
- **Activities page**: CurrentWeekStrip placement updated — goes between mileage stats and the filter bar (activities page now has search + filters below stats).
- **Separate queue**: Plan matching uses its own BullMQ queue (`plan` queue), following the bulk-import queue separation pattern. Prevents plan jobs from blocking webhook/activity processing.
- **Feature flag**: Training plans gated behind `training_plans` feature flag using existing `isFeatureEnabled()` system.
- **Match trigger**: Changed from activity-import to activity-streams (match after streams complete, when `syncStatus = 'complete'`). Also triggers from bulk-import.
- **Worker setup**: Added `apps/worker/src/index.ts` and `apps/web/src/lib/server/queue.ts` to Modified Files for queue setup.
- **Nav position**: Specified "Plans" placement between Import and Settings in the top nav.
- **Distance aliases**: Reference existing `RACE_DISTANCES` from `zones.ts` instead of duplicating.
- **YAML package**: Specified `yaml` npm package by name.
- **Zone copy**: Documented that matching uses zone `name` field (no `slug` field exists on ZoneDefinition). Removed incorrect changelog claim about adding slug field.
- **Migration**: Added note to use `drizzle-kit generate` (never manual migration files).

### 2026-03-23 (rev 2)
- **Zone copy helper**: "Copy from my zones" button in start-plan effort mapping UI pre-fills slugs matching user's existing zone names. Frontend-only convenience.
- **Plan zones in terminal**: "Plan zones" toggle in terminal display controls shows matched workout effort bands from the plan instance's effortMap on pace/HR charts. Added to Phase 5e.
- **Warmup/cooldown targets**: Added `'warmup'` and `'cooldown'` as `TargetStep.type` values. YAML targets can now express full workout structure (warmup → intervals → cooldown).
- **Backfill rename**: Renamed `plan-batch-match` to `plan-backfill-matches` to clarify intent — retroactively matches existing activities to plan workouts.
- **Effort slug requirement**: All effort slugs must be mapped before starting a plan. Start button disabled until complete.

### 2026-03-23
- **Template/instance separation**: Split into `plan_templates` (uploaded YAML) and `plan_instances` (started execution with race date). Copy-on-start — starting a plan copies workout data from the parsed template into instance-owned rows.
- **Week countdown numbering**: Weeks count down to race week (0 = race week). Explicit `week: N` field in YAML.
- **ISO day-of-week**: YAML accepts both names (`tue`) and ISO numbers (`1`=Mon, `7`=Sun).
- **Custom effort maps**: Effort slugs are free-form in YAML. Each plan instance defines its own slug-to-pace/HR mapping (JSONB `effortMap` field), configured when starting the plan. Replaces the fixed 5-zone-slug system.
- **Recovery in YAML**: Added `recovery_distance` and `recovery_duration` fields to interval targets. No `recovery_effort` (recovery is always easy).
- **Upload vs start separation**: Upload saves a template to the library. Starting creates an instance with race date + effort mapping.
- **Current week prominence**: Plan detail shows current week at full height, past/future weeks compact. Current week strip widget added to activities page.
- Removed `race_date` from YAML format (set when starting an instance)
- Added `plan_templates` table, renamed `training_plans` to `plan_instances`
- Added `effortMap` JSONB to plan_instances
- Added `CurrentWeekStrip` component and activities page integration
- Updated file list and implementation order

### 2026-03-22
- Initial plan document — merged research from existing plan doc with detailed implementation design
- Added normalized data model (4 tables) instead of JSONB approach
- Added detailed YAML format with distance/duration shorthand
- Added phase labels per week (base/build/peak/taper/race)
- Added structured target/interval JSONB schema
- Added distance tolerance bands for auto-matching (20%/35%)
- Added confidence scoring formula for matches
- Added drag-and-drop spec (within-week only, pointer capture pattern)
- Added detailed UI specs for calendar view, workout cards, import page
- Added implementation order with 5 sub-phases
- **Review fixes:** Removed bare-number distance default (explicit units required); added `sportType` to training_plans; used timestamp(tz) instead of date columns; added partial unique index for active plan constraint; added `(planId, startDate)` index to plan_weeks; renamed `workoutType` to `category` on plan_workouts to avoid Strava naming collision; added range support and recovery fields to TargetStep JSONB; moved matching logic to worker package; specified batch matching runs as background job; added timestamps to plan_weeks; specified drag-and-drop sortOrder behavior
