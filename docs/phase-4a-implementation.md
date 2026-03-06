# Phase 4a: Activity Views & Charts — Implementation Plan

## Progress Checklist

- [ ] Font imports + design system tokens in `app.css` (Geist, Geist Mono, Cormorant Garamond, zone/stream colors)
- [ ] User-facing layout shell (`/(protected)/+layout.svelte`) — top nav
- [ ] Activity list page (`/activities`) — month-grouped, prose rows, sparklines, distance + sport + date + workout filters
- [ ] Activity detail page (`/activities/[id]`)
- [ ] `ActivityChart.svelte` — layerchart-based chart with zone bands + crosshair sync
- [ ] `SparkLine.svelte` — inline miniature chart for list view (keep simple)
- [ ] `StatCard.svelte` — labeled stat display with Geist Mono values
- [ ] Zone settings page (`/settings/zones`) — manual editor + race-derived calculator
- [ ] Zone calculation algorithm (`packages/shared/src/zones.ts`)
- [ ] `user_zones` schema + migration
- [ ] Zone config type definitions in `packages/shared`
- [ ] API: activity list with filters (including distance presets)
- [ ] API: activity detail + streams
- [ ] API: zone settings read/write
- [ ] Tests: load functions, zone actions, zone calculation algorithm, distance preset ranges

---

## Overview

Phase 4a is the first user-facing feature surface. It covers:

1. **Activity list** — browse your runs with filtering and inline sparklines
2. **Activity detail** — map, stats, synchronized interactive charts, laps, splits
3. **Effort zones** — define pace/HR zones used as visual overlays on charts

All data is already in the database from Phase 3. This phase is purely about surfacing it in a high-quality, useful way.

---

## 1. Design System

### Aesthetic Direction

The design follows a clean, sparse, functional aesthetic — a professional tool that lets data speak. The visual language extends what's already present in the admin section (zinc palette, minimal borders, no component library) while adding typographic character and the patterns needed for data visualization.

**What makes it memorable:** three distinct typefaces with clearly delineated roles — Cormorant Garamond for editorial moments (activity titles, month headers), Geist Mono for all numeric data, and Geist for UI chrome. Zone bands behind charts make effort visible at a glance without separate legend UI. The design starts sparse; decoration can be added if it proves too austere.

### Typography

Three fonts, each with a specific role:

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Cormorant+Garamond:wght@500;600&display=swap');

@theme {
  --font-sans:  'Geist', ui-sans-serif, system-ui, sans-serif;
  --font-mono:  'Geist Mono', ui-monospace, monospace;
  --font-serif: 'Cormorant Garamond', Georgia, serif;
}
```

| Font | Role | Examples |
|---|---|---|
| Geist | UI chrome, labels, body | Nav, filter labels, table headers |
| Geist Mono | All numeric data | Pace, HR, distance, time, chart axes |
| Cormorant Garamond | Editorial display moments | Activity title (`h1`), month headers |

Cormorant Garamond is used sparingly — only where there is a narrative or editorial moment, never in functional UI or the data layer. Its presence should feel earned.

**Numeric data:** All stat cards, chart axes, lap tables, and pace/HR displays use `font-mono` with tabular figures:

```css
font-variant-numeric: tabular-nums;
font-feature-settings: "tnum";
```

This makes pace times, distances, and HRs align cleanly in columns — data feels precision-engineered rather than incidental.

### Color Tokens

Defined in `apps/web/src/app.css` using Tailwind v4's CSS-based config. Zinc palette unchanged from the admin section:

```css
@import "tailwindcss";

