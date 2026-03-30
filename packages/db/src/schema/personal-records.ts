import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { activities } from './activities';

export const personalRecords = pgTable(
  'personal_records',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    raceDistance: text('race_distance').notNull(),
    timeSeconds: integer('time_seconds').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_pr_user_activity').on(table.userId, table.activityId),
    index('idx_pr_user_distance').on(table.userId, table.raceDistance),
  ],
);
