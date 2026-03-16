# Panel Drag & Drop Plan

Replaces the current two-click swap with direct drag-and-drop of panels within the grid.

## Current State

Panels swap via a two-phase click: click swap button on source, then click any other panel to exchange placements. This is discoverable but clunky — it requires finding and clicking a toolbar button, then clicking a target. There's no spatial feedback during the operation.

The resize system already has a mature pointer-capture + grid-snapping + overlay-preview pipeline. Drag-and-drop should reuse as much of this infrastructure as possible.

## Design

### Interaction Model

**Initiation**: Pointer down on the panel header (the toolbar bar at the top, excluding buttons). The header already exists as a drag affordance — it just needs a `cursor: grab` and a pointerdown handler.

**During drag**:
- The source panel renders at reduced opacity (use `--term-drag-ghost`).
- A floating ghost element follows the cursor. This is a small rectangle showing the panel's label/icon, rendered outside the grid to avoid CSS grid layout interference. Use a `position: fixed` div appended to the layout root, sized to match the panel header.
- The GridOverlay shows the drop target zone — a dashed outline at the hovered grid cell's panel placement, using `--term-drop-zone` fill and `--term-snap-border` stroke.
- Pointer capture on the grid container (same pattern as resize).

**Drop targets**: Any existing panel is a valid target. Hovering over a panel highlights it. The drop preview shows both panels' new positions (the source going to the target's position, the target going to the source's position).

**Completion**: Pointer up over a valid target swaps placements between the two panels. Pointer up over empty space or the same panel cancels. Escape cancels at any point.

### State Machine

Extend `createGridInteraction` with drag states alongside the existing resize and swap states:

```
dragPanel: number | null       // index of panel being dragged
dragTarget: number | null      // index of panel being hovered as drop target
dragGhostPos: {x, y} | null   // cursor position for ghost element (clientX/Y)
```

Add methods:
- `startDrag(panelIndex, pointerId)` — sets `dragPanel`, captures pointer, sets `state.isDragging = true`
- `onDragMove(event)` — updates `dragGhostPos` and computes `dragTarget` from cursor position
- `endDrag()` — if `dragTarget` is valid and different from `dragPanel`, swap placements and call `onCommit()`; otherwise cancel
- `cancelDrag()` — reset all drag state

The `onPointerMove` handler on the grid container already dispatches to resize logic; add a branch for drag:

```typescript
function onPointerMove(event: PointerEvent) {
    if (resizePanel !== null) { /* existing resize logic */ }
    else if (dragPanel !== null) { onDragMove(event); }
}
```

Similarly, `onPointerUp` dispatches to `endResize` or `endDrag`.

### Finding the Drop Target

Use the existing `pixelToGrid()` to convert cursor position to grid coordinates. Then find which panel (if any) contains that grid cell:

```typescript
function panelAtGridPos(col: number, row: number): number | null {
    for (let i = 0; i < state.layoutPanels.length; i++) {
        const p = state.layoutPanels[i].placement;
        if (col >= p.col && col < p.col + p.colSpan &&
            row >= p.row && row < p.row + p.rowSpan) {
            return i;
        }
    }
    return null;
}
```

### Visual Feedback

**GridOverlay changes**: Add a `dropTarget` prop (PanelPlacement | null). When set, render a dashed outline at the target panel's current position using `--term-snap-border`. Optionally render a second outline at the source panel's current position showing where the target will move to.

**Source panel**: Apply `opacity: 0.5` via a CSS class or inline style when `dragPanel === idx`.

**Ghost element**: A `position: fixed` div rendered in TerminalLayout (outside the grid), tracking `dragGhostPos`. Shows a compact label (the panel's data source name or special type). Styled with `--term-drag-ghost` background. Offset slightly from the cursor.

**Cursor**: `cursor: grabbing` on the grid container during drag.

### Panel Header as Drag Handle

In `TerminalPanel.svelte`, the header div needs:
- `cursor: grab` (becomes `grabbing` during drag via parent)
- `onpointerdown` that calls `ondragstart(panelIndex, pointerId)` — a new prop
- Exclude interactive children (buttons, selects) from triggering drag — check `e.target` against interactive elements, or use the existing `rowClick()` pattern from the codebase

New prop on TerminalPanel:
```typescript
ondragstart?: (panelIndex: number, pointerId: number) => void;
```

### Removing Swap UI

Remove from `TerminalPanel.svelte`:
- The swap button ("⇄" / "...")
- Props: `swapActive`, `isSwapSource`, `onswap`
- The green border highlight on swap targets
- The click handler on the panel div that completes swaps

Remove from `grid-interaction.svelte.ts`:
- `startSwap`, `completeSwap`, `cancelSwap` methods
- `swapSource` state
- `swappingPanelId` getter

Remove from `TerminalLayout.svelte`:
- The `onswap` handler wiring
- `swapActive` and `isSwapSource` prop passing

Remove from `terminal-state.svelte.ts` (if applicable):
- Any swap-specific state (isDragging can be repurposed for drag-and-drop)

### Edge Cases

- **Drag over resize handles**: Resize handles have `z-index: 5` and sit on top of the panel. The drag initiation is from the panel header, which is inside the panel content area (below resize handles). No conflict — the header is not near the edges.
- **Drag during resize**: The state machine is mutually exclusive — `dragPanel` and `resizePanel` cannot both be non-null. Starting one cancels the other.
- **Small panels**: If a panel is too small to show a header, drag won't be available. This matches the current behavior where the swap button disappears in very small panels.
- **Touch support**: Pointer events cover touch. The ghost element uses `position: fixed` with `clientX/Y`, which works for touch. The `touch-action: none` should be set on the header during drag to prevent scrolling.

## File Changes

| File | Change |
|------|--------|
| `grid-interaction.svelte.ts` | Add drag state, `startDrag`/`onDragMove`/`endDrag`/`cancelDrag`, `panelAtGridPos`. Update `onPointerMove`/`onPointerUp` dispatch. Remove swap methods. |
| `grid-validation.ts` | No changes needed — swap is just placement exchange, no validation required. |
| `GridOverlay.svelte` | Add `dropTarget` prop, render drop target outline. |
| `TerminalLayout.svelte` | Wire `ondragstart` on panels. Render ghost element. Pass `dropTarget` to overlay. Apply source opacity. Remove swap wiring. |
| `TerminalPanel.svelte` | Add `ondragstart` prop + header pointerdown handler. Remove swap button, `swapActive`, `isSwapSource`, `onswap`. Add `cursor: grab` to header. |
| `terminal-state.svelte.ts` | Keep `isDragging` (repurposed for drag). |
| `terminal-theme.css` | No changes — `--term-drag-ghost` and `--term-drop-zone` already defined. |

## Implementation Order

1. Add drag state + methods to `grid-interaction.svelte.ts` (keep swap methods temporarily)
2. Add `ondragstart` to `TerminalPanel` header, wire in `TerminalLayout`
3. Render ghost element in `TerminalLayout`
4. Add drop target highlighting to `GridOverlay`
5. Apply source panel opacity during drag
6. Verify drag-and-drop works end-to-end
7. Remove all swap code (methods, props, UI)
8. Test edge cases: escape cancel, drag to same panel, drag to empty space, very small panels
