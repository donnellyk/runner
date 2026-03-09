# Phase 4a.1: Activity Notes — Implementation Details

## Progress

- [ ] Database schema: `activity_notes` table + migration
- [ ] Schema export and type definitions
- [ ] Query function: add notes to `getActivity()` in `activities.ts`
- [ ] Form actions: create, update, delete notes (user-facing page)
- [ ] Notes panel on activity detail page (list, add, edit, delete)
- [ ] Repeat note creation (frontend-only expansion into individual rows)
- [ ] RouteMap: pre-computed markers and range highlights
- [ ] ActivityChart: vertical lines, shaded regions, crosshair tooltip
- [ ] Toggle to show/hide note indicators
- [ ] Click-to-highlight: clicking a note highlights its location on map + charts
- [ ] Tests: schema validation, CRUD, distance utilities, display logic

---

## Overview

Add structured, distance-anchored notes to activities. Each note is tied to either a single distance point or a distance range on the activity. Notes are displayed as visual indicators on the route map and stream charts, with a toggle to show or hide them.

**Examples:**
- Point note at 4 km: "Took a 100g Maurten gel"
- Range note from 1 km to 1.5 km: "This hill felt harder than expected"
- Point note at 10 km: "Right knee started aching"
- Repeating note every 4 mi: "Maurten 100 gel" (expanded into individual rows at 4mi, 8mi, 12mi, etc.)

---

## 1. Database Schema

### New table: `activity_notes`

```typescript
// packages/db/src/schema/activity-notes.ts
import { pgTable, serial, integer, doublePrecision, text, timestamp, index } from 'drizzle-orm/pg-core';
import { activities } from './activities';

export const activityNotes = pgTable(
  'activity_notes',
  {
    id: serial('id').primaryKey(),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    distanceStart: doublePrecision('distance_start').notNull(), // meters
    distanceEnd: doublePrecision('distance_end'),               // meters, null = point note
    content: text('content').notNull(),
    color: text('color'),                                       // optional override
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_activity_notes_activity_id').on(table.activityId),
  ],
);

export type ActivityNote = typeof activityNotes.$inferSelect;
export type NewActivityNote = typeof activityNotes.$inferInsert;
```

**Design decisions:**
- `doublePrecision` for distance columns — matches `activitySegments` pattern
- `distanceStart` is always required (meters from activity start)
- `distanceEnd` is null for point notes, populated for range notes
- `onDelete: 'cascade'` — deleting an activity deletes its notes
- No `userId` column — ownership inferred through `activity.userId`
- `color` is optional — allows future categorization (nutrition, pain, terrain, etc.)
- Index pattern matches `activitySegments`

### Migration

```sql
CREATE TABLE activity_notes (
  id SERIAL PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  distance_start DOUBLE PRECISION NOT NULL,
  distance_end DOUBLE PRECISION,
  content TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (distance_end IS NULL OR distance_end > distance_start)
);

CREATE INDEX idx_activity_notes_activity_id ON activity_notes(activity_id);
```

### Schema export

Add to `packages/db/src/schema/index.ts`:
```typescript
export { activityNotes } from './activity-notes';
```

---

## 2. Query + API Layer

### Add notes to `getActivity()`

**Location:** `apps/web/src/lib/server/queries/activities.ts`

Add the notes query to the existing `Promise.all` in `getActivity()`:

```typescript
const [laps, streams, segments, paceZonesRow, hrZonesRow, notes] = await Promise.all([
  // ... existing queries ...
  db.select()
    .from(activityNotes)
    .where(eq(activityNotes.activityId, activityId))
    .orderBy(activityNotes.distanceStart),
]);

return { activity, laps, segments, streamMap, paceZones, hrZones, notes };
```

This keeps the notes query parallel with existing queries (no N+1), scoped to the user via the `userId` check on the activity itself.

### Form actions

**Location:** `apps/web/src/routes/(protected)/(app)/activities/[id]/+page.server.ts`

Add form actions to the user-facing activity page:

