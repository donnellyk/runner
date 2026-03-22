import { describe, it, expect } from 'vitest';
import { findOverlayCrosshairIndex, isPanelDisabledInCompare, COMPARE_COLORS, MAX_COMPARE_ACTIVITIES } from './compare-state.svelte';

describe('findOverlayCrosshairIndex', () => {
	it('returns matching index for equal-length arrays', () => {
		const primary = [0, 500, 1000, 1500, 2000];
		const overlay = [0, 500, 1000, 1500, 2000];
		expect(findOverlayCrosshairIndex(primary, overlay, 2)).toBe(2);
	});

	it('finds closest index when overlay has different spacing', () => {
		const primary = [0, 500, 1000, 1500, 2000];
		const overlay = [0, 400, 800, 1200, 1600, 2000];
		// primaryIndex=2 → targetValue=1000, closest in overlay is index 2 (800) or 3 (1200)
		// Binary search finds first >= 1000, which is index 3 (1200)
		const result = findOverlayCrosshairIndex(primary, overlay, 2);
		expect(result).toBe(3);
	});

	it('returns null when overlay is shorter than crosshair position', () => {
		const primary = [0, 500, 1000, 1500, 2000];
		const overlay = [0, 500, 1000];
		expect(findOverlayCrosshairIndex(primary, overlay, 4)).toBeNull();
	});

	it('returns null when primaryIndex is out of bounds', () => {
		const primary = [0, 500, 1000];
		const overlay = [0, 500, 1000, 1500];
		expect(findOverlayCrosshairIndex(primary, overlay, 5)).toBeNull();
	});

	it('returns 0 for index 0', () => {
		const primary = [0, 500];
		const overlay = [0, 500];
		expect(findOverlayCrosshairIndex(primary, overlay, 0)).toBe(0);
	});

	it('handles exact match at end', () => {
		const primary = [0, 500, 1000];
		const overlay = [0, 500, 1000];
		expect(findOverlayCrosshairIndex(primary, overlay, 2)).toBe(2);
	});
});

describe('isPanelDisabledInCompare', () => {
	it('disables candlestick charts', () => {
		expect(isPanelDisabledInCompare({ kind: 'chart', chartType: 'candlestick' })).toBe(true);
	});

	it('disables heatmap panels', () => {
		expect(isPanelDisabledInCompare({ kind: 'special', specialType: 'heatmap' })).toBe(true);
	});

	it('disables notes panels', () => {
		expect(isPanelDisabledInCompare({ kind: 'special', specialType: 'notes' })).toBe(true);
	});

	it('disables laps panels', () => {
		expect(isPanelDisabledInCompare({ kind: 'special', specialType: 'laps' })).toBe(true);
	});

	it('allows line charts', () => {
		expect(isPanelDisabledInCompare({ kind: 'chart', chartType: 'line' })).toBe(false);
	});

	it('allows area charts', () => {
		expect(isPanelDisabledInCompare({ kind: 'chart', chartType: 'area' })).toBe(false);
	});

	it('allows bar charts', () => {
		expect(isPanelDisabledInCompare({ kind: 'chart', chartType: 'bar' })).toBe(false);
	});

	it('allows map panels', () => {
		expect(isPanelDisabledInCompare({ kind: 'special', specialType: 'map' })).toBe(false);
	});
});

describe('constants', () => {
	it('has 4 compare colors', () => {
		expect(COMPARE_COLORS).toHaveLength(4);
	});

	it('max activities is 4', () => {
		expect(MAX_COMPARE_ACTIVITIES).toBe(4);
	});
});
