import { describe, it, expect } from 'vitest';
import {
	computeYBounds,
	smoothStream,
	trimLeadingZeros,
	formatXLabel,
	formatXLabelShort,
	computePauseSegments,
} from './axes';

describe('computeYBounds', () => {
	it('returns default for empty data', () => {
		expect(computeYBounds([], null)).toEqual({ yMin: 0, yMax: 1 });
	});

	it('returns default for all-zero data', () => {
		expect(computeYBounds([0, 0, 0], null)).toEqual({ yMin: 0, yMax: 1 });
	});

	it('returns min/max of positive values', () => {
		const result = computeYBounds([10, 20, 30], null);
		expect(result.yMin).toBe(10);
		expect(result.yMax).toBe(30);
	});

	it('excludes paused points', () => {
		const result = computeYBounds([10, 100, 20], [false, true, false]);
		expect(result.yMin).toBeLessThanOrEqual(10);
		expect(result.yMax).toBeGreaterThanOrEqual(20);
		expect(result.yMax).toBeLessThan(100);
	});

	it('adds padding with paused mask', () => {
		const result = computeYBounds([100, 200], [false, false]);
		expect(result.yMin).toBeLessThan(100);
		expect(result.yMax).toBeGreaterThan(200);
	});
});

describe('smoothStream', () => {
	it('returns copy for window 0', () => {
		const data = [1, 2, 3];
		const result = smoothStream(data, 0, null);
		expect(result).toEqual([1, 2, 3]);
		expect(result).not.toBe(data);
	});

	it('averages within window', () => {
		const result = smoothStream([10, 20, 30], 1, null);
		expect(result[0]).toBe(15);
		expect(result[1]).toBe(20);
		expect(result[2]).toBe(25);
	});

	it('skips paused points in average', () => {
		const result = smoothStream([10, 999, 30], 1, [false, true, false]);
		expect(result[0]).toBe(10);
		expect(result[2]).toBe(30);
	});

	it('falls back to original value if all neighbors paused', () => {
		const result = smoothStream([10, 20, 30], 1, [true, true, true]);
		expect(result[1]).toBe(20);
	});
});

describe('trimLeadingZeros', () => {
	it('returns 0 for no leading zeros', () => {
		expect(trimLeadingZeros([5, 0, 3])).toBe(0);
	});

	it('returns index of first non-zero', () => {
		expect(trimLeadingZeros([0, 0, 5, 3])).toBe(2);
	});

	it('returns -1 for all zeros', () => {
		expect(trimLeadingZeros([0, 0, 0])).toBe(-1);
	});
});

describe('formatXLabel', () => {
	it('formats distance in metric', () => {
		expect(formatXLabel(5000, 'distance', 'metric')).toBe('5.00 km');
	});

	it('formats distance in imperial', () => {
		const result = formatXLabel(1609.344, 'distance', 'imperial');
		expect(result).toBe('1.00 mi');
	});

	it('formats time as mm:ss', () => {
		expect(formatXLabel(125, 'time', 'metric')).toBe('2:05');
	});

	it('pads seconds to 2 digits', () => {
		expect(formatXLabel(60, 'time', 'metric')).toBe('1:00');
	});
});

describe('formatXLabelShort', () => {
	it('formats distance with 1 decimal', () => {
		expect(formatXLabelShort(5000, 'distance', 'metric')).toBe('5.0 km');
	});

	it('formats time as Xm', () => {
		expect(formatXLabelShort(125, 'time', 'metric')).toBe('2m');
	});
});

describe('computePauseSegments', () => {
	it('returns single segment for no pauses', () => {
		const result = computePauseSegments([false, false, false]);
		expect(result.segs).toEqual([{ startIdx: 0, endIdx: 2 }]);
	});

	it('splits at paused points', () => {
		const result = computePauseSegments([false, true, false]);
		expect(result.segs).toEqual([
			{ startIdx: 0, endIdx: 0 },
			{ startIdx: 2, endIdx: 2 },
		]);
	});

	it('returns empty for all paused', () => {
		const result = computePauseSegments([true, true, true]);
		expect(result.segs).toEqual([]);
	});

	it('handles pause at start', () => {
		const result = computePauseSegments([true, true, false, false]);
		expect(result.segs).toEqual([{ startIdx: 2, endIdx: 3 }]);
	});

	it('handles pause at end', () => {
		const result = computePauseSegments([false, false, true, true]);
		expect(result.segs).toEqual([{ startIdx: 0, endIdx: 1 }]);
	});
});
