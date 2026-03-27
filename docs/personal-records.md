# Personal Records (PRs) Feature Plan

## Overview

Allow users to mark activities as personal records for common race distances. Display PRs on the stats page and show a special PR card on race activity detail pages with a confetti celebration effect.

## Race Distances

Use the existing `RACE_DISTANCES` from `packages/shared/src/zones.ts`:

| Distance | Meters |
|----------|--------|
| 1 Mile | 1,609 |
| 5K | 5,000 |
| 8K | 8,047 |
| 10K | 10,000 |
| 10 Mile | 16,093 |
| Half Marathon | 21,097 |
| Marathon | 42,195 |

---

## 1. Database

### New table: `personal_records`

```
personal_records
  id              serial PK
  user_id         integer FK → users.id (cascade)
  activity_id     integer FK → activities.id (cascade) UNIQUE
  race_distance   text NOT NULL          -- matches RACE_DISTANCES label: '5K', 'Marathon', etc.
  time_seconds    integer NOT NULL       -- movingTime snapshot for quick queries
  created_at      timestamptz NOT NULL DEFAULT now()
```

**Indexes:**
- `unique(user_id, activity_id)` -- one PR designation per activity
- `idx_pr_user_distance` on `(user_id, race_distance)` -- fast lookup for PR table

