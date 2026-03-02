import { describe, it, expect } from 'vitest';
import { computeSegments, buildRouteWkt } from '../segments.js';

describe('computeSegments', () => {
  it('returns empty for no distance data', () => {
    expect(computeSegments({})).toEqual([]);
    expect(computeSegments({ distance: [] })).toEqual([]);
  });

  it('creates a single segment for activity shorter than 500m', () => {
    const segments = computeSegments({
      distance: [0, 100, 200, 300, 400],
      time: [0, 30, 60, 90, 120],
      latlng: [
        [40.0, -74.0],
        [40.001, -74.001],
        [40.002, -74.002],
        [40.003, -74.003],
        [40.004, -74.004],
      ],
    });

    expect(segments).toHaveLength(1);
    expect(segments[0].segmentIndex).toBe(0);
    expect(segments[0].distanceStart).toBe(0);
    expect(segments[0].distanceEnd).toBe(400);
    expect(segments[0].duration).toBe(120);
    expect(segments[0].routeWkt).toContain('LINESTRING');
  });

  it('splits at 500m boundaries', () => {
    const distance = Array.from({ length: 21 }, (_, i) => i * 100);
    const time = Array.from({ length: 21 }, (_, i) => i * 30);

    const segments = computeSegments({ distance, time });

    expect(segments).toHaveLength(4);
    expect(segments[0].distanceStart).toBe(0);
    expect(segments[0].distanceEnd).toBe(500);
    expect(segments[1].distanceStart).toBe(500);
    expect(segments[1].distanceEnd).toBe(1000);
    expect(segments[2].distanceStart).toBe(1000);
    expect(segments[2].distanceEnd).toBe(1500);
    expect(segments[3].distanceStart).toBe(1500);
    expect(segments[3].distanceEnd).toBe(2000);
  });

  it('computes heartrate stats per segment', () => {
    const distance = [0, 250, 500, 750, 1000];
    const time = [0, 60, 120, 180, 240];
    const heartrate = [140, 150, 160, 170, 180];

    const segments = computeSegments({ distance, time, heartrate });

    expect(segments).toHaveLength(2);
    expect(segments[0].avgHeartrate).toBeGreaterThan(0);
    expect(segments[0].minHeartrate).toBeLessThanOrEqual(segments[0].avgHeartrate!);
    expect(segments[0].maxHeartrate).toBeGreaterThanOrEqual(segments[0].avgHeartrate!);
  });

  it('computes elevation gain/loss', () => {
    const distance = [0, 250, 500, 750, 1000];
    const time = [0, 60, 120, 180, 240];
    const altitude = [100, 110, 105, 115, 120];

    const segments = computeSegments({ distance, time, altitude });

    expect(segments[0].elevationGain).toBeGreaterThan(0);
    expect(segments[0].elevationLoss).toBeGreaterThan(0);
  });

  it('handles missing optional metrics', () => {
    const distance = [0, 250, 500];
    const time = [0, 60, 120];

    const segments = computeSegments({ distance, time });

    expect(segments).toHaveLength(1);
    expect(segments[0].avgHeartrate).toBeNull();
    expect(segments[0].avgCadence).toBeNull();
    expect(segments[0].avgPower).toBeNull();
    expect(segments[0].elevationGain).toBeNull();
    expect(segments[0].routeWkt).toBeNull();
  });

  it('builds valid WKT for segment routes', () => {
    const distance = [0, 250, 500];
    const latlng: [number, number][] = [
      [40.0, -74.0],
      [40.001, -74.001],
      [40.002, -74.002],
    ];

    const segments = computeSegments({ distance, latlng });
    expect(segments[0].routeWkt).toBe('SRID=4326;LINESTRING(-74 40,-74.001 40.001,-74.002 40.002)');
  });
});

describe('buildRouteWkt', () => {
  it('returns null for fewer than 2 points', () => {
    expect(buildRouteWkt([])).toBeNull();
    expect(buildRouteWkt([[40, -74]])).toBeNull();
  });

  it('builds EWKT linestring with lng before lat', () => {
    const result = buildRouteWkt([
      [40.0, -74.0],
      [40.1, -74.1],
    ]);
    expect(result).toBe('SRID=4326;LINESTRING(-74 40,-74.1 40.1)');
  });
});