```typescript
import { fail } from '@sveltejs/kit';
import { getDb } from '@web-runner/db/client';
import { activityNotes, activities } from '@web-runner/db/schema';
import { eq, and } from 'drizzle-orm';

export const actions = {
  createNote: async ({ params, request, locals }) => {
    const db = getDb();
    const userId = locals.user!.id;
    const activityId = Number(params.id);
    if (isNaN(activityId)) return fail(400, { error: 'Invalid activity' });

    // Verify activity belongs to user and get distance for bounds check
    const [activity] = await db
      .select({ id: activities.id, distance: activities.distance })
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.userId, userId)));
    if (!activity) return fail(404, { error: 'Activity not found' });

    const formData = await request.formData();
    const distanceStart = parseFloat(formData.get('distanceStart') as string);
    const distanceEnd = formData.get('distanceEnd')
      ? parseFloat(formData.get('distanceEnd') as string)
      : null;
    const content = (formData.get('content') as string)?.trim();

    // Validation
    if (isNaN(distanceStart) || distanceStart < 0) {
      return fail(400, { error: 'Invalid start distance' });
    }
    if (distanceEnd !== null && (isNaN(distanceEnd) || distanceEnd <= distanceStart)) {
      return fail(400, { error: 'End distance must be greater than start distance' });
    }
    if (activity.distance && (distanceStart > activity.distance ||
        (distanceEnd !== null && distanceEnd > activity.distance))) {
      return fail(400, { error: 'Distance exceeds activity length' });
    }
    if (!content || content.length > 1000) {
      return fail(400, { error: 'Content is required (max 1000 characters)' });
    }

    await db.insert(activityNotes).values({
      activityId,
      distanceStart,
      distanceEnd,
      content,
    });
  },

  updateNote: async ({ params, request, locals }) => {
    const db = getDb();
    const userId = locals.user!.id;
    const activityId = Number(params.id);

    const formData = await request.formData();
    const noteId = parseInt(formData.get('noteId') as string);
    const distanceStart = formData.has('distanceStart')
      ? parseFloat(formData.get('distanceStart') as string)
      : undefined;
    const distanceEnd = formData.has('distanceEnd')
      ? formData.get('distanceEnd')
        ? parseFloat(formData.get('distanceEnd') as string)
        : null
      : undefined;
    const content = (formData.get('content') as string)?.trim();

    if (!content || content.length > 1000) {
      return fail(400, { error: 'Content is required (max 1000 characters)' });
    }

    // Scope delete to both noteId AND activityId (ownership via activity's userId check)
    const [activity] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.userId, userId)));
    if (!activity) return fail(404, { error: 'Activity not found' });

    const updates: Record<string, unknown> = { content, updatedAt: new Date() };
    if (distanceStart !== undefined) updates.distanceStart = distanceStart;
    if (distanceEnd !== undefined) updates.distanceEnd = distanceEnd;

    await db.update(activityNotes)
      .set(updates)
      .where(and(eq(activityNotes.id, noteId), eq(activityNotes.activityId, activityId)));
  },

  deleteNote: async ({ params, request, locals }) => {
    const db = getDb();
    const userId = locals.user!.id;
    const activityId = Number(params.id);

    const formData = await request.formData();
    const noteId = parseInt(formData.get('noteId') as string);

    // Verify ownership: activity must belong to user
    const [activity] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.userId, userId)));
    if (!activity) return fail(404, { error: 'Activity not found' });

    await db.delete(activityNotes)
      .where(and(eq(activityNotes.id, noteId), eq(activityNotes.activityId, activityId)));
  },
};
```

**Key security decisions:**
- All actions verify `activity.userId === locals.user.id` via the activity query
- `updateNote` and `deleteNote` scope to both `noteId` AND `activityId` — prevents cross-activity manipulation
- `updateNote` supports changing distances (not just content)
- Content capped at 1000 characters
- Distance validated against `activity.distance` upper bound

---

## 3. Activity Detail Page — Notes Panel

### Target: `apps/web/src/routes/(protected)/(app)/activities/[id]/+page.svelte`

