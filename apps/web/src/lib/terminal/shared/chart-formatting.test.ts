import { describe, it, expect } from 'vitest';
import { formatYValue, formatYValueShort } from './chart-formatting';

describe('formatYValue', () => {
	it('formats with unit when no formatValue provided', () => {
		expect(formatYValue(142, ' bpm')).toBe('142 bpm');
	});

	it('rounds to integer by default', () => {
		expect(formatYValue(142.7, ' bpm')).toBe('143 bpm');
	});

	it('uses formatValue when provided', () => {
		const fmt = (v: number) => `${v.toFixed(1)} W`;
		expect(formatYValue(250.3, ' W', fmt)).toBe('250.3 W');
	});

	it('handles empty unit string', () => {
		expect(formatYValue(100, '')).toBe('100');
	});

	it('handles unit with special characters', () => {
		expect(formatYValue(5, '%')).toBe('5%');
	});
});

describe('formatYValueShort', () => {
	it('returns integer string when no formatValue provided', () => {
		expect(formatYValueShort(142)).toBe('142');
	});

	it('rounds to integer by default', () => {
		expect(formatYValueShort(142.7)).toBe('143');
	});

	it('strips trailing /unit from formatValue output', () => {
		const fmt = (v: number) => {
			const total = Math.round(v);
			const mins = Math.floor(total / 60);
			const secs = total % 60;
			return `${mins}:${String(secs).padStart(2, '0')} /km`;
		};
		expect(formatYValueShort(330, fmt)).toBe('5:30');
	});

	it('strips /mi suffix too', () => {
		const fmt = (v: number) => `${v.toFixed(0)} /mi`;
		expect(formatYValueShort(500, fmt)).toBe('500');
	});

	it('leaves output unchanged when no trailing /unit', () => {
		const fmt = (v: number) => `${v.toFixed(1)} W`;
		expect(formatYValueShort(250.3, fmt)).toBe('250.3 W');
	});
});
