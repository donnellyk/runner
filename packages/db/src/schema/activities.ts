import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  doublePrecision,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { geometry } from './custom-types';

export const activities = pgTable(
  'activities',
  {
    id: serial('id').primaryKey(),
    externalId: text('external_id').notNull(),
    source: text('source').notNull().default('strava'),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sportType: text('sport_type').notNull(),
    workoutType: text('workout_type'),
    distance: doublePrecision('distance'),
    movingTime: integer('moving_time'),
    elapsedTime: integer('elapsed_time'),
    totalElevationGain: doublePrecision('total_elevation_gain'),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    startLatlng: doublePrecision('start_latlng').array(),
    endLatlng: doublePrecision('end_latlng').array(),
    averageSpeed: doublePrecision('average_speed'),
    maxSpeed: doublePrecision('max_speed'),
    averageHeartrate: doublePrecision('average_heartrate'),
    maxHeartrate: doublePrecision('max_heartrate'),
    averageCadence: doublePrecision('average_cadence'),
    averageWatts: doublePrecision('average_watts'),
    hasHeartrate: boolean('has_heartrate').notNull().default(false),
    hasPower: boolean('has_power').notNull().default(false),
    deviceName: text('device_name'),
    gearId: text('gear_id'),
    syncStatus: text('sync_status').notNull().default('pending'),
    route: geometry('route'),
    sourceRaw: jsonb('source_raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_activities_source_external_id').on(table.source, table.externalId),
    index('idx_activities_user_id').on(table.userId),
    index('idx_activities_start_date').on(table.startDate),
    index('idx_activities_sync_status').on(table.syncStatus),
    index('idx_activities_sport_type').on(table.sportType),
  ],
);