Notes go on the **user-facing** activity page, not the admin page. This is where charts, stat cards, and crosshair sync already live.

### 3a. Toggle control

Add to the Charts header bar (alongside the existing Distance/Time toggle):

```svelte
<label class="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
  <input type="checkbox" bind:checked={showNotes} class="rounded border-zinc-300" />
  Notes
</label>
```

`showNotes` is a `$state(true)` boolean passed to RouteMap and ActivityChart.

### 3b. Notes list

New section after charts, before laps. Shows existing notes sorted by distance:

```svelte
<div class="mb-8">
  <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
    Notes ({data.notes.length})
  </h2>
  {#if data.notes.length > 0}
    {#each data.notes as note (note.id)}
      <div
        class="flex items-start gap-3 py-2 border-b border-zinc-50 cursor-pointer {highlightedNoteId === note.id ? 'bg-amber-50' : 'hover:bg-zinc-50'}"
        onclick={() => highlightedNoteId = highlightedNoteId === note.id ? null : note.id}
      >
        <div class="text-xs text-zinc-400 font-mono whitespace-nowrap" style="font-variant-numeric: tabular-nums;">
          {formatDistance(note.distanceStart, units)}
          {#if note.distanceEnd}
            – {formatDistance(note.distanceEnd, units)}
          {/if}
        </div>
        <div class="flex-1 text-sm text-zinc-700">{note.content}</div>
        <form method="POST" action="?/deleteNote" use:enhance>
          <input type="hidden" name="noteId" value={note.id} />
          <button
            class="text-xs text-zinc-300 hover:text-red-500"
            onclick={(e) => e.stopPropagation()}
          >Delete</button>
        </form>
      </div>
    {/each}
  {:else}
    <p class="text-sm text-zinc-400">No notes</p>
  {/if}

  <!-- Add note form -->
  ...
</div>
```

### 3c. Add note form

Inline form below the notes list:

```svelte
<form method="POST" action="?/createNote" use:enhance={handleNoteSubmit} class="flex gap-2 items-end mt-3">
  <div>
    <label class="text-xs text-zinc-400">Start ({units === 'imperial' ? 'mi' : 'km'})</label>
    <input type="text" name="distanceStart" placeholder="1.0"
      class="w-20 text-sm border border-zinc-200 rounded px-2 py-1 font-mono" />
  </div>
  <div>
    <label class="text-xs text-zinc-400">End (optional)</label>
    <input type="text" name="distanceEnd" placeholder=""
      class="w-20 text-sm border border-zinc-200 rounded px-2 py-1 font-mono" />
  </div>
  <div>
    <label class="text-xs text-zinc-400">Repeat every</label>
    <input type="text" name="repeatEvery" placeholder=""
      class="w-20 text-sm border border-zinc-200 rounded px-2 py-1 font-mono" />
  </div>
  <div class="flex-1">
    <label class="text-xs text-zinc-400">Note</label>
    <input type="text" name="content" placeholder="What happened here?"
      class="w-full text-sm border border-zinc-200 rounded px-2 py-1" />
  </div>
  <button type="submit" class="px-3 py-1 text-sm bg-zinc-900 text-white rounded hover:bg-zinc-800">Add</button>
</form>
```

### 3d. Unit conversion

**Location:** `apps/web/src/lib/format.ts`

Add a `toMeters` function alongside existing conversion utilities:

```typescript
export function toMeters(displayValue: number, units: Units): number {
  return units === 'imperial' ? displayValue * 1609.34 : displayValue * 1000;
}
```

The `use:enhance` handler converts display values to meters before submission:

```typescript
function handleNoteSubmit({ formData }: { formData: FormData }) {
  const start = parseFloat(formData.get('distanceStart') as string);
  if (!isNaN(start)) formData.set('distanceStart', String(toMeters(start, units)));

  const end = formData.get('distanceEnd') as string;
  if (end) {
    const endVal = parseFloat(end);
    if (!isNaN(endVal)) formData.set('distanceEnd', String(toMeters(endVal, units)));
  }
}
```

