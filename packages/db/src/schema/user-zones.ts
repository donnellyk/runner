import { pgTable, serial, integer, text, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import type { ZoneDefinition } from '@web-runner/shared';

export const userZones = pgTable(
  'user_zones',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    zoneType: text('zone_type').notNull(),
    zones: jsonb('zones').notNull().$type<ZoneDefinition[]>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_user_zones_user_zone_type').on(table.userId, table.zoneType),
  ],
);