**Why a separate table instead of a boolean on `activities`:**
- Stores the matched race distance label explicitly (an activity's distance of 5,023m maps to "5K")
- Snapshots `time_seconds` so the PR leaderboard query doesn't need to join activities
- Keeps the activities table unchanged -- no migration risk, no null backfills
- Easy to query "best time per distance" with a simple `MIN(time_seconds) ... GROUP BY race_distance`

**Schema file:** `packages/db/src/schema/personal-records.ts`, re-exported from `packages/db/src/schema/index.ts`.

---

## 2. Backend

### Shared types

Add to `packages/shared/src/index.ts` (or a new `pr-types.ts`):

```ts
export interface PersonalRecord {
  id: number;
  activityId: number;
  raceDistance: string;    // RACE_DISTANCES label
  timeSeconds: number;
  createdAt: string;
}
```

### Server queries: `apps/web/src/lib/server/queries/pr-queries.ts`

Two query functions:

1. **`getUserPRs(userId)`** -- Returns the *current best* for each race distance.

   ```sql
   SELECT DISTINCT ON (race_distance)
     pr.*, a.name, a.start_date, a.average_speed, a.sport_type
   FROM personal_records pr
   JOIN activities a ON a.id = pr.activity_id
   WHERE pr.user_id = $1
   ORDER BY race_distance, time_seconds ASC
   ```

2. **`getActivityPR(activityId, userId)`** -- Returns the PR record for a specific activity, if one exists. Also returns whether this is the *current best* for that distance (i.e., no other PR for the same distance has a faster time).

### Form actions on activity detail page

Add two form actions to `activities/[id]/+page.server.ts`:

- **`markPR`**: Accepts `raceDistance` (validated against `RACE_DISTANCES` labels). Inserts into `personal_records`. If the activity already has a PR row, update the distance.
- **`removePR`**: Deletes the PR record for the activity.

### Race distance matching

When marking a PR, auto-suggest the race distance using `raceDistanceBounds()` from `zones.ts` (10% tolerance). If the activity's distance falls within bounds of a known distance, pre-select it. If it doesn't match any, let the user pick manually from the list.

---

## 3. Activity Detail Page

### PR Card component: `apps/web/src/lib/components/PRCard.svelte`

A special card that appears in the stat card grid, before the TerminalEntryCard, when the activity is marked as a PR.

**Design:**
- Warm gradient background (gold/amber tones) -- distinct from both the white stat cards and the dark Terminal card
- Left accent with a trophy/record icon (SVG, no emoji)
- Shows: race distance label, time, and whether it's the current best ("PR" vs "Former PR")
- If it's the current best, the time is emphasized
- Remove button (small, subtle) to un-mark the PR

**Layout change in `+page.svelte`:**
```
[Distance] [Time] [Pace] [HR]
[Elevation] [Cadence] [PR Card*] [Terminal Card]
```
The PR card replaces an empty grid slot. If no PR, layout stays the same.

### "Mark as PR" button

When the activity is NOT marked as a PR and `workoutType === 'race'`:
- Show a subtle button/link below the stat cards: "Mark as PR"
- Clicking opens an inline form (not a modal) with:
  - Race distance dropdown, pre-selected if auto-matched
  - "Save" button
- Uses `use:enhance` for progressive enhancement

When the activity IS marked as a PR:
- The PR card itself has a small "x" or "Remove" action

### Confetti effect

When the user marks an activity as PR:
1. The form action returns successfully
2. On the client, after `invalidateAll()`, detect that the PR card is now present (or use the action result)
3. Fire a canvas-based confetti burst from the PR card's position
4. The effect is purely decorative, ~2 seconds, then self-cleans

**Implementation:** A small self-contained `confetti.ts` utility (~60 lines). No external dependency. Uses a temporary `<canvas>` overlay, spawns ~80 particles with random velocity/color/decay, runs via `requestAnimationFrame`, removes canvas when done.

Confetti colors: gold, amber, orange, white -- matching the PR card's warm palette.

---

## 4. Stats Page: PR Table

Add a "Personal Records" section to the stats page (`stats/+page.svelte`).

### Data loading

In `stats/+page.server.ts`, call `getUserPRs(userId)` alongside the existing stats query.

### UI

Below the existing chart section (or as a toggleable tab), render a PR table:

```
Personal Records
┌─────────────────┬──────────┬───────────┬────────────┬──────────────┐
│ Distance        │ Time     │ Pace      │ Date       │ Activity     │
├─────────────────┼──────────┼───────────┼────────────┼──────────────┤
│ 5K              │ 19:42    │ 3:56/km   │ Mar 15 '25 │ Parkrun →    │
│ 10K             │ 41:15    │ 4:08/km   │ Jan 8 '25  │ Winter 10K → │
│ Half Marathon   │ 1:32:10  │ 4:23/km   │ Oct 12 '24 │ City Half →  │
│ Marathon        │ —        │ —         │ —          │              │
└─────────────────┴──────────┴───────────┴────────────┴──────────────┘
```

- Show all `RACE_DISTANCES` rows, even those without a PR (displayed as dashes)
- Time formatted via `formatDurationClock()`
- Pace formatted via `formatPace()` respecting user's unit preference
- Activity name links to the activity detail page
- Distances without PRs are dimmed but visible -- they serve as goals

---

## 5. Implementation Order

1. **Schema + migration**: Create `personal_records` table, generate migration with `drizzle-kit`
2. **Server queries**: `pr-queries.ts` with `getUserPRs` and `getActivityPR`
3. **Form actions**: `markPR` / `removePR` on activity detail page
4. **PR Card component**: Design and implement `PRCard.svelte`
5. **Activity page integration**: Wire up PR card, mark/remove button, race distance form
6. **Confetti utility**: `confetti.ts` particle effect
7. **Stats page PR table**: Load and display PR summary
8. **Tests**: Query tests, race distance matching, confetti cleanup

## 6. Files Changed / Created

| File | Action |
|------|--------|
| `packages/db/src/schema/personal-records.ts` | Create |
| `packages/db/src/schema/index.ts` | Edit (re-export) |
| `packages/db/drizzle/XXXX_*.sql` | Generated by drizzle-kit |
| `packages/shared/src/pr-types.ts` | Create |
| `packages/shared/src/index.ts` | Edit (re-export) |
| `apps/web/src/lib/server/queries/pr-queries.ts` | Create |
| `apps/web/src/lib/components/PRCard.svelte` | Create |
| `apps/web/src/lib/confetti.ts` | Create |
| `apps/web/src/routes/(protected)/(app)/activities/[id]/+page.server.ts` | Edit (add actions) |
| `apps/web/src/routes/(protected)/(app)/activities/[id]/+page.svelte` | Edit (PR card + button) |
| `apps/web/src/routes/(protected)/(app)/stats/+page.server.ts` | Edit (load PRs) |
| `apps/web/src/routes/(protected)/(app)/stats/+page.svelte` | Edit (PR table) |

## 7. Open Questions

- **Multiple PRs per distance?** This plan tracks every activity marked as PR, but only highlights the fastest per distance on the stats page. An alternative would be to enforce one PR per distance (replace on faster time). The current design is more flexible -- users can mark several and the system shows the best.

@@ I like the idea of a 'former PR' still being tied to the activity. But there should only be one PR at a time (and we should differential between current PR and Former on the activity screen)

- **Auto-detection on sync?** Future enhancement: when a race activity syncs and its time beats the current PR for that distance, surface a prompt. Out of scope for v1.
- **Sport type scoping?** PRs are implicitly run-only given the race distances, but the table doesn't enforce `sportType`. If cycling PRs are wanted later, the schema supports it -- just add cycling distances to `RACE_DISTANCES`.
