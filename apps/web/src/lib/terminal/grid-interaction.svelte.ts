import type { LayoutPanel, PanelPlacement } from './layout-url';
import type { TerminalState } from './terminal-state.svelte';
import { canResize, GRID_COLS, GRID_ROWS } from './grid-validation';

export type ResizeEdge =
	| 'top' | 'bottom' | 'left' | 'right'
	| 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export function createGridInteraction(
	state: TerminalState,
	getContainer: () => HTMLElement | null,
	onCommit?: () => void,
) {
	let resizePanel = $state<number | null>(null);
	let resizeEdge = $state<ResizeEdge | null>(null);
	let pendingResult = $state<LayoutPanel[] | null>(null);
	let previewPlacement = $state<PanelPlacement | null>(null);
	let affectedPlacements = $state<PanelPlacement[]>([]);
	let capturedPointerId = $state<number | null>(null);
	let swapSource = $state<number | null>(null);
	let blocked = $state(false);

	function pixelToGrid(clientX: number, clientY: number): { col: number; row: number } {
		const container = getContainer();
		if (!container) return { col: 0, row: 0 };
		const rect = container.getBoundingClientRect();
		const x = clientX - rect.left;
		const y = clientY - rect.top;

		return {
			col: Math.max(0, Math.min(GRID_COLS, Math.round((x / rect.width) * GRID_COLS))),
			row: Math.max(0, Math.min(GRID_ROWS, Math.round((y / rect.height) * GRID_ROWS))),
		};
	}

	function startResize(
		panelIndex: number,
		edge: ResizeEdge,
		pointerId: number,
	) {
		resizePanel = panelIndex;
		resizeEdge = edge;
		pendingResult = null;
		state.isResizing = true;

		const container = getContainer();
		if (container) {
			container.setPointerCapture(pointerId);
			capturedPointerId = pointerId;
		}
	}

	function onPointerMove(event: PointerEvent) {
		if (resizePanel === null || resizeEdge === null) return;

		const panel = state.layoutPanels[resizePanel];
		if (!panel) return;

		const grid = pixelToGrid(event.clientX, event.clientY);

		let testPanels: LayoutPanel[] = state.layoutPanels;
		let anyBlocked = false;

		const hasRight = resizeEdge === 'right' || resizeEdge === 'top-right' || resizeEdge === 'bottom-right';
		const hasLeft = resizeEdge === 'left' || resizeEdge === 'top-left' || resizeEdge === 'bottom-left';
		const hasBottom = resizeEdge === 'bottom' || resizeEdge === 'bottom-left' || resizeEdge === 'bottom-right';
		const hasTop = resizeEdge === 'top' || resizeEdge === 'top-left' || resizeEdge === 'top-right';

		if (hasRight) {
			const p = testPanels[resizePanel];
			const currentRight = p.placement.col + p.placement.colSpan;
			const delta = grid.col - currentRight;
			if (delta !== 0) {
				const result = canResize(testPanels, resizePanel, 'right', delta);
				if (result) testPanels = result;
				else anyBlocked = true;
			}
		}

		if (hasLeft) {
			const p = testPanels[resizePanel];
			const delta = grid.col - p.placement.col;
			if (delta !== 0) {
				const result = canResize(testPanels, resizePanel, 'left', delta);
				if (result) testPanels = result;
				else anyBlocked = true;
			}
		}

		if (hasBottom) {
			const p = testPanels[resizePanel];
			const currentBottom = p.placement.row + p.placement.rowSpan;
			const delta = grid.row - currentBottom;
			if (delta !== 0) {
				const result = canResize(testPanels, resizePanel, 'bottom', delta);
				if (result) testPanels = result;
				else anyBlocked = true;
			}
		}

		if (hasTop) {
			const p = testPanels[resizePanel];
			const delta = grid.row - p.placement.row;
			if (delta !== 0) {
				const result = canResize(testPanels, resizePanel, 'top', delta);
				if (result) testPanels = result;
				else anyBlocked = true;
			}
		}

		// Compute the desired placement from the raw cursor position (clamped to grid)
		const orig = panel.placement;
		const desired = { ...orig };
		if (hasRight) {
			desired.colSpan = Math.max(1, Math.min(grid.col - desired.col, GRID_COLS - desired.col));
		}
		if (hasLeft) {
			const clampedCol = Math.max(0, Math.min(grid.col, desired.col + desired.colSpan - 1));
			desired.colSpan = desired.col + desired.colSpan - clampedCol;
			desired.col = clampedCol;
		}
		if (hasBottom) {
			desired.rowSpan = Math.max(1, Math.min(grid.row - desired.row, GRID_ROWS - desired.row));
		}
		if (hasTop) {
			const clampedRow = Math.max(0, Math.min(grid.row, desired.row + desired.rowSpan - 1));
			desired.rowSpan = desired.row + desired.rowSpan - clampedRow;
			desired.row = clampedRow;
		}

		blocked = anyBlocked;
		const validResult = anyBlocked ? null : (testPanels !== state.layoutPanels ? testPanels : null);
		pendingResult = validResult;
		previewPlacement = desired;

		// Diff to find affected neighbors
		if (validResult && resizePanel !== null) {
			const affected: PanelPlacement[] = [];
			for (let i = 0; i < validResult.length; i++) {
				if (i === resizePanel) continue;
				const o = state.layoutPanels[i]?.placement;
				const u = validResult[i]?.placement;
				if (!o || !u) continue;
				if (o.col !== u.col || o.row !== u.row || o.colSpan !== u.colSpan || o.rowSpan !== u.rowSpan) {
					affected.push(u);
				}
			}
			affectedPlacements = affected;
		} else {
			affectedPlacements = [];
		}
	}

	function endResize() {
		const changed = pendingResult !== null;
		if (pendingResult) {
			state.layoutPanels = pendingResult;
		}

		releaseCapture();
		resetResizeState();

		if (changed) onCommit?.();
	}

	function cancelResize() {
		releaseCapture();
		resetResizeState();
	}

	function releaseCapture() {
		if (capturedPointerId !== null) {
			const container = getContainer();
			if (container && container.hasPointerCapture(capturedPointerId)) {
				container.releasePointerCapture(capturedPointerId);
			}
			capturedPointerId = null;
		}
	}

	function resetResizeState() {
		resizePanel = null;
		resizeEdge = null;
		pendingResult = null;
		previewPlacement = null;
		affectedPlacements = [];
		blocked = false;
		state.isResizing = false;
	}

	function startSwap(panelId: number) {
		swapSource = panelId;
		state.isDragging = true;
	}

	function completeSwap(targetId: number) {
		if (swapSource === null || swapSource === targetId) {
			cancelSwap();
			return;
		}

		const panels = state.layoutPanels;
		const sourceIndex = panels.findIndex((p) => p.id === swapSource);
		const targetIndex = panels.findIndex((p) => p.id === targetId);

		if (sourceIndex === -1 || targetIndex === -1) {
			cancelSwap();
			return;
		}

		const updated = panels.map((p) => ({
			...p,
			config: { ...p.config },
			placement: { ...p.placement },
		}));

		// Swap placements
		const sourcePlacement = { ...updated[sourceIndex].placement };
		updated[sourceIndex].placement = { ...updated[targetIndex].placement };
		updated[targetIndex].placement = sourcePlacement;

		state.layoutPanels = updated;
		swapSource = null;
		state.isDragging = false;
		onCommit?.();
	}

	function cancelSwap() {
		swapSource = null;
		state.isDragging = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (resizePanel !== null) {
			e.preventDefault();
			cancelResize();
		} else if (swapSource !== null) {
			e.preventDefault();
			cancelSwap();
		}
	}

	const isActive = $derived(resizePanel !== null || swapSource !== null);

	return {
		startResize,
		onPointerMove,
		endResize,
		cancelResize,
		handleKeydown,
		startSwap,
		completeSwap,
		cancelSwap,
		get isActive() {
			return isActive;
		},
		get resizingPanelIndex() {
			return resizePanel;
		},
		get pendingResult() {
			return pendingResult;
		},
		get previewPlacement() {
			return previewPlacement;
		},
		get swappingPanelId() {
			return swapSource;
		},
		get resizeBlocked() {
			return blocked;
		},
		get affectedPlacements() {
			return affectedPlacements;
		},
	};
}

export type GridInteraction = ReturnType<typeof createGridInteraction>;
