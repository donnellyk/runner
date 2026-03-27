import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  doublePrecision,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { activities } from './activities';

export const planTemplates = pgTable(
  'plan_templates',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sportType: text('sport_type').notNull().default('run'),
    raceDistance: doublePrecision('race_distance'),
    weekCount: integer('week_count').notNull(),
    sourceYaml: text('source_yaml').notNull(),
    color: text('color').notNull().default('#3b82f6'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_plan_templates_user_id').on(table.userId)],
);

export type PlanTemplate = typeof planTemplates.$inferSelect;
export type NewPlanTemplate = typeof planTemplates.$inferInsert;

export const planInstances = pgTable(
  'plan_instances',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    templateId: integer('template_id').references(() => planTemplates.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    sportType: text('sport_type').notNull(),
    raceDistance: doublePrecision('race_distance'),
    raceDate: timestamp('race_date', { withTimezone: true }).notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('active'),
    effortMap: jsonb('effort_map').notNull(),
    color: text('color').notNull().default('#3b82f6'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_plan_instances_user_id').on(table.userId),
    uniqueIndex('idx_plan_instances_user_active')
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export type PlanInstance = typeof planInstances.$inferSelect;
export type NewPlanInstance = typeof planInstances.$inferInsert;

export const planWeeks = pgTable(
  'plan_weeks',
  {
    id: serial('id').primaryKey(),
    instanceId: integer('instance_id')
      .notNull()
      .references(() => planInstances.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    phase: text('phase').notNull(),
    description: text('description'),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    supplementary: jsonb('supplementary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_plan_weeks_instance_week').on(table.instanceId, table.weekNumber),
    index('idx_plan_weeks_instance_start_date').on(table.instanceId, table.startDate),
  ],
);

export type PlanWeek = typeof planWeeks.$inferSelect;
export type NewPlanWeek = typeof planWeeks.$inferInsert;

export const planSupplementaryCompletions = pgTable(
  'plan_supplementary_completions',
  {
    id: serial('id').primaryKey(),
    weekId: integer('week_id')
      .notNull()
      .references(() => planWeeks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_plan_supp_completions_week_id').on(table.weekId)],
);

export type PlanSupplementaryCompletion = typeof planSupplementaryCompletions.$inferSelect;

export const planWorkouts = pgTable(
  'plan_workouts',
  {
    id: serial('id').primaryKey(),
    weekId: integer('week_id')
      .notNull()
      .references(() => planWeeks.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    category: text('category').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    targetDistanceMin: doublePrecision('target_distance_min'),
    targetDistanceMax: doublePrecision('target_distance_max'),
    targetDurationMin: integer('target_duration_min'),
    targetDurationMax: integer('target_duration_max'),
    effort: text('effort'),
    targets: jsonb('targets'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_plan_workouts_week_day_order').on(
      table.weekId,
      table.dayOfWeek,
      table.sortOrder,
    ),
  ],
);

export type PlanWorkout = typeof planWorkouts.$inferSelect;
export type NewPlanWorkout = typeof planWorkouts.$inferInsert;

export const planWorkoutMatches = pgTable(
  'plan_workout_matches',
  {
    id: serial('id').primaryKey(),
    workoutId: integer('workout_id')
      .notNull()
      .unique()
      .references(() => planWorkouts.id, { onDelete: 'cascade' }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    matchType: text('match_type').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_plan_workout_matches_activity_id').on(table.activityId)],
);

export type PlanWorkoutMatch = typeof planWorkoutMatches.$inferSelect;
export type NewPlanWorkoutMatch = typeof planWorkoutMatches.$inferInsert;
