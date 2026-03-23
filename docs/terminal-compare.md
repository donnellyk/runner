# Terminal Activity Comparison

## Overview

Add the ability to compare up to 4 activities side-by-side in the Terminal view. Activities are managed via a tab bar in the title area. A "Compare" toggle overlays selected activities' data on the same charts with distinct colors.

## Design Decisions

| Question | Decision |
|----------|----------|
| X-axis alignment | Align starts, shorter activity ends early |
| Compare rendering | Overlaid polylines on same chart, Y-axis expands to union of all ranges |
| Map | Overlay all routes with per-activity colors |
| Sidebar | Show stats for currently-hovered activity only |
| Crosshair | Sync across all activities by distance/time position |
| Max activities | 4 |
| Sport type restriction | Same sport only |
| Disabled in compare | Candlestick, heatmap, notes, laps panels |
| Enabled in compare | Line, area, bar charts + map |

## UI

### Activity Tabs (in Title Bar)

Comparison activities are embedded in the existing title bar — no second row. The primary activity keeps its current styling (plain text name + date). Additional activities appear as compact tabs (colored dot + truncated name + X button) between the primary label and the right-side controls.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ESC  Morning Run  Mar 15, 2026  ● Tempo Run ✕  ● Long Run ✕  [+] [Compare]  │  Dist│Time  Display  ...
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Primary activity:** unchanged styling (name + date as plain text, not a tab)
- **Additional activities:** compact tabs with colored dot + truncated name + X button to remove
- **[+] button:** opens activity search popup (hidden when at 4 activities)
- **[Compare] button:** appears when 2+ activities are loaded
- **Overflow:** when horizontal space is tight (3+ activities), overflow tabs collapse into a `+N more` dropdown list
- When only the primary activity is loaded, the title bar looks identical to today
- In non-compare mode, clicking a tab switches the view to that single activity
- In compare mode, clicking a tab toggles that activity's inclusion in the overlay

### Tab States

**Normal mode (compare off):**
- One tab is "active" (highlighted border/bg). Charts show only that activity's data.
- Clicking a different tab switches to viewing that activity.

**Compare mode:**
- Tabs show a checkbox or filled/unfilled dot to indicate selected.
- At least 2 must be selected. The primary is always selected.
- Charts overlay all selected activities.
- Clicking a tab toggles its selection (minimum 2 enforced).

### Activity Search Popup

Triggered by the `[+]` button. A dropdown/modal with:

1. **Search input** — text search on activity name, debounced (300ms)
2. **Results list** — name, date, distance, pace. Scrollable, max ~10 visible.
3. **Filtered to same sport type** as the primary activity.
4. **Click to add** — adds the activity, fetches its terminal data, closes popup.
5. **Loading state** while fetching activity data after selection.

Allow the filters we use on the activities list page as well. 

### Color Assignment

Each activity gets a color from a rotation of 4 high-contrast colors from the existing `COLOR_PALETTE` that are visually distinct on the dark terminal background:

| Slot | Color | Hex |
|------|-------|-----|
| 1 (primary) | Green | `#50fa7b` |
| 2 | Cyan | `#8be9fd` |
| 3 | Purple | `#bd93f9` |
| 4 | Orange | `#ff9e44` |

Users can change any activity's color via a color swatch picker on the tab (click the color dot).

In non-compare mode, charts use the panel's configured color (existing behavior). In compare mode, each polyline uses its activity's assigned color, overriding the panel color.

## Data Architecture

### New API Endpoints

#### `GET /api/activities/search`

Lightweight search for the activity picker.

```
Query params:
  q: string        — search text (ILIKE on name)
  sport: string    — filter by sportType (required)
  limit: number    — max results (default 20)

Response: {
  activities: {
    id: number
    name: string
    sportType: string
    startDate: string
    distance: number | null
    movingTime: number | null
    averageSpeed: number | null
  }[]
}
```

Uses `ILIKE '%query%'` on `activities.name`. Ordered by `startDate DESC`. Excludes the current activity (passed via `exclude` param). Only returns the user's own activities.

#### `GET /api/activities/[id]/terminal-data`

Fetches the full terminal payload for a comparison activity.

