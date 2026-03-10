# Phase 4b: Terminal Mode — Activity Analysis Dashboard

## Overview

A full-viewport, dark-themed, multi-panel activity analysis view inspired by Bloomberg Terminal and TradingView. The user opens an activity in "Terminal Mode" and sees a configurable 3x2 grid of synchronized charts, a route map, and a sidebar with stats and controls. Crosshairs sync across all panels. The experience feels like a different product — dark, dense, data-forward — while sharing fonts and core logic with the main site.

This phase covers single-activity analysis only. Multi-activity overlay/comparison is deferred.

## Route

```
/activities/[id]/terminal
```

Full-viewport, no app shell (no header/footer/nav). Uses a `(terminal)` layout group under `(protected)` for auth without the app shell:

```
routes/(protected)/
  (app)/         — header/nav/footer
  (terminal)/    — bare, full-viewport, auth only
    activities/[id]/terminal/+page.svelte
```

An exit button (top-left) and `Esc` key return to `/activities/[id]`.

### Entry Point

A card on the activity detail page, after the cadence card, same dimensions as the other metric cards. Dark background (`--term-bg`), terminal theme styling. Label: `> Terminal` in monospace font. Clicking navigates to the terminal route.

---

## Layout

### Grid Structure

A 3x2 panel grid plus a fixed-width sidebar (280px). Desktop only — no mobile/responsive layout in v1.

```
┌──────────┬──────────┬──────────┬────────────┐
│          │          │          │            │
│  Panel A │  Panel B │  Panel C │  Sidebar   │
│          │          │          │            │
├──────────┼──────────┼──────────┤  - Stats   │
│          │          │          │  - Controls│
│  Panel D │  Panel E │  Panel F │  - Notes   │
│          │          │          │  - Laps    │
└──────────┴──────────┴──────────┴────────────┘
```

**Default assignment:**
- A: Route Map (dark tiles)
- B: Pace (line chart)
- C: Heart Rate (area chart)
- D: Elevation (filled area)
- E: Cadence (bar chart)
- F: Pace Candlestick (per-split)

Panels resize proportionally with the viewport. No drag-and-drop — just dropdown swaps. Keep it simple for v1.

### Panel Configuration

Each panel has two dropdowns in its title bar:

1. **Data source**: Pace, Heart Rate, Elevation, Cadence, Power, Grade
2. **Chart type**: Filtered based on the selected data source (constrained matrix)

| Chart Type | Available For |
|------------|--------------|
| Line | Any stream |
| Area | Any stream |
| Bar | Cadence, Pace |
| Candlestick | Pace only (needs segment OHLC data) |

Special panel types (single dropdown, no data source selection):
- **Map**: Leaflet dark map with route, crosshair marker, notes
- **Notes**: Scrollable note list with click-to-highlight
- **Split Heatmap**: Color-coded grid of all metrics across splits
- **Lap Comparison**: Horizontal bars comparing lap paces

If a stream doesn't exist for the activity (e.g., no power data), that data source is greyed out in the dropdown.

### Candlestick Granularity

When chart type is candlestick, a toggle in the panel title bar switches between:
- **Splits**: One candle per 500m segment (default)
- **Laps**: One candle per lap (disabled if activity has ≤1 lap)

---

## Dark Theme

### Color System

A self-contained dark palette applied only within the terminal route. Does not affect the rest of the app.