@theme {
  --font-sans:  'Geist', ui-sans-serif, system-ui, sans-serif;
  --font-mono:  'Geist Mono', ui-monospace, monospace;
  --font-serif: 'Cormorant Garamond', Georgia, serif;

  /* Chart stream colors — consistent across all views */
  --color-stream-pace: #f97316;       /* orange-500 */
  --color-stream-heartrate: #ef4444;  /* red-500 */
  --color-stream-elevation: #22c55e;  /* green-500 */
  --color-stream-cadence: #a855f7;    /* purple-500 */
  --color-stream-power: #f59e0b;      /* amber-500 */
  --color-stream-gap: #3b82f6;        /* blue-500 */

  /* Effort zone colors — used for chart bands + zone cards */
  --color-zone-1: #6ee7b7;   /* emerald-300 · Easy */
  --color-zone-2: #34d399;   /* emerald-400 · General Aerobic */
  --color-zone-3: #fcd34d;   /* amber-300  · Tempo */
  --color-zone-4: #f97316;   /* orange-500 · Lactate Threshold */
  --color-zone-5: #ef4444;   /* red-500    · VO2max */
}
```

The zone color ramp is intentional: cool green for easy, warm amber for tempo, hot red for max effort. These map to visual intuition without needing labels.

### Spacing & Layout

No new spacing scale. Tailwind's default scale is used throughout. Key layout decisions:

| Context | Value |
|---|---|
| Page horizontal padding | `px-6` (24px) on mobile, `px-8` (32px) on md+ |
| Content max-width | `max-w-5xl` (1024px) for activity detail |
| Activity list max-width | `max-w-4xl` (896px) |
| Stat card grid | 4-column on md+, 2-column mobile |
| Chart height | 96px compact / 160px expanded |

### Component Patterns

**Stat card** — a labeled metric tile:
```
┌────────────────┐
│ Distance       │  ← text-xs text-zinc-500 uppercase tracking-wide
│ 8.2 mi         │  ← text-2xl font-semibold tabular
│ 8:51/mi        │  ← text-sm text-zinc-400 (secondary stat)
└────────────────┘
```

**Activity row** — two-line condensed list item:
```
Morning Run                              Tue, Mar 3
8.2 mi · 1:12:34 · 8:51/mi · 142 bpm   [sparkline]
```

**Zone band** — thin colored bar with label:
```
Zone 2 · General Aerobic   ████████████░░░░   138–152 bpm
```

---

## 2. Page Mockups

### 2.1 Activity List (`/activities`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  web-runner                       Activities   Settings             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Activities                                                         │
│                                                                     │
│  [Run ▼]  [All Time ▼]  [Any Type ▼]    ·  247 activities          │
│                                                                     │
│  MARCH 2026                                                         │
│  ─────────────────────────────────────────────────────────         │
│  Tue Mar 3   Morning Run                   8.2 mi  1:12:34         │
│              8:51/mi · 142 bpm · +312 ft   ~~~~~~~~ (sparkline)    │
│                                                                     │
│  Mon Mar 2   Evening Easy                  4.1 mi  38:20           │
│              9:21/mi · 135 bpm             ~~~~~ (sparkline)       │
│                                                                     │
│  FEBRUARY 2026                                                      │
│  ─────────────────────────────────────────────────────────         │
│  Sat Feb 28  Long Run                     12.4 mi  1:58:42         │
│              9:35/mi · 138 bpm · +520 ft  ~~~~~~~~~~~~ (sparkline) │
│                                                                     │
│  Thu Feb 26  Track Workout                 5.0 mi  42:15           │
│              8:27/mi · 158 bpm             ~~~~~~~ (sparkline)     │
│                                                                     │
│  [Load more]                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

Key decisions:
- **Month grouping** — activities grouped by calendar month with sticky month headers
- **Sparklines** — tiny inline pace chart per row, 60×24px SVG, no axes, no interaction
- **No table layout** — prose-style rows feel more like a training log than a spreadsheet
- **Elevation only shown when > 0** — de-clutters flat route rows

Filters:
- Sport type dropdown (Run, Ride, Walk — derived from actual data)
- Date range preset (This week, This month, Last 90 days, All time)
- Workout type (Easy, Long Run, Workout, Race)
- Distance preset — common race distances, ±10% symmetric tolerance:

| Label | Target | Range |
|---|---|---|
| 1 Mile | 1,609m | 1,448–1,770m |
| 5K | 5,000m | 4,500–5,500m |
| 8K | 8,047m | 7,242–8,852m |
| 10K | 10,000m | 9,000–11,000m |
| 10 Mile | 16,093m | 14,484–17,702m |
| Half Marathon | 21,097m | 18,987–23,207m |
| Marathon | 42,195m | 37,976–46,415m |

### 2.2 Activity Detail (`/activities/[id]`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Activities                                                       │
│                                                                     │
│  Morning Run                                   Tue, Mar 3 · 7:15am │
│  Easy Run                                                           │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ DISTANCE │  │   TIME   │  │   PACE   │  │    HR    │           │
│  │  8.2 mi  │  │ 1:12:34  │  │ 8:51/mi  │  │ 142 bpm  │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│  ┌──────────┐  ┌──────────┐                                        │
│  │ELEVATION │  │ CADENCE  │                                        │
│  │ +312 ft  │  │ 178 spm  │                                        │
│  └──────────┘  └──────────┘                                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Leaflet map — full route, auto-zoomed]                    │   │
│  │                                                             │   │
│  │                    ~~~~~~~~~~~~~                            │   │
│  │                   ~             ~                           │   │
│  │  ~~~~~~~~~~~~~~~                 ~                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ── Charts ──────────────────────────────────────────────────      │
│                                                                     │
│  Pace           8:51 avg                   [by distance] [by time] │
│  │▓▓░░░ zone bands ░░░▒▒▒▒▒░░░░░░░░░░░▒▒│                         │
│  │~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│                │
│  0                    4.1 mi                  8.2 mi               │
│                                                                     │
│  Heart Rate     142 avg                                            │
│  │░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░│                            │
│  │~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│                │
│                                                                     │
│  Elevation      +312 ft gain                                       │
│  │~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│                │
│                                                                     │
│  ── Laps ────────────────────────────────────────────────────      │
│                                                                     │
│  #   Distance   Time      Pace      HR    Cadence                  │
│  1   1.00 mi    8:47      8:47/mi   140   178                     │
│  2   1.00 mi    8:52      8:52/mi   143   179                     │
│  3   1.00 mi    8:55      8:55/mi   145   180                     │
│  ...                                                               │
│                                                                     │
│  ── Splits (500m) ───────────────────────────────────────────      │
│  [Scrollable table of 500m segment data]                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Zone Settings (`/settings/zones`)

Zones can be set manually or calculated from a recent race performance.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Settings / Effort Zones                                            │
│                                                                     │
│  Define your training zones. These appear as bands on charts.      │
│                                                                     │
│  Zone type:  (•) Pace    ( ) Heart Rate                            │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ ██  Zone 1 · Easy                                         │     │
│  │     Slower than  [  9:30  ] /mi                           │     │
│  └───────────────────────────────────────────────────────────┘     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ ██  Zone 2 · General Aerobic                              │     │
│  │     [  9:00  ] – [  9:30  ] /mi                           │     │
│  └───────────────────────────────────────────────────────────┘     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ ██  Zone 3 · Tempo                                        │     │
│  │     [  8:15  ] – [  9:00  ] /mi                           │     │
│  └───────────────────────────────────────────────────────────┘     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ ██  Zone 4 · Lactate Threshold                            │     │
│  │     [  7:30  ] – [  8:15  ] /mi                           │     │
│  └───────────────────────────────────────────────────────────┘     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ ██  Zone 5 · VO2max                                       │     │
│  │     Faster than  [  7:30  ] /mi                           │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                     │
│  [Save zones]                                                       │
│                                                                     │
│  Preview — how zones will look on charts:                          │
│  ┌────────────────────────────────────────────────────────┐        │
│  │ ░░░░░░░░░▒▒▒▒▒▒▓▓▓▓▓▓▓████████████████▓▓▓▓▒▒▒░░░░░   │        │
│  │ Z1       Z2     Z3      Z4              Z3   Z2  Z1   │        │
│  └────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Navigation & Layout Architecture

### User Layout Shell

The admin section uses a sidebar layout (`flex min-h-screen`). The user-facing section uses a **top navigation bar** — a deliberate separation that makes it visually clear you're in the main app vs. the admin panel.

```
apps/web/src/routes/(protected)/
  +layout.svelte        ← NEW: top nav shell for user section
  +layout.server.ts     ← existing: requires auth
  +page.svelte          ← existing: currently placeholder
  activities/
    +page.svelte
    +page.server.ts
    [id]/
      +page.svelte
      +page.server.ts
  settings/
    zones/
      +page.svelte
      +page.server.ts
