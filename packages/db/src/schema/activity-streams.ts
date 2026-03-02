import {
  pgTable,
  integer,
  text,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { activities } from './activities';

export const activityStreams = pgTable(
  'activity_streams',
  {
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    streamType: text('stream_type').notNull(),
    data: jsonb('data').notNull(),
    originalSize: integer('original_size'),
    resolution: text('resolution'),
  },
  (table) => [
    primaryKey({ columns: [table.activityId, table.streamType] }),
  ],
);
