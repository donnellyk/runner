import { describe, expect, test } from 'vitest';
import {
	formatDistance,
	formatDistancePrecise,
	formatElevation,
	formatPace,
	formatPaceDisplay,
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

describe('formatPaceDisplay', () => {
	test('returns dash for null', () => {
		expect(formatPaceDisplay(null, 'metric')).toBe('-');
	});

	test('formats metric without converting', () => {
		expect(formatPaceDisplay(330, 'metric')).toBe('5:30 /km');
	});

	test('formats imperial without converting (value already in sec/mi)', () => {
		expect(formatPaceDisplay(330, 'imperial')).toBe('5:30 /mi');
	});

	test('does not double-convert imperial values', () => {
		// 330 sec/km * 1.60934 = ~531 sec/mi
		// formatPaceDisplay should NOT multiply again
		expect(formatPaceDisplay(531, 'imperial')).toBe('8:51 /mi');
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

import {
	formatDuration,
	formatDurationClock,
	parsePaceInput,
	formatPaceForInput,
	toMeters,
} from './format';

describe('formatDuration', () => {
	test('returns dash for null', () => {
		expect(formatDuration(null)).toBe('-');
		expect(formatDuration(0)).toBe('-');
	});

	test('formats hours and minutes', () => {
		expect(formatDuration(3672)).toBe('1h 1m');
		expect(formatDuration(4800)).toBe('1h 20m');
	});

	test('formats minutes and seconds', () => {
		expect(formatDuration(2305)).toBe('38m 25s');
	});

	test('formats seconds only', () => {
		expect(formatDuration(45)).toBe('45s');
	});
});

describe('formatDurationClock', () => {
	test('returns dash for null', () => {
		expect(formatDurationClock(null)).toBe('-');
	});

	test('formats with hours', () => {
		expect(formatDurationClock(3672)).toBe('1:01:12');
	});

	test('formats without hours', () => {
		expect(formatDurationClock(330)).toBe('5:30');
	});

	test('pads minutes and seconds', () => {
		expect(formatDurationClock(65)).toBe('1:05');
	});
});

describe('parsePaceInput', () => {
	test('parses valid M:SS input', () => {
		expect(parsePaceInput('5:30')).toBe(330);
		expect(parsePaceInput('8:05')).toBe(485);
	});

	test('returns null for invalid input', () => {
		expect(parsePaceInput('')).toBeNull();
		expect(parsePaceInput('5:60')).toBeNull();
		expect(parsePaceInput('abc')).toBeNull();
		expect(parsePaceInput('5:3')).toBeNull();
	});
});

describe('formatPaceForInput', () => {
	test('returns empty string for null', () => {
		expect(formatPaceForInput(null)).toBe('');
	});

	test('formats sec/km to M:SS', () => {
		expect(formatPaceForInput(330)).toBe('5:30');
		expect(formatPaceForInput(485)).toBe('8:05');
	});
});

describe('toMeters', () => {
	test('converts km to meters', () => {
		expect(toMeters(5, 'metric')).toBe(5000);
		expect(toMeters(1, 'metric')).toBe(1000);
	});

	test('converts miles to meters', () => {
		expect(toMeters(1, 'imperial')).toBeCloseTo(1609.34, 1);
		expect(toMeters(5, 'imperial')).toBeCloseTo(8046.7, 1);
	});

	test('handles zero', () => {
		expect(toMeters(0, 'metric')).toBe(0);
		expect(toMeters(0, 'imperial')).toBe(0);
	});

	test('handles fractional values', () => {
		expect(toMeters(0.5, 'metric')).toBe(500);
		expect(toMeters(0.5, 'imperial')).toBeCloseTo(804.67, 1);
	});
});