```
Response: {
  activity: { id, name, sportType, startDate, distance, movingTime,
              averageSpeed, averageHeartrate, totalElevationGain,
              averageCadence, routeGeoJson }
  streamMap: Record<string, number[] | [number, number][]>
  laps: ActivityLap[]
  segments: ActivitySegment[]
  notes: ActivityNote[]
}
```

Reuses the existing `getActivity()` query. Validates that the requesting user owns the activity.

### Compare State

New file: `compare-state.svelte.ts`

```typescript
interface CompareActivity {
  id: number;
  name: string;
  startDate: string;
  color: string;
  selected: boolean;           // included in compare overlay
  activity: ActivityData;
  streams: StreamData;
  laps: ActivityLap[];
  segments: ActivitySegment[];
  notes: ActivityNote[];
}

interface CompareState {
  activities: CompareActivity[];    // index 0 = primary (always present)
  compareMode: boolean;
  activeIndex: number;              // which tab is active (non-compare mode)
  loading: boolean;                 // fetching activity data
}
```

The primary activity (index 0) is populated from the existing page server load data. Additional activities are fetched client-side via the terminal-data API.

### Integration with Terminal State

`terminalState` remains unchanged — it manages layout, crosshair, processing params, etc.

`compareState` is a new parallel state object. The page component (`+page.svelte`) derives the "effective" data to pass to `TerminalLayout` based on compare state:

- **Non-compare mode:** Pass `compareState.activities[activeIndex]` data to TerminalLayout (same as today but from the active tab).
- **Compare mode:** Pass all selected activities to TerminalLayout as a `comparedActivities` array.

## Chart Changes

### TerminalLineChart

Add an optional `overlayData` prop for compare mode:

```typescript
interface OverlaySeries {
  data: number[];
  color: string;
  label: string;
}

// New prop
overlayData?: OverlaySeries[];
```

When `overlayData` is present:
- Y-axis bounds computed from the union of all series (primary + overlays)
- Primary data renders as usual
- Each overlay renders as an additional polyline with its own color
- Glow filter applied per-series
- Crosshair shows values for all series (stacked Y-badges)
- Filled/area mode: only primary fills, overlays render as lines (to avoid visual clutter)
- Smoothing applied independently to each series

### CadenceBarChart

In compare mode, render overlaid bars at full width with semi-transparency. Primary activity bars render first (back), overlay bars render on top with reduced opacity (~0.5). Each bar uses its activity's assigned color. This is simpler than grouped bars and keeps the visual scale consistent.

### TerminalMap

Add optional `overlayRoutes` prop:

```typescript
interface OverlayRoute {
  coordinates: [number, number][];
  color: string;
  label: string;
}

overlayRoutes?: OverlayRoute[];
```

Render each route as a separate Leaflet polyline. Fit map bounds to the union of all routes. Each route uses its activity color. Primary route renders on top (highest z-index). Crosshair markers shown for all activities at their respective positions.

### Disabled Panels in Compare Mode

When compare mode is active, panels with incompatible types show a dimmed overlay:

```
┌──────────────────────┐
│ CANDLESTICK          │
│                      │
│   Not available in   │
│   compare mode       │
│                      │
└──────────────────────┘
```

The panel config/type isn't changed — it just renders a placeholder. When compare mode is turned off, the panel resumes normal rendering.

Disabled panel types in compare mode:
- `candlestick` chart type
- `heatmap` special panel
- `notes` special panel
- `laps` special panel

### Crosshair in Compare Mode

The shared `crosshairIndex` maps to a position on the primary activity's distance/time array. For overlay activities, we find the corresponding index by matching the distance/time value:

```typescript
// Primary activity crosshair is at distance D
// For each overlay activity, find the index closest to D
function findOverlayCrosshairIndex(
  primaryXData: number[],
  overlayXData: number[],
  primaryIndex: number
): number | null
```

If an overlay activity is shorter than the crosshair position, its value is null.

**Y-badges:** Stacked Y-badges with collision avoidance. Each activity gets its own Y-badge at its respective Y position, colored to match the activity. When badges would overlap (values within ~20px), they nudge apart vertically to remain readable. Primary badge retains full ref-line drag interaction; overlay badges are display-only.

## Sidebar Changes

