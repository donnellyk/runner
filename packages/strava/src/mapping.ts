import { SportType, WorkoutType } from '@web-runner/shared';

const SPORT_TYPE_MAP: Record<string, SportType> = {
  Run: SportType.RUN,
  TrailRun: SportType.TRAIL_RUN,
  Ride: SportType.RIDE,
  Swim: SportType.SWIM,
  Walk: SportType.WALK,
  Hike: SportType.HIKE,
  VirtualRun: SportType.RUN,
  VirtualRide: SportType.RIDE,
  MountainBikeRide: SportType.RIDE,
  GravelRide: SportType.RIDE,
  EBikeRide: SportType.RIDE,
};

const WORKOUT_TYPE_MAP: Record<number, WorkoutType> = {
  0: WorkoutType.DEFAULT,
  1: WorkoutType.RACE,
  2: WorkoutType.LONG_RUN,
  3: WorkoutType.WORKOUT,
};

export function mapStravaSportType(stravaSportType: string): SportType {
  return SPORT_TYPE_MAP[stravaSportType] ?? SportType.OTHER;
}

export function mapStravaWorkoutType(stravaWorkoutType: number | null): WorkoutType {
  if (stravaWorkoutType == null) return WorkoutType.DEFAULT;
  return WORKOUT_TYPE_MAP[stravaWorkoutType] ?? WorkoutType.DEFAULT;
}
