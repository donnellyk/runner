import { type LayoutPanel, type PanelPlacement } from './layout-url';

export const GRID_COLS = 12;
export const GRID_ROWS = 6;
export const MAX_PANELS = 12;
export const MIN_COL_SPAN = 2;
export const MIN_ROW_SPAN = 1;
export const MIN_SPECIAL_COL_SPAN = 3; // for map and heatmap
export const MIN_SPECIAL_ROW_SPAN = 2; // for map and heatmap

function isSpecialPanel(panel: LayoutPanel): boolean {
	return (
		panel.config.kind === 'special' &&
		(panel.config.specialType === 'map' || panel.config.specialType === 'heatmap')
	);
}

export function getMinColSpan(panel: LayoutPanel): number {
	return isSpecialPanel(panel) ? MIN_SPECIAL_COL_SPAN : MIN_COL_SPAN;
}

export function getMinRowSpan(panel: LayoutPanel): number {
	return isSpecialPanel(panel) ? MIN_SPECIAL_ROW_SPAN : MIN_ROW_SPAN;
}

export function validatePlacement(panels: LayoutPanel[]): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Check panel count
	if (panels.length > MAX_PANELS) {
		errors.push(`Too many panels: ${panels.length} exceeds maximum of ${MAX_PANELS}`);
	}

	for (let i = 0; i < panels.length; i++) {
		const p = panels[i].placement;

		// Check valid bounds
		if (p.col < 0 || p.col >= GRID_COLS) {
			errors.push(`Panel ${i}: col ${p.col} is out of bounds`);
		}
		if (p.row < 0 || p.row >= GRID_ROWS) {
			errors.push(`Panel ${i}: row ${p.row} is out of bounds`);
		}
		if (p.col + p.colSpan > GRID_COLS) {
			errors.push(`Panel ${i}: col ${p.col} + colSpan ${p.colSpan} exceeds grid width ${GRID_COLS}`);
		}
		if (p.row + p.rowSpan > GRID_ROWS) {
			errors.push(`Panel ${i}: row ${p.row} + rowSpan ${p.rowSpan} exceeds grid height ${GRID_ROWS}`);
		}

		// Check minimum spans
		const minCol = getMinColSpan(panels[i]);
		const minRow = getMinRowSpan(panels[i]);
		if (p.colSpan < minCol) {
			errors.push(`Panel ${i}: colSpan ${p.colSpan} is below minimum ${minCol}`);
		}
		if (p.rowSpan < minRow) {
			errors.push(`Panel ${i}: rowSpan ${p.rowSpan} is below minimum ${minRow}`);
		}
	}

	// Check overlaps using a cell grid
	const grid = new Uint8Array(GRID_COLS * GRID_ROWS);
	for (let i = 0; i < panels.length; i++) {
		const p = panels[i].placement;
		for (let r = p.row; r < Math.min(p.row + p.rowSpan, GRID_ROWS); r++) {
			for (let c = p.col; c < Math.min(p.col + p.colSpan, GRID_COLS); c++) {
				const idx = r * GRID_COLS + c;
				if (grid[idx] !== 0) {
					errors.push(`Overlap at cell (${c}, ${r}) between panels`);
				}
				grid[idx] = 1;
			}
		}
	}

	return { valid: errors.length === 0, errors };
}

export function findAlignedNeighbors(
	panels: LayoutPanel[],
	panelIndex: number,
	edge: 'right' | 'bottom',
): number[] | null {
	const panel = panels[panelIndex];
	const p = panel.placement;

	if (edge === 'right') {
		const boundary = p.col + p.colSpan;
		if (boundary >= GRID_COLS) return null;

		const sourceRowStart = p.row;
		const sourceRowEnd = p.row + p.rowSpan;

		// Find all panels whose left edge is at the boundary and whose row range overlaps
		const neighbors: { index: number; rowStart: number; rowEnd: number }[] = [];
		for (let i = 0; i < panels.length; i++) {
			if (i === panelIndex) continue;
			const np = panels[i].placement;
			if (np.col === boundary) {
				const nRowStart = np.row;
				const nRowEnd = np.row + np.rowSpan;
				// Check overlap with source panel's row range
				if (nRowStart < sourceRowEnd && nRowEnd > sourceRowStart) {
					neighbors.push({ index: i, rowStart: nRowStart, rowEnd: nRowEnd });
				}
			}
		}

		// Check they perfectly tile the source panel's row extent
		if (!perfectlyTiles(neighbors, sourceRowStart, sourceRowEnd)) return null;
		return neighbors.map((n) => n.index);
	}

	// edge === 'bottom'
	const boundary = p.row + p.rowSpan;
	if (boundary >= GRID_ROWS) return null;

	const sourceColStart = p.col;
	const sourceColEnd = p.col + p.colSpan;

	const neighbors: { index: number; colStart: number; colEnd: number }[] = [];
	for (let i = 0; i < panels.length; i++) {
		if (i === panelIndex) continue;
		const np = panels[i].placement;
		if (np.row === boundary) {
			const nColStart = np.col;
			const nColEnd = np.col + np.colSpan;
			if (nColStart < sourceColEnd && nColEnd > sourceColStart) {
				neighbors.push({ index: i, colStart: nColStart, colEnd: nColEnd });
			}
		}
	}

	if (!perfectlyTilesCol(neighbors, sourceColStart, sourceColEnd)) return null;
	return neighbors.map((n) => n.index);
}

