import { describe, it, expect } from 'vitest';
import { linearFit, computeDecoupling } from './trendlines';

describe('linearFit', () => {
	it('recovers a known line', () => {
		const xs = [0, 1, 2, 3, 4];
		const ys = xs.map((x) => 2 * x + 1);
		const fit = linearFit(xs, ys);
		expect(fit).not.toBeNull();
		expect(fit!.slope).toBeCloseTo(2, 6);
		expect(fit!.intercept).toBeCloseTo(1, 6);
	});

	it('skips paused samples and non-positive values', () => {
		const xs = [0, 1, 2, 3, 4];
		const ys = [1, 0, 5, -2, 9]; // indices 1 (zero) and 3 (negative) dropped
		const mask = [false, false, false, false, false];
		const fit = linearFit(xs, ys, mask);
		// remaining points: (0,1),(2,5),(4,9) -> slope 2, intercept 1
		expect(fit!.slope).toBeCloseTo(2, 6);
		expect(fit!.intercept).toBeCloseTo(1, 6);
	});

	it('honors the paused mask', () => {
		const xs = [0, 1, 2, 3];
		const ys = [1, 3, 5, 100];
		const mask = [false, false, false, true]; // drop the outlier
		const fit = linearFit(xs, ys, mask);
		expect(fit!.slope).toBeCloseTo(2, 6);
	});

	it('returns null when under-determined', () => {
		expect(linearFit([1], [1])).toBeNull();
		expect(linearFit([], [])).toBeNull();
	});
});

describe('computeDecoupling', () => {
	it('is ~0 for steady effort', () => {
		const v = Array(100).fill(4);
		const h = Array(100).fill(150);
		expect(computeDecoupling(v, h)).toBeCloseTo(0, 6);
	});

	it('is positive when HR drifts up at constant pace', () => {
		const v = Array(100).fill(4);
		const h = [...Array(50).fill(150), ...Array(50).fill(165)];
		const d = computeDecoupling(v, h)!;
		// ef1 = 4/150, ef2 = 4/165 -> drop of ~9.1%
		expect(d).toBeGreaterThan(8);
		expect(d).toBeLessThan(10);
	});

	it('is scale-invariant in velocity', () => {
		const v = [...Array(50).fill(4), ...Array(50).fill(3.8)];
		const h = Array(100).fill(150);
		const d1 = computeDecoupling(v, h)!;
		const d2 = computeDecoupling(v.map((x) => x * 1.05), h)!;
		expect(d1).toBeCloseTo(d2, 6);
	});

	it('returns null without enough data or missing streams', () => {
		expect(computeDecoupling(null, [150])).toBeNull();
		expect(computeDecoupling([4, 4], [150, 150])).toBeNull();
	});
});
