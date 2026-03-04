import { describe, expect, test } from 'vitest';
import {
	formatDistance,
	formatDistancePrecise,
	formatElevation,
	formatPace,
	formatPaceValue,
	formatSegmentDistance,
	segmentDistanceLabel,
} from './format';

describe('formatDistance', () => {
	test('returns dash for null', () => {
		expect(formatDistance(null, 'metric')).toBe('-');
		expect(formatDistance(null, 'imperial')).toBe('-');
	});

	test('returns dash for zero', () => {
		expect(formatDistance(0, 'metric')).toBe('-');
	});

	test('formats metric km', () => {
		expect(formatDistance(5200, 'metric')).toBe('5.2 km');
		expect(formatDistance(10000, 'metric')).toBe('10.0 km');
	});

	test('formats imperial miles', () => {
		// 5000m = 5km * 0.621371 = 3.106855 mi
		expect(formatDistance(5000, 'imperial')).toBe('3.1 mi');
		// 10000m = 10km * 0.621371 = 6.21371 mi
		expect(formatDistance(10000, 'imperial')).toBe('6.2 mi');
	});
});

describe('formatDistancePrecise', () => {
	test('returns dash for null', () => {
		expect(formatDistancePrecise(null, 'metric')).toBe('-');
	});

	test('formats metric with 2 decimals', () => {
		expect(formatDistancePrecise(5200, 'metric')).toBe('5.20 km');
	});

	test('formats imperial with 2 decimals', () => {
		expect(formatDistancePrecise(5000, 'imperial')).toBe('3.11 mi');
	});
});

describe('formatElevation', () => {
	test('returns dash for null', () => {
		expect(formatElevation(null, 'metric')).toBe('-');
	});

	test('formats zero elevation', () => {
		expect(formatElevation(0, 'metric')).toBe('0 m');
		expect(formatElevation(0, 'imperial')).toBe('0 ft');
	});

	test('formats metric meters', () => {
		expect(formatElevation(120, 'metric')).toBe('120 m');
	});

	test('formats imperial feet', () => {
		// 120m * 3.28084 = 393.7008
		expect(formatElevation(120, 'imperial')).toBe('394 ft');
	});
});

describe('formatPace', () => {
	test('returns dash for null or zero', () => {
		expect(formatPace(null, 'metric')).toBe('-');
		expect(formatPace(0, 'metric')).toBe('-');
	});

	test('formats metric pace from m/s', () => {
		// 3.030303 m/s => 1000/3.030303 = 330 sec/km = 5:30 min/km
		expect(formatPace(1000 / 330, 'metric')).toBe('5:30 min/km');
	});

	test('formats imperial pace from m/s', () => {
		// 3.030303 m/s => 330 sec/km * 1.60934 = 531.08 sec/mi = 8:51
		expect(formatPace(1000 / 330, 'imperial')).toBe('8:51 min/mi');
	});
});

describe('formatPaceValue', () => {
	test('returns dash for null', () => {
		expect(formatPaceValue(null, 'metric')).toBe('-');
	});

	test('formats metric sec/km', () => {
		// 330 sec/km = 5:30
		expect(formatPaceValue(330, 'metric')).toBe('5:30 /km');
	});

	test('formats imperial sec/mi', () => {
		// 330 * 1.60934 = 531.08 sec/mi = 8:51
		expect(formatPaceValue(330, 'imperial')).toBe('8:51 /mi');
	});
});

describe('formatSegmentDistance', () => {
	test('returns dash for null', () => {
		expect(formatSegmentDistance(null, 'metric')).toBe('-');
	});

	test('formats metric as meters', () => {
		expect(formatSegmentDistance(500, 'metric')).toBe('500');
	});

	test('formats imperial as feet', () => {
		// 500m * 3.28084 = 1640.42
		expect(formatSegmentDistance(500, 'imperial')).toBe('1640');
	});
});

describe('segmentDistanceLabel', () => {
	test('returns m for metric', () => {
		expect(segmentDistanceLabel('metric')).toBe('m');
	});

	test('returns ft for imperial', () => {
		expect(segmentDistanceLabel('imperial')).toBe('ft');
	});
});
