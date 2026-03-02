import { describe, it, expect } from 'vitest';
import { mapStravaSportType, mapStravaWorkoutType } from '../mapping.js';
import { SportType, WorkoutType } from '@web-runner/shared';

describe('mapStravaSportType', () => {
  it('maps known Strava sport types', () => {
    expect(mapStravaSportType('Run')).toBe(SportType.RUN);
    expect(mapStravaSportType('TrailRun')).toBe(SportType.TRAIL_RUN);
    expect(mapStravaSportType('Ride')).toBe(SportType.RIDE);
    expect(mapStravaSportType('Swim')).toBe(SportType.SWIM);
    expect(mapStravaSportType('Walk')).toBe(SportType.WALK);
    expect(mapStravaSportType('Hike')).toBe(SportType.HIKE);
  });

  it('maps virtual activities to their base types', () => {
    expect(mapStravaSportType('VirtualRun')).toBe(SportType.RUN);
    expect(mapStravaSportType('VirtualRide')).toBe(SportType.RIDE);
  });

  it('maps bike variants to ride', () => {
    expect(mapStravaSportType('MountainBikeRide')).toBe(SportType.RIDE);
    expect(mapStravaSportType('GravelRide')).toBe(SportType.RIDE);
    expect(mapStravaSportType('EBikeRide')).toBe(SportType.RIDE);
  });

  it('maps unknown types to other', () => {
    expect(mapStravaSportType('Yoga')).toBe(SportType.OTHER);
    expect(mapStravaSportType('UnknownSport')).toBe(SportType.OTHER);
  });
});

describe('mapStravaWorkoutType', () => {
  it('maps known workout types', () => {
    expect(mapStravaWorkoutType(0)).toBe(WorkoutType.DEFAULT);
    expect(mapStravaWorkoutType(1)).toBe(WorkoutType.RACE);
    expect(mapStravaWorkoutType(2)).toBe(WorkoutType.LONG_RUN);
    expect(mapStravaWorkoutType(3)).toBe(WorkoutType.WORKOUT);
  });

  it('maps null to default', () => {
    expect(mapStravaWorkoutType(null)).toBe(WorkoutType.DEFAULT);
  });

  it('maps unknown values to default', () => {
    expect(mapStravaWorkoutType(99)).toBe(WorkoutType.DEFAULT);
  });
});
