import { describe, it, expect } from 'vitest';
import { generateRaceReport } from './race-report';
import { MARATHON_METERS } from './marathon-splits';

/**
 * Linear pace streams: distance and time both rise proportionally, so
 * interpolation at any boundary is exact regardless of sampling density.
 */
function linearStreams(totalDist: number, totalTime: number, n = 1000) {
	const distance: number[] = [];
	const time: number[] = [];
	for (let i = 0; i <= n; i++) {
		const f = i / n;
		distance.push(totalDist * f);
		time.push(totalTime * f);
	}
	return { distance, time };
}

describe('generateRaceReport', () => {
	const FOUR_HOURS = 4 * 3600;

	it('emits the full section skeleton', () => {
		const { distance, time } = linearStreams(MARATHON_METERS, FOUR_HOURS);
		const md = generateRaceReport({
			distanceStream: distance,
			timeStream: time,
			gpsTotal: MARATHON_METERS,
		});

		expect(md).toContain('## Race Writeup');
		expect(md).toContain('### Goals');
		expect(md).toContain('### Splits');
		expect(md).toContain('## Race Report');
		expect(md).toContain('### Training');
		expect(md).toContain('### Final Week');
		expect(md).toContain('### Race Day');
		expect(md).toContain('#### Morning');
		expect(md).toContain('#### Plan');
		expect(md.endsWith('\n')).toBe(true);
	});

	it('seeds three blank goal rows', () => {
		const md = generateRaceReport({ distanceStream: null, timeStream: null, gpsTotal: 0 });
		expect(md).toContain('| Goal | Description | Completed |');
		expect(md).toContain('| A |  |  |');
		expect(md).toContain('| B |  |  |');
		expect(md).toContain('| C |  |  |');
	});

	it('computes first/second-half split times', () => {
		const { distance, time } = linearStreams(MARATHON_METERS, FOUR_HOURS);
		const md = generateRaceReport({
			distanceStream: distance,
			timeStream: time,
			gpsTotal: MARATHON_METERS,
		});
		// Even pacing splits four hours into two equal halves. Only the second
		// half carries a total (the full elapsed race time).
		expect(md).toContain('| Split | Time | Total |');
		expect(md).toContain('| First Half | 2:00:00 |  |');
		expect(md).toContain('| Second Half | 2:00:00 | 4:00:00 |');
	});

	it('labels plan headers Start..Finish every 10km', () => {
		const { distance, time } = linearStreams(MARATHON_METERS, FOUR_HOURS);
		const md = generateRaceReport({
			distanceStream: distance,
			timeStream: time,
			gpsTotal: MARATHON_METERS,
		});
		expect(md).toContain('#### Start - 10km,');
		expect(md).toContain('#### 10km - 20km,');
		expect(md).toContain('#### 20km - 30km,');
		expect(md).toContain('#### 30km - 40km,');
		expect(md).toContain('#### 40km - Finish,');
	});

	it('formats each plan header as "<range>, <split> (<elapsed>)"', () => {
		const { distance, time } = linearStreams(MARATHON_METERS, FOUR_HOURS);
		const md = generateRaceReport({
			distanceStream: distance,
			timeStream: time,
			gpsTotal: MARATHON_METERS,
		});
		// Even pacing: each 10km segment is ~56:53; the first elapsed equals its split.
		expect(md).toContain('#### Start - 10km, 56:53 (56:53)');
		// Finish cumulative is the full race time.
		expect(md).toContain('(4:00:00)');
		expect(md).toContain('#### 40km - Finish,');
	});

	it('distributes GPS over-measurement across splits', () => {
		// GPS recorded 42.4km for a 42.195km course; the finish should still land
		// at the full race time once the surplus is scaled back to the official total.
		const gpsTotal = 42400;
		const { distance, time } = linearStreams(gpsTotal, FOUR_HOURS);
		const md = generateRaceReport({
			distanceStream: distance,
			timeStream: time,
			officialTotal: MARATHON_METERS,
			gpsTotal,
		});
		expect(md).toContain('#### 40km - Finish,');
		expect(md).toContain('(4:00:00)');
	});

	it('renders the skeleton with no split rows when streams are empty', () => {
		const md = generateRaceReport({ distanceStream: null, timeStream: null, gpsTotal: 0 });
		expect(md).toContain('| Split | Time |');
		// No split data rows, but the Plan section header is still present.
		expect(md).toContain('#### Plan');
		expect(md).not.toContain('#### Start - 10km');
	});
});
