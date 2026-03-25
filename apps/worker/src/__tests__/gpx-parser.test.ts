import { describe, it, expect } from 'vitest';
import { parseGpxFile } from '../gpx-parser.js';

// Three trackpoints roughly 111 m apart in latitude
const SIMPLE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <trkseg>
      <trkpt lat="40.00000" lon="-74.00000">
        <ele>10.0</ele>
        <time>2024-01-15T08:30:00Z</time>
      </trkpt>
      <trkpt lat="40.00100" lon="-74.00000">
        <ele>12.5</ele>
        <time>2024-01-15T08:30:30Z</time>
      </trkpt>
      <trkpt lat="40.00200" lon="-74.00000">
        <ele>11.0</ele>
        <time>2024-01-15T08:31:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

const HR_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Garmin Connect"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <trkseg>
      <trkpt lat="37.77000" lon="-122.41000">
        <ele>5.0</ele>
        <time>2024-06-01T10:00:00Z</time>
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:hr>142</gpxtpx:hr>
            <gpxtpx:cad>85</gpxtpx:cad>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>
      <trkpt lat="37.77100" lon="-122.41000">
        <ele>6.0</ele>
        <time>2024-06-01T10:00:30Z</time>
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:hr>150</gpxtpx:hr>
            <gpxtpx:cad>87</gpxtpx:cad>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>
      <trkpt lat="37.77200" lon="-122.41000">
        <ele>8.0</ele>
        <time>2024-06-01T10:01:00Z</time>
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:hr>155</gpxtpx:hr>
            <gpxtpx:cad>88</gpxtpx:cad>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

const NO_EXTENSIONS_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <trkseg>
      <trkpt lat="51.50000" lon="-0.12000">
        <ele>20.0</ele>
        <time>2024-03-10T07:00:00Z</time>
      </trkpt>
      <trkpt lat="51.50100" lon="-0.12000">
        <ele>22.0</ele>
        <time>2024-03-10T07:01:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

const EMPTY_TRKSEG_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <trkseg>
    </trkseg>
  </trk>
