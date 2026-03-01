import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  stravaAthleteId: text('strava_athlete_id').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  profilePicUrl: text('profile_pic_url'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  timezone: text('timezone').notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
