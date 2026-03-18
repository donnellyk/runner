import { describe, it, expect } from 'vitest';
import {
	validatePlacement,
	findAlignedNeighbors,
	canResize,
	findSplitForNewPanel,
	removePanel,
	computeDragLayout,
	getMinColSpan,
	getMinRowSpan,
	MAX_PANELS,
	MIN_COL_SPAN,
	MIN_ROW_SPAN,
	MIN_SPECIAL_COL_SPAN,
	MIN_SPECIAL_ROW_SPAN,
} from './grid-validation';
import { DEFAULT_LAYOUT } from './layout-url';
import type { LayoutPanel } from './layout-url';
import type { PanelConfig } from './terminal-state.svelte';

function makePanel(
	id: number,
	config: PanelConfig,
	col: number,
	row: number,
	colSpan: number,
	rowSpan: number,
): LayoutPanel {
	return { id, config, placement: { col, row, colSpan, rowSpan } };
}

function chartPanel(
	id: number,
	col: number,
	row: number,
	colSpan: number,
	rowSpan: number,
): LayoutPanel {
	return makePanel(id, { kind: 'chart', dataSource: 'pace', chartType: 'line' }, col, row, colSpan, rowSpan);
}

function mapPanel(
	id: number,
	col: number,
	row: number,
	colSpan: number,
	rowSpan: number,
): LayoutPanel {
	return makePanel(id, { kind: 'special', specialType: 'map' }, col, row, colSpan, rowSpan);
}

function heatmapPanel(
	id: number,
	col: number,
	row: number,
	colSpan: number,
	rowSpan: number,
): LayoutPanel {
	return makePanel(id, { kind: 'special', specialType: 'heatmap' }, col, row, colSpan, rowSpan);
}

describe('validatePlacement', () => {
	it('default 3x2 layout is valid', () => {
		const result = validatePlacement(DEFAULT_LAYOUT);
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it('detects overlapping panels', () => {
		const panels: LayoutPanel[] = [
			chartPanel(1, 0, 0, 6, 6),
			chartPanel(2, 4, 0, 8, 6), // overlaps with panel 1 at cols 4-5
		];
		const result = validatePlacement(panels);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('Overlap'))).toBe(true);
	});

	it('allows gaps in layout', () => {
		const panels: LayoutPanel[] = [
			chartPanel(1, 0, 0, 6, 6),
		];
		const result = validatePlacement(panels);
		expect(result.valid).toBe(true);
	});

	it('detects panel out of bounds', () => {
		const panels: LayoutPanel[] = [
			chartPanel(1, 10, 0, 4, 6), // col 10 + colSpan 4 = 14 > 12
			chartPanel(2, 0, 0, 10, 6),
		];
		const result = validatePlacement(panels);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('exceeds grid width'))).toBe(true);
	});

	it('detects panel below minimum size', () => {
		// colSpan 1 is below MIN_COL_SPAN of 2
		const panels: LayoutPanel[] = [
			chartPanel(1, 0, 0, 1, 6),
			chartPanel(2, 1, 0, 11, 6),
		];
		const result = validatePlacement(panels);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('below minimum'))).toBe(true);
	});

	it('enforces max panel count', () => {
		// Create 13 panels (exceeds MAX_PANELS of 12)
		const panels: LayoutPanel[] = [];
		for (let i = 0; i < 13; i++) {
			panels.push(chartPanel(i + 1, 0, 0, 2, 1));
		}
		const result = validatePlacement(panels);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('Too many panels'))).toBe(true);
	});

	it('map panel respects larger minimum size', () => {
		// Map with colSpan 2 (below MIN_SPECIAL_COL_SPAN of 3)
		const panels: LayoutPanel[] = [
			mapPanel(1, 0, 0, 2, 2),
			chartPanel(2, 2, 0, 10, 2),
			chartPanel(3, 0, 2, 12, 4),
		];
		const result = validatePlacement(panels);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('below minimum'))).toBe(true);
	});
});

