import { findClosestIndex, resolveMouseIndex, type Padding } from "./chart-utils";
import type { ChartDimensions } from "./chart-dimensions.svelte";
import type { Selection } from "./selection-stats";

export interface ChartInteractionConfig {
	dims: ChartDimensions;
	padding: Padding;
	getXPositions(): number[];
	fromY(px: number): number;
	getDraggingRefIdx(): number | null;
	setDraggingRefIdx(v: number | null): void;
	onRefLineDrag(value: number): void;
	onCrosshairMove(idx: number): void;
	onCrosshairClick(idx: number): void;
	onCrosshairLeave(): void;
}

const DRAG_THRESHOLD = 5;

export function createChartInteraction(config: ChartInteractionConfig) {
	const { dims, padding: P } = config;

	let dragOrigin = $state<{
		clientX: number;
		clientY: number;
		svgX: number;
		svgY: number;
	} | null>(null);
	let dragMode = $state<"horizontal" | "vertical" | null>(null);
	let selection = $state<Selection | null>(null);
	let justFinishedDrag = $state(false);

	function resolveSvgPos(e: MouseEvent): { x: number; y: number } | null {
		if (!dims.svgEl) return null;
		const rect = dims.svgEl.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function resolveIndex(e: MouseEvent): number | null {
		return resolveMouseIndex(dims.svgEl, e, config.getXPositions());
	}

	function handleMouseDown(e: MouseEvent) {
		if (config.getDraggingRefIdx() != null) return;
		const pos = resolveSvgPos(e);
		if (!pos) return;
		if (
			pos.x < P.left ||
			pos.x > P.left + dims.chartW ||
			pos.y < P.top ||
			pos.y > P.top + dims.chartH
		)
			return;
		dragOrigin = {
			clientX: e.clientX,
			clientY: e.clientY,
			svgX: pos.x,
			svgY: pos.y,
		};
		dragMode = null;
		justFinishedDrag = false;
	}

	function handleMouseMove(e: MouseEvent) {
		if (config.getDraggingRefIdx() != null) {
			if (!dims.svgEl) return;
			const rect = dims.svgEl.getBoundingClientRect();
			const mouseY = e.clientY - rect.top;
			const clamped = Math.max(P.top, Math.min(P.top + dims.chartH, mouseY));
			config.onRefLineDrag(config.fromY(clamped));
			return;
		}

		if (dragOrigin) {
			const dx = Math.abs(e.clientX - dragOrigin.clientX);
			const dy = Math.abs(e.clientY - dragOrigin.clientY);

			if (dragMode == null) {
				if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
				dragMode = dx >= dy ? "horizontal" : "vertical";
			}

			const pos = resolveSvgPos(e);
			if (!pos) return;

			if (dragMode === "horizontal") {
				const xPositions = config.getXPositions();
				const si = findClosestIndex(dragOrigin.svgX, xPositions);
				const ei = findClosestIndex(pos.x, xPositions);
				if (si != null && ei != null) {
					const lo = Math.min(si, ei);
					const hi = Math.max(si, ei);
					selection = { mode: "horizontal", startIdx: lo, endIdx: hi };
				}
			} else {
				const clampedOriginY = Math.max(
					P.top,
					Math.min(P.top + dims.chartH, dragOrigin.svgY),
				);
				const clampedCurrentY = Math.max(
					P.top,
					Math.min(P.top + dims.chartH, pos.y),
				);
				const v1 = config.fromY(clampedOriginY);
				const v2 = config.fromY(clampedCurrentY);
				selection = {
					mode: "vertical",
					lowValue: Math.min(v1, v2),
					highValue: Math.max(v1, v2),
				};
			}
			return;
		}

		const idx = resolveIndex(e);
		if (idx != null) config.onCrosshairMove(idx);
	}

	function handleMouseUp() {
		if (config.getDraggingRefIdx() != null) {
			config.setDraggingRefIdx(null);
			return;
		}
		if (dragOrigin && dragMode != null) {
			dragOrigin = null;
			dragMode = null;
			justFinishedDrag = true;
			return;
		}
		dragOrigin = null;
		dragMode = null;
	}

	function handleClick(e: MouseEvent) {
		if (justFinishedDrag) {
			justFinishedDrag = false;
			return;
		}
		if (selection) {
			selection = null;
			return;
		}
		const idx = resolveIndex(e);
		if (idx != null) config.onCrosshairClick(idx);
	}

	function handleMouseLeave() {
		if (config.getDraggingRefIdx() != null) {
			config.setDraggingRefIdx(null);
			return;
		}
		if (dragOrigin) {
			dragOrigin = null;
			dragMode = null;
			return;
		}
		config.onCrosshairLeave();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Escape" && selection) {
			e.stopPropagation();
			selection = null;
		}
	}

	const cursorStyle = $derived.by(() => {
		if (config.getDraggingRefIdx() != null) return "ns-resize";
		if (dragMode === "horizontal") return "col-resize";
		if (dragMode === "vertical") return "row-resize";
		if (dragOrigin) return "crosshair";
		return "";
	});

	return {
		get selection() {
			return selection;
		},
		get dragOrigin() {
			return dragOrigin;
		},
		get cursorStyle() {
			return cursorStyle;
		},
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleClick,
		handleMouseLeave,
		handleKeyDown,
	};
}

export type ChartInteraction = ReturnType<typeof createChartInteraction>;
