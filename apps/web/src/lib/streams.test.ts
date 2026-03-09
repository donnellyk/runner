import { describe, expect, test } from 'vitest';
import { findIndexAtDistance } from './streams';

describe('findIndexAtDistance', () => {
	test('finds exact match', () => {
		expect(findIndexAtDistance([0, 500, 1000, 1500, 2000], 1000)).toBe(2);
	});

	test('finds first index >= target when no exact match', () => {
		expect(findIndexAtDistance([0, 500, 1000, 1500, 2000], 750)).toBe(2);
	});

	test('returns 0 for target before start', () => {
		expect(findIndexAtDistance([100, 200, 300], 0)).toBe(0);
	});

	test('returns last index for target beyond end', () => {
		expect(findIndexAtDistance([0, 500, 1000], 5000)).toBe(2);
	});

	test('handles single-element array', () => {
		expect(findIndexAtDistance([500], 500)).toBe(0);
		expect(findIndexAtDistance([500], 0)).toBe(0);
		expect(findIndexAtDistance([500], 1000)).toBe(0);
	});

	test('returns first match for duplicate values', () => {
		expect(findIndexAtDistance([0, 500, 500, 500, 1000], 500)).toBe(1);
	});

	test('handles target at first element', () => {
		expect(findIndexAtDistance([0, 100, 200], 0)).toBe(0);
	});

	test('handles target at last element', () => {
		expect(findIndexAtDistance([0, 100, 200], 200)).toBe(2);
	});
});