### 3e. Repeat note expansion

The "Repeat every" field is **frontend-only**. When populated, the `use:enhance` handler expands a single form submission into multiple `createNote` requests:

```typescript
async function handleNoteSubmit({ formData, cancel }) {
  const repeatStr = formData.get('repeatEvery') as string;
  const repeatEvery = repeatStr ? parseFloat(repeatStr) : null;

  if (repeatEvery && repeatEvery > 0 && activity.distance) {
    cancel(); // prevent default single submission

    const start = parseFloat(formData.get('distanceStart') as string);
    const content = formData.get('content') as string;
    const startMeters = toMeters(start, units);
    const intervalMeters = toMeters(repeatEvery, units);
    const maxDist = activity.distance;

    // Generate all repeat points: startMeters, startMeters + interval, startMeters + 2*interval, ...
    for (let dist = startMeters; dist <= maxDist; dist += intervalMeters) {
      await fetch('?/createNote', {
        method: 'POST',
        body: new URLSearchParams({
          distanceStart: String(dist),
          content,
        }),
      });
    }

    invalidateAll();
    return;
  }

  // Single note: just convert units
  // ... unit conversion as above ...
}
```

Each repeated note is saved as its own row in the database. The "every X" interval is not stored — it's purely a UI convenience for bulk creation.

### 3f. Click-to-highlight interaction

When a user clicks a note in the list:
1. Set `highlightedNoteId` state
2. Pass to RouteMap and ActivityChart components
3. Map pans to the note's location
4. Note indicator on charts changes opacity

---

## 4. RouteMap Enhancements

### Location: `apps/web/src/lib/components/RouteMap.svelte`

### Pre-compute positions in the parent

Rather than passing raw distance/latlng arrays to RouteMap and making it do lookups, the parent page pre-computes marker positions:

```typescript
// In +page.svelte
interface NoteMarker {
  id: number;
  content: string;
  point: [number, number];             // [lng, lat] for point notes
  range?: [number, number][];          // array of [lng, lat] for range polyline
}

const noteMarkers = $derived.by((): NoteMarker[] => {
  if (!data.notes.length || !distStream || !latlngStream) return [];

  return data.notes.map(note => {
    const startIdx = findIndexAtDistance(distStream, note.distanceStart);
    const point: [number, number] = [latlngStream[startIdx][1], latlngStream[startIdx][0]];

    let range: [number, number][] | undefined;
    if (note.distanceEnd != null) {
      const endIdx = findIndexAtDistance(distStream, note.distanceEnd);
      range = latlngStream.slice(startIdx, endIdx + 1)
        .map(([lat, lng]) => [lng, lat] as [number, number]);
    }

    return { id: note.id, content: note.content, point, range };
  });
});
```

### New RouteMap props

```typescript
interface Props {
  coordinates: [number, number][];
  marker?: [number, number];
  darkMap?: boolean;
  noteMarkers?: NoteMarker[];          // NEW — pre-computed positions
  showNotes?: boolean;                 // NEW
  highlightedNoteId?: number | null;   // NEW
}
```

This keeps RouteMap as a rendering component — it receives positions, not raw data.

### Rendering

Use a Leaflet `LayerGroup` for all note layers (easy toggle on/off):

**Point notes:** CircleMarker at `marker.point`
```typescript
L.circleMarker([lat, lng], {
  radius: 6,
  fillColor: '#f59e0b',
  color: '#ffffff',
  weight: 2,
  fillOpacity: 0.9,
}).bindTooltip(marker.content, { direction: 'top', offset: [0, -8] })
```

**Range notes:** Highlighted polyline from `marker.range`
```typescript
L.polyline(marker.range, {
  color: '#f59e0b',
  weight: 5,
  opacity: 0.7,
}).bindTooltip(marker.content, { sticky: true })
```

### Toggle + highlight

- When `showNotes` is false, call `noteLayerGroup.remove()`. When true, `noteLayerGroup.addTo(map)`.
- When `highlightedNoteId` changes, pan map to that note's position and open its tooltip.

---

