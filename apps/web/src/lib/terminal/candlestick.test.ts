import { describe, it, expect } from 'vitest';
import { candlesFromSegments, candlesFromLaps } from './candlestick';
import type { ActivitySegment, ActivityLap } from './terminal-state.svelte';

function makeSegment(i: number, overrides: Partial<ActivitySegment> = {}): ActivitySegment {
	return {
		id: i,
		segmentIndex: i,
		distanceStart: i * 500,
		distanceEnd: (i + 1) * 500,
		avgPace: 300,
		minPace: 280,
		maxPace: 320,
		avgHeartrate: 150,
		avgCadence: 85,
		avgPower: null,
		elevationGain: 10,
		elevationLoss: 5,
		...overrides,
	};
}

function makeLap(i: number, overrides: Partial<ActivityLap> = {}): ActivityLap {
	return {
		id: i,
		lapIndex: i,
		distance: 1000,
		movingTime: 300,
		averageSpeed: 3.33,
		averageHeartrate: 150,
		averageCadence: 85,
		...overrides,
	};
}

describe('candlesFromSegments', () => {
	it('returns empty for empty segments', () => {
		expect(candlesFromSegments([], null, null, 'metric')).toEqual([]);
	});

	it('filters out segments with null avgPace', () => {
		const segments = [makeSegment(0, { avgPace: null })];
		expect(candlesFromSegments(segments, null, null, 'metric')).toEqual([]);
	});

	it('filters out segments with zero avgPace', () => {
		const segments = [makeSegment(0, { avgPace: 0 })];
		expect(candlesFromSegments(segments, null, null, 'metric')).toEqual([]);
	});

	it('creates candle with correct label', () => {
		const segments = [makeSegment(0), makeSegment(1)];
		const candles = candlesFromSegments(segments, null, null, 'metric');
		expect(candles).toHaveLength(2);
		expect(candles[0].label).toBe('1');
		expect(candles[1].label).toBe('2');
	});

	it('uses avgPace as open and close without velocity stream', () => {
		const segments = [makeSegment(0, { avgPace: 300 })];
		const candles = candlesFromSegments(segments, null, null, 'metric');
		expect(candles[0].open).toBe(300);
		expect(candles[0].close).toBe(300);
	});

	it('applies imperial conversion factor', () => {
		const segments = [makeSegment(0, { avgPace: 300 })];
		const metric = candlesFromSegments(segments, null, null, 'metric');
		const imperial = candlesFromSegments(segments, null, null, 'imperial');
		expect(imperial[0].open).toBeGreaterThan(metric[0].open);
	});

	it('sets high from minPace and low from maxPace', () => {
		const segments = [makeSegment(0, { avgPace: 300, minPace: 280, maxPace: 320 })];
		const candles = candlesFromSegments(segments, null, null, 'metric');
		expect(candles[0].high).toBe(280);
		expect(candles[0].low).toBe(320);
	});
});

describe('candlesFromLaps', () => {
	it('returns empty for empty laps', () => {
		expect(candlesFromLaps([], null, null, 'metric')).toEqual([]);
	});

	it('filters out laps with null distance', () => {
		const laps = [makeLap(0, { distance: null })];
		expect(candlesFromLaps(laps, null, null, 'metric')).toEqual([]);
	});

	it('filters out laps with zero distance', () => {
		const laps = [makeLap(0, { distance: 0 })];
		expect(candlesFromLaps(laps, null, null, 'metric')).toEqual([]);
	});

	it('computes pace from averageSpeed', () => {
		const laps = [makeLap(0, { averageSpeed: 4.0 })];
		const candles = candlesFromLaps(laps, null, null, 'metric');
		expect(candles[0].open).toBe(250);
		expect(candles[0].close).toBe(250);
	});

	it('handles null averageSpeed as zero pace', () => {
		const laps = [makeLap(0, { averageSpeed: null })];
		const candles = candlesFromLaps(laps, null, null, 'metric');
		expect(candles[0].open).toBe(0);
	});

	it('creates labels starting from 1', () => {
		const laps = [makeLap(0), makeLap(1)];
		const candles = candlesFromLaps(laps, null, null, 'metric');
		expect(candles[0].label).toBe('1');
		expect(candles[1].label).toBe('2');
	});

	it('uses velocity stream for open/close when available', () => {
		const velocity = Array.from({ length: 100 }, (_, i) => i < 50 ? 3.0 : 4.0);
		const distance = Array.from({ length: 100 }, (_, i) => i * 10);
		const laps = [makeLap(0, { distance: 1000 })];
		const candles = candlesFromLaps(laps, velocity, distance, 'metric');
		expect(candles[0].open).not.toBe(candles[0].close);
	});

	it('computes high/low from stream pace percentiles', () => {
		// Velocity varies: slow (2.0 m/s = 500 s/km) in middle, fast (5.0 m/s = 200 s/km) at edges
		const velocity = Array.from({ length: 100 }, (_, i) =>
			i >= 40 && i < 60 ? 2.0 : 5.0,
		);
		const distance = Array.from({ length: 100 }, (_, i) => i * 10);
		const laps = [makeLap(0, { distance: 1000 })];
		const candles = candlesFromLaps(laps, velocity, distance, 'metric');
		// high = fastest pace (lowest number), low = slowest pace (highest number)
		expect(candles[0].high).toBeLessThan(candles[0].low);
		// p5/p95 should still capture the bulk of the range
		expect(candles[0].high).toBe(200); // 5.0 m/s = 200 s/km
		expect(candles[0].low).toBe(500);  // 2.0 m/s = 500 s/km
	});

	it('clips outliers via percentiles', () => {
		// 196 points at steady 4.0 m/s, 2 extreme slow, 2 extreme fast
		const velocity = Array.from({ length: 200 }, () => 4.0);
		velocity[0] = 0.5;  // outlier: 2000 s/km
		velocity[1] = 0.5;
		velocity[198] = 20; // outlier: 50 s/km
		velocity[199] = 20;
		const distance = Array.from({ length: 200 }, (_, i) => i * 5);
		const laps = [makeLap(0, { distance: 1000 })];
		const candles = candlesFromLaps(laps, velocity, distance, 'metric');
		// p1/p99 should exclude the 2-point outliers on each side
		expect(candles[0].high).toBe(250);  // 4.0 m/s = 250 s/km
		expect(candles[0].low).toBe(250);
	});

	it('falls back to synthetic high/low without velocity stream', () => {
		const laps = [makeLap(0, { averageSpeed: 4.0 })];
		const candles = candlesFromLaps(laps, null, null, 'metric');
		// 4.0 m/s = 250 s/km, synthetic: high = 250*0.95, low = 250*1.05
		expect(candles[0].high).toBeCloseTo(237.5);
		expect(candles[0].low).toBeCloseTo(262.5);
	});

	it('tracks cumulative distance for distanceStart/distanceEnd', () => {
		const laps = [makeLap(0, { distance: 1000 }), makeLap(1, { distance: 1500 })];
		const candles = candlesFromLaps(laps, null, null, 'metric');
		expect(candles[0].distanceStart).toBe(0);
		expect(candles[0].distanceEnd).toBe(1000);
		expect(candles[1].distanceStart).toBe(1000);
		expect(candles[1].distanceEnd).toBe(2500);
	});
});