```

The `(protected)` group currently only has `+layout.server.ts` (auth guard) and the admin subdirectory. We need to add `+layout.svelte` to give the user section its own navigation chrome.

```svelte
<!-- (protected)/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  let { data, children } = $props();

  const navItems = [
    { href: '/activities', label: 'Activities' },
    { href: '/settings/zones', label: 'Settings' },
  ] as const;
</script>

<div class="min-h-screen bg-white">
  <header class="border-b border-zinc-200 bg-white">
    <div class="max-w-5xl mx-auto px-8 h-14 flex items-center justify-between">
      <a href={resolve('/')} class="text-sm font-semibold text-zinc-900">web-runner</a>
      <nav class="flex items-center gap-1">
        {#each navItems as item}
          <a
            href={resolve(item.href)}
            class="px-3 py-1.5 rounded text-sm {page.url.pathname.startsWith(item.href)
              ? 'bg-zinc-100 font-medium text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}"
          >
            {item.label}
          </a>
        {/each}
        {#if data.user?.isAdmin}
          <a href={resolve('/admin/activities')} class="ml-4 text-xs text-zinc-400 hover:text-zinc-600">
            Admin
          </a>
        {/if}
      </nav>
    </div>
  </header>
  <main class="max-w-5xl mx-auto px-8 py-8">
    {@render children()}
  </main>
</div>
```

**Why top nav for users, sidebar for admin:** The admin section has 5+ pages all equally important. The user section has 2 main destinations. Top nav with a few links is the right pattern for the user section's scale. The visual distinction also makes it obvious when you've navigated to admin vs. the main app.

**Admin layout is unaffected.** The `(protected)/admin/+layout.svelte` overrides the top nav with its own sidebar layout — SvelteKit's nested layout system handles this naturally.

---

## 4. Database Schema Changes

### `user_zones` table

Stores effort zone configuration per user. One row per user per zone type.

```typescript
// packages/db/src/schema/user-zones.ts
import { pgTable, serial, integer, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userZones = pgTable('user_zones', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  zoneType: text('zone_type').notNull(), // 'pace' | 'heartrate'
  zones: jsonb('zones').notNull().$type<ZoneDefinition[]>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Zone type uniqueness: one zone config per type per user. We do not add a unique index and instead use upsert logic (same pattern as activities). Alternatively, store both configs on a single row; a single-row-per-user approach is simpler but less extensible.

**Decision: single row per user per zone type.** Users will have at most two configs (pace + HR). Upsert on `(userId, zoneType)` with a unique index.

### Zone Type Definition

```typescript
// packages/shared/src/zones.ts
export type ZoneType = 'pace' | 'heartrate';

export interface ZoneDefinition {
  index: number;    // 1–5
  name: string;     // 'Easy', 'General Aerobic', 'Tempo', 'LT', 'VO2max'
  color: string;    // CSS color, matches --color-zone-N
  // Bounds for pace (sec/km) — null means unbounded
  paceMin: number | null;   // faster bound (lower sec/km)
  paceMax: number | null;   // slower bound (higher sec/km)
  // Bounds for heartrate (bpm)
  hrMin: number | null;
  hrMax: number | null;
}

export const DEFAULT_ZONES: ZoneDefinition[] = [
  { index: 1, name: 'Easy',             color: '#6ee7b7', paceMin: null,  paceMax: 360, hrMin: null, hrMax: 138 },
  { index: 2, name: 'General Aerobic',  color: '#34d399', paceMin: 300,   paceMax: 360, hrMin: 138,  hrMax: 152 },
  { index: 3, name: 'Tempo',            color: '#fcd34d', paceMin: 255,   paceMax: 300, hrMin: 152,  hrMax: 162 },
  { index: 4, name: 'Lactate Threshold',color: '#f97316', paceMin: 210,   paceMax: 255, hrMin: 162,  hrMax: 174 },
  { index: 5, name: 'VO2max',           color: '#ef4444', paceMin: null,  paceMax: 210, hrMin: 174,  hrMax: null },
];
```

Note: all pace bounds are in sec/km (metric, matching the rest of the data model). Display conversion to sec/mi happens in the UI via the existing `formatPaceValue()` utility.

### Migration

```sql
-- packages/db/drizzle/0003_user_zones.sql
CREATE TABLE user_zones (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_type TEXT NOT NULL,
  zones JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_zones_user_zone_type ON user_zones(user_id, zone_type);
```

---

## 5. Component Architecture

### 5.1 `ActivityChart.svelte`

Built on **layerchart** — a Svelte-native, SVG-based chart library. layerchart handles scale math, axes, and tooltip behaviour. We compose zone bands as custom SVG rects within layerchart's canvas slot.

`StreamChart.svelte` in the admin section stays as-is — layerchart is not pulled into the admin.

**Props interface:**

```typescript
interface Props {
  data: number[];
  distanceData?: number[];      // x-axis: cumulative meters
  timeData?: number[];          // alternative x-axis
  xAxis?: 'distance' | 'time';
  label: string;
  color: string;
  unit: string;
  zones?: ZoneDefinition[];
  zoneMetric?: 'pace' | 'heartrate';
  // Crosshair sync — index controlled by parent
  crosshairIndex?: number | null;
  oncrosshairmove?: (index: number | null) => void;
}
```

**Key design decisions:**
- Zone bands are semi-transparent SVG rects rendered inside layerchart's canvas — no separate legend needed
- Crosshair index is owned by the parent page, passed down to each chart — enables sync across all charts on the detail page
- X-axis toggles between distance and time via a shared `$state` on the parent
- `font-mono` on all axis tick labels for tabular alignment

### 5.2 `SparkLine.svelte`

Tiny inline chart for the activity list. No axes, no labels, no interaction — pure visual signal.

```svelte
<!-- apps/web/src/lib/components/SparkLine.svelte -->
<script lang="ts">
  interface Props {
    data: number[];
    color?: string;
    width?: number;
    height?: number;
  }

  let { data, color = '#a1a1aa', width = 64, height = 20 }: Props = $props();

  let points = $derived.by(() => {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1);
    return data.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
  });
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" style="display: block; overflow: visible;">
  <polyline {points} fill="none" stroke={color} stroke-width="1.5" stroke-linejoin="round" />
</svg>
```

### 5.3 `StatCard.svelte`

```svelte
<!-- apps/web/src/lib/components/StatCard.svelte -->
<script lang="ts">
  interface Props {
    label: string;
    value: string;
    sub?: string;
  }
  let { label, value, sub }: Props = $props();
</script>

<div class="rounded-lg border border-zinc-200 bg-white px-4 py-3">
  <div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{label}</div>
  <div class="text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
  {#if sub}
    <div class="text-xs text-zinc-400 mt-0.5 tabular-nums">{sub}</div>
  {/if}
</div>
```

---

## 6. Page Implementations

### 6.1 Activity List

#### Load Function (`activities/+page.server.ts`)

```typescript
import { db } from '$lib/server/db';
import { activities } from '@web-runner/db/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 30;

export const load: PageServerLoad = async ({ locals, url }) => {
  const userId = locals.user!.id;

  const sport   = url.searchParams.get('sport') ?? '';
  const workout = url.searchParams.get('workout') ?? '';
  const range   = url.searchParams.get('range') ?? '';
  const cursor  = url.searchParams.get('cursor') ?? '';

  const conditions = [eq(activities.userId, userId)];

  if (sport)   conditions.push(eq(activities.sportType, sport));
  if (workout) conditions.push(eq(activities.workoutType, workout));

  if (range === 'week') {
    const since = new Date(); since.setDate(since.getDate() - 7);
    conditions.push(gte(activities.startDate, since));
  } else if (range === 'month') {
    const since = new Date(); since.setMonth(since.getMonth() - 1);
    conditions.push(gte(activities.startDate, since));
  } else if (range === '90d') {
    const since = new Date(); since.setDate(since.getDate() - 90);
    conditions.push(gte(activities.startDate, since));
  }

  if (cursor) {
    conditions.push(lte(activities.startDate, new Date(cursor)));
  }

  const rows = await db
    .select({
      id: activities.id,
      name: activities.name,
      sportType: activities.sportType,
      workoutType: activities.workoutType,
      startDate: activities.startDate,
      distance: activities.distance,
      movingTime: activities.movingTime,
      totalElevationGain: activities.totalElevationGain,
      averageSpeed: activities.averageSpeed,
      averageHeartrate: activities.averageHeartrate,
      hasHeartrate: activities.hasHeartrate,
    })
    .from(activities)
    .where(and(...conditions))
    .orderBy(desc(activities.startDate))
    .limit(PAGE_SIZE + 1);  // +1 to detect if there's a next page

  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);

  // Fetch pace sparkline data for displayed activities (from velocity_smooth stream)
  // Only if the stream is available. Done as a single query with IN.
  const activityIds = items.map(a => a.id);
  const sparklineData = activityIds.length > 0
    ? await db.execute(sql`
        SELECT activity_id, data
        FROM activity_streams
        WHERE activity_id = ANY(${activityIds})
          AND stream_type = 'velocity_smooth'
      `)
    : { rows: [] };

  const sparklineMap = new Map<number, number[]>();
  for (const row of sparklineData.rows as { activity_id: number; data: number[] }[]) {
    // Downsample to 60 points max for sparklines
    const d = row.data as number[];
    const step = Math.max(1, Math.floor(d.length / 60));
    sparklineMap.set(row.activity_id, d.filter((_, i) => i % step === 0));
  }

  // Distinct sport types for filter dropdown
  const sportTypes = await db
    .selectDistinct({ sportType: activities.sportType })
    .from(activities)
    .where(eq(activities.userId, userId));

  const nextCursor = hasMore ? items[items.length - 1].startDate.toISOString() : null;

  return {
    activities: items.map(a => ({
      ...a,
      sparkline: sparklineMap.get(a.id) ?? null,
    })),
    filters: { sport, workout, range },
    sportTypes: sportTypes.map(r => r.sportType),
    nextCursor,
  };
};
```

**Pagination strategy: cursor-based on `startDate`.** Activities are always ordered by date descending. A cursor (ISO timestamp of the last visible activity's start date) avoids the offset-based N+1 count issue and handles new activities being inserted without shifting pages.

#### Page (`activities/+page.svelte`)

Key implementation notes:
- Month grouping computed client-side via `$derived` — group activities by `YYYY-MM`
- SparkLine rendered inline; velocity data downsampled server-side to 60pts
- Filter form uses native `<select>` elements, submits via `?sport=Run&range=month` query params (no JS required, progressive enhancement)
- Row click navigates to activity detail (same `rowClick` pattern as admin)
- "Load more" is a standard link to `?cursor=<ISO>` that appends to the list client-side if JS is available, falls back to page reload

### 6.2 Activity Detail

#### Load Function (`activities/[id]/+page.server.ts`)

```typescript
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { activities, activityLaps, activityStreams, activitySegments, userZones } from '@web-runner/db/schema';
import { eq, and } from 'drizzle-orm';
import { DEFAULT_ZONES } from '@web-runner/shared/zones';

export const load = async ({ params, locals }) => {
  const userId = locals.user!.id;
  const id = Number(params.id);

  const [activity] = await db.select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, userId)));

  if (!activity) error(404, 'Activity not found');

  const [laps, streams, segments, zonesRow] = await Promise.all([
    db.select().from(activityLaps)
      .where(eq(activityLaps.activityId, id))
      .orderBy(activityLaps.lapIndex),
    db.select().from(activityStreams)
      .where(eq(activityStreams.activityId, id)),
    db.select().from(activitySegments)
      .where(eq(activitySegments.activityId, id))
      .orderBy(activitySegments.segmentIndex),
    db.select().from(userZones)
      .where(and(eq(userZones.userId, userId), eq(userZones.zoneType, 'pace')))
      .limit(1),
  ]);

  const zones = zonesRow[0]?.zones ?? DEFAULT_ZONES;

  // Build a map of streamType → data for the template
  const streamMap = Object.fromEntries(
    streams.map(s => [s.streamType, s.data])
  );

  return {
    activity,
    laps,
    segments,
    streamMap,
    zones,
  };
};
```

**Security note:** The query includes `eq(activities.userId, userId)` — a user can only access their own activities. This is enforced at the load function level, not just the route guard.

#### Page (`activities/[id]/+page.svelte`)

Key implementation:
- Crosshair sync: one `let crosshairIndex = $state<number | null>(null)` passed to all `ActivityChart` components
- X-axis toggle (distance vs. time): one `let xAxis = $state<'distance' | 'time'>('distance')` shared across charts
- Map: lazy-loaded `RouteMap.svelte` (already built, unchanged)
- Route GeoJSON from `activity.routeGeoJson` or falls back to `latlng` stream (existing logic)

### 6.3 Zone Settings

#### Race-Derived Zone Calculation Algorithm

Zones can be calculated automatically from a recent race effort. The anchor concept is **lactate threshold pace (T-pace)** — roughly the pace sustainable for a hard 60-minute effort. All zones are derived from it.

Different race distances are run at predictable intensities relative to LT, so from a known race result we back-calculate T-pace:

```
T-pace = 5K race pace       + 15 sec/km
T-pace = 10K race pace      + 8  sec/km
T-pace = HM race pace       - 5  sec/km   (HM ≈ LT, most reliable)
T-pace = marathon race pace  - 25 sec/km
```

Zone derivation from T-pace:

```
Zone 5 (VO2max):  faster than T − 15 sec/km
Zone 4 (LT):      T − 15  to  T + 5
Zone 3 (Tempo):   T + 5   to  T + 35
Zone 2 (GA):      T + 35  to  T + 75
Zone 1 (Easy):    slower than T + 75 sec/km
```

For HR zones: estimate LTHR from the race activity's average HR (adjusted by distance), then apply Friel percentage-based zones.

**Race selection logic** (`packages/shared/src/zones.ts`):

```
For each distance in priority order (HM → 10K → 10mi → 5K → marathon → 1mi):
  candidates = activities in last 12 months, within ±10% of distance

  if candidates is empty → skip

  race_tagged  = candidates where workoutType = 'Race'
  best         = fastest of race_tagged if any, else fastest of all candidates

  → use best, stop

If nothing found → fall back to manual activity picker
```

**UX flow on the zone settings page:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Calculate from a recent race:                                  │
│                                                                 │
│  NYC Half · Oct 12, 2025 · 1:45:32                             │
│  Estimated threshold: 4:58/km (7:59/mi)                        │
│                                                                 │
│  [Apply calculated zones]   [Choose a different activity ▼]    │
└─────────────────────────────────────────────────────────────────┘
```

Applying calculated zones populates the manual editor inputs — the user can adjust before saving. A note is shown: *"Accuracy depends on this being a maximal effort."*

#### Load Function (`settings/zones/+page.server.ts`)

```typescript
import { db } from '$lib/server/db';
import { userZones } from '@web-runner/db/schema';
import { eq, and } from 'drizzle-orm';
import { DEFAULT_ZONES } from '@web-runner/shared/zones';

export const load = async ({ locals }) => {
  const userId = locals.user!.id;

  const [paceRow, hrRow] = await Promise.all([
    db.select().from(userZones)
      .where(and(eq(userZones.userId, userId), eq(userZones.zoneType, 'pace')))
      .limit(1),
    db.select().from(userZones)
      .where(and(eq(userZones.userId, userId), eq(userZones.zoneType, 'heartrate')))
      .limit(1),
  ]);

  return {
    paceZones: paceRow[0]?.zones ?? DEFAULT_ZONES,
    hrZones: hrRow[0]?.zones ?? DEFAULT_ZONES,
  };
};

export const actions = {
  saveZones: async ({ request, locals }) => {
    const userId = locals.user!.id;
    const data = await request.formData();
    const zoneType = data.get('zoneType') as 'pace' | 'heartrate';

    // Parse zone bounds from form fields: zone_1_min, zone_1_max, etc.
    const zones = DEFAULT_ZONES.map(z => {
      const rawMin = data.get(`zone_${z.index}_min`);
      const rawMax = data.get(`zone_${z.index}_max`);
      return {
        ...z,
        paceMin: rawMin ? parsePaceInput(String(rawMin)) : z.paceMin,
        paceMax: rawMax ? parsePaceInput(String(rawMax)) : z.paceMax,
      };
    });

    await db.insert(userZones)
      .values({ userId, zoneType, zones })
      .onConflictDoUpdate({
        target: [userZones.userId, userZones.zoneType],
        set: { zones, updatedAt: new Date() },
      });

    return { success: true };
  },
};

/**
 * Parse a "M:SS" pace string into sec/km.
 * Input is in the user's unit (sec/mi if imperial, sec/km if metric).
 * Caller handles unit conversion before passing to this function.
 */
function parsePaceInput(input: string): number | null {
  const match = input.match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}
```

---

## 7. API Endpoints

The SvelteKit load functions cover the SSR use case. For future app/client use, two REST endpoints are added:

### `GET /api/activities`

```typescript
// apps/web/src/routes/api/activities/+server.ts
// Query params: sport, workout, range, cursor, limit (max 100)
// Returns: { activities: ActivitySummary[], nextCursor: string | null }
```

### `GET /api/activities/[id]`

```typescript
// apps/web/src/routes/api/activities/[id]/+server.ts
// Returns: { activity, laps, streams: { [type]: number[] }, zones }
// Auth: validates activity belongs to session user
```

These are thin wrappers around the same DB queries used by the load functions. The load functions and API handlers share a common query function extracted to `$lib/server/queries/activities.ts`.

---

## 8. `routeGeoJson` Field

The activity detail page uses `activity.routeGeoJson` for the map. Looking at the schema, the route is stored as a PostGIS geometry column (`route`). The load function needs to serialize it as GeoJSON:

```typescript
// In the activity detail load function:
const [activityRow] = await db.execute(sql`
  SELECT
    *,
    ST_AsGeoJSON(route) as route_geo_json
  FROM activities
  WHERE id = ${id} AND user_id = ${userId}
`);
```

The existing admin detail page does `a.routeGeoJson` — this suggests the field is already being selected in the admin query. Verify against `activities/[id]/+page.server.ts` in the admin section; the pattern should be reused.

---

## 9. Testing Strategy

### Unit Tests

**`packages/shared`** — zone parsing and default zone validation:
```
src/__tests__/zones.test.ts
- DEFAULT_ZONES has 5 zones in ascending index order
- Zone color values are valid hex codes
- Pace bounds are consistent (zone N max equals zone N+1 min)
```

**`apps/web`** — format utilities (extend existing tests):
```
src/lib/__tests__/format.test.ts
- parsePaceInput('8:30') → 510
- parsePaceInput('9:00') → 540
- parsePaceInput('invalid') → null
- formatPaceValue(510, 'imperial') → '13:42 /mi'
```

### Load Function Tests

**Activity list load function:**
```typescript
// activities/__tests__/page.server.test.ts
- Returns activities filtered by userId (no cross-user data leak)
- Sport filter narrows results
- Cursor pagination: cursor from page N gives page N+1
- hasMore=true when results exceed PAGE_SIZE
- sparklineMap populated for activities with velocity_smooth streams
```

**Zone settings actions:**
```typescript
// settings/zones/__tests__/page.server.test.ts
- saveZones upserts new record when none exists
- saveZones updates existing record on re-save
- parsePaceInput handles M:SS format
- parsePaceInput rejects invalid input (no crash, returns null)
```

### Chart Component Tests

The chart components use SVG math that can be unit-tested without a DOM:

```typescript
// lib/components/__tests__/ActivityChart.test.ts
// Test the coordinate transform functions in isolation
- toX maps xMin → PADDING_H, xMax → PADDING_H + chartW
- toY maps yMin → PADDING_TOP + chartH, yMax → PADDING_TOP
- Zone bands cover correct y range given zone bounds
- Downsampled sparkline data has ≤ 60 points
```

---

## 10. File Structure

```
packages/
  shared/
    src/
      zones.ts                            NEW: ZoneDefinition, DEFAULT_ZONES
      index.ts                            updated: export from zones
  db/
    src/schema/
      user-zones.ts                       NEW: userZones table
      index.ts                            updated: export userZones
    drizzle/
      0003_user_zones.sql                 NEW: migration

apps/web/src/
  app.css                                 updated: zone + stream color tokens
  routes/(protected)/
    +layout.svelte                        NEW: top nav shell (user section)
    activities/
      +page.server.ts                     NEW: activity list load
      +page.svelte                        NEW: activity list UI
      [id]/
        +page.server.ts                   NEW: activity detail load
        +page.svelte                      NEW: activity detail UI
    settings/
      zones/
        +page.server.ts                   NEW: zone load + saveZones action
        +page.svelte                      NEW: zone settings UI
    api/
      activities/
        +server.ts                        NEW: REST activity list
        [id]/
          +server.ts                      NEW: REST activity detail
  lib/
    components/
      ActivityChart.svelte                NEW: interactive chart
      SparkLine.svelte                    NEW: inline sparkline
      StatCard.svelte                     NEW: labeled stat tile
      RouteMap.svelte                     unchanged
      StreamChart.svelte                  unchanged (admin only)
    server/
      queries/
        activities.ts                     NEW: shared DB query functions
    format.ts                             updated: parsePaceInput helper
```

---

## 11. Open Questions / Decisions

| Question | Decision |
|---|---|
| Does `(protected)/+layout.svelte` break the admin layout? | No — admin has its own `+layout.svelte` that replaces the shell entirely. SvelteKit nested layouts: admin layout overrides parent. |
| Should zones be pace *or* HR, or both simultaneously? | Both — user sets both. Charts overlay zones based on which stream is being displayed (pace chart uses pace zones, HR chart uses HR zones). |
| How to handle activities with no HR data? | HR stat card shows `—`. HR chart is omitted. SparkLine uses velocity data always. |
| Downsampling for sparklines — where? | Server-side in the load function. Reduces serialized payload. 60 points is sufficient for a 64px wide sparkline. |
| Route GeoJSON — raw query or schema change? | Raw SQL with `ST_AsGeoJSON` in the load function query. No schema change needed. Pattern matches existing admin detail page. |
| GAP (Grade-Adjusted Pace) — Phase 4a or 4b? | Phase 4a includes the chart *slot* for GAP but only displays it if the stream exists (Strava provides `grade_smooth`, GAP must be computed). Computing GAP from `velocity_smooth + grade_smooth` is non-trivial and deferred to Phase 4b or 6. |
| Effort zones — should Zone 5 have an upper bound? | No — "faster than X" covers everything above the threshold. `paceMin: null` and `hrMax: null` represent unbounded. |

---

## 12. Dependencies

New packages in `apps/web`:
- **layerchart** — Svelte-native SVG chart library for `ActivityChart.svelte`

No other new packages:
- PostGIS GeoJSON via raw SQL (`ST_AsGeoJSON`) — already in use in admin
- Zone JSONB stored and retrieved via Drizzle — existing pattern
- `SparkLine.svelte` — custom SVG, no library needed (sufficiently simple)

The `packages/shared` package gets a new file (`zones.ts`). It already exists as a workspace package, so no new workspace setup needed.

---

## 13. Exit Criteria

- A user can log in and see a list of their own activities, grouped by month
- Filtering by sport type and date range works
- Each activity row shows a sparkline of pace data (when available)
- Clicking an activity navigates to the detail page
- The detail page shows: map, stat cards, pace/HR/elevation charts with zone bands, laps table, 500m splits
- Charts share a synchronized crosshair on hover
- X-axis toggles between distance and time
- The zone settings page allows defining 5 pace and/or HR zones
- Saved zones appear as bands on all activity charts
- No cross-user data access (userId guard in all load functions)
- All load function tests pass