describe('getMinColSpan / getMinRowSpan', () => {
	it('returns standard minimums for chart panels', () => {
		const panel = chartPanel(1, 0, 0, 4, 3);
		expect(getMinColSpan(panel)).toBe(MIN_COL_SPAN);
		expect(getMinRowSpan(panel)).toBe(MIN_ROW_SPAN);
	});

	it('returns larger minimums for map panels', () => {
		const panel = mapPanel(1, 0, 0, 4, 3);
		expect(getMinColSpan(panel)).toBe(MIN_SPECIAL_COL_SPAN);
		expect(getMinRowSpan(panel)).toBe(MIN_SPECIAL_ROW_SPAN);
	});

	it('returns larger minimums for heatmap panels', () => {
		const panel = heatmapPanel(1, 0, 0, 4, 3);
		expect(getMinColSpan(panel)).toBe(MIN_SPECIAL_COL_SPAN);
		expect(getMinRowSpan(panel)).toBe(MIN_SPECIAL_ROW_SPAN);
	});
});

describe('findAlignedNeighbors', () => {
	// Default layout:
	// Row 0-2: [0,0,4,3] [4,0,4,3] [8,0,4,3]
	// Row 3-5: [0,3,4,3] [4,3,4,3] [8,3,4,3]

	it('returns correct indices for right edge', () => {
		// Panel 0 (col=0, colSpan=4): right boundary at col 4
		// Panel 1 (col=4) has left edge at col 4, rows 0-3
		// Panel 4 (col=4) has left edge at col 4, rows 3-6
		// But panel 0's row range is 0-3, so only panel 1 tiles it
		const result = findAlignedNeighbors(DEFAULT_LAYOUT, 0, 'right');
		expect(result).not.toBeNull();
		expect(result).toEqual([1]);
	});

	it('returns correct indices for bottom edge', () => {
		// Panel 0 (row=0, rowSpan=3): bottom boundary at row 3
		// Panel 3 (row=3) has top edge at row 3, cols 0-4
		// Panel 0's col range is 0-4, so panel 3 tiles it perfectly
		const result = findAlignedNeighbors(DEFAULT_LAYOUT, 0, 'bottom');
		expect(result).not.toBeNull();
		expect(result).toEqual([3]);
	});

	it('returns null when neighbors do not perfectly tile', () => {
		// Create a layout where the right neighbors don't perfectly tile
		const panels: LayoutPanel[] = [
			chartPanel(1, 0, 0, 6, 6),    // source panel, full height
			chartPanel(2, 6, 0, 6, 2),    // right neighbor, rows 0-2
			chartPanel(3, 6, 2, 6, 2),    // right neighbor, rows 2-4
			// rows 4-6 on the right side are missing
		];
		// Panel 0's right edge is at col 6, row range 0-6
		// Neighbors at col 6 cover rows 0-4, not 0-6
		const result = findAlignedNeighbors(panels, 0, 'right');
		expect(result).toBeNull();
	});

	it('returns null for edge at grid boundary', () => {
		// Panel 2 is at the right edge of the grid
		const result = findAlignedNeighbors(DEFAULT_LAYOUT, 2, 'right');
		expect(result).toBeNull();
	});

	it('returns multiple neighbors when they tile the edge', () => {
		// Create a layout where one tall panel has two shorter neighbors on its right
		const panels: LayoutPanel[] = [
			chartPanel(1, 0, 0, 6, 6),    // left half, full height
			chartPanel(2, 6, 0, 6, 3),    // right top half
			chartPanel(3, 6, 3, 6, 3),    // right bottom half
		];
		const result = findAlignedNeighbors(panels, 0, 'right');
		expect(result).not.toBeNull();
		expect(result!.sort()).toEqual([1, 2]);
	});
});

