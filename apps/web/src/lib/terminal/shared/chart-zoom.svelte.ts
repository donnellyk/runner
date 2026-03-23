export interface ZoomState {
	locked: boolean;
	xZoom: number;
	xOffset: number;
	yZoom: number;
	yOffset: number;
}

export const DEFAULT_ZOOM: ZoomState = {
	locked: true,
	xZoom: 1,
	xOffset: 0,
	yZoom: 1,
	yOffset: 0,
};

export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 1;

export function clampZoom(v: number): number {
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v));
}

export function clampOffset(v: number): number {
	return Math.max(0, Math.min(1, v));
}

/**
 * Compute the visible sub-range given a full range, a zoom level, and an offset.
 *
 * - zoom=1, offset=0  → full range
 * - zoom=0.5, offset=0 → left half
 * - zoom=0.5, offset=1 → right half
 */
export function computeRange(
	fullMin: number,
	fullMax: number,
	zoom: number,
	offset: number,
): { min: number; max: number } {
	const fullRange = fullMax - fullMin;
	const visibleWidth = zoom * fullRange;
	const visibleStart = fullMin + offset * (fullRange - visibleWidth);
	return { min: visibleStart, max: visibleStart + visibleWidth };
}

/**
 * Compute new offset after a zoom so that the given center (0-1 in the current
 * visible range) stays fixed.
 *
 * Derivation:
 *   visibleStart = offset * (1 - zoom) * fullRange + fullMin
 *   We want: visibleStart_old + center * visibleWidth_old
 *          = visibleStart_new + center * visibleWidth_new
 *   Solving for offset_new (fullRange cancels):
 *   offset_new = (offset_old*(1 - oldZoom) + center*(oldZoom - newZoom)) / (1 - newZoom)
 *
 * When newZoom reaches MAX_ZOOM (1) the denominator is 0; pin offset to 0.
 */
export function zoomAroundCenter(
	currentZoom: number,
	currentOffset: number,
	factor: number,
	center: number,
): { zoom: number; offset: number } {
	const newZoom = clampZoom(currentZoom * factor);
	if (newZoom >= MAX_ZOOM) {
		return { zoom: MAX_ZOOM, offset: 0 };
	}
	const newOffset = clampOffset(
		(currentOffset * (1 - currentZoom) + center * (currentZoom - newZoom)) / (1 - newZoom),
	);
	return { zoom: newZoom, offset: newOffset };
}

export function createChartZoom() {
	let locked = $state(DEFAULT_ZOOM.locked);
	let xZoom = $state(DEFAULT_ZOOM.xZoom);
	let xOffset = $state(DEFAULT_ZOOM.xOffset);
	let yZoom = $state(DEFAULT_ZOOM.yZoom);
	let yOffset = $state(DEFAULT_ZOOM.yOffset);

	return {
		get locked() {
			return locked;
		},
		set locked(v: boolean) {
			locked = v;
		},

		get xZoom() {
			return xZoom;
		},
		set xZoom(v: number) {
			xZoom = clampZoom(v);
		},

		get xOffset() {
			return xOffset;
		},
		set xOffset(v: number) {
			xOffset = clampOffset(v);
		},

		get yZoom() {
			return yZoom;
		},
		set yZoom(v: number) {
			yZoom = clampZoom(v);
		},

		get yOffset() {
			return yOffset;
		},
		set yOffset(v: number) {
			yOffset = clampOffset(v);
		},

		reset() {
			locked = DEFAULT_ZOOM.locked;
			xZoom = DEFAULT_ZOOM.xZoom;
			xOffset = DEFAULT_ZOOM.xOffset;
			yZoom = DEFAULT_ZOOM.yZoom;
			yOffset = DEFAULT_ZOOM.yOffset;
		},

		applyXRange(fullMin: number, fullMax: number): { min: number; max: number } {
			if (locked) return { min: fullMin, max: fullMax };
			return computeRange(fullMin, fullMax, xZoom, xOffset);
		},

		applyYRange(fullMin: number, fullMax: number): { min: number; max: number } {
			if (locked) return { min: fullMin, max: fullMax };
			return computeRange(fullMin, fullMax, yZoom, yOffset);
		},

		zoomX(factor: number, center = 0.5) {
			const result = zoomAroundCenter(xZoom, xOffset, factor, center);
			xZoom = result.zoom;
			xOffset = result.offset;
		},

		zoomY(factor: number, center = 0.5) {
			const result = zoomAroundCenter(yZoom, yOffset, factor, center);
			yZoom = result.zoom;
			yOffset = result.offset;
		},

		panX(delta: number) {
			xOffset = clampOffset(xOffset + delta);
		},

		panY(delta: number) {
			yOffset = clampOffset(yOffset + delta);
		},
	};
}

export type ChartZoom = ReturnType<typeof createChartZoom>;