In compare mode, the sidebar header shows the name + color dot of whichever activity the crosshair is closest to (by Y-value at the crosshair X position), or the primary by default.

The stats section shows values from that activity. The laps and notes sections are hidden in compare mode (since those panels are disabled).

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/terminal/compare-state.svelte.ts` | Compare state management |
| `apps/web/src/lib/terminal/CompareBar.svelte` | Tab bar with +, tabs, compare toggle |
| `apps/web/src/lib/terminal/ActivitySearchPopup.svelte` | Search popup for adding activities |
| `apps/web/src/lib/terminal/ColorPickerDot.svelte` | Clickable color dot with swatch popup |
| `apps/web/src/routes/api/activities/search/+server.ts` | Activity search API |
| `apps/web/src/routes/api/activities/[id]/terminal-data/+server.ts` | Terminal data API |

### Modified Files

| File | Changes |
|------|---------|
| `+page.svelte` (terminal layout route) | Add CompareBar, create compareState, derive effective data |
| `TerminalLayout.svelte` | Accept optional `comparedActivities` prop, pass overlay data to charts |
| `TerminalLineChart.svelte` | Accept `overlayData` prop, render multiple polylines, union Y-bounds |
| `CadenceBarChart.svelte` | Accept overlay bar data, render grouped bars |
| `TerminalMap.svelte` | Accept `overlayRoutes`, render multiple polylines |
| `TerminalPanel.svelte` | Show disabled overlay when panel type is incompatible with compare mode |
| `TerminalSidebar.svelte` | Show activity indicator in compare mode, hide laps/notes sections |
| `apps/web/src/lib/server/queries/activities.ts` | Add `searchActivities()` query function |

### Unchanged Files

Terminal state, layout encoding, grid system, processing popups, and all other infrastructure remain unchanged. Compare state is additive and doesn't alter existing data flow.

## Implementation Order

### Phase 1: API Layer
1. Add `searchActivities()` to `activities.ts` query module
2. Create `/api/activities/search` endpoint
3. Create `/api/activities/[id]/terminal-data` endpoint
4. Tests for search query

### Phase 2: State & UI Shell
5. Create `compare-state.svelte.ts`
6. Create `CompareBar.svelte` (tabs, +, compare toggle)
7. Create `ActivitySearchPopup.svelte`
8. Create `ColorPickerDot.svelte`
9. Wire into `+page.svelte` — tab switching works in non-compare mode

### Phase 3: Compare Mode Charts
10. Update `TerminalLineChart.svelte` with overlay support
11. Update `CadenceBarChart.svelte` with grouped bars
12. Update `TerminalMap.svelte` with multiple routes
13. Update `TerminalPanel.svelte` with disabled state
14. Update `TerminalLayout.svelte` to pipe compare data through
15. Update `TerminalSidebar.svelte` for compare mode

### Phase 4: Polish
16. Crosshair multi-activity value display
17. Color picker dot interaction
18. Loading states and error handling
19. Keyboard shortcuts (maybe number keys to toggle tabs)
20. URL persistence of compared activity IDs (`?compare=123,456`)

## Edge Cases

- **Activity with no streams:** Skip overlay for that activity on charts that need missing streams. Show a warning badge on the tab.
- **Very different distances:** Shorter activity's polyline simply ends. No extrapolation.
- **Switching sport type mid-compare:** Not possible — search is filtered to same sport.
- **Removing an activity while in compare mode:** If only 2 remain and one is removed, auto-exit compare mode.
- **Layout changes in compare mode:** Grid resize/drag works normally. Panel config changes apply to the panel, not per-activity.
- **Saved layouts:** Compare state is not saved with layouts (layouts are structural). Compare state is session-only or URL-param based.

## Changelog

### 2026-03-19
- **Tab bar placement:** Moved activity tabs into the existing title bar instead of adding a second row. Primary activity keeps its current plain-text styling; only additional activities render as compact tabs. Overflow collapses into a dropdown.
- **CadenceBarChart compare rendering:** Changed from grouped side-by-side bars to overlaid bars with semi-transparency. Simpler and keeps bars at full width.
- **Crosshair Y-badges:** Added stacked Y-badges with collision avoidance — one badge per activity at its Y position, nudging apart when overlapping. Overlay badges are display-only; primary retains ref-line interaction.