describe('canResize', () => {
	it('grows right, pushing neighbor', () => {
		const result = canResize(DEFAULT_LAYOUT, 0, 'right', 2);
		expect(result).not.toBeNull();
		expect(result![0].placement.colSpan).toBe(6);
		expect(result![1].placement.col).toBe(6);
		expect(result![1].placement.colSpan).toBe(2);
	});

	it('grows left, pushing neighbor', () => {
		const panels = [
			chartPanel(1, 0, 0, 4, 3),
			chartPanel(2, 4, 0, 4, 3),
			chartPanel(3, 8, 0, 4, 3),
			chartPanel(4, 0, 3, 4, 3),
			chartPanel(5, 4, 3, 4, 3),
			chartPanel(6, 8, 3, 4, 3),
		];
		const result = canResize(panels, 1, 'left', -2);
		expect(result).not.toBeNull();
		expect(result![1].placement.col).toBe(2);
		expect(result![1].placement.colSpan).toBe(6);
		expect(result![0].placement.colSpan).toBe(2);
	});

	it('grows bottom, pushing neighbor', () => {
		const result = canResize(DEFAULT_LAYOUT, 0, 'bottom', 1);
		expect(result).not.toBeNull();
		expect(result![0].placement.rowSpan).toBe(4);
		expect(result![3].placement.row).toBe(4);
		expect(result![3].placement.rowSpan).toBe(2);
	});

	it('grows top, pushing neighbor', () => {
		const result = canResize(DEFAULT_LAYOUT, 3, 'top', -1);
		expect(result).not.toBeNull();
		expect(result![3].placement.row).toBe(2);
		expect(result![3].placement.rowSpan).toBe(4);
		expect(result![0].placement.rowSpan).toBe(2);
	});

	it('rejects push that would shrink neighbor below minimum', () => {
		// Panel 0 is a map (min colSpan=3, colSpan=4). Growing right by 2 would
		// push panel 1 to colSpan=2, but growing by 3 would push to colSpan=1.
		expect(canResize(DEFAULT_LAYOUT, 0, 'right', 2)).not.toBeNull();
		expect(canResize(DEFAULT_LAYOUT, 0, 'right', 3)).toBeNull();
	});

	it('grows into empty space without affecting neighbors', () => {
		const panels = [
			chartPanel(1, 0, 0, 4, 6),
			chartPanel(2, 8, 0, 4, 6),
		];
		const result = canResize(panels, 0, 'right', 4);
		expect(result).not.toBeNull();
		expect(result![0].placement.colSpan).toBe(8);
		expect(result![1].placement.col).toBe(8);
		expect(result![1].placement.colSpan).toBe(4);
	});

	it('shrinks panel right, leaving empty space', () => {
		const result = canResize(DEFAULT_LAYOUT, 1, 'right', -2);
		expect(result).not.toBeNull();
		expect(result![1].placement.colSpan).toBe(2);
		expect(result![2].placement.col).toBe(8);
		expect(result![2].placement.colSpan).toBe(4);
	});

	it('shrinks panel left, leaving empty space', () => {
		const result = canResize(DEFAULT_LAYOUT, 1, 'left', 2);
		expect(result).not.toBeNull();
		expect(result![1].placement.col).toBe(6);
		expect(result![1].placement.colSpan).toBe(2);
		expect(result![0].placement.colSpan).toBe(4);
	});

	it('shrinks panel top, leaving empty space', () => {
		const result = canResize(DEFAULT_LAYOUT, 3, 'top', 1);
		expect(result).not.toBeNull();
		expect(result![3].placement.row).toBe(4);
		expect(result![3].placement.rowSpan).toBe(2);
		expect(result![0].placement.rowSpan).toBe(3);
	});

	it('returns null when resize would violate minimum size', () => {
		expect(canResize(DEFAULT_LAYOUT, 0, 'right', -3)).toBeNull();
		expect(canResize(DEFAULT_LAYOUT, 1, 'left', 3)).toBeNull();
		expect(canResize(DEFAULT_LAYOUT, 3, 'top', 3)).toBeNull();
	});

	it('returns null when expanding past grid boundary', () => {
		expect(canResize(DEFAULT_LAYOUT, 2, 'right', 1)).toBeNull();
		expect(canResize(DEFAULT_LAYOUT, 0, 'left', -1)).toBeNull();
		expect(canResize(DEFAULT_LAYOUT, 0, 'top', -1)).toBeNull();
	});

	it('does not mutate original panels', () => {
		const originalColSpan = DEFAULT_LAYOUT[0].placement.colSpan;
		canResize(DEFAULT_LAYOUT, 0, 'right', 2);
		expect(DEFAULT_LAYOUT[0].placement.colSpan).toBe(originalColSpan);
	});

	it('map panel respects larger minimum size during resize', () => {
		const result = canResize(DEFAULT_LAYOUT, 0, 'right', -2);
		expect(result).toBeNull();
	});

	it('produces a valid layout after resize', () => {
		const result = canResize(DEFAULT_LAYOUT, 0, 'right', 1);
		expect(result).not.toBeNull();
		const validation = validatePlacement(result!);
		expect(validation.valid).toBe(true);
	});
});

