import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import { eq, and, gte, lt, inArray } from 'drizzle-orm';
import type { Database } from '@web-runner/db/client';
import {
  activities,
  planInstances,
  planWeeks,
  planWorkouts,
  planWorkoutMatches,
  users,
} from '@web-runner/db/schema';
import type { PlanMatchJobData, PlanBackfillJobData } from '@web-runner/shared';

export interface PlanMatchingDeps {
  db: Database;
  logger: Logger;
}

/**
 * Compute the ISO 8601 day-of-week (1 = Monday, 7 = Sunday) for a date in a given timezone.
 */
export function dayOfWeekInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const dayName = formatter.format(date);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[dayName] ?? 1;
}

/**
 * Score a candidate match by distance ratio.
 * Returns { confidence, ratio } or null if the ratio is outside the 0.65-1.35 range.
 */
export function scoreMatch(
  activityDistance: number,
  targetDistanceMin: number,
): { confidence: number; ratio: number } | null {
  if (targetDistanceMin <= 0) return null;
  const ratio = activityDistance / targetDistanceMin;
  if (ratio < 0.65 || ratio > 1.35) return null;
  const confidence = 1 - Math.abs(1 - ratio);
  return { confidence, ratio };
}

/**
 * Match a single activity to a plan workout.
 * Called when an activity finishes syncing.
 */
export async function handlePlanMatch(
  job: Job<PlanMatchJobData>,
  deps: PlanMatchingDeps,
): Promise<void> {
  const { db, logger } = deps;
  const { userId, activityId } = job.data;

  const [activity] = await db
    .select({
      id: activities.id,
      startDate: activities.startDate,
      distance: activities.distance,
      sportType: activities.sportType,
      syncStatus: activities.syncStatus,
    })
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)));

  if (!activity) {
    logger.warn({ userId, activityId }, 'plan-match: activity not found');
    return;
  }

  if (activity.syncStatus !== 'complete') {
    logger.info(
      { userId, activityId, syncStatus: activity.syncStatus },
      'plan-match: activity not complete, skipping',
    );
    return;
  }

  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return;

  const [instance] = await db
    .select()
    .from(planInstances)
    .where(and(eq(planInstances.userId, userId), eq(planInstances.status, 'active')));

  if (!instance) {
    logger.debug({ userId }, 'plan-match: no active plan instance');
    return;
  }

  if (activity.sportType.toLowerCase() !== instance.sportType.toLowerCase()) {
    logger.debug(
      { userId, activityId, activitySport: activity.sportType, planSport: instance.sportType },
      'plan-match: sport type mismatch',
    );
    return;
  }

  // Check if this activity is already matched
  const [existingMatch] = await db
    .select({ id: planWorkoutMatches.id })
    .from(planWorkoutMatches)
    .where(eq(planWorkoutMatches.activityId, activity.id));

  if (existingMatch) {
    logger.debug({ activityId: activity.id }, 'plan-match: activity already matched');
    return;
  }

  await matchActivityToWorkout(db, logger, {
    activity: {
      id: activity.id,
      startDate: activity.startDate,
      distance: activity.distance ?? 0,
    },
    instance,
    timezone: user.timezone,
  });
}

/**
 * Core matching logic: find unmatched workouts for an activity's day and pick the best match.
 */
async function matchActivityToWorkout(
  db: Database,
  logger: Logger,
  params: {
    activity: { id: number; startDate: Date; distance: number };
    instance: typeof planInstances.$inferSelect;
    timezone: string;
  },
): Promise<void> {
  const { activity, instance, timezone } = params;

  const activityDow = dayOfWeekInTimezone(activity.startDate, timezone);

  // Find the week this activity falls in
  const weeks = await db
    .select()
    .from(planWeeks)
    .where(eq(planWeeks.instanceId, instance.id));

  const matchingWeek = weeks.find((w) => {
    const weekStart = w.startDate.getTime();
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
    return activity.startDate.getTime() >= weekStart && activity.startDate.getTime() < weekEnd;
  });

  if (!matchingWeek) {
    logger.debug(
      { activityId: activity.id, instanceId: instance.id },
      'plan-match: activity date not in any plan week',
    );
    return;
  }

  // Find workouts for that day
  const workouts = await db
    .select()
    .from(planWorkouts)
    .where(
      and(eq(planWorkouts.weekId, matchingWeek.id), eq(planWorkouts.dayOfWeek, activityDow)),
    );

  if (workouts.length === 0) {
    logger.debug(
      { activityId: activity.id, dayOfWeek: activityDow },
      'plan-match: no workouts on this day',
    );
    return;
  }

  // Filter out already-matched workouts
  const workoutIds = workouts.map((w) => w.id);
  const existingMatches = await db
    .select({ workoutId: planWorkoutMatches.workoutId })
    .from(planWorkoutMatches)
    .where(inArray(planWorkoutMatches.workoutId, workoutIds));

  const matchedIds = new Set(existingMatches.map((m) => m.workoutId));
  const unmatchedWorkouts = workouts.filter((w) => !matchedIds.has(w.id));

  if (unmatchedWorkouts.length === 0) {
    logger.debug(
      { activityId: activity.id },
      'plan-match: all workouts on this day already matched',
    );
    return;
  }

  // Score each unmatched workout and pick the best
  let bestWorkout: (typeof unmatchedWorkouts)[0] | null = null;
  let bestScore: { confidence: number; ratio: number } | null = null;

  for (const workout of unmatchedWorkouts) {
    if (!workout.targetDistanceMin || workout.targetDistanceMin <= 0) continue;
    const score = scoreMatch(activity.distance, workout.targetDistanceMin);
    if (!score) continue;
    if (!bestScore || score.confidence > bestScore.confidence) {
      bestScore = score;
      bestWorkout = workout;
    }
  }

  if (!bestWorkout || !bestScore) {
    logger.debug({ activityId: activity.id }, 'plan-match: no workout scored within range');
    return;
  }

  const matchType = bestScore.confidence >= 0.8 ? 'auto' : 'suggested';

  await db.insert(planWorkoutMatches).values({
    workoutId: bestWorkout.id,
    activityId: activity.id,
    matchType,
    confidence: bestScore.confidence,
  });

  logger.info(
    {
      activityId: activity.id,
      workoutId: bestWorkout.id,
      matchType,
      confidence: bestScore.confidence,
      ratio: bestScore.ratio,
    },
    `plan-match: ${matchType}`,
  );
}