## 5. ActivityChart Enhancements

### Location: `apps/web/src/lib/components/ActivityChart.svelte`

### New props

```typescript
interface Props {
  // ... existing props ...
  notes?: ActivityNote[];           // NEW
  showNotes?: boolean;              // NEW
  highlightedNoteId?: number | null; // NEW
}
```

### Distance-to-time mapping

Notes store distances in meters. When `xAxis === 'time'`, we need to convert note distances to time values for correct `toX()` positioning. The `distanceData` and `timeData` streams are parallel arrays, so this is an index lookup:

```typescript
function distanceToTime(distMeters: number): number | null {
  if (!distanceData || !timeData) return null;
  const idx = findIndexAtDistance(distanceData, distMeters);
  return timeData[idx] ?? null;
}

function noteToX(note: ActivityNote, which: 'start' | 'end'): number | null {
  const dist = which === 'start' ? note.distanceStart : note.distanceEnd;
  if (dist == null) return null;
  if (xAxis === 'distance') return toX(dist);
  const time = distanceToTime(dist);
  return time != null ? toX(time) : null;
}
```

This works in both modes: in distance mode, `toX()` maps meters directly; in time mode, we look up the corresponding time value from the parallel stream and pass that to `toX()`.

### Note indicators (both distance and time modes)

```svelte
{#if showNotes && notes}
  {#each notes as note (note.id)}
    {@const x = noteToX(note, 'start')}
    {#if x == null}
      <!-- skip: no position data available -->
    {:else if note.distanceEnd == null}
      <!-- Point note: dashed vertical line + diamond marker -->
      <line
        x1={x} y1={PAD_TOP} x2={x} y2={PAD_TOP + chartH}
        stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3"
        opacity={highlightedNoteId === note.id ? 1 : 0.6}
      />
      <polygon
        points="{x},{PAD_TOP + 2} {x + 4},{PAD_TOP + 6} {x},{PAD_TOP + 10} {x - 4},{PAD_TOP + 6}"
        fill="#f59e0b"
        opacity={highlightedNoteId === note.id ? 1 : 0.7}
      />
    {:else}
      <!-- Range note: shaded region with border lines -->
      {@const x2 = noteToX(note, 'end')}
      {#if x2 != null}
      <rect
        x={Math.min(x, x2)} y={PAD_TOP}
        width={Math.abs(x2 - x)} height={chartH}
        fill="#f59e0b"
        fill-opacity={highlightedNoteId === note.id ? 0.2 : 0.1}
      />
      <line x1={x} y1={PAD_TOP} x2={x} y2={PAD_TOP + chartH}
        stroke="#f59e0b" stroke-width="1" opacity="0.4" />
      <line x1={x2} y1={PAD_TOP} x2={x2} y2={PAD_TOP + chartH}
        stroke="#f59e0b" stroke-width="1" opacity="0.4" />
      {/if}
    {/if}
  {/each}
{/if}
```

### Crosshair note tooltip

When the crosshair overlaps a note's distance, show the note content:

```typescript
let activeNote = $derived.by(() => {
  if (!notes || !showNotes || crosshairIndex == null) return null;
  // Convert crosshair position back to distance for note matching.
  // In distance mode, trimXData values are already meters.
  // In time mode, reverse-lookup: find the distance at the current time index.
  let dist: number;
  if (xAxis === 'distance') {
    dist = trimXData[crosshairIndex];
  } else if (distanceData) {
    // trimXData holds time values; use the same index to look up distance
    const origIdx = crosshairIndex + startIdx;
    dist = distanceData[origIdx] ?? 0;
  } else {
    return null;
  }

  return notes.find(n =>
    n.distanceEnd
      ? dist >= n.distanceStart && dist <= n.distanceEnd
      : Math.abs(dist - n.distanceStart) < (xMax - xMin) * 0.01
  ) ?? null;
});
```

Render `activeNote.content` as a small label in the chart header area (next to the existing tooltip value).

