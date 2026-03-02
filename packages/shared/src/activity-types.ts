export const SportType = {
  RUN: 'run',
  TRAIL_RUN: 'trail_run',
  RIDE: 'ride',
  SWIM: 'swim',
  WALK: 'walk',
  HIKE: 'hike',
  OTHER: 'other',
} as const;

export type SportType = (typeof SportType)[keyof typeof SportType];

export const WorkoutType = {
  DEFAULT: 'default',
  RACE: 'race',
  LONG_RUN: 'long_run',
  WORKOUT: 'workout',
} as const;

export type WorkoutType = (typeof WorkoutType)[keyof typeof WorkoutType];