describe('findSplitForNewPanel', () => {
	it('finds a split for the default layout', () => {
		const result = findSplitForNewPanel(DEFAULT_LAYOUT);
		expect(result).not.toBeNull();
		expect(result!.placement.colSpan).toBeGreaterThanOrEqual(MIN_COL_SPAN);
		expect(result!.placement.rowSpan).toBeGreaterThanOrEqual(MIN_ROW_SPAN);
	});

	it('returns null when at max panels', () => {
		const panels: LayoutPanel[] = [];
		for (let i = 0; i < MAX_PANELS; i++) {
			panels.push(chartPanel(i + 1, (i % 6) * 2, Math.floor(i / 6) * 3, 2, 3));
		}
		const result = findSplitForNewPanel(panels);
		expect(result).toBeNull();
	});

	it('shrunk + new placement covers original panel area', () => {
		const result = findSplitForNewPanel(DEFAULT_LAYOUT);
		expect(result).not.toBeNull();
		const original = DEFAULT_LAYOUT[result!.panelIndex].placement;
		const originalArea = original.colSpan * original.rowSpan;
		const shrunkArea = result!.shrunkPlacement.colSpan * result!.shrunkPlacement.rowSpan;
		const newArea = result!.placement.colSpan * result!.placement.rowSpan;
		expect(shrunkArea + newArea).toBe(originalArea);
	});
});

describe('removePanel', () => {
	it('removes a panel leaving empty space', () => {
		const result = removePanel(DEFAULT_LAYOUT, 1);
		expect(result).not.toBeNull();
		expect(result!.length).toBe(DEFAULT_LAYOUT.length - 1);
		expect(result!.find((p) => p.id === DEFAULT_LAYOUT[1].id)).toBeUndefined();
	});

	it('returns null when only one panel', () => {
		const panels = [chartPanel(1, 0, 0, 12, 6)];
		const result = removePanel(panels, 0);
		expect(result).toBeNull();
	});

	it('does not mutate original panels', () => {
		const originalLen = DEFAULT_LAYOUT.length;
		removePanel(DEFAULT_LAYOUT, 1);
		expect(DEFAULT_LAYOUT.length).toBe(originalLen);
	});
});

