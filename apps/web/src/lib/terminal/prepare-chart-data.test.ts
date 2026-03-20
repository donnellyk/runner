import { describe, it, expect } from 'vitest';
import {
	prepareSamplingIndices,
	sampleStream,
	createPausedMask,
	extractRouteCoordinates,
	computeCrosshairValues,
} from './prepare-chart-data';

describe('prepareSamplingIndices', () => {
	it('returns null when stream length is within sample points', () => {
		expect(prepareSamplingIndices([1, 2, 3], 3, 5)).toBeNull();
	});

	it('returns null when stream length equals sample points', () => {
		expect(prepareSamplingIndices([1, 2, 3, 4, 5], 5, 5)).toBeNull();
	});

	it('returns indices when stream exceeds sample points', () => {
		const velocity = Array.from({ length: 100 }, (_, i) => i * 0.1);
		const indices = prepareSamplingIndices(velocity, 100, 10);
		expect(indices).not.toBeNull();
		expect(indices!.length).toBe(10);
	});

	it('uses zero-filled fallback when velocity is null', () => {
		const indices = prepareSamplingIndices(null, 100, 10);
		expect(indices).not.toBeNull();
		expect(indices!.length).toBe(10);
	});

	it('returns null when velocity is null and stream length is within sample points', () => {
		expect(prepareSamplingIndices(null, 3, 5)).toBeNull();
	});

	it('returns indices sorted in ascending order', () => {
		const velocity = Array.from({ length: 50 }, (_, i) => Math.sin(i));
		const indices = prepareSamplingIndices(velocity, 50, 10);
		expect(indices).not.toBeNull();
		for (let i = 1; i < indices!.length; i++) {
			expect(indices![i]).toBeGreaterThan(indices![i - 1]);
		}
	});
});

describe('sampleStream', () => {
	it('returns stream unchanged when indices is null', () => {
		const stream = [10, 20, 30];
		expect(sampleStream(stream, null)).toBe(stream);
	});

	it('returns null when stream is null', () => {
		expect(sampleStream(null, [0, 1, 2])).toBeNull();
	});

	it('returns null when both stream and indices are null', () => {
		expect(sampleStream(null, null)).toBeNull();
	});

	it('samples stream at given indices', () => {
		const stream = [10, 20, 30, 40, 50];
		const indices = [0, 2, 4];
		expect(sampleStream(stream, indices)).toEqual([10, 30, 50]);
	});

	it('works with non-number types', () => {
		const stream: [number, number][] = [[1, 2], [3, 4], [5, 6]];
		const indices = [0, 2];
		expect(sampleStream(stream, indices)).toEqual([[1, 2], [5, 6]]);
	});

	it('handles empty stream', () => {
		expect(sampleStream([], [0, 1])).toEqual([undefined, undefined]);
	});

	it('handles empty indices', () => {
		expect(sampleStream([1, 2, 3], [])).toEqual([]);
	});
});

describe('createPausedMask', () => {
	it('returns null when velocity is null', () => {
		expect(createPausedMask(null, 1.0)).toBeNull();
	});

	it('marks points below threshold as paused', () => {
		const velocity = [0.5, 1.5, 0.0, 2.0, 0.9];
		expect(createPausedMask(velocity, 1.0)).toEqual([true, false, true, false, true]);
	});

	it('marks all as paused when all below threshold', () => {
		const velocity = [0.1, 0.2, 0.3];
		expect(createPausedMask(velocity, 1.0)).toEqual([true, true, true]);
	});

	it('marks none as paused when all at or above threshold', () => {
		const velocity = [1.0, 2.0, 3.0];
		expect(createPausedMask(velocity, 1.0)).toEqual([false, false, false]);
	});

	it('handles empty velocity array', () => {
		expect(createPausedMask([], 1.0)).toEqual([]);
	});

	it('respects different thresholds', () => {
		const velocity = [1.5, 2.5, 3.5];
		expect(createPausedMask(velocity, 2.0)).toEqual([true, false, false]);
		expect(createPausedMask(velocity, 4.0)).toEqual([true, true, true]);
	});
});