```css
/* Terminal Mode — scoped to (terminal) layout group */
--term-bg:            #0b0f1a;    /* near-black navy */
--term-surface:       #131829;    /* panel background */
--term-surface-hover: #1a2035;    /* panel hover/active */
--term-border:        #1e2640;    /* panel borders, grid lines */
--term-grid:          #1a2238;    /* chart grid lines */
--term-text:          #c8cee0;    /* primary text */
--term-text-muted:    #6b7394;    /* labels, secondary */
--term-text-bright:   #eef0f6;    /* values, headings */

/* Stream colors — higher saturation for dark bg */
--term-pace:          #ff8c42;    /* warm orange */
--term-hr:            #ff4d6a;    /* coral red */
--term-elevation:     #2dd4a8;    /* mint green */
--term-cadence:       #a78bfa;    /* soft purple */
--term-power:         #fbbf24;    /* gold */
--term-grade:         #60a5fa;    /* sky blue */

/* Zone bands — distinct hues, low opacity on dark bg */
--term-zone-1:        #60a5fa33;  /* blue — easy/recovery */
--term-zone-2:        #2dd4a833;  /* teal — aerobic */
--term-zone-3:        #eab30833;  /* yellow — tempo */
--term-zone-4:        #f9731633;  /* orange — threshold */
--term-zone-5:        #ef444433;  /* red — VO2max */

/* Crosshair */
--term-crosshair:     #ffffff55;
--term-crosshair-label-bg: #131829ee;
```

### Typography

Same fonts as main site (serif headings, Geist Mono for data). Smaller base sizes — dense information display:
- Panel titles: 10px uppercase tracking-wide, `--term-text-muted`
- Data values: 11px monospace, `--term-text-bright`
- Axis labels: 9px monospace, `--term-text-muted`
- Sidebar headings: 12px semibold, `--term-text`

---

## Chart Types

### Line / Area

Standard polyline or filled area chart. Works with any data stream. Supports zone bands (displayed as horizontal color bands at low opacity). Shared utilities with existing `ActivityChart` for axis calculation, data processing, and polyline generation — but separate terminal-specific rendering components (not a fork of ActivityChart).

### Pace Candlestick

One candle per segment (500m split) or per lap. Each candle encodes four values:

```
       ┬  ← wick top: fastest instantaneous pace in segment
       │
    ┌──┤  ← body top: pace at segment start (or avg first quarter)
    │  │
    │  │  ← body: colored green if segment got faster, red if slower
    │  │
    └──┤  ← body bottom: pace at segment end (or avg last quarter)
       │
       ┴  ← wick bottom: slowest instantaneous pace in segment
```

- Green body: closing pace faster than opening (negative split within segment)
- Red body: closing pace slower than opening
- Wick length shows pace variance within the segment
- X-axis: distance (each candle = one segment)

Data source: `activity_segments` table has min/max/avg pace per 500m split. Open/close computed from raw velocity stream at segment boundaries.

### Heart Rate Area

Filled area chart with gradient fill. The fill color transitions through zone colors based on the HR value, creating a visual heatmap effect where fill color indicates intensity at a glance.

### Cadence Bar

Vertical bars at regular intervals (every 10 seconds or every 100m). Bar height = cadence value. Color intensity varies with cadence (lighter = lower, saturated = higher).

### Split Heatmap

A grid where rows = metrics (pace, HR, cadence, elevation gain) and columns = splits. Each cell is color-coded by intensity relative to the activity's range.

```
Split:    1    2    3    4    5    6    7    8    9   10
Pace:   [grn][grn][yel][yel][org][org][red][red][org][grn]
HR:     [blu][grn][grn][yel][yel][org][org][red][red][org]
Cad:    [grn][grn][grn][yel][grn][grn][yel][org][org][grn]
Elev:   [   ][   ][grn][yel][org][   ][   ][grn][yel][   ]
```

---

## Sidebar

Fixed width (280px). Scrollable. Contains:

### Stats Section (top)
Key metrics in a compact 2-column grid, monospace, tabular-nums:
```
Distance    13.1 mi        Avg Pace    7:52 /mi
Time        1:43:22        Avg HR      152 bpm
Elevation   +420 ft        Avg Cad     174 spm
```

Values at the crosshair position update live in this section when hovering.

### Controls Section

Collapsible accordion sections:

**Display**
- X-axis toggle: Distance / Time
- Show zones: on/off
- Show notes: on/off
- Show pause gaps: on/off

**Processing**
- Smoothing window: slider (0 = raw, 1-10, default 2)
- Sample points: slider (100-2000, default 500)
- Pause threshold: input (m/s, default 1.0)

**Layout**
- Reset to default layout button