function perfectlyTiles(
	segments: { rowStart: number; rowEnd: number }[],
	rangeStart: number,
	rangeEnd: number,
): boolean {
	if (segments.length === 0) return false;

	// Sort by start
	const sorted = [...segments].sort((a, b) => a.rowStart - b.rowStart);

	// Check contiguous coverage from rangeStart to rangeEnd
	let cursor = rangeStart;
	for (const seg of sorted) {
		if (seg.rowStart !== cursor) return false;
		cursor = seg.rowEnd;
	}
	return cursor === rangeEnd;
}

function perfectlyTilesCol(
	segments: { colStart: number; colEnd: number }[],
	rangeStart: number,
	rangeEnd: number,
): boolean {
	if (segments.length === 0) return false;

	const sorted = [...segments].sort((a, b) => a.colStart - b.colStart);

	let cursor = rangeStart;
	for (const seg of sorted) {
		if (seg.colStart !== cursor) return false;
		cursor = seg.colEnd;
	}
	return cursor === rangeEnd;
}

export function canResize(
	panels: LayoutPanel[],
	panelIndex: number,
	edge: 'right' | 'bottom' | 'left' | 'top',
	delta: number,
): LayoutPanel[] | null {
	if (delta === 0) return null;

	const result: LayoutPanel[] = panels.map((p) => ({
		...p,
		placement: { ...p.placement },
	}));

	const panel = result[panelIndex];
	const orig = panels[panelIndex].placement;

	if (edge === 'right') {
		const newColSpan = panel.placement.colSpan + delta;
		if (newColSpan < getMinColSpan(panels[panelIndex])) return null;
		if (panel.placement.col + newColSpan > GRID_COLS) return null;

		if (delta > 0) {
			const newRight = panel.placement.col + newColSpan;
			for (let i = 0; i < result.length; i++) {
				if (i === panelIndex) continue;
				const np = result[i].placement;
				if (np.col < newRight && np.col + np.colSpan > orig.col + orig.colSpan
					&& np.row < orig.row + orig.rowSpan && np.row + np.rowSpan > orig.row) {
					const overlap = newRight - np.col;
					const shrunk = np.colSpan - overlap;
					if (shrunk < getMinColSpan(panels[i])) return null;
					np.col += overlap;
					np.colSpan = shrunk;
				}
			}
		}

		panel.placement.colSpan = newColSpan;
	} else if (edge === 'left') {
		const newCol = panel.placement.col + delta;
		const newColSpan = panel.placement.colSpan - delta;
		if (newCol < 0) return null;
		if (newColSpan < getMinColSpan(panels[panelIndex])) return null;

		if (delta < 0) {
			for (let i = 0; i < result.length; i++) {
				if (i === panelIndex) continue;
				const np = result[i].placement;
				if (np.col + np.colSpan > newCol && np.col < orig.col
					&& np.row < orig.row + orig.rowSpan && np.row + np.rowSpan > orig.row) {
					const overlap = np.col + np.colSpan - newCol;
					const shrunk = np.colSpan - overlap;
					if (shrunk < getMinColSpan(panels[i])) return null;
					np.colSpan = shrunk;
				}
			}
		}

		panel.placement.col = newCol;
		panel.placement.colSpan = newColSpan;
	} else if (edge === 'bottom') {
		const newRowSpan = panel.placement.rowSpan + delta;
		if (newRowSpan < getMinRowSpan(panels[panelIndex])) return null;
		if (panel.placement.row + newRowSpan > GRID_ROWS) return null;

		if (delta > 0) {
			const newBottom = panel.placement.row + newRowSpan;
			for (let i = 0; i < result.length; i++) {
				if (i === panelIndex) continue;
				const np = result[i].placement;
				if (np.row < newBottom && np.row + np.rowSpan > orig.row + orig.rowSpan
					&& np.col < orig.col + orig.colSpan && np.col + np.colSpan > orig.col) {
					const overlap = newBottom - np.row;
					const shrunk = np.rowSpan - overlap;
					if (shrunk < getMinRowSpan(panels[i])) return null;
					np.row += overlap;
					np.rowSpan = shrunk;
				}
			}
		}

		panel.placement.rowSpan = newRowSpan;
	} else {
		// edge === 'top'
		const newRow = panel.placement.row + delta;
		const newRowSpan = panel.placement.rowSpan - delta;
		if (newRow < 0) return null;
		if (newRowSpan < getMinRowSpan(panels[panelIndex])) return null;

		if (delta < 0) {
			for (let i = 0; i < result.length; i++) {
				if (i === panelIndex) continue;
				const np = result[i].placement;
				if (np.row + np.rowSpan > newRow && np.row < orig.row
					&& np.col < orig.col + orig.colSpan && np.col + np.colSpan > orig.col) {
					const overlap = np.row + np.rowSpan - newRow;
					const shrunk = np.rowSpan - overlap;
					if (shrunk < getMinRowSpan(panels[i])) return null;
					np.rowSpan = shrunk;
				}
			}
		}

		panel.placement.row = newRow;
		panel.placement.rowSpan = newRowSpan;
	}

	const validation = validatePlacement(result);
	if (!validation.valid) return null;

	return result;
}