/**
 * Backfill matches for all past weeks in a plan instance.
 */
export async function handlePlanBackfill(
  job: Job<PlanBackfillJobData>,
  deps: PlanMatchingDeps,
): Promise<void> {
  const { db, logger } = deps;
  const { userId, instanceId } = job.data;

  const [instance] = await db
    .select()
    .from(planInstances)
    .where(and(eq(planInstances.id, instanceId), eq(planInstances.userId, userId)));

  if (!instance) {
    logger.warn({ userId, instanceId }, 'plan-backfill: instance not found');
    return;
  }

  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return;

  const now = new Date();

  // Get all weeks, sorted by week number
  const weeks = await db
    .select()
    .from(planWeeks)
    .where(eq(planWeeks.instanceId, instanceId));

  // Track matched activity IDs across weeks to avoid reuse
  const globalMatchedActivityIds = new Set<number>();

  let matched = 0;

  for (const week of weeks) {
    if (week.startDate.getTime() > now.getTime()) continue;

    const weekEnd = new Date(week.startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const workouts = await db
      .select()
      .from(planWorkouts)
      .where(eq(planWorkouts.weekId, week.id));

    if (workouts.length === 0) continue;

    // Get already-matched workout IDs for this week
    const workoutIds = workouts.map((w) => w.id);
    const existingWorkoutMatches = await db
      .select({ workoutId: planWorkoutMatches.workoutId })
      .from(planWorkoutMatches)
      .where(inArray(planWorkoutMatches.workoutId, workoutIds));

    const matchedWorkoutIds = new Set(existingWorkoutMatches.map((m) => m.workoutId));
    const unmatchedWorkouts = workouts.filter((w) => !matchedWorkoutIds.has(w.id));

    if (unmatchedWorkouts.length === 0) continue;

    // Find completed activities for this user in this week
    const weekActivities = await db
      .select({
        id: activities.id,
        startDate: activities.startDate,
        distance: activities.distance,
        sportType: activities.sportType,
      })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.syncStatus, 'complete'),
          gte(activities.startDate, week.startDate),
          lt(activities.startDate, weekEnd),
        ),
      );

    // Filter to matching sport type
    const relevantActivities = weekActivities.filter((a) => a.sportType.toLowerCase() === instance.sportType.toLowerCase());

    // Filter out already-matched activities (both from DB and from prior iterations)
    // Scope to only matches for workouts in this instance
    const existingActivityMatches = await db
      .select({ activityId: planWorkoutMatches.activityId })
      .from(planWorkoutMatches)
      .innerJoin(planWorkouts, eq(planWorkoutMatches.workoutId, planWorkouts.id))
      .innerJoin(planWeeks, eq(planWorkouts.weekId, planWeeks.id))
      .where(eq(planWeeks.instanceId, instanceId));
    const dbMatchedActivityIds = new Set(existingActivityMatches.map((m) => m.activityId));

    const unmatchedActivities = relevantActivities.filter(
      (a) => !dbMatchedActivityIds.has(a.id) && !globalMatchedActivityIds.has(a.id),
    );

    const daysWithWorkouts = [...new Set(unmatchedWorkouts.map((w) => w.dayOfWeek))];

    for (const dow of daysWithWorkouts) {
      const dayWorkouts = unmatchedWorkouts.filter((w) => w.dayOfWeek === dow);
      const dayActivities = unmatchedActivities.filter(
        (a) => dayOfWeekInTimezone(a.startDate, user.timezone) === dow,
      );

      if (dayActivities.length === 0) continue;

      for (const workout of dayWorkouts) {
        if (!workout.targetDistanceMin || workout.targetDistanceMin <= 0) continue;

        let bestActivity: (typeof dayActivities)[0] | null = null;
        let bestScore: { confidence: number; ratio: number } | null = null;

        for (const activity of dayActivities) {
          if (globalMatchedActivityIds.has(activity.id)) continue;

          const score = scoreMatch(activity.distance ?? 0, workout.targetDistanceMin);
          if (!score) continue;
          if (!bestScore || score.confidence > bestScore.confidence) {
            bestScore = score;
            bestActivity = activity;
          }
        }

        if (!bestActivity || !bestScore) continue;

        const matchType = bestScore.confidence >= 0.8 ? 'auto' : 'suggested';

        await db.insert(planWorkoutMatches).values({
          workoutId: workout.id,
          activityId: bestActivity.id,
          matchType,
          confidence: bestScore.confidence,
        });

        globalMatchedActivityIds.add(bestActivity.id);
        matched++;

        logger.info(
          {
            activityId: bestActivity.id,
            workoutId: workout.id,
            matchType,
            confidence: bestScore.confidence,
          },
          `plan-backfill: ${matchType}`,
        );
      }
    }
  }

  logger.info({ userId, instanceId, matched }, 'plan-backfill: complete');
}