describe('computeDragLayout', () => {
	it('returns null when position is unchanged (no-op)', () => {
		const panels = [
			chartPanel(1, 0, 0, 4, 3),
			chartPanel(2, 4, 0, 4, 3),
			chartPanel(3, 8, 0, 4, 3),
		];
		expect(computeDragLayout(panels, 0, 0, 0)).toBeNull();
	});

	it('moves to empty space with no displaced panels', () => {
		// Two panels with a gap between them
		const panels = [
			chartPanel(1, 0, 0, 4, 3),
			chartPanel(2, 8, 0, 4, 3),
		];
		// Move panel 0 to the gap area (row 3)
		const result = computeDragLayout(panels, 0, 0, 3);
		expect(result).not.toBeNull();
		expect(result![0].placement).toEqual({ col: 0, row: 3, colSpan: 4, rowSpan: 3 });
		expect(result![1].placement).toEqual(panels[1].placement);
	});

	it('swaps equal-size panels', () => {
		const panels = [
			chartPanel(1, 0, 0, 4, 3),
			chartPanel(2, 4, 0, 4, 3),
			chartPanel(3, 8, 0, 4, 3),
			chartPanel(4, 0, 3, 12, 3),
		];
		// Drag panel 0 to panel 1's position
		const result = computeDragLayout(panels, 0, 4, 0);
		expect(result).not.toBeNull();
		// Panel 0 should be at (4,0)
		expect(result![0].placement.col).toBe(4);
		expect(result![0].placement.row).toBe(0);
		// Panel 1 should have moved to freed space (0,0)
		expect(result![1].placement.col).toBe(0);
		expect(result![1].placement.row).toBe(0);
		expect(result![1].placement.colSpan).toBe(4);
		expect(result![1].placement.rowSpan).toBe(3);
	});

	it('large panel displaces small panel into freed space', () => {
		// Row 0-2: [6x3] [3x3] [3x3]
		// Row 3-5: [12x3]
		const panels = [
			chartPanel(1, 0, 0, 6, 3),
			chartPanel(2, 6, 0, 3, 3),
			chartPanel(3, 9, 0, 3, 3),
			chartPanel(4, 0, 3, 12, 3),
		];
		// Drag the 6x3 panel to col 6
		const result = computeDragLayout(panels, 0, 6, 0);
		expect(result).not.toBeNull();
		// Panel 0 now at (6,0)
		expect(result![0].placement).toEqual({ col: 6, row: 0, colSpan: 6, rowSpan: 3 });
		// Displaced panels (1 and 2) should fit somewhere in the freed 6-wide space at col 0
		const validation = validatePlacement(result!);
		expect(validation.valid).toBe(true);
	});

	it('displaces multiple panels, all relocate', () => {
		// Three equal panels in a row, plus a bottom row
		const panels = [
			chartPanel(1, 0, 0, 4, 3),
			chartPanel(2, 4, 0, 4, 3),
			chartPanel(3, 8, 0, 4, 3),
			chartPanel(4, 0, 3, 4, 3),
			chartPanel(5, 4, 3, 4, 3),
			chartPanel(6, 8, 3, 4, 3),
		];
		// Drag panel 3 (bottom-left) to overlap panel 1 and 2 (top-middle, top-right)
		// Panel 3 is 4x3. Moving to (4, 0) displaces panel 1
		const result = computeDragLayout(panels, 3, 4, 0);
		expect(result).not.toBeNull();
		expect(result![3].placement).toEqual({ col: 4, row: 0, colSpan: 4, rowSpan: 3 });
		// Panel 1 should have moved to the freed space
		const validation = validatePlacement(result!);
		expect(validation.valid).toBe(true);
	});

	it('returns null when displaced panel cannot fit (blocked)', () => {
		// Drag a 2x1 chart panel on top of a 3x2 map; the freed 2x1 space is too small for the map.
		const blockedPanels = [
			mapPanel(1, 0, 0, 3, 2),  // map: min 3x2
			chartPanel(2, 3, 0, 3, 2),
			chartPanel(3, 6, 0, 6, 2),
			chartPanel(4, 0, 2, 12, 2),
			chartPanel(5, 0, 4, 2, 1),
			chartPanel(6, 2, 4, 10, 1),
			chartPanel(7, 0, 5, 12, 1),
		];
		// Drag panel 5 (2x1 at 0,4) to (0,0) — displaces map panel 0 (3x2, min 3x2)
		// Freed space is 2x1 at (0,4) — too small for the 3x2 map even at minimum size.
		// The map needs at least 3x2 = 6 cells but freed space is only 2 cells.
		// Other free space? Let's check: grid is mostly covered.
		const result2 = computeDragLayout(blockedPanels, 5, 0, 0);
		expect(result2).toBeNull();
	});

	it('respects special panel min size when displaced', () => {
		// Map panel (min 3x2) displaced by a move
		const panels = [
			mapPanel(1, 0, 0, 3, 2),
			chartPanel(2, 3, 0, 9, 2),
			chartPanel(3, 0, 2, 12, 4),
		];
		// Drag panel 2 (9x2) to (0,0) — displaces map panel 0
		// The freed space is at (3,0) with size 9x2 — map can fit there at 3x2
		const result = computeDragLayout(panels, 2, 0, 0);
		expect(result).not.toBeNull();
		// Map should maintain at least 3x2
		expect(result![0].placement.colSpan).toBeGreaterThanOrEqual(MIN_SPECIAL_COL_SPAN);
		expect(result![0].placement.rowSpan).toBeGreaterThanOrEqual(MIN_SPECIAL_ROW_SPAN);
	});

	it('does not mutate original panels', () => {
		const panels = [
			chartPanel(1, 0, 0, 4, 3),
			chartPanel(2, 4, 0, 4, 3),
			chartPanel(3, 8, 0, 4, 3),
			chartPanel(4, 0, 3, 12, 3),
		];
		const origCol = panels[0].placement.col;
		const origRow = panels[0].placement.row;
		computeDragLayout(panels, 0, 4, 0);
		expect(panels[0].placement.col).toBe(origCol);
		expect(panels[0].placement.row).toBe(origRow);
	});

	it('produces a valid layout', () => {
		const panels = [
			chartPanel(1, 0, 0, 6, 3),
			chartPanel(2, 6, 0, 6, 3),
			chartPanel(3, 0, 3, 6, 3),
			chartPanel(4, 6, 3, 6, 3),
		];
		const result = computeDragLayout(panels, 0, 6, 0);
		expect(result).not.toBeNull();
		const validation = validatePlacement(result!);
		expect(validation.valid).toBe(true);
	});

	it('returns null when target is out of bounds', () => {
		const panels = [chartPanel(1, 0, 0, 4, 3)];
		expect(computeDragLayout(panels, 0, 10, 0)).toBeNull(); // 10 + 4 > 12
		expect(computeDragLayout(panels, 0, 0, 5)).toBeNull(); // 5 + 3 > 6
	});
});
