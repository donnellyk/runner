import {
  pgTable,
  serial,
  integer,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { activities } from './activities';
import { geometry } from './custom-types';

export const activitySegments = pgTable(
  'activity_segments',
  {
    id: serial('id').primaryKey(),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    segmentIndex: integer('segment_index').notNull(),
    route: geometry('route'),
    distanceStart: doublePrecision('distance_start').notNull(),
    distanceEnd: doublePrecision('distance_end').notNull(),
    duration: integer('duration'),
    avgPace: doublePrecision('avg_pace'),
    minPace: doublePrecision('min_pace'),
    maxPace: doublePrecision('max_pace'),
    avgHeartrate: doublePrecision('avg_heartrate'),
    minHeartrate: doublePrecision('min_heartrate'),
    maxHeartrate: doublePrecision('max_heartrate'),
    avgCadence: doublePrecision('avg_cadence'),
    minCadence: doublePrecision('min_cadence'),
    maxCadence: doublePrecision('max_cadence'),
    avgPower: doublePrecision('avg_power'),
    minPower: doublePrecision('min_power'),
    maxPower: doublePrecision('max_power'),
    elevationGain: doublePrecision('elevation_gain'),
    elevationLoss: doublePrecision('elevation_loss'),
  },
  (table) => [
    uniqueIndex('idx_activity_segments_activity_segment').on(table.activityId, table.segmentIndex),
    index('idx_activity_segments_activity_id').on(table.activityId),
    index('idx_activity_segments_avg_pace').on(table.avgPace),
    index('idx_activity_segments_avg_heartrate').on(table.avgHeartrate),
  ],
);
