# Terminal Panel Layout Redesign

Resizable, reorderable panel grid with URL-encoded state and saved layouts.

## Current State

The terminal view is a fixed 3×2 CSS grid of 6 panels (`grid-cols-3 grid-rows-2`) with a 280px sidebar. Panels can change their data source and chart type via dropdowns, but not their size or position. Layout state lives entirely in memory (`$state`) and resets on page reload. There is no persistence layer for terminal configuration.

## Goals

1. Users can resize panels by dragging edges/corners, snapping to a dot grid
2. Users can reorder panels via drag-and-drop
3. A dot grid overlay renders during resize to show snap points
4. Full layout + settings encoded in the URL (shareable, bookmarkable)
5. Users can save, update, delete named layouts, and mark one as default
6. Default layout auto-loads when entering terminal mode

## Grid System

### Dimensions

**12 columns × 6 rows** — 72 total cells.

12 columns divides evenly by 1, 2, 3, 4, 6, and 12. 6 rows gives a roughly 2:1 aspect ratio per cell on a typical 16:9 viewport (minus header and sidebar), keeping cells close to square.

The grid fills the area: `viewport - 32px header - 280px sidebar`.

### Panel Placement

```typescript
interface PanelPlacement {
  col: number;      // 0–11, left edge
  row: number;      // 0–5, top edge
  colSpan: number;  // 1–12
  rowSpan: number;  // 1–6
}
```

Each panel in `state.panels` pairs a `PanelConfig` with a `PanelPlacement`. Each `LayoutPanel` also has a stable `id` (incrementing counter) used as the `{#each}` key to ensure Svelte correctly tracks identity during swaps and reorders. The grid uses CSS `grid-column` and `grid-row` with explicit start/span values.

### Constraints

- **No overlaps.** Two panels cannot occupy the same cell.
- **No gaps.** Every cell in the grid must belong to a panel.
- **Minimum size:** 2 columns × 1 row (map and heatmap: 3×2).
- **Maximum panels:** 12 (arbitrary but sane upper bound).

### Default Layout

Equivalent to the current 3×2, each panel is 4 cols × 3 rows:

```
┌────────────┬────────────┬────────────┐
│            │            │            │
│    Map     │   Pace     │     HR     │
│   (4×3)    │   (4×3)    │   (4×3)    │
│            │            │            │
├────────────┼────────────┼────────────┤
│            │            │            │
│ Elevation  │  Cadence   │ Candlestick│
│   (4×3)    │   (4×3)    │   (4×3)    │
│            │            │            │
└────────────┴────────────┴────────────┘
```

Example asymmetric layout (72 cells, verified):

```
Col:  0   1   2   3   4   5   6   7   8   9  10  11
    ┌───────────────────┬───────────────────────────┐
  0 │                   │       Pace (6×2)          │
  1 │   Map (6×4)       ├───────────────────────────┤
  2 │   col=0 row=0     │       HR (6×2)            │
  3 │                   ├───────────┬───────────────┤
    ├─────────┬─────────┤ Cadence   │   Candle      │
  4 │  Elev   │  Grade  │  (4×2)    │   (4×2)       │
  5 │  (4×2)  │  (4×2)  │  col=4    │   col=8       │
    └─────────┴─────────┴───────────┴───────────────┘

Map:      col=0, row=0, 6×4 = 24 cells
Pace:     col=6, row=0, 6×2 = 12 cells
HR:       col=6, row=2, 6×2 = 12 cells
Elev:     col=0, row=4, 4×2 =  8 cells
Grade:    col=4, row=4, 4×2 =  8 cells (not in default, added for this example)
Cadence:  col=4, row=4, 4×2 =  8 cells — wait, overlaps Grade
```

Corrected — 6 panels filling 72 cells:

```
Col:  0   1   2   3   4   5   6   7   8   9  10  11
    ┌───────────────────┬───────────────────────────┐
  0 │                   │                           │
  1 │   Map (6×4)       │       Pace (6×2)          │
    │                   ├───────────────────────────┤
  2 │                   │                           │
  3 │                   │       HR (6×2)            │
    ├─────────┬─────────┼───────────┬───────────────┤
  4 │  Elev   │ Cadence │  Candle   │               │
  5 │  (4×2)  │  (4×2)  │  (4×2)    │               │
    └─────────┴─────────┴───────────┘

Map:      col=0, row=0, 6×4 = 24
Pace:     col=6, row=0, 6×2 = 12
HR:       col=6, row=2, 6×2 = 12
Elev:     col=0, row=4, 4×2 =  8
Cadence:  col=4, row=4, 4×2 =  8
Candle:   col=8, row=4, 4×2 =  8
Total:                    = 72 ✓
```

