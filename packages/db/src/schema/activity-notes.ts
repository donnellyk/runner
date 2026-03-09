import {
  pgTable,
  serial,
  integer,
  doublePrecision,
  text,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { activities } from './activities';

export const activityNotes = pgTable(
  'activity_notes',
  {
    id: serial('id').primaryKey(),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    distanceStart: doublePrecision('distance_start').notNull(),
    distanceEnd: doublePrecision('distance_end'),
    content: text('content').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_activity_notes_activity_id').on(table.activityId),
    check('chk_distance_end', sql`${table.distanceEnd} IS NULL OR ${table.distanceEnd} > ${table.distanceStart}`),
  ],
);

export type ActivityNote = typeof activityNotes.$inferSelect;
export type NewActivityNote = typeof activityNotes.$inferInsert;
