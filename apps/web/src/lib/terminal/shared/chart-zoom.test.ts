import { describe, it, expect } from 'vitest';
import {
	DEFAULT_ZOOM,
	MIN_ZOOM,
	MAX_ZOOM,
	clampZoom,
	clampOffset,
	computeRange,
	zoomAroundCenter,
} from './chart-zoom.svelte';

describe('DEFAULT_ZOOM', () => {
	it('is locked with all zooms 1 and all offsets 0', () => {
		expect(DEFAULT_ZOOM).toEqual({ locked: true, xZoom: 1, xOffset: 0, yZoom: 1, yOffset: 0 });
	});
});

describe('clampZoom', () => {
	it('clamps below MIN_ZOOM', () => {
		expect(clampZoom(0)).toBe(MIN_ZOOM);
		expect(clampZoom(-1)).toBe(MIN_ZOOM);
	});

	it('clamps above MAX_ZOOM', () => {
		expect(clampZoom(5)).toBe(MAX_ZOOM);
		expect(clampZoom(2)).toBe(MAX_ZOOM);
	});

	it('passes through values within range', () => {
		expect(clampZoom(0.5)).toBe(0.5);
		expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
		expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
	});
});

describe('clampOffset', () => {
	it('clamps below 0', () => {
		expect(clampOffset(-0.5)).toBe(0);
	});

	it('clamps above 1', () => {
		expect(clampOffset(2)).toBe(1);
	});

	it('passes through values within range', () => {
		expect(clampOffset(0)).toBe(0);
		expect(clampOffset(0.5)).toBe(0.5);
		expect(clampOffset(1)).toBe(1);
	});
});

describe('computeRange', () => {
	describe('returns full range when zoom=1 and offset=0', () => {
		it('returns full range for [0, 100]', () => {
			expect(computeRange(0, 100, 1, 0)).toEqual({ min: 0, max: 100 });
		});

		it('returns full range for non-zero base', () => {
			expect(computeRange(50, 150, 1, 0)).toEqual({ min: 50, max: 150 });
		});
	});

	describe('zoom=0.5 (half width)', () => {
		it('offset=0 returns left half', () => {
			const result = computeRange(0, 100, 0.5, 0);
			expect(result.min).toBeCloseTo(0);
			expect(result.max).toBeCloseTo(50);
		});

		it('offset=1 returns right half', () => {
			const result = computeRange(0, 100, 0.5, 1);
			expect(result.min).toBeCloseTo(50);
			expect(result.max).toBeCloseTo(100);
		});

		it('offset=0.5 returns middle half', () => {
			const result = computeRange(0, 100, 0.5, 0.5);
			expect(result.min).toBeCloseTo(25);
			expect(result.max).toBeCloseTo(75);
		});
	});

	describe('zoom=0.25 (quarter width)', () => {
		it('offset=0 returns first quarter', () => {
			const result = computeRange(0, 100, 0.25, 0);
			expect(result.min).toBeCloseTo(0);
			expect(result.max).toBeCloseTo(25);
		});

		it('offset=1 returns last quarter', () => {
			const result = computeRange(0, 100, 0.25, 1);
			expect(result.min).toBeCloseTo(75);
			expect(result.max).toBeCloseTo(100);
		});
	});

	it('works with non-zero fullMin', () => {
		const result = computeRange(100, 200, 0.5, 0);
		expect(result.min).toBeCloseTo(100);
		expect(result.max).toBeCloseTo(150);
	});
});

describe('zoomAroundCenter', () => {
	describe('clamping', () => {
		it('clamps newZoom to MIN_ZOOM when zooming in past minimum', () => {
			const { zoom } = zoomAroundCenter(0.02, 0, 0.1, 0.5);
			expect(zoom).toBe(MIN_ZOOM);
		});

		it('clamps newZoom to MAX_ZOOM and resets offset to 0 when zooming out past maximum', () => {
			const { zoom, offset } = zoomAroundCenter(0.5, 0.5, 10, 0.5);
			expect(zoom).toBe(MAX_ZOOM);
			expect(offset).toBe(0);
		});
	});

	describe('center stability — left edge (center=0)', () => {
		it('keeps the left edge pinned when zooming in from full range', () => {
			const { zoom, offset } = zoomAroundCenter(1, 0, 0.5, 0);
			// visibleStart should still be 0: computeRange(0,100, zoom, offset).min === 0
			const result = computeRange(0, 100, zoom, offset);
			expect(result.min).toBeCloseTo(0);
			expect(result.max).toBeCloseTo(50);
		});
	});

	describe('center stability — right edge (center=1)', () => {
		it('keeps the right edge pinned when zooming in from full range', () => {
			const { zoom, offset } = zoomAroundCenter(1, 0, 0.5, 1);
			const result = computeRange(0, 100, zoom, offset);
			expect(result.max).toBeCloseTo(100);
			expect(result.min).toBeCloseTo(50);
		});
	});

	describe('center stability — midpoint (center=0.5)', () => {
		it('keeps the midpoint stable when zooming in from full range', () => {
			const { zoom, offset } = zoomAroundCenter(1, 0, 0.5, 0.5);
			const result = computeRange(0, 100, zoom, offset);
			expect((result.min + result.max) / 2).toBeCloseTo(50);
			expect(result.max - result.min).toBeCloseTo(50);
		});

		it('keeps the midpoint stable when already zoomed and zooming further', () => {
			// xZoom=0.5, xOffset=0.5 → computeRange(0,100,0.5,0.5) = [25, 75], midpoint=50
			// Zoom in by 0.5 around center (0.5) → new visible width = 25, midpoint should stay at 50
			const { zoom, offset } = zoomAroundCenter(0.5, 0.5, 0.5, 0.5);
			const result = computeRange(0, 100, zoom, offset);
			expect((result.min + result.max) / 2).toBeCloseTo(50);
			expect(result.max - result.min).toBeCloseTo(25);
		});

		it('keeps the midpoint stable when zooming out', () => {
			const { zoom, offset } = zoomAroundCenter(0.5, 0.25, 2, 0.5);
			const result = computeRange(0, 100, zoom, offset);
			expect((result.min + result.max) / 2).toBeCloseTo(50);
		});
	});

	describe('offset is clamped', () => {
		it('does not produce offset below 0', () => {
			const { offset } = zoomAroundCenter(0.5, 0, 0.5, 0);
			expect(offset).toBeGreaterThanOrEqual(0);
		});

		it('does not produce offset above 1', () => {
			const { offset } = zoomAroundCenter(0.5, 1, 0.5, 1);
			expect(offset).toBeLessThanOrEqual(1);
		});
	});
});

describe('Y axis — same math as X', () => {
	it('computeRange returns correct subset for y-axis values', () => {
		const result = computeRange(0, 200, 0.5, 0);
		expect(result.min).toBeCloseTo(0);
		expect(result.max).toBeCloseTo(100);
	});

	it('zoomAroundCenter clamps yZoom at minimum', () => {
		const { zoom } = zoomAroundCenter(0.02, 0, 0.1, 0.5);
		expect(zoom).toBe(MIN_ZOOM);
	});

	it('zoomAroundCenter keeps center stable for y-axis zoom', () => {
		const { zoom, offset } = zoomAroundCenter(1, 0, 0.5, 0.5);
		const result = computeRange(0, 200, zoom, offset);
		expect((result.min + result.max) / 2).toBeCloseTo(100);
	});
});