Controls update all panels in real-time via shared state.

### Notes Section

Compact list of distance-anchored notes. Hovering a note highlights it on the map and charts. Same data as the main activity page, styled for dark theme.

Notes can also be viewed as a full panel (see Panel Configuration). Clicking a note in either the sidebar or a Notes panel sets a `highlightedNote` in shared state, which renders a vertical line (or shaded range) at that note's position across all chart panels and a marker on the map. Click again to clear.

### Laps Section

Compact lap table: #, distance, pace, HR. Clicking a lap zooms the charts to that lap's distance range (deferred, not v1).

---

## Crosshair Synchronization

### Architecture

```
terminalState (Svelte runes)
├── crosshairIndex: number | null     ← shared hover position
├── highlightedNote: string | null    ← clicked note ID
├── xAxis: 'distance' | 'time'       ← x-axis mode
├── params: ProcessingParams          ← smoothing, sampling, etc.
├── panelAssignments: PanelConfig[]   ← what each panel shows (data + chart type)
└── zoomRange: [number, number] | null ← future: zoom to selection
```

Every chart panel receives `crosshairIndex` as a prop and calls `oncrosshairmove` on hover. The map panel receives the crosshair position as a marker coordinate.

### Crosshair Rendering (per chart)

- **Vertical line**: full chart height, `--term-crosshair`, dashed — synced across all panels
- **Horizontal line**: per-panel only, drawn where the synced vertical line intersects that panel's data curve
- **Value label**: at the intersection point, monospace, semi-transparent background
- **X label**: bottom, formatted distance or time

### Map Sync

The map shows a pulsing dot at the crosshair's GPS position. The route polyline highlights the "already covered" portion up to the crosshair in a brighter color. Call `map.invalidateSize()` after layout renders or resizes.

---

## Data Pipeline

### What Already Exists
- `getActivity()` fetches all streams, zones, laps, segments, notes
- `bucketAvgIndices()` downsamples to N points
- Moving average smoothing with pause-aware skipping
- Pause detection from velocity threshold
- Unit conversion (metric/imperial)

### What's New
- **Candlestick data derivation**: For each segment, compute open/close pace from the raw velocity stream at segment start/end indices. Min/max already in `activity_segments`.
- **Cadence bucketing**: Divide cadence stream into fixed-interval buckets, compute mean per bucket.
- **Heatmap data**: Normalize each metric's segment values to a 0-1 range for color mapping.
- **Server-side**: No new queries needed. All data is already fetched. Processing happens client-side.

---

## File Structure

```
apps/web/src/
  routes/(protected)/(terminal)/
    activities/[id]/terminal/
      +page.svelte          — Terminal mode page (full viewport)
      +page.server.ts       — Reuse getActivity(), same load function
  lib/
    terminal/
      TerminalLayout.svelte      — Grid container, panel routing
      TerminalSidebar.svelte     — Stats, controls, notes, laps
      TerminalPanel.svelte       — Panel wrapper (title bar, dropdowns)
      TerminalEntryCard.svelte   — "> Terminal" card for activity detail page
      charts/
        TerminalLineChart.svelte     — Dark-themed line/area chart
        CandlestickChart.svelte      — Pace candlestick
        CadenceBarChart.svelte       — Cadence vertical bars
        SplitHeatmap.svelte          — Grid heatmap
        NotesPanel.svelte            — Scrollable notes with click-to-highlight
      shared/
        axes.ts                      — Shared axis calculation utilities
        polyline.ts                  — Shared polyline/path generation
        zones.ts                     — Zone band rendering helpers
      terminal-theme.css             — CSS custom properties, scoped styles
      terminal-state.svelte.ts       — Shared runes for crosshair, config
      candlestick.ts                 — Derive OHLC data from streams + segments
```

---

## Rendering Approach

### SVG (v1)

Stick with SVG for v1. Terminal mode will have ~6 chart panels x 500 points = 3,000 SVG elements. Well within SVG performance limits.

