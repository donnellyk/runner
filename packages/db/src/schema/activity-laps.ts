import {
  pgTable,
  serial,
  integer,
  doublePrecision,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { activities } from './activities';

export const activityLaps = pgTable(
  'activity_laps',
  {
    id: serial('id').primaryKey(),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    lapIndex: integer('lap_index').notNull(),
    elapsedTime: integer('elapsed_time'),
    movingTime: integer('moving_time'),
    distance: doublePrecision('distance'),
    startDate: timestamp('start_date', { withTimezone: true }),
    totalElevationGain: doublePrecision('total_elevation_gain'),
    averageSpeed: doublePrecision('average_speed'),
    maxSpeed: doublePrecision('max_speed'),
    averageHeartrate: doublePrecision('average_heartrate'),
    maxHeartrate: doublePrecision('max_heartrate'),
    averageCadence: doublePrecision('average_cadence'),
    averageWatts: doublePrecision('average_watts'),
  },
  (table) => [
    uniqueIndex('idx_activity_laps_activity_lap').on(table.activityId, table.lapIndex),
  ],
);
