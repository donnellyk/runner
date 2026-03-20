import { describe, it, expect } from 'vitest';
import { prepareStreams, prepareNotes, prepareLaps, prepareSegments } from './prepare-page-data';

describe('prepareStreams', () => {
	it('maps valid stream types to the correct keys', () => {
		const streamMap: Record<string, unknown> = {
			velocity_smooth: [3.1, 3.2, 3.3],
			heartrate: [140, 145, 150],
			altitude: [100, 105, 110],
			cadence: [80, 82, 84],
			watts: [200, 210, 220],
			grade_smooth: [1.5, 2.0, -0.5],
			distance: [0, 500, 1000],
			time: [0, 60, 120],
			latlng: [
				[40.0, -74.0],
				[40.1, -74.1],
			],
		};

		const result = prepareStreams(streamMap);

		expect(result.velocity).toEqual([3.1, 3.2, 3.3]);
		expect(result.heartrate).toEqual([140, 145, 150]);
		expect(result.altitude).toEqual([100, 105, 110]);
		expect(result.cadence).toEqual([80, 82, 84]);
		expect(result.power).toEqual([200, 210, 220]);
		expect(result.grade).toEqual([1.5, 2.0, -0.5]);
		expect(result.distance).toEqual([0, 500, 1000]);
		expect(result.time).toEqual([0, 60, 120]);
		expect(result.latlng).toEqual([
			[40.0, -74.0],
			[40.1, -74.1],
		]);
	});

	it('returns null for missing streams', () => {
		const result = prepareStreams({});

		expect(result.velocity).toBeNull();
		expect(result.heartrate).toBeNull();
		expect(result.altitude).toBeNull();
		expect(result.cadence).toBeNull();
		expect(result.power).toBeNull();
		expect(result.grade).toBeNull();
		expect(result.distance).toBeNull();
		expect(result.time).toBeNull();
		expect(result.latlng).toBeNull();
	});

	it('returns null for empty number arrays', () => {
		const streamMap: Record<string, unknown> = {
			velocity_smooth: [],
			heartrate: [],
		};

		const result = prepareStreams(streamMap);

		expect(result.velocity).toBeNull();
		expect(result.heartrate).toBeNull();
	});

	it('returns null for invalid data types', () => {
		const streamMap: Record<string, unknown> = {
			velocity_smooth: 'not an array',
			heartrate: { bpm: 140 },
			altitude: [1, 'two', 3],
			cadence: null,
			watts: undefined,
			grade_smooth: true,
			distance: 42,
			time: [null, null],
			latlng: [[1, 2, 3]],
		};

		const result = prepareStreams(streamMap);

		expect(result.velocity).toBeNull();
		expect(result.heartrate).toBeNull();
		expect(result.altitude).toBeNull();
		expect(result.cadence).toBeNull();
		expect(result.power).toBeNull();
		expect(result.grade).toBeNull();
		expect(result.distance).toBeNull();
		expect(result.time).toBeNull();
		expect(result.latlng).toBeNull();
	});

	it('handles partial stream data', () => {
		const streamMap: Record<string, unknown> = {
			velocity_smooth: [3.0, 3.5],
			distance: [0, 1000],
		};

		const result = prepareStreams(streamMap);

		expect(result.velocity).toEqual([3.0, 3.5]);
		expect(result.distance).toEqual([0, 1000]);
		expect(result.heartrate).toBeNull();
		expect(result.latlng).toBeNull();
	});
});

describe('prepareNotes', () => {
	it('maps notes to ActivityNote array', () => {
		const notes = [
			{ id: 1, distanceStart: 0, distanceEnd: 500, content: 'Warm up' },
			{ id: 2, distanceStart: 5000, distanceEnd: null, content: 'Felt strong' },
		];

		const result = prepareNotes(notes);

		expect(result).toEqual([
			{ id: 1, distanceStart: 0, distanceEnd: 500, content: 'Warm up' },
			{ id: 2, distanceStart: 5000, distanceEnd: null, content: 'Felt strong' },
		]);
	});

	it('returns empty array for empty input', () => {
		expect(prepareNotes([])).toEqual([]);
	});
});

describe('prepareLaps', () => {
	it('maps laps to ActivityLap array', () => {
		const laps = [
			{
				id: 10,
				lapIndex: 0,
				distance: 1000,
				movingTime: 300,
				averageSpeed: 3.33,
				averageHeartrate: 145,
				averageCadence: 82,
			},
			{
				id: 11,
				lapIndex: 1,
				distance: 1000,
				movingTime: 290,
				averageSpeed: 3.45,
				averageHeartrate: 155,
				averageCadence: 84,
			},
		];

		const result = prepareLaps(laps);

		expect(result).toEqual([
			{
				id: 10,
				lapIndex: 0,
				distance: 1000,
				movingTime: 300,
				averageSpeed: 3.33,
				averageHeartrate: 145,
				averageCadence: 82,
			},
			{
				id: 11,
				lapIndex: 1,
				distance: 1000,
				movingTime: 290,
				averageSpeed: 3.45,
				averageHeartrate: 155,
				averageCadence: 84,
			},
		]);
	});

	it('handles null fields', () => {
		const laps = [
			{
				id: 1,
				lapIndex: 0,
				distance: null,
				movingTime: null,
				averageSpeed: null,
				averageHeartrate: null,
				averageCadence: null,
			},
		];

		const result = prepareLaps(laps);

		expect(result).toEqual([
			{
				id: 1,
				lapIndex: 0,
				distance: null,
				movingTime: null,
				averageSpeed: null,
				averageHeartrate: null,
				averageCadence: null,
			},
		]);
	});

	it('returns empty array for empty input', () => {
		expect(prepareLaps([])).toEqual([]);
	});
});

describe('prepareSegments', () => {
	it('maps segments to ActivitySegment array', () => {
		const segments = [
			{
				id: 100,
				segmentIndex: 0,
				distanceStart: 0,
				distanceEnd: 500,
				avgPace: 300,
				minPace: 280,
				maxPace: 320,
				avgHeartrate: 150,
				avgCadence: 82,
				avgPower: 250,
				elevationGain: 10,
				elevationLoss: 5,
			},
			{
				id: 101,
				segmentIndex: 1,
				distanceStart: 500,
				distanceEnd: 1000,
				avgPace: 290,
				minPace: 270,
				maxPace: 310,
				avgHeartrate: 155,
				avgCadence: 84,
				avgPower: null,
				elevationGain: null,
				elevationLoss: null,
			},
		];

		const result = prepareSegments(segments);

		expect(result).toEqual([
			{
				id: 100,
				segmentIndex: 0,
				distanceStart: 0,
				distanceEnd: 500,
				avgPace: 300,
				minPace: 280,
				maxPace: 320,
				avgHeartrate: 150,
				avgCadence: 82,
				avgPower: 250,
				elevationGain: 10,
				elevationLoss: 5,
			},
			{
				id: 101,
				segmentIndex: 1,
				distanceStart: 500,
				distanceEnd: 1000,
				avgPace: 290,
				minPace: 270,
				maxPace: 310,
				avgHeartrate: 155,
				avgCadence: 84,
				avgPower: null,
				elevationGain: null,
				elevationLoss: null,
			},
		]);
	});

	it('returns empty array for empty input', () => {
		expect(prepareSegments([])).toEqual([]);
	});
});