Reasons to stay SVG:
- Shared chart utilities can be reused without rewriting
- Crosshair, tooltips, zone bands are easier in SVG (DOM events, CSS styling)
- Matches project's "no heavy dependencies" philosophy
- Retina-crisp at any size without manual DPR handling

### Canvas/WebGL (future)

If performance becomes an issue (raw unsampled data, >5000 points per panel), migrate to Canvas:
- Offscreen Canvas per panel for data rendering
- SVG overlay for crosshair, labels, interactive elements
- Future optimization, not needed for v1

---

## Implementation Order

### Step 1: Route + Layout Shell
- Create `(terminal)` layout group under `(protected)`
- Create `/activities/[id]/terminal` route
- Full viewport dark wrapper with `Esc` to exit
- CSS custom properties for terminal theme
- 3x2 panel grid + sidebar layout
- Panel wrapper component with title bar

### Step 2: Terminal Charts (Line/Area)
- Extract shared utilities from `ActivityChart` (axes, polyline, zones)
- Build `TerminalLineChart` using shared utilities with terminal styling
- Support both line and filled-area variants
- Wire up crosshair sync via shared state
- Render zones with dark-appropriate opacity

### Step 3: Sidebar
- Stats section from activity data (with live crosshair values)
- Processing controls (smoothing, sampling, pause threshold)
- Notes list (dark-styled, click-to-highlight)
- Compact lap table

### Step 4: Map Panel
- Dark-themed Leaflet map (CartoDB dark_all tiles)
- Crosshair-synced marker with pulse animation
- Note markers
- "Covered distance" highlight on route polyline
- `invalidateSize()` on layout render/resize

### Step 5: Panel Type Switching
- Two dropdowns per panel (data source + chart type)
- Constrained matrix: chart type filters based on data source
- State for panel assignments
- Render correct component based on assignment
- Grey out unavailable data sources (missing streams)
- "No data" placeholder for panels with missing streams

### Step 6: Candlestick Chart
- Derive OHLC from velocity stream + segment boundaries
- SVG rendering: rect for body, line for wick
- Green/red coloring based on pace direction
- Splits/Laps toggle in title bar
- Crosshair shows all four values

### Step 7: Additional Chart Types
- Cadence bar chart
- Split heatmap
- HR area with zone-gradient fill
- Notes panel

### Step 8: Entry Point + Polish
- `> Terminal` card on activity detail page
- Loading states per panel
- Error boundaries per panel (one broken panel doesn't crash the page)
- Keyboard: `Esc` to exit

---

## Non-Goals (v1)

- Drag-and-drop panel reordering
- Resizable panels
- Multi-activity overlay/comparison (Phase 4b.2)
- Persistent layout saving to database
- WebGL rendering
- Real-time streaming data
- Print/export to PDF
- Mobile/responsive layout (desktop only)
- Arrow-key crosshair scrubbing
- Responsive collapse to fewer panels

---

## Decisions Log

| Decision | Resolution |
|----------|------------|
| Grid layout | 3x2 (A-F) + sidebar |
| Panel configuration | Constrained matrix: two dropdowns (data + chart type), chart type filtered by data source |
| Zone colors | Blue-teal-yellow-orange-red ramp (distinct hues, not two greens) |
| Notes as panel | Yes, with click-to-highlight via shared `highlightedNote` state |
| Candlestick granularity | Both splits (500m) and laps, toggle in panel title bar |
| Entry point | `> Terminal` card in monospace on activity detail page |
| Chart components | Separate from ActivityChart, shared utilities for axes/polyline/zones |
| Route layout | `(terminal)` layout group under `(protected)` — auth, no app shell |
| Crosshair horizontal line | Per-panel only, drawn at intersection of synced vertical line with panel's data |
| Missing streams | Grey out in dropdown, "No data" placeholder if assigned |
| Leaflet sizing | Call `invalidateSize()` after layout render/resize |
| Keyboard | Esc to exit in v1; arrow-key scrubbing deferred |
| Mobile | Desktop only, no responsive layout |
| Sidebar width | 280px fixed |