**Trim offset consideration:** Notes reference absolute distances (meters from activity start). The chart's `trimXData` also uses absolute distance values from the distance stream, so note positions align correctly even after leading-zero trimming. The `toX()` function maps distance values (not indices), so this works naturally. In time mode, we use `findIndexAtDistance` on the full distance stream to convert note distances to time values for positioning, and reverse-lookup distance from the crosshair index for tooltip matching.

---

## 6. Graceful Degradation

### Activities without distance/latlng streams

- **Notes panel:** Always shown. Notes can be created and listed regardless of stream availability.
- **Map indicators:** Only rendered when `latlngStream` is available. The `noteMarkers` derivation returns `[]` when streams are missing.
- **Chart indicators:** Rendered in both distance and time modes via `noteToX()` mapping. If both `distanceData` and `timeData` are missing, indicators are not drawn.
- **Treadmill runs:** No GPS data, so no map indicators. Chart indicators work if distance stream exists.

---

## 7. Data Flow Summary

```
getActivity() in activities.ts
  ├── activity, laps, segments, streamMap, paceZones, hrZones (existing)
  └── notes: ActivityNote[] (NEW — parallel query in Promise.all)

+page.svelte (user-facing)
  ├── showNotes: $state(true)
  ├── highlightedNoteId: $state<number | null>(null)
  ├── noteMarkers: $derived (pre-computed from notes + distStream + latlngStream)
  ├── Notes panel (list + add form with repeat + edit/delete)
  ├── RouteMap ← { noteMarkers, showNotes, highlightedNoteId }
  └── ActivityChart(s) ← { notes, showNotes, highlightedNoteId }
```

---

## 8. Implementation Order

1. **Schema + migration** — `activity_notes` table with `doublePrecision`, `CHECK` constraint, index. Export from schema index.
2. **Query layer** — Add notes to `getActivity()` Promise.all. Add `toMeters()` to `format.ts`.
3. **Form actions** — Create, update, delete with ownership checks and distance validation.
4. **Notes panel UI** — List with empty state, add form, delete buttons, `use:enhance` with unit conversion.
5. **Repeat note expansion** — Frontend-only "every X" field that creates multiple note rows.
6. **ActivityChart indicators** — Vertical lines and shaded regions (distance mode only).
7. **RouteMap indicators** — Pre-computed `NoteMarker` positions, LayerGroup toggle.
8. **Toggle + highlight** — Show/hide state, click-to-highlight in list/map/charts.
9. **Tests** — Full coverage (see below).

---

## 9. What This Does NOT Include (future scope)

- Note categories/tags (nutrition, pain, terrain, gear)
- Note templates or autocomplete
- Sharing notes between users
- Note search across activities
- Photo attachments on notes
- Admin page note indicators (admin StreamChart lacks the visual infrastructure)

---

## 10. Testing Plan

### Unit tests

- `toMeters()` — km and mi conversions, edge cases (0, very large values)
- `findIndexAtDistance()` — binary search correctness: exact match, between points, before start, after end, single-element array
- Content validation — empty, whitespace-only, over 1000 chars

### Integration tests (Vitest + Drizzle)

- Create point note — verify `distanceStart` stored, `distanceEnd` is null
- Create range note — verify both distances stored correctly
- Reject `distanceEnd <= distanceStart` (CHECK constraint)
- Reject `distanceStart` beyond `activity.distance`
- Reject content over 1000 characters
- Update note content and distances — verify `updatedAt` changes
- Delete note — verify removed
- Cascade delete — deleting activity removes its notes
- Authorization — cannot update/delete notes on another user's activity
- Load notes — verify ordered by `distanceStart`

### Component tests (if applicable)

- ActivityChart renders note indicators when `showNotes=true` (distance mode)
- ActivityChart renders note indicators when `showNotes=true` (time mode, via distance-to-time mapping)
- ActivityChart hides indicators when `showNotes=false`
- `distanceToTime()` — correct index lookup, edge cases (distance beyond stream)
- `noteToX()` — returns correct x in distance mode, correct x in time mode, null when streams missing
- Note tooltip appears when crosshair is within note range (both modes)