describe('extractRouteCoordinates', () => {
	it('returns null when both inputs are null', () => {
		expect(extractRouteCoordinates(null, null)).toBeNull();
	});

	it('returns null when routeGeoJson is undefined and latlng is null', () => {
		expect(extractRouteCoordinates(undefined, null)).toBeNull();
	});

	it('parses coordinates from valid GeoJSON', () => {
		const geoJson = JSON.stringify({
			type: 'LineString',
			coordinates: [[10, 20], [30, 40]],
		});
		expect(extractRouteCoordinates(geoJson, null)).toEqual([[10, 20], [30, 40]]);
	});

	it('returns null for invalid JSON in routeGeoJson', () => {
		expect(extractRouteCoordinates('not valid json', null)).toBeNull();
	});

	it('converts latlng stream by swapping lat/lng to lng/lat', () => {
		const latlng: [number, number][] = [[40, -74], [41, -73]];
		expect(extractRouteCoordinates(null, latlng)).toEqual([[-74, 40], [-73, 41]]);
	});

	it('prefers routeGeoJson over latlng when both provided', () => {
		const geoJson = JSON.stringify({
			type: 'LineString',
			coordinates: [[10, 20]],
		});
		const latlng: [number, number][] = [[40, -74]];
		expect(extractRouteCoordinates(geoJson, latlng)).toEqual([[10, 20]]);
	});

	it('handles empty latlng array', () => {
		expect(extractRouteCoordinates(null, [])).toEqual([]);
	});

	it('handles GeoJSON with empty coordinates', () => {
		const geoJson = JSON.stringify({ type: 'LineString', coordinates: [] });
		expect(extractRouteCoordinates(geoJson, null)).toEqual([]);
	});
});

describe('computeCrosshairValues', () => {
	function makeLookup(streams: Record<string, number[] | null>) {
		return (source: string) => streams[source] ?? null;
	}

	it('returns empty object when crosshairIndex is null', () => {
		const lookup = makeLookup({ pace: [300] });
		expect(computeCrosshairValues(null, lookup, 'metric')).toEqual({});
	});

	it('computes pace value in metric', () => {
		const lookup = makeLookup({ pace: [300] });
		const result = computeCrosshairValues(0, lookup, 'metric');
		expect(result['pace']).toBe('5:00 /km');
	});

	it('computes pace value in imperial', () => {
		const lookup = makeLookup({ pace: [482.802] }); // ~8:03 /mi
		const result = computeCrosshairValues(0, lookup, 'imperial');
		expect(result['pace']).toMatch(/\/mi$/);
	});

	it('skips pace when value is zero', () => {
		const lookup = makeLookup({ pace: [0] });
		const result = computeCrosshairValues(0, lookup, 'metric');
		expect(result['pace']).toBeUndefined();
	});

	it('skips pace when stream is null', () => {
		const lookup = makeLookup({});
		const result = computeCrosshairValues(0, lookup, 'metric');
		expect(result['pace']).toBeUndefined();
	});

	it('computes heartrate value', () => {
		const lookup = makeLookup({ heartrate: [155.7] });
		const result = computeCrosshairValues(0, lookup, 'metric');
		expect(result['heartrate']).toBe('156 bpm');
	});

	it('computes elevation in metric', () => {
		const lookup = makeLookup({ elevation: [123.4] });
		const result = computeCrosshairValues(0, lookup, 'metric');
		expect(result['elevation']).toBe('123 m');
	});

	it('computes elevation in imperial', () => {
		const lookup = makeLookup({ elevation: [100] });
		const result = computeCrosshairValues(0, lookup, 'imperial');
		expect(result['elevation']).toBe('100 ft');
	});

	it('computes cadence value', () => {
		const lookup = makeLookup({ cadence: [170.3] });
		const result = computeCrosshairValues(0, lookup, 'metric');
		expect(result['cadence']).toBe('170 spm');
	});

	it('computes all values when all streams present', () => {
		const lookup = makeLookup({
			pace: [300],
			heartrate: [150],
			elevation: [200],
			cadence: [180],
		});
		const result = computeCrosshairValues(0, lookup, 'metric');
		expect(Object.keys(result)).toHaveLength(4);
		expect(result['pace']).toBeDefined();
		expect(result['heartrate']).toBeDefined();
		expect(result['elevation']).toBeDefined();
		expect(result['cadence']).toBeDefined();
	});

	it('handles index beyond stream length', () => {
		const lookup = makeLookup({ pace: [300] });
		const result = computeCrosshairValues(5, lookup, 'metric');
		// pace[5] is undefined, so pace should not be included
		expect(result['pace']).toBeUndefined();
	});

	it('returns empty object for empty streams', () => {
		const lookup = makeLookup({
			pace: null,
			heartrate: null,
			elevation: null,
			cadence: null,
		});
		const result = computeCrosshairValues(0, lookup, 'metric');
		expect(result).toEqual({});
	});
});