export function findSplitForNewPanel(
	panels: LayoutPanel[],
): { panelIndex: number; placement: PanelPlacement; shrunkPlacement: PanelPlacement } | null {
	if (panels.length >= MAX_PANELS) return null;

	// Find the largest panel that can be split
	let bestIdx = -1;
	let bestArea = 0;
	for (let i = 0; i < panels.length; i++) {
		const p = panels[i].placement;
		const area = p.colSpan * p.rowSpan;
		if (area > bestArea) {
			// Check if it can be split (at least 2x min size in one dimension)
			const minCol = getMinColSpan(panels[i]);
			const canSplitH = p.colSpan >= minCol + MIN_COL_SPAN;
			const canSplitV = p.rowSpan >= MIN_ROW_SPAN * 2;
			if (canSplitH || canSplitV) {
				bestArea = area;
				bestIdx = i;
			}
		}
	}

	if (bestIdx === -1) return null;

	const p = panels[bestIdx].placement;
	const minCol = getMinColSpan(panels[bestIdx]);
	const canSplitH = p.colSpan >= minCol + MIN_COL_SPAN;

	// Prefer horizontal split (more common layout pattern)
	if (canSplitH) {
		const newColSpan = Math.floor(p.colSpan / 2);
		const remainingColSpan = p.colSpan - newColSpan;
		return {
			panelIndex: bestIdx,
			shrunkPlacement: { col: p.col, row: p.row, colSpan: remainingColSpan, rowSpan: p.rowSpan },
			placement: { col: p.col + remainingColSpan, row: p.row, colSpan: newColSpan, rowSpan: p.rowSpan },
		};
	}

	// Vertical split
	const newRowSpan = Math.floor(p.rowSpan / 2);
	const remainingRowSpan = p.rowSpan - newRowSpan;
	return {
		panelIndex: bestIdx,
		shrunkPlacement: { col: p.col, row: p.row, colSpan: p.colSpan, rowSpan: remainingRowSpan },
		placement: { col: p.col, row: p.row + remainingRowSpan, colSpan: p.colSpan, rowSpan: newRowSpan },
	};
}

export function removePanel(
	panels: LayoutPanel[],
	panelIndex: number,
): LayoutPanel[] | null {
	if (panels.length <= 1) return null;

	return panels
		.filter((_, idx) => idx !== panelIndex)
		.map((p) => ({ ...p, config: { ...p.config }, placement: { ...p.placement } }));
}

function buildOccupancyGrid(panels: LayoutPanel[], excludeIndices: Set<number>): Uint8Array {
	const grid = new Uint8Array(GRID_COLS * GRID_ROWS);
	for (let i = 0; i < panels.length; i++) {
		if (excludeIndices.has(i)) continue;
		const p = panels[i].placement;
		for (let r = p.row; r < p.row + p.rowSpan; r++) {
			for (let c = p.col; c < p.col + p.colSpan; c++) {
				grid[r * GRID_COLS + c] = 1;
			}
		}
	}
	return grid;
}

