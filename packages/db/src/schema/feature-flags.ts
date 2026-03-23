import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';

export const featureFlags = pgTable('feature_flags', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  enabled: boolean('enabled').notNull().default(false),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
