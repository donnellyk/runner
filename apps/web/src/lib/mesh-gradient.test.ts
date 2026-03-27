import { describe, it, expect } from 'vitest';
import { meshGradientStyle, NOISE_DATA_URI, NOISE_FILTER_SVG } from './mesh-gradient';

describe('meshGradientStyle', () => {
	it('returns a string with multiple radial-gradient layers', () => {
		const result = meshGradientStyle('#3b82f6');
		expect(result).toContain('radial-gradient');
		expect(result).toContain('linear-gradient');
		// Should have 4 radial gradients + 1 linear gradient
		const radialCount = (result.match(/radial-gradient/g) ?? []).length;
		const linearCount = (result.match(/linear-gradient/g) ?? []).length;
		expect(radialCount).toBe(4);
		expect(linearCount).toBe(1);
	});

	it('uses hsl color values derived from the input', () => {
		const result = meshGradientStyle('#ef4444');
		// Should contain hsl values
		expect(result).toContain('hsl(');
	});

	it('handles different hex colors without errors', () => {
		const colors = ['#000000', '#ffffff', '#22c55e', '#f97316', '#a855f7', '#14b8a6'];
		for (const color of colors) {
			const result = meshGradientStyle(color);
			expect(result).toBeTruthy();
			expect(result).toContain('radial-gradient');
		}
	});

	it('produces different results for different colors', () => {
		const a = meshGradientStyle('#3b82f6');
		const b = meshGradientStyle('#ef4444');
		expect(a).not.toBe(b);
	});
});

describe('NOISE_FILTER_SVG', () => {
	it('contains feTurbulence element', () => {
		expect(NOISE_FILTER_SVG).toContain('feTurbulence');
		expect(NOISE_FILTER_SVG).toContain('fractalNoise');
	});

	it('contains feColorMatrix for grayscale', () => {
		expect(NOISE_FILTER_SVG).toContain('feColorMatrix');
	});
});

describe('NOISE_DATA_URI', () => {
	it('is a valid data URI string', () => {
		expect(NOISE_DATA_URI).toMatch(/^url\("data:image\/svg\+xml,/);
	});
});
