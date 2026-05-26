import { describe, it, expect } from 'vitest';
import { distanceNormFactor, normalizeStreams, streamGpsTotal } from './normalize-distance';
import type { StreamData } from './terminal-state.svelte';

const baseStreams: StreamData = {
	velocity: [4, 4, 5],
	heartrate: [150, 151, 152],
	altitude: [10, 11, 12],
	cadence: [85, 85, 86],
	power: null,
	grade: null,
	distance: [0, 4000, 8500],
	time: [0, 1000, 2000],
	latlng: [
		[1, 2],
		[1, 2],
		[1, 2],
	],
};

describe('distanceNormFactor', () => {
	it('returns target / gps', () => {
		expect(distanceNormFactor(42195, 42500)).toBeCloseTo(42195 / 42500, 6);
	});

	it('returns 1 when disabled or gps missing', () => {
		expect(distanceNormFactor(null, 42500)).toBe(1);
		expect(distanceNormFactor(0, 42500)).toBe(1);
		expect(distanceNormFactor(42195, 0)).toBe(1);
		expect(distanceNormFactor(42195, null)).toBe(1);
	});
});

describe('streamGpsTotal', () => {
	it('reads the last cumulative distance', () => {
		expect(streamGpsTotal(baseStreams)).toBe(8500);
		expect(streamGpsTotal({ ...baseStreams, distance: null })).toBe(0);
	});
});

describe('normalizeStreams', () => {
	it('scales only distance and velocity', () => {
		const factor = 0.98;
		const out = normalizeStreams(baseStreams, factor);
		expect(out.distance).toEqual(baseStreams.distance!.map((d) => d * factor));
		expect(out.velocity).toEqual(baseStreams.velocity!.map((v) => v * factor));
		// Untouched dimensions
		expect(out.heartrate).toBe(baseStreams.heartrate);
		expect(out.time).toBe(baseStreams.time);
		expect(out.latlng).toBe(baseStreams.latlng);
	});

	it('returns the same object when factor is 1', () => {
		expect(normalizeStreams(baseStreams, 1)).toBe(baseStreams);
	});
});