function markOccupancy(
	grid: Uint8Array,
	col: number,
	row: number,
	colSpan: number,
	rowSpan: number,
): void {
	for (let r = row; r < row + rowSpan; r++) {
		for (let c = col; c < col + colSpan; c++) {
			grid[r * GRID_COLS + c] = 1;
		}
	}
}

function findPlacement(
	occupancy: Uint8Array,
	colSpan: number,
	rowSpan: number,
	preferCol: number,
	preferRow: number,
): PanelPlacement | null {
	let best: PanelPlacement | null = null;
	let bestDist = Infinity;

	for (let row = 0; row + rowSpan <= GRID_ROWS; row++) {
		for (let col = 0; col + colSpan <= GRID_COLS; col++) {
			let free = true;
			for (let r = row; r < row + rowSpan && free; r++) {
				for (let c = col; c < col + colSpan && free; c++) {
					if (occupancy[r * GRID_COLS + c] !== 0) {
						free = false;
					}
				}
			}
			if (!free) continue;

			const dist = Math.abs(col - preferCol) + Math.abs(row - preferRow);
			if (dist < bestDist) {
				bestDist = dist;
				best = { col, row, colSpan, rowSpan };
			}
		}
	}

	return best;
}

export function computeDragLayout(
	panels: LayoutPanel[],
	dragIdx: number,
	targetCol: number,
	targetRow: number,
): LayoutPanel[] | null {
	const dragged = panels[dragIdx];
	const origPlacement = dragged.placement;

	if (targetCol === origPlacement.col && targetRow === origPlacement.row) return null;

	const { colSpan, rowSpan } = origPlacement;
	if (targetCol + colSpan > GRID_COLS || targetRow + rowSpan > GRID_ROWS) return null;
	if (targetCol < 0 || targetRow < 0) return null;

	const result = panels.map((p) => ({
		...p,
		config: { ...p.config },
		placement: { ...p.placement },
	}));

	const freedRect = { ...origPlacement };

	result[dragIdx].placement.col = targetCol;
	result[dragIdx].placement.row = targetRow;

	const newRect = result[dragIdx].placement;
	const displacedIndices: number[] = [];
	for (let i = 0; i < result.length; i++) {
		if (i === dragIdx) continue;
		const p = result[i].placement;
		if (
			p.col < newRect.col + newRect.colSpan &&
			p.col + p.colSpan > newRect.col &&
			p.row < newRect.row + newRect.rowSpan &&
			p.row + p.rowSpan > newRect.row
		) {
			displacedIndices.push(i);
		}
	}

	if (displacedIndices.length === 0) {
		const validation = validatePlacement(result);
		return validation.valid ? result : null;
	}

	const excludeSet = new Set(displacedIndices);
	const occupancy = buildOccupancyGrid(result, excludeSet);

	const displacedSorted = [...displacedIndices].sort((a, b) => {
		const areaA = panels[a].placement.colSpan * panels[a].placement.rowSpan;
		const areaB = panels[b].placement.colSpan * panels[b].placement.rowSpan;
		return areaB - areaA;
	});

	const preferCol = freedRect.col;
	const preferRow = freedRect.row;

	for (const idx of displacedSorted) {
		const panel = result[idx];
		const origColSpan = panel.placement.colSpan;
		const origRowSpan = panel.placement.rowSpan;
		const minCol = getMinColSpan(panel);
		const minRow = getMinRowSpan(panel);

		const sizes: { cs: number; rs: number }[] = [];
		for (let cs = origColSpan; cs >= minCol; cs--) {
			for (let rs = origRowSpan; rs >= minRow; rs--) {
				sizes.push({ cs, rs });
			}
		}
		sizes.sort((a, b) => b.cs * b.rs - (a.cs * a.rs));

		let placed = false;
		for (const { cs, rs } of sizes) {
			const placement = findPlacement(occupancy, cs, rs, preferCol, preferRow);
			if (placement) {
				panel.placement = placement;
				markOccupancy(occupancy, placement.col, placement.row, placement.colSpan, placement.rowSpan);
				placed = true;
				break;
			}
		}

		if (!placed) return null;
	}

	const validation = validatePlacement(result);
	return validation.valid ? result : null;
}