## Dot Grid Overlay

### Visual Design

The dot grid renders as a full-workspace overlay during resize and drag operations.

- **Dots:** 2px circles at every grid intersection (13 × 7 = 91 points)
- **Color:** `var(--term-grid)` at 20% opacity, fading to 40% near the active handle
- **Appearance:** Fades in over 150ms when a resize/drag begins, fades out on release
- **Active axis highlight:** When dragging a vertical edge, the column lines under the cursor get brighter. Same for horizontal edges with row lines.
- **Snap preview:** A dashed rectangle shows the panel's new bounds, border color matching the panel's data source color (e.g., `var(--term-pace)` for pace panels)

### Implementation

Start with an SVG overlay (91 `<circle>` elements + a `<rect>` for the snap preview). This is simpler than canvas (no DPI handling, no manual resize), and 91 elements is well within SVG performance limits. Upgrade to canvas only if performance becomes an issue.

```
GridOverlay.svelte
├── Renders dot grid on canvas
├── Shows snap preview rectangle
├── Handles pointer events during resize/drag
└── Emits: onresizeend, ondragend
```

The overlay sits above the panels (`z-index: 10`) and is only mounted when `isResizing || isDragging` is true. Pointer events pass through to panels when the overlay is not active.

## Resize Interaction

### Handles

Each panel has invisible 8px-wide hit zones on three edges:

- **Right edge:** `cursor: col-resize` — adjusts this panel's `colSpan` and the right neighbor's `col`/`colSpan`
- **Bottom edge:** `cursor: row-resize` — adjusts this panel's `rowSpan` and the below neighbor's `row`/`rowSpan`
- **Bottom-right corner:** `cursor: nwse-resize` — adjusts both axes simultaneously

Handles are `<div>` elements positioned absolutely within each panel cell. A 2px visible hairline (`var(--term-border)`) renders on hover so the user sees what they'll grab.

### Resize Logic

When the user drags a handle:

1. **Start:** Mount the dot grid overlay. Record the starting cell boundary.
2. **Move:** Compute which grid line the cursor is nearest to. Clamp to valid range (min size for both this panel and affected neighbors). Update the snap preview rectangle.
3. **End:** Apply the new placement. Animate panels to new positions (150ms ease-out via CSS `transition`). Unmount overlay. Push new layout to URL.

**Neighbor adjustment:** Resizing one panel's right edge moves the shared boundary. The panel to the right shrinks or grows inversely. If the neighbor would shrink below minimum, the resize clamps.

