import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const terminalLayouts = pgTable(
  'terminal_layouts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    encoded: text('encoded').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_terminal_layouts_user_id').on(table.userId),
    uniqueIndex('idx_terminal_layouts_user_default')
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
  ],
);

export type TerminalLayout = typeof terminalLayouts.$inferSelect;
export type NewTerminalLayout = typeof terminalLayouts.$inferInsert;