</gpx>`;

describe('parseGpxFile', () => {
  describe('simple GPX with 3 trackpoints', () => {
    it('returns empty laps array', () => {
      const result = parseGpxFile(SIMPLE_GPX);
      expect(result.laps).toEqual([]);
    });

    it('builds latlng stream', () => {
      const { streams } = parseGpxFile(SIMPLE_GPX);
      expect(streams.latlng).toHaveLength(3);
      expect(streams.latlng![0]).toEqual([40.0, -74.0]);
      expect(streams.latlng![1][0]).toBeCloseTo(40.001, 5);
      expect(streams.latlng![2][0]).toBeCloseTo(40.002, 5);
    });

    it('builds altitude stream', () => {
      const { streams } = parseGpxFile(SIMPLE_GPX);
      expect(streams.altitude).toEqual([10.0, 12.5, 11.0]);
    });

    it('builds time stream starting at 0', () => {
      const { streams } = parseGpxFile(SIMPLE_GPX);
      expect(streams.time).toHaveLength(3);
      expect(streams.time![0]).toBe(0);
      expect(streams.time![1]).toBe(30);
      expect(streams.time![2]).toBe(60);
    });

    it('builds distance stream starting at 0 and increasing', () => {
      const { streams } = parseGpxFile(SIMPLE_GPX);
      expect(streams.distance).toHaveLength(3);
      expect(streams.distance![0]).toBe(0);
      expect(streams.distance![1]).toBeGreaterThan(0);
      expect(streams.distance![2]).toBeGreaterThan(streams.distance![1]);
      // 0.001 degree latitude ≈ 111 m
      expect(streams.distance![1]).toBeCloseTo(111.2, 0);
    });

    it('builds velocity_smooth stream', () => {
      const { streams } = parseGpxFile(SIMPLE_GPX);
      expect(streams.velocity_smooth).toHaveLength(3);
      // first point is 0 by convention
      expect(streams.velocity_smooth![0]).toBe(0);
      // subsequent points: ~111 m / 30 s ≈ 3.7 m/s
      expect(streams.velocity_smooth![1]).toBeCloseTo(3.71, 1);
    });

    it('returns null heartrate and cadence when not present', () => {
      const { streams } = parseGpxFile(SIMPLE_GPX);
      expect(streams.heartrate).toBeNull();
      expect(streams.cadence).toBeNull();
    });

    it('returns null watts', () => {
      const { streams } = parseGpxFile(SIMPLE_GPX);
      expect(streams.watts).toBeNull();
    });

    it('computes summary startDate from first timestamp', () => {
      const { summary } = parseGpxFile(SIMPLE_GPX);
      expect(summary.startDate).toBeInstanceOf(Date);
      expect(summary.startDate!.toISOString()).toBe('2024-01-15T08:30:00.000Z');
    });

    it('computes summary elapsedTime', () => {
      const { summary } = parseGpxFile(SIMPLE_GPX);
      expect(summary.elapsedTime).toBe(60);
    });

    it('computes summary total distance', () => {
      const { summary } = parseGpxFile(SIMPLE_GPX);
      expect(summary.distance).toBeCloseTo(222.4, 0);
    });

    it('computes totalElevationGain and totalElevationLoss', () => {
      const { summary } = parseGpxFile(SIMPLE_GPX);
      // gain: 10→12.5 = +2.5; loss: 12.5→11 = 1.5
      expect(summary.totalElevationGain).toBeCloseTo(2.5, 5);
      expect(summary.totalElevationLoss).toBeCloseTo(1.5, 5);
    });
  });

  describe('GPX with HR and cadence extensions', () => {
    it('builds heartrate stream', () => {
      const { streams } = parseGpxFile(HR_GPX);
      expect(streams.heartrate).toEqual([142, 150, 155]);
    });

    it('builds cadence stream', () => {
      const { streams } = parseGpxFile(HR_GPX);
      expect(streams.cadence).toEqual([85, 87, 88]);
    });

    it('computes average heartrate in summary', () => {
      const { summary } = parseGpxFile(HR_GPX);
      expect(summary.averageHeartrate).toBeCloseTo((142 + 150 + 155) / 3, 5);
    });

    it('computes max heartrate in summary', () => {
      const { summary } = parseGpxFile(HR_GPX);
      expect(summary.maxHeartrate).toBe(155);
    });

    it('computes average cadence in summary', () => {
      const { summary } = parseGpxFile(HR_GPX);
      expect(summary.averageCadence).toBeCloseTo((85 + 87 + 88) / 3, 5);
    });
  });

  describe('GPX with no extensions (GPS only)', () => {
    it('parses without error', () => {
      expect(() => parseGpxFile(NO_EXTENSIONS_GPX)).not.toThrow();
    });

    it('builds latlng and altitude streams', () => {
      const { streams } = parseGpxFile(NO_EXTENSIONS_GPX);
      expect(streams.latlng).toHaveLength(2);
      expect(streams.altitude).toEqual([20.0, 22.0]);
    });

    it('has null heartrate, cadence, watts', () => {
      const { streams } = parseGpxFile(NO_EXTENSIONS_GPX);
      expect(streams.heartrate).toBeNull();
      expect(streams.cadence).toBeNull();
      expect(streams.watts).toBeNull();
    });

    it('builds distance stream', () => {
      const { streams } = parseGpxFile(NO_EXTENSIONS_GPX);
      expect(streams.distance).toHaveLength(2);
      expect(streams.distance![0]).toBe(0);
      expect(streams.distance![1]).toBeGreaterThan(0);
    });

    it('computes summary totalElevationGain', () => {
      const { summary } = parseGpxFile(NO_EXTENSIONS_GPX);
      // 20→22 = +2 m gain, no loss
      expect(summary.totalElevationGain).toBeCloseTo(2.0, 5);
      expect(summary.totalElevationLoss).toBeCloseTo(0.0, 5);
    });
  });

  describe('empty track segment', () => {
    it('returns null streams', () => {
      const { streams } = parseGpxFile(EMPTY_TRKSEG_GPX);
      expect(streams.time).toBeNull();
      expect(streams.distance).toBeNull();
      expect(streams.latlng).toBeNull();
      expect(streams.altitude).toBeNull();
      expect(streams.heartrate).toBeNull();
      expect(streams.cadence).toBeNull();
      expect(streams.watts).toBeNull();
      expect(streams.velocity_smooth).toBeNull();
    });

    it('returns empty laps array', () => {
      const { laps } = parseGpxFile(EMPTY_TRKSEG_GPX);
      expect(laps).toEqual([]);
    });

    it('returns null summary fields', () => {
      const { summary } = parseGpxFile(EMPTY_TRKSEG_GPX);
      expect(summary.startDate).toBeNull();
      expect(summary.elapsedTime).toBeNull();
      expect(summary.distance).toBeNull();
      expect(summary.totalElevationGain).toBeNull();
    });
  });
});
