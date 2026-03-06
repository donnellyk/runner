import { describe, expect, test } from 'vitest';
import {
	estimateThresholdPace,
	estimateLTHR,
	zonesFromThresholdPace,
	zonesFromLTHR,
	raceDistanceBounds,
	DEFAULT_ZONES,
	RACE_DISTANCES,
	ZONE_CALC_PRIORITY,
} from '../zones';

describe('raceDistanceBounds', () => {
	test('returns ±10% bounds', () => {
		const { lo, hi } = raceDistanceBounds(5000);
		expect(lo).toBeCloseTo(4500, 0);
		expect(hi).toBeCloseTo(5500, 0);
	});

	test('marathon bounds', () => {
		const { lo, hi } = raceDistanceBounds(42195);
		expect(lo).toBeCloseTo(37975.5, 0);
		expect(hi).toBeCloseTo(46414.5, 0);
	});
});

describe('estimateThresholdPace', () => {
	test('half marathon: -5 from race pace', () => {
		expect(estimateThresholdPace('Half Marathon', 280)).toBe(275);
	});

	test('5K: +15 from race pace', () => {
		expect(estimateThresholdPace('5K', 250)).toBe(265);
	});

	test('10K: +8 from race pace', () => {
		expect(estimateThresholdPace('10K', 270)).toBe(278);
	});

	test('marathon: -25 from race pace', () => {
		expect(estimateThresholdPace('Marathon', 300)).toBe(275);
	});

	test('unknown distance: no adjustment', () => {
		expect(estimateThresholdPace('Unknown', 300)).toBe(300);
	});
});

describe('estimateLTHR', () => {
	test('half marathon: 0 adjustment', () => {
		expect(estimateLTHR('Half Marathon', 170)).toBe(170);
	});

	test('5K: -6 bpm from avg HR', () => {
		expect(estimateLTHR('5K', 180)).toBe(174);
	});

	test('marathon: +6 bpm from avg HR', () => {
		expect(estimateLTHR('Marathon', 155)).toBe(161);
	});
});

describe('zonesFromThresholdPace', () => {
	const threshold = 270; // sec/km
	const zones = zonesFromThresholdPace(threshold, DEFAULT_ZONES);

	test('returns 5 zones', () => {
		expect(zones).toHaveLength(5);
	});

	test('zone 1 is open-ended slow', () => {
		const z1 = zones.find((z) => z.index === 1)!;
		expect(z1.paceMin).toBe(threshold + 75);
		expect(z1.paceMax).toBeNull();
	});

	test('zone 4 brackets threshold', () => {
		const z4 = zones.find((z) => z.index === 4)!;
		expect(z4.paceMin).toBe(threshold - 15);
		expect(z4.paceMax).toBe(threshold + 5);
	});

	test('zone 5 is open-ended fast', () => {
		const z5 = zones.find((z) => z.index === 5)!;
		expect(z5.paceMin).toBeNull();
		expect(z5.paceMax).toBe(threshold - 15);
	});

	test('preserves zone names and colors', () => {
		for (let i = 0; i < zones.length; i++) {
			expect(zones[i].name).toBe(DEFAULT_ZONES[i].name);
			expect(zones[i].color).toBe(DEFAULT_ZONES[i].color);
		}
	});
});

describe('zonesFromLTHR', () => {
	const lthr = 170;
	const zones = zonesFromLTHR(lthr, DEFAULT_ZONES);

	test('returns 5 zones', () => {
		expect(zones).toHaveLength(5);
	});

	test('zone 1 is open-ended low', () => {
		const z1 = zones.find((z) => z.index === 1)!;
		expect(z1.hrMin).toBeNull();
		expect(z1.hrMax).toBe(Math.round(lthr * 0.85));
	});

	test('zone 4 is above LTHR', () => {
		const z4 = zones.find((z) => z.index === 4)!;
		expect(z4.hrMin).toBe(lthr);
		expect(z4.hrMax).toBe(Math.round(lthr * 1.06));
	});

	test('zone 5 is open-ended high', () => {
		const z5 = zones.find((z) => z.index === 5)!;
		expect(z5.hrMax).toBeNull();
		expect(z5.hrMin).toBe(Math.round(lthr * 1.06));
	});
});

describe('ZONE_CALC_PRIORITY', () => {
	test('half marathon is first priority', () => {
		expect(ZONE_CALC_PRIORITY[0]).toBe('Half Marathon');
	});

	test('all entries are valid race distance labels', () => {
		const validLabels = RACE_DISTANCES.map((d) => d.label);
		for (const label of ZONE_CALC_PRIORITY) {
			expect(validLabels).toContain(label);
		}
	});
});
