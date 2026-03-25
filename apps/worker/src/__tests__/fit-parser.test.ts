import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fit-file-parser before importing the module under test
const mockParseAsync = vi.fn();
vi.mock('fit-file-parser', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      parseAsync: mockParseAsync,
    })),
  };
});

import { parseFitFile } from '../fit-parser.js';

function makeFitData(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 2,
    profileVersion: 2117,
    user_profile: {},
    activity: { timestamp: '2024-01-01T10:00:00.000Z' },
    records: [],
    laps: [],
    sessions: [],
    device_infos: [],
    ...overrides,
  };
}

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: '2024-01-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeLap(overrides: Record<string, unknown> = {}) {
  return {
    start_time: '2024-01-01T10:00:00.000Z',
    timestamp: '2024-01-01T10:10:00.000Z',
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    start_time: '2024-01-01T10:00:00.000Z',
    timestamp: '2024-01-01T10:30:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockParseAsync.mockResolvedValue(makeFitData());
});

describe('parseFitFile', () => {
  describe('empty records', () => {
    it('returns all null streams when records array is empty', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({ records: [] }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.time).toBeNull();
      expect(result.streams.distance).toBeNull();
      expect(result.streams.latlng).toBeNull();
      expect(result.streams.altitude).toBeNull();
      expect(result.streams.heartrate).toBeNull();
      expect(result.streams.cadence).toBeNull();
      expect(result.streams.watts).toBeNull();
      expect(result.streams.velocity_smooth).toBeNull();
    });

    it('returns empty laps array when laps array is empty', async () => {
      const result = await parseFitFile(Buffer.from(''));
      expect(result.laps).toEqual([]);
    });

    it('returns null summary fields when sessions array is empty', async () => {
      const result = await parseFitFile(Buffer.from(''));
      expect(result.summary.startDate).toBeNull();
      expect(result.summary.elapsedTime).toBeNull();
      expect(result.summary.movingTime).toBeNull();
      expect(result.summary.distance).toBeNull();
    });
  });

  describe('time stream', () => {
    it('computes time as seconds from first record timestamp', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z' }),
          makeRecord({ timestamp: '2024-01-01T10:00:30.000Z' }),
          makeRecord({ timestamp: '2024-01-01T10:01:00.000Z' }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.time).toEqual([0, 30, 60]);
    });

    it('returns time stream with single value of 0 for single record', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [makeRecord({ timestamp: '2024-01-01T10:05:00.000Z' })],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.time).toEqual([0]);
    });
  });

  describe('missing sensor fields', () => {
    it('returns null for heartrate stream when no HR in records', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ distance: 0 }),
          makeRecord({ distance: 100 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.heartrate).toBeNull();
    });

    it('returns null for cadence stream when no cadence in records', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [makeRecord({ distance: 0 })],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.cadence).toBeNull();
    });

    it('returns null for watts stream when no power in records', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [makeRecord({ distance: 0 })],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.watts).toBeNull();
    });

    it('returns null for latlng stream when no position data in records', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ distance: 0, heart_rate: 140 }),
          makeRecord({ distance: 100, heart_rate: 145 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.latlng).toBeNull();
    });

    it('returns null for velocity_smooth when no speed in records', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [makeRecord({ distance: 0 })],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.velocity_smooth).toBeNull();
    });
  });

  describe('stream extraction', () => {
    it('extracts all streams when all sensor data is present', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({
            timestamp: '2024-01-01T10:00:00.000Z',
            distance: 0,
            position_lat: 40.0,
            position_long: -74.0,
            altitude: 100,
            heart_rate: 140,
            cadence: 85,
            power: 200,
            speed: 3.5,
          }),
          makeRecord({
            timestamp: '2024-01-01T10:00:10.000Z',
            distance: 35,
            position_lat: 40.001,
            position_long: -74.001,
            altitude: 102,
            heart_rate: 145,
            cadence: 87,
            power: 210,
            speed: 3.6,
          }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.time).toEqual([0, 10]);
      expect(result.streams.distance).toEqual([0, 35]);
      expect(result.streams.latlng).toEqual([[40.0, -74.0], [40.001, -74.001]]);
      expect(result.streams.altitude).toEqual([100, 102]);
      expect(result.streams.heartrate).toEqual([140, 145]);
      expect(result.streams.cadence).toEqual([85, 87]);
      expect(result.streams.watts).toEqual([200, 210]);
      expect(result.streams.velocity_smooth).toEqual([3.5, 3.6]);
    });

    it('falls back to enhanced_altitude when altitude is absent', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ enhanced_altitude: 250 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.altitude).toEqual([250]);
    });

    it('falls back to enhanced_speed when speed is absent', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ enhanced_speed: 4.2 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.velocity_smooth).toEqual([4.2]);
    });

    it('stores raw cadence values without doubling (half-cycles as-is)', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ cadence: 85 }),
          makeRecord({ cadence: 90 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      // Raw cadence stored as-is, not doubled
      expect(result.streams.cadence).toEqual([85, 90]);
    });
  });

  describe('lap extraction', () => {
    it('assigns lapIndex in order', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        laps: [
          makeLap({ total_distance: 1000 }),
          makeLap({ total_distance: 1000, start_time: '2024-01-01T10:10:00.000Z' }),
          makeLap({ total_distance: 500, start_time: '2024-01-01T10:20:00.000Z' }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.laps).toHaveLength(3);
      expect(result.laps[0].lapIndex).toBe(0);
      expect(result.laps[1].lapIndex).toBe(1);
      expect(result.laps[2].lapIndex).toBe(2);
    });

    it('extracts lap fields correctly', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        laps: [
          makeLap({
            start_time: '2024-01-01T10:00:00.000Z',
            total_elapsed_time: 600,
            total_timer_time: 590,
            total_distance: 1000,
            total_ascent: 15,
            avg_speed: 1.8,
            max_speed: 3.0,
            avg_heart_rate: 155,
            max_heart_rate: 170,
            avg_cadence: 86,
            avg_power: 250,
          }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));
      const lap = result.laps[0];

      expect(lap.lapIndex).toBe(0);
      expect(lap.startDate).toEqual(new Date('2024-01-01T10:00:00.000Z'));
      expect(lap.elapsedTime).toBe(600);
      expect(lap.movingTime).toBe(590);
      expect(lap.distance).toBe(1000);
      expect(lap.totalElevationGain).toBe(15);
      expect(lap.averageSpeed).toBe(1.8);
      expect(lap.maxSpeed).toBe(3.0);
      expect(lap.averageHeartrate).toBe(155);
      expect(lap.maxHeartrate).toBe(170);
      expect(lap.averageCadence).toBe(86);
      expect(lap.averageWatts).toBe(250);
    });

    it('returns null for missing lap fields', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        laps: [makeLap()],
      }));

      const result = await parseFitFile(Buffer.from(''));
      const lap = result.laps[0];

      expect(lap.elapsedTime).toBeNull();
      expect(lap.movingTime).toBeNull();
      expect(lap.distance).toBeNull();
      expect(lap.totalElevationGain).toBeNull();
      expect(lap.averageHeartrate).toBeNull();
      expect(lap.averageCadence).toBeNull();
      expect(lap.averageWatts).toBeNull();
    });
  });

  describe('session summary', () => {
    it('extracts session fields correctly', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        sessions: [
          makeSession({
            start_time: '2024-01-01T10:00:00.000Z',
            total_elapsed_time: 1800,
            total_timer_time: 1750,
            total_distance: 5000,
            total_ascent: 50,
            total_descent: 48,
            avg_speed: 2.8,
            max_speed: 4.5,
            avg_heart_rate: 158,
            max_heart_rate: 178,
            avg_cadence: 87,
            avg_power: 260,
          }),
        ],
        device_infos: [{ product_name: 'Garmin Forerunner 265', timestamp: '2024-01-01T10:00:00.000Z' }],
      }));

      const result = await parseFitFile(Buffer.from(''));
      const summary = result.summary;

      expect(summary.startDate).toEqual(new Date('2024-01-01T10:00:00.000Z'));
      expect(summary.elapsedTime).toBe(1800);
      expect(summary.movingTime).toBe(1750);
      expect(summary.distance).toBe(5000);
      expect(summary.totalElevationGain).toBe(50);
      expect(summary.totalElevationLoss).toBe(48);
      expect(summary.averageSpeed).toBe(2.8);
      expect(summary.maxSpeed).toBe(4.5);
      expect(summary.averageHeartrate).toBe(158);
      expect(summary.maxHeartrate).toBe(178);
      expect(summary.averageCadence).toBe(87);
      expect(summary.averageWatts).toBe(260);
      expect(summary.deviceName).toBe('Garmin Forerunner 265');
    });

    it('returns null deviceName when no device_infos', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        sessions: [makeSession()],
        device_infos: [],
      }));

      const result = await parseFitFile(Buffer.from(''));
      expect(result.summary.deviceName).toBeNull();
    });

    it('returns null deviceName when device_infos have no product_name', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        sessions: [makeSession()],
        device_infos: [{ timestamp: '2024-01-01T10:00:00.000Z' }],
      }));

      const result = await parseFitFile(Buffer.from(''));
      expect(result.summary.deviceName).toBeNull();
    });
  });

  describe('stream alignment', () => {
    it('all non-null streams have the same length as time', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({
            timestamp: '2024-01-01T10:00:00.000Z',
            distance: 0,
            heart_rate: 140,
            speed: 3.0,
          }),
          makeRecord({
            timestamp: '2024-01-01T10:00:10.000Z',
            distance: 30,
            // heart_rate absent
            speed: 3.2,
          }),
          makeRecord({
            timestamp: '2024-01-01T10:00:20.000Z',
            distance: 62,
            heart_rate: 145,
            // speed absent
          }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));
      const streams = result.streams;

      expect(streams.time).toHaveLength(3);
      expect(streams.distance).toHaveLength(3);
      expect(streams.heartrate).toHaveLength(3);
      expect(streams.velocity_smooth).toHaveLength(3);
    });

    it('forward-fills heartrate when some records are missing it', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', heart_rate: 140 }),
          makeRecord({ timestamp: '2024-01-01T10:00:10.000Z' }), // no HR
          makeRecord({ timestamp: '2024-01-01T10:00:20.000Z', heart_rate: 145 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.heartrate).toEqual([140, 140, 145]);
    });

    it('forward-fills velocity_smooth when some records are missing it', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', speed: 3.0 }),
          makeRecord({ timestamp: '2024-01-01T10:00:10.000Z' }), // no speed
          makeRecord({ timestamp: '2024-01-01T10:00:20.000Z', speed: 3.5 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.velocity_smooth).toEqual([3.0, 3.0, 3.5]);
    });

    it('forward-fills distance when some records are missing it', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', distance: 0 }),
          makeRecord({ timestamp: '2024-01-01T10:00:10.000Z' }), // no distance
          makeRecord({ timestamp: '2024-01-01T10:00:20.000Z', distance: 60 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.distance).toEqual([0, 0, 60]);
    });

    it('forward-fills altitude when some records are missing it', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', altitude: 100 }),
          makeRecord({ timestamp: '2024-01-01T10:00:10.000Z' }), // no altitude
          makeRecord({ timestamp: '2024-01-01T10:00:20.000Z', altitude: 105 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.altitude).toEqual([100, 100, 105]);
    });

    it('forward-fills latlng when some records are missing position', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', position_lat: 40.0, position_long: -74.0 }),
          makeRecord({ timestamp: '2024-01-01T10:00:10.000Z' }), // no position
          makeRecord({ timestamp: '2024-01-01T10:00:20.000Z', position_lat: 40.001, position_long: -74.001 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.latlng).toEqual([
        [40.0, -74.0],
        [40.0, -74.0],
        [40.001, -74.001],
      ]);
    });

    it('forward-fills cadence when some records are missing it', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', cadence: 85 }),
          makeRecord({ timestamp: '2024-01-01T10:00:10.000Z' }), // no cadence
          makeRecord({ timestamp: '2024-01-01T10:00:20.000Z', cadence: 88 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.cadence).toEqual([85, 85, 88]);
    });

    it('forward-fills watts when some records are missing it', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', power: 200 }),
          makeRecord({ timestamp: '2024-01-01T10:00:10.000Z' }), // no power
          makeRecord({ timestamp: '2024-01-01T10:00:20.000Z', power: 210 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.watts).toEqual([200, 200, 210]);
    });

    it('skips records without a valid timestamp', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', heart_rate: 140 }),
          { heart_rate: 145 }, // no timestamp
          makeRecord({ timestamp: '2024-01-01T10:00:20.000Z', heart_rate: 150 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.time).toEqual([0, 20]);
      expect(result.streams.heartrate).toEqual([140, 150]);
    });

    it('returns null for a stream when no record has that field', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', distance: 0 }),
          makeRecord({ timestamp: '2024-01-01T10:00:10.000Z', distance: 30 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.heartrate).toBeNull();
      expect(result.streams.watts).toBeNull();
      expect(result.streams.cadence).toBeNull();
    });
  });

  describe('production edge cases', () => {
    it('does not emit [0,0] latlng for records before first GPS fix', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', distance: 0 }),
          makeRecord({ timestamp: '2024-01-01T10:00:05.000Z', distance: 15 }),
          makeRecord({ timestamp: '2024-01-01T10:00:10.000Z', distance: 30, position_lat: 40.0, position_long: -74.0 }),
          makeRecord({ timestamp: '2024-01-01T10:00:15.000Z', distance: 45, position_lat: 40.001, position_long: -74.001 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      // latlng should only contain points from when GPS was available
      expect(result.streams.latlng).toEqual([
        [40.0, -74.0],
        [40.001, -74.001],
      ]);
      // No [0,0] entries
      expect(result.streams.latlng).not.toContainEqual([0, 0]);
    });

    it('latlng can be shorter than time when GPS fix is delayed', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', distance: 0, heart_rate: 80 }),
          makeRecord({ timestamp: '2024-01-01T10:00:10.000Z', distance: 30, heart_rate: 120, position_lat: 40.0, position_long: -74.0 }),
          makeRecord({ timestamp: '2024-01-01T10:00:20.000Z', distance: 60, heart_rate: 140, position_lat: 40.001, position_long: -74.001 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.streams.time).toHaveLength(3);
      expect(result.streams.heartrate).toHaveLength(3);
      expect(result.streams.latlng).toHaveLength(2);
    });

    it('rounds float elapsed/moving times to integers in laps', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        laps: [
          makeLap({ total_elapsed_time: 467.619, total_timer_time: 450.234 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.laps[0].elapsedTime).toBe(468);
      expect(result.laps[0].movingTime).toBe(450);
    });

    it('rounds float elapsed/moving times to integers in session summary', async () => {
      mockParseAsync.mockResolvedValue(makeFitData({
        sessions: [
          makeSession({ total_elapsed_time: 3099.74, total_timer_time: 3050.12 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      expect(result.summary.elapsedTime).toBe(3100);
      expect(result.summary.movingTime).toBe(3050);
    });

    it('returns zero distance from session even when records have data', async () => {
      // FIT files can have session.total_distance = 0 while records have real distance data.
      // The parser should faithfully return what the session reports; the caller handles fallback.
      mockParseAsync.mockResolvedValue(makeFitData({
        sessions: [
          makeSession({ total_distance: 0, total_elapsed_time: 0, total_timer_time: 0 }),
        ],
        records: [
          makeRecord({ timestamp: '2024-01-01T10:00:00.000Z', distance: 0 }),
          makeRecord({ timestamp: '2024-01-01T10:00:30.000Z', distance: 5000 }),
        ],
      }));

      const result = await parseFitFile(Buffer.from(''));

      // Session summary reports what's in the session message
      expect(result.summary.distance).toBe(0);
      expect(result.summary.elapsedTime).toBe(0);
      // But streams have the real data for the caller to use as fallback
      expect(result.streams.distance).toEqual([0, 5000]);
      expect(result.streams.time).toEqual([0, 30]);
    });
  });

  describe('error handling', () => {
    it('rejects when fit-file-parser returns an error', async () => {
      mockParseAsync.mockRejectedValue(new Error('Invalid FIT file'));

      await expect(parseFitFile(Buffer.from(''))).rejects.toThrow('Invalid FIT file');
    });

    it('resolves with empty result when fit-file-parser returns minimal data', async () => {
      mockParseAsync.mockResolvedValue(makeFitData());

      const result = await parseFitFile(Buffer.from(''));
      expect(result.streams.time).toBeNull();
      expect(result.laps).toEqual([]);
      expect(result.summary.startDate).toBeNull();
    });
  });
});