For resize operations that would require complex multi-panel reflow (e.g., resizing a panel's bottom edge when the row below has a different column structure), the system constrains the resize to only affect panels that share an aligned boundary. If no clean adjustment exists, the resize is disallowed for that direction.

**Aligned boundary algorithm:** Given a panel edge being dragged (e.g., right edge at column `c`), find all panels whose opposing edge (left edge) is exactly at column `c` and whose row range overlaps the dragged panel's row range. If these adjacent panels perfectly tile the dragged edge's full row extent, the resize is valid — move the shared boundary. If they don't tile perfectly (gaps or partial overlaps), the resize is disallowed. This is a pure function in `grid-validation.ts`:

```typescript
function findAlignedNeighbors(
  panels: LayoutPanel[],
  panelIndex: number,
  edge: 'right' | 'bottom',
): number[] | null {
  // Returns indices of panels sharing the full aligned boundary,
  // or null if no clean resize is possible.
}
```

### Edge Cases

- **Panels that span multiple rows:** When resizing the bottom edge, only neighbors directly below the panel are affected.
- **Single panel in a row:** Horizontal resize is disabled (it already fills the width).
- **Minimum size enforcement:** The cursor snaps to the minimum-size boundary and the preview rectangle reflects the clamped position.

## Panel Reordering

### Interaction: Click-to-Swap

Rather than full drag-and-drop (which requires ghost elements, pointer capture, hit testing, and careful Leaflet/map handling), use a simpler click-to-swap interaction that achieves the same result:

1. **Enter swap mode:** Click a "swap" icon button on a panel header. The panel highlights and a prompt appears: "Click another panel to swap."
2. **Pick target:** Click any other panel. The two panels swap placements (position + size). Both adopt the other's bounds. Animate to final positions (150ms).
3. **Cancel:** Press `Escape` or click the same panel again to exit swap mode.

This is 90% of the value of full drag-and-drop with ~20% of the implementation complexity. It avoids all the edge cases around drag ghosts, pointer capture across panels, and Leaflet map invalidation during drag.

### Implementation

The swap state lives in `grid-interaction.svelte.ts`:

```typescript
let swapSource = $state<number | null>(null); // panel id being swapped

function startSwap(panelId: number) { swapSource = panelId; }
function completeSwap(targetId: number) {
  // swap placements between swapSource and targetId
  swapSource = null;
}
function cancelSwap() { swapSource = null; }
```

Full drag-and-drop can be added later as an enhancement if click-to-swap feels limiting.

## URL Encoding

### Format

All terminal state is encoded as URL search params. The layout param uses a compact custom encoding.

**Layout param `l`:**

Each panel is packed into 3 bytes (21 bits used) and the full layout is base64url-encoded:

```
Byte layout per panel (3 bytes = 24 bits, 3 MSB unused):
  [0 0 0 | source(4) | type(3)] [col(4) | row(3) | X] [colSpan(4) | rowSpan(3) | X]
  X = unused padding bit
```

| Bits | Field | Range | Description |
|------|-------|-------|-------------|
| 4 | source | 0–15 | Data source (see table below) |
| 3 | type | 0–7 | Chart type (see table below) |
| 4 | col | 0–11 | Column start |
| 3 | row | 0–5 | Row start |
| 4 | colSpan | 1–12 | Column span |
| 3 | rowSpan | 1–6 | Row span |

Source codes (4 bits):
| Value | Source |
|-------|--------|
| 0 | pace |
| 1 | heartrate |
| 2 | elevation |
| 3 | cadence |
| 4 | power |
| 5 | grade |
| 8 | map (special) |
| 9 | notes (special) |
| 10 | heatmap (special) |
| 11 | laps (special) |

Values 6–7 and 12–15 are reserved for future sources.

Chart type codes (3 bits):
| Value | Type |
|-------|------|
| 0 | line |
| 1 | area |
| 2 | bar |
| 3 | candlestick-splits |
| 4 | candlestick-laps |

Special panels (source >= 8) ignore the type field (set to 0).

`candlestickMode` is encoded in the type value (3 = splits, 4 = laps) rather than as a separate field.

`colorOverride` is not encoded in the URL — custom colors are ephemeral per-session. Saved layouts in the database do persist `colorOverride` via the JSONB config.

6 panels × 3 bytes = 18 bytes → 24 chars base64url. Example:

```
?l=gBkDAYYDQhkDhCkDgzID
```

Encoding uses base64url (RFC 4648 §5: `A-Z a-z 0-9 - _`, no padding) so the value is URL-safe without percent-encoding.

### Debug Tool

The admin page gets a "Terminal URL Decoder" section where you can paste a terminal URL and see the decoded layout as a table (source, type, col, row, colSpan, rowSpan per panel) plus a miniature grid preview. Uses the same `decodeLayout()` function from `layout-url.ts` — no separate decoding logic.

```
apps/web/src/routes/(protected)/admin/terminal-debug/+page.svelte
```

**Settings params:**

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `x`   | `d`, `t` | `d` | x-axis (distance/time) |
| `z`   | `0`, `1` | `0` | show zones |
| `n`   | `0`, `1` | `1` | show notes |
| `pg`  | `0`, `1` | `1` | show pause gaps |
| `sm`  | `0`–`10` | `2` | smoothing window |
| `sp`  | `100`–`2000` | `500` | sample points |
| `pt`  | `0.1`–`3.0` | `1.0` | pause threshold |
| `wp`  | `0`–`25` | `1` | wick percentile |

Default values are omitted from the URL to keep it short. A full URL:

```
/activities/123/terminal?l=gBkDAYYDQhkDhCkDgzID&z=1&sm=4
```

### Encoding/Decoding

```
apps/web/src/lib/terminal/
  layout-url.ts          — encodeLayout(), decodeLayout(), encodeSettings(), decodeSettings()
  layout-url.test.ts     — round-trip tests, malformed input handling
```

`decodeLayout()` validates placement constraints (no overlaps, no gaps, valid spans). If the URL param is malformed or missing, fall back to the default layout and return a `{ layout, warning?: string }` result. When a warning is present, show an auto-dismissing toast (5s): "Layout URL was invalid — showing default layout". The toast uses the existing terminal theme colors (`--term-text`, `--term-border`).

### URL Sync

The terminal page reads URL params on load to initialize state. When state changes, the URL is updated:

- **Discrete layout changes** (resize end, panel swap): `pushState()` — enables browser back button as undo
- **Continuous interactions** (slider drags, setting toggles): debounced `replaceState()` (300ms) — avoids flooding history

```typescript
// In +page.svelte — only URL-relevant state triggers writes
let urlString = $derived(buildTerminalUrl(state.layoutPanels, {
  xAxis: state.xAxis,
  showZones: state.showZones,
  showNotes: state.showNotes,
  showPauseGaps: state.showPauseGaps,
  smoothingWindow: state.params.smoothingWindow,
  samplePoints: state.params.samplePoints,
  pauseThreshold: state.params.pauseThreshold,
  wickPercentile: state.wickPercentile,
}));

$effect(() => {
  debouncedReplaceState(urlString);
});
```

The `$derived` only references URL-relevant fields, so transient UI state (crosshair position, hover highlights, etc.) won't trigger writes.

## Saved Layouts

### Database

New table in `packages/db`:

```sql
CREATE TABLE terminal_layouts (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  encoded         TEXT NOT NULL,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one default per user
CREATE UNIQUE INDEX idx_terminal_layouts_user_default
  ON terminal_layouts(user_id) WHERE is_default = true;
```

The `encoded` column stores the same base64url string used in the URL `l` param, plus any non-default settings params appended as a query string fragment (e.g. `gBkDAYYDQhkDhCkDgzID&z=1&sm=4`). This is the exact value that gets dropped into the URL when loading a saved layout — no transformation needed. The same `encodeLayout()` / `decodeLayout()` functions handle both directions.

### Schema + Migration

```
packages/db/src/schema/terminal-layouts.ts   — Drizzle schema
packages/db/drizzle/0008_*.sql               — Migration
```

### API (Form Actions)

Layout CRUD is user-scoped (not activity-scoped), so it should live outside the activity route to avoid coupling mutations to an irrelevant activity ID. Use a standalone API route:

```
apps/web/src/routes/api/terminal-layouts/+server.ts      — GET (list), POST (create)
apps/web/src/routes/api/terminal-layouts/[id]/+server.ts  — PUT (update), DELETE
apps/web/src/routes/api/terminal-layouts/[id]/default/+server.ts — POST (set default)
```

These are JSON API endpoints protected by the session auth check (same pattern as any `+server.ts` in the protected group). The terminal page load function still fetches layouts to include in page data.

Actions:

| Endpoint | Method | Body | Behavior |
|----------|--------|------|----------|
| `/api/terminal-layouts` | POST | `{ name, config }` | Insert new layout. Returns `{ id }`. |
| `/api/terminal-layouts/[id]` | PUT | `{ name?, config? }` | Update layout (upsert fields). |
| `/api/terminal-layouts/[id]` | DELETE | — | Delete layout. |
| `/api/terminal-layouts/[id]/default` | POST | — | Clear existing default (`UPDATE ... SET is_default = false WHERE user_id = ? AND is_default = true`), then set this layout as default. Both in a single transaction. |

The load function adds the user's layouts to page data:

```typescript
// +page.server.ts load
const layouts = await db.select()
  .from(terminalLayouts)
  .where(eq(terminalLayouts.userId, userId))
  .orderBy(terminalLayouts.updatedAt);

return { ...existingData, layouts };
```

### Sidebar UI

The "Reset Layout" button in `TerminalSidebar.svelte` is replaced with a layout management section:

```
┌─ Layout ──────────────────────────┐
│                                   │
│  [Default ▾] [Save] [⟳ Reset]    │
│                                   │
│  Saved:                           │
│  ● Race Analysis        [★] [✕]  │
│    Pace Focus            [★] [✕]  │
│    Training Review       [★] [✕]  │
│                                   │
└───────────────────────────────────┘
```

- **Dropdown:** Switches between saved layouts. Selecting one replaces the URL params and reinitializes state.
- **Save:** If current layout matches a saved one, updates it. Otherwise opens an inline name input to create a new one.
- **Reset:** Restores the default layout (or the hardcoded default if no saved default exists).
- **★ (star):** Marks/unmarks as default. Filled star = current default.
- **✕ (delete):** Deletes after confirmation.
- **● (dot):** Indicates the currently active layout.
- **Hover preview:** Hovering a saved layout shows a tooltip with a miniature SVG grid (~60×30px). Each panel is a filled `<rect>` positioned by its grid placement and colored by data source (e.g. `var(--term-pace)` for pace, `var(--term-hr)` for heartrate). No labels — just the layout shape. Appears after 300ms hover delay, positioned above the list item.

### Loading Priority

When entering terminal mode:

1. If URL has `?l=...` param → decode and use it (URL is authoritative, even for recipients who have their own saved defaults)
2. If URL has no `l` param and user has a saved default layout → load the default's config and push it to the URL via `replaceState()`
3. If URL has no `l` param and no saved default → use hardcoded `DEFAULT_LAYOUT` and push to URL

This means sharing a URL always reproduces the exact view, regardless of the recipient's saved defaults. Removing the `l` param from a URL manually triggers priority 2 or 3.

## New File Structure

```
apps/web/src/lib/terminal/
  layout-url.ts                    — URL encode/decode for layout + settings
  layout-url.test.ts               — Round-trip, validation, edge case tests
  grid-interaction.svelte.ts       — Resize + swap state machine (pointer events)
  grid-validation.ts               — Constraint checks: no overlap, no gaps, min size, aligned neighbors
  grid-validation.test.ts          — Placement validation tests (exhaustive)
  GridOverlay.svelte               — Dot grid SVG overlay + snap preview rectangle
  ResizeHandle.svelte              — Invisible edge/corner grab zones per panel
  TerminalLayout.svelte            — Rewritten: CSS Grid with dynamic placement
  TerminalPanel.svelte             — Updated: swap button on header, resize handles
  TerminalSidebar.svelte           — Updated: layout management section
  terminal-state.svelte.ts         — Updated: panels now include placement + stable id

packages/db/src/schema/
  terminal-layouts.ts              — New Drizzle schema

apps/web/src/routes/api/terminal-layouts/
  +server.ts                       — GET (list), POST (create)
apps/web/src/routes/api/terminal-layouts/[id]/
  +server.ts                       — PUT (update), DELETE
apps/web/src/routes/api/terminal-layouts/[id]/default/
  +server.ts                       — POST (set default)

apps/web/src/routes/(protected)/(terminal)/activities/[id]/terminal/
  +page.server.ts                  — Updated: load layouts into page data
  +page.svelte                     — Updated: URL sync, layout initialization

apps/web/src/routes/(protected)/admin/terminal-debug/
  +page.svelte                     — URL decoder: paste terminal URL, see decoded layout table + grid preview
```

## State Changes

### PanelConfig → LayoutPanel

```typescript
// Before
interface PanelConfig {
  kind: 'chart' | 'special';
  dataSource?: DataSource;
  chartType?: ChartType;
  specialType?: SpecialPanel;
  candlestickMode?: 'splits' | 'laps';
  colorOverride?: string;
}

// After — PanelConfig stays the same, placement is separate
interface LayoutPanel {
  id: number;  // stable identity for {#each} key — incrementing counter
  config: PanelConfig;
  placement: PanelPlacement;
}

interface PanelPlacement {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}
```

### TerminalState additions

```typescript
// New state fields
let layoutPanels = $state<LayoutPanel[]>([...DEFAULT_LAYOUT]);
let isResizing = $state(false);
let isDragging = $state(false);
let activeLayoutId = $state<number | null>(null);

// Derived
let gridStyle = $derived(
  `grid-template-columns: repeat(12, 1fr); grid-template-rows: repeat(6, 1fr);`
);
```

### CSS Grid Rendering

```svelte
<!-- TerminalLayout.svelte -->
<!-- gap: 0 simplifies pixel-to-grid math; panels use their own border for visual separation -->
<div class="grid p-1 h-full" style={gridStyle}>
  {#each layoutPanels as panel (panel.id)}
    <div style="
      grid-column: {panel.placement.col + 1} / span {panel.placement.colSpan};
      grid-row: {panel.placement.row + 1} / span {panel.placement.rowSpan};
    ">
      <TerminalPanel .../>
    </div>
  {/each}
</div>
```

Using `gap: 0` (panels already have `border: 1px solid var(--term-border)`) avoids complications in the pixel-to-grid coordinate mapping during resize. The visual gap comes from the panel borders collapsing, which matches the current look.

## CSS Theme Additions

```css
/* terminal-theme.css */
--term-dot: rgba(55, 65, 100, 0.2);
--term-dot-active: rgba(55, 65, 100, 0.5);
--term-snap-border: rgba(80, 250, 123, 0.6);
--term-drop-zone: rgba(80, 250, 123, 0.08);
--term-drag-ghost: rgba(22, 27, 44, 0.7);
```

## Implementation Phases

### Phase 1: Grid + URL (no persistence)
- `layout-url.ts` + tests
- `grid-validation.ts` + tests
- Rewrite `TerminalLayout.svelte` to use CSS Grid with dynamic placement
- URL sync in `+page.svelte`
- Replace `state.panels: PanelConfig[]` with `state.layoutPanels: LayoutPanel[]`
- Default layout renders identically to current view

### Phase 2: Resize
- `GridOverlay.svelte` (dot grid canvas)
- `ResizeHandle.svelte` (edge/corner hit zones)
- `grid-interaction.svelte.ts` (resize state machine)
- Wire resize into `TerminalLayout.svelte`
- URL updates on resize end

### Phase 3: Panel Reordering
- Click-to-swap interaction in `grid-interaction.svelte.ts`
- Swap icon button on panel headers
- Visual highlight for source/target during swap mode
- URL updates on swap

### Phase 4: Saved Layouts
- DB schema + migration
- Form actions in `+page.server.ts`
- Layout management UI in `TerminalSidebar.svelte`
- Default layout loading on terminal entry

### Phase 5: Add/Remove Panels
- "Add Panel" button that places a new panel in the first available space
- "Remove Panel" button on each panel header (expand neighbors to fill gap)
- Panel count no longer fixed at 6

## Edge Cases & Gotchas

### Window Resize

Panel placements are in grid units, so CSS Grid handles visual resizing automatically. However:
- The dot grid SVG overlay must redraw on window resize (listen for `resize` event)
- Any in-progress resize/drag interaction should be cancelled on window resize
- The Leaflet map requires `map.invalidateSize()` after container size changes

### Leaflet Map Invalidation

When a panel containing the map changes size (resize or swap), Leaflet's internal size tracking gets stale. After any layout change that affects a map panel, dispatch a custom event or use an `$effect` watching the panel's placement to call `invalidateSize()`. The stable `panel.id` key in `{#each}` ensures Svelte moves the DOM node rather than destroying/recreating it, avoiding full Leaflet re-initialization.

### Browser History

Use `pushState()` for discrete layout changes (resize end, panel swap) so the browser back button acts as undo. Use `replaceState()` for continuous interactions (slider drags, setting changes) to avoid flooding history. The user navigates away from terminal mode via the ESC link, which uses normal `goto()`.

### URL Length

With 12 panels, the `l` param reaches ~250 characters. Combined with settings, total query string stays under 500 characters — well within browser URL length limits (~2000 chars).

## Resolved Decisions

1. **Maximum grid rows:** Fixed at 6. No vertical scrolling — all panels visible at once.

2. **Mobile/narrow viewports:** Establish a minimum width for the terminal page. Horizontal scroll is acceptable; no responsive collapse.

3. **Layout sharing across activities:** Layouts are user-scoped, not activity-scoped. Missing streams show "No data" — same as current behavior.

4. **Undo:** Use `pushState()` (not `replaceState()`) for discrete layout changes (resize end, panel swap) so the browser back button acts as undo. Continue using `replaceState()` for continuous interactions (slider drags) to avoid flooding history.
