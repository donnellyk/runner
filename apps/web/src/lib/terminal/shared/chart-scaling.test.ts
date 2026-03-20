import { describe, it, expect } from 'vitest';
import { createYAxisScaling } from './chart-scaling';

describe('createYAxisScaling', () => {
	const padTop = 20;
	const chartH = 100;

	describe('normal (non-inverted) Y axis', () => {
		const { toY, fromY } = createYAxisScaling(0, 100, padTop, chartH, false);

		it('maps yMin to bottom of chart', () => {
			expect(toY(0)).toBe(padTop + chartH); // 120
		});

		it('maps yMax to top of chart', () => {
			expect(toY(100)).toBe(padTop); // 20
		});

		it('maps midpoint to center of chart', () => {
			expect(toY(50)).toBe(padTop + chartH / 2); // 70
		});

		it('fromY is inverse of toY', () => {
			expect(fromY(toY(0))).toBeCloseTo(0);
			expect(fromY(toY(100))).toBeCloseTo(100);
			expect(fromY(toY(37.5))).toBeCloseTo(37.5);
		});
	});

	describe('inverted Y axis (e.g. pace)', () => {
		const { toY, fromY } = createYAxisScaling(200, 400, padTop, chartH, true);

		it('maps yMin to top of chart', () => {
			expect(toY(200)).toBe(padTop); // 20
		});

		it('maps yMax to bottom of chart', () => {
			expect(toY(400)).toBe(padTop + chartH); // 120
		});

		it('maps midpoint to center of chart', () => {
			expect(toY(300)).toBe(padTop + chartH / 2); // 70
		});

		it('fromY is inverse of toY', () => {
			expect(fromY(toY(200))).toBeCloseTo(200);
			expect(fromY(toY(400))).toBeCloseTo(400);
			expect(fromY(toY(350))).toBeCloseTo(350);
		});
	});

	describe('degenerate range (yMin === yMax)', () => {
		const { toY, fromY } = createYAxisScaling(50, 50, padTop, chartH, false);

		it('does not produce NaN', () => {
			expect(Number.isNaN(toY(50))).toBe(false);
			expect(Number.isNaN(fromY(padTop + chartH / 2))).toBe(false);
		});
	});

	describe('defaults to non-inverted when invertY omitted', () => {
		const { toY } = createYAxisScaling(0, 100, padTop, chartH);

		it('maps yMax to top of chart', () => {
			expect(toY(100)).toBe(padTop);
		});
	});
});
