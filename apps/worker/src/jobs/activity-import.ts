import type { Job, Queue } from 'bullmq';
import type { Logger } from 'pino';
import type { Database } from '@web-runner/db/client';
import { activities, activityLaps } from '@web-runner/db/schema';
import { StravaClient, getValidToken } from '@web-runner/strava';
import { buildActivityValues, buildActivityUpdateSet } from './activity-values.js';
import { JobPriority, type ActivityImportJobData } from '@web-runner/shared';
import type { StravaRateLimiter } from '../rate-limiter.js';
import { checkRateLimit } from '../rate-limit-guard.js';

export async function handleActivityImport(
  job: Job<ActivityImportJobData>,
  deps: { db: Database; queue: Queue; rateLimiter: StravaRateLimiter; logger: Logger; token?: string },
) {
  const { db, queue, rateLimiter, logger } = deps;
  const { userId, activityId } = job.data;

  const token = await getValidToken(db, userId);
  if (!token) throw new Error(`No valid token for user ${userId}`);

  const client = new StravaClient();

  await checkRateLimit(rateLimiter, job, deps.token);
  const { data: detail, rateLimit } = await client.getActivity(token, activityId);
  await rateLimiter.updateFromHeaders(rateLimit.usage);

  const actDbId = await db.transaction(async (tx) => {
    const values = buildActivityValues(userId, detail);
    const [row] = await tx.insert(activities).values({
      ...values,
      syncStatus: 'streams_pending',
      sourceRaw: detail,
    }).onConflictDoUpdate({
      target: [activities.source, activities.externalId],
      set: {
        ...buildActivityUpdateSet(userId, detail),
        syncStatus: 'streams_pending',
        sourceRaw: detail,
      },
    }).returning({ id: activities.id });

    if (detail.laps && detail.laps.length > 0) {
      for (const lap of detail.laps) {
        await tx.insert(activityLaps).values({
          activityId: row.id,
          lapIndex: lap.lap_index,
          elapsedTime: lap.elapsed_time,
          movingTime: lap.moving_time,
          distance: lap.distance,
          startDate: new Date(lap.start_date),
          totalElevationGain: lap.total_elevation_gain,
          averageSpeed: lap.average_speed,
          maxSpeed: lap.max_speed,
          averageHeartrate: lap.average_heartrate ?? null,
          maxHeartrate: lap.max_heartrate ?? null,
          averageCadence: lap.average_cadence ?? null,
          averageWatts: lap.average_watts ?? null,
        }).onConflictDoUpdate({
          target: [activityLaps.activityId, activityLaps.lapIndex],
          set: {
            elapsedTime: lap.elapsed_time,
            movingTime: lap.moving_time,
            distance: lap.distance,
            startDate: new Date(lap.start_date),
            totalElevationGain: lap.total_elevation_gain,
            averageSpeed: lap.average_speed,
            maxSpeed: lap.max_speed,
            averageHeartrate: lap.average_heartrate ?? null,
            maxHeartrate: lap.max_heartrate ?? null,
            averageCadence: lap.average_cadence ?? null,
            averageWatts: lap.average_watts ?? null,
          },
        });
      }
    }

    return row.id;
  });

  await queue.add('activity-streams', {
    type: 'activity-streams',
    userId,
    activityId,
  }, { priority: JobPriority.activityImport });

  logger.info({ userId, activityId, actDbId }, 'Activity imported');
}
