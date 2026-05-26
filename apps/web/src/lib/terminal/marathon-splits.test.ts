import { describe, it, expect } from 'vitest';
import {
	computeRaceSplits,
	timeAtDistance,
	MARATHON_METERS,
	HALF_MARATHON_METERS,
} from './marathon-splits';

// A synthetic marathon at a constant pace, GPS over-measuring by 0.2 mi
// (26.2 mi official -> ~26.4 mi recorded). Constant velocity means time is a
// linear function of distance, which keeps the expected math simple.
const GPS_TOTAL = 42500; // m (~26.41 mi)
const DURATION = 42500 / 4; // 4 m/s -> 10625 s

function constantPaceStreams(points = 1000) {
	const distance: number[] = [];
	const time: number[] = [];
	for (let i = 0; i <= points; i++) {
		const f = i / points;
		distance.push(GPS_TOTAL * f);
		time.push(DURATION * f);
	}
	return { distance, time };
}

describe('timeAtDistance', () => {
	const { distance, time } = constantPaceStreams();

	it('interpolates linearly', () => {
		// halfway in distance -> halfway in time
		expect(timeAtDistance(distance, time, GPS_TOTAL / 2)).toBeCloseTo(DURATION / 2, 1);
	});

	it('clamps to ends', () => {
		expect(timeAtDistance(distance, time, -100)).toBe(time[0]);
		expect(timeAtDistance(distance, time, GPS_TOTAL + 100)).toBe(time[time.length - 1]);
	});

	it('returns null for empty streams', () => {
		expect(timeAtDistance(null, time, 100)).toBeNull();
		expect(timeAtDistance(distance, [], 100)).toBeNull();
	});
});

describe('computeRaceSplits', () => {
	const { distance, time } = constantPaceStreams();

	it('produces 9 splits for 5K (8 full + finish) ending at the recorded total', () => {
		const splits = computeRaceSplits({
			distanceStream: distance,
			timeStream: time,
			splitMeters: 5000,
			choice: '5k',
			gpsTotal: GPS_TOTAL,
		});
		expect(splits).toHaveLength(9);
		expect(splits.map((s) => s.label)).toEqual([
			'5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish',
		]);
		// Last split ends exactly at the recorded GPS total.
		expect(splits.at(-1)!.endDistance).toBeCloseTo(GPS_TOTAL, 3);
		// Cumulative of the last split is the full duration.
		expect(splits.at(-1)!.cumulative).toBeCloseTo(DURATION, 1);
	});

	it('distributes the GPS surplus evenly across splits', () => {
		const splits = computeRaceSplits({
			distanceStream: distance,
			timeStream: time,
			splitMeters: 5000,
			choice: '5k',
			gpsTotal: GPS_TOTAL,
		});
		const scale = GPS_TOTAL / MARATHON_METERS;
		// Each full 5K split spans 5000 * scale on the GPS track.
		expect(splits[0].endDistance).toBeCloseTo(5000 * scale, 3);
		expect(splits[1].endDistance - splits[1].startDistance).toBeCloseTo(5000 * scale, 3);
		// At constant pace every full split takes the same time.
		const full = splits.slice(0, 8).map((s) => s.elapsed);
		for (const e of full) expect(e).toBeCloseTo(full[0], 1);
		// The final (partial) split is shorter than a full one.
		expect(splits.at(-1)!.elapsed).toBeLessThan(full[0]);
	});

	it('reports the elapsed delta vs the previous split', () => {
		const splits = computeRaceSplits({
			distanceStream: distance,
			timeStream: time,
			splitMeters: 5000,
			choice: '5k',
			gpsTotal: GPS_TOTAL,
		});
		expect(splits[0].delta).toBeNull();
		expect(splits[1].delta).toBe(splits[1].elapsed - splits[0].elapsed);
		// Constant pace -> full-split deltas are ~0 (within rounding).
		expect(Math.abs(splits[2].delta!)).toBeLessThanOrEqual(1);
	});

	it('produces 5 splits for 10K', () => {
		const splits = computeRaceSplits({
			distanceStream: distance,
			timeStream: time,
			splitMeters: 10000,
			choice: '10k',
			gpsTotal: GPS_TOTAL,
		});
		expect(splits.map((s) => s.label)).toEqual(['10K', '20K', '30K', '40K', 'Finish']);
	});

	it('produces 2 even halves', () => {
		const splits = computeRaceSplits({
			distanceStream: distance,
			timeStream: time,
			splitMeters: HALF_MARATHON_METERS,
			choice: 'half',
			gpsTotal: GPS_TOTAL,
		});
		expect(splits.map((s) => s.label)).toEqual(['1st Half', '2nd Half']);
		expect(splits[0].endDistance).toBeCloseTo(GPS_TOTAL / 2, 3);
		// Even halves at constant pace; allow 1s of rounding slack.
		expect(Math.abs(splits[0].elapsed - splits[1].elapsed)).toBeLessThanOrEqual(1);
	});

	it('returns no splits without streams', () => {
		expect(computeRaceSplits({ distanceStream: null, timeStream: time, splitMeters: 5000, choice: '5k', gpsTotal: GPS_TOTAL })).toEqual([]);
		expect(computeRaceSplits({ distanceStream: distance, timeStream: time, splitMeters: 5000, choice: '5k', gpsTotal: 0 })).toEqual([]);
	});
});
