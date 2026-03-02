import type { Job, Queue } from 'bullmq';
import { DelayedError } from 'bullmq';
import type { Logger } from 'pino';
import type { Database } from '@web-runner/db/client';
import { activities, activityLaps } from '@web-runner/db/schema';
import { StravaClient, getValidToken, mapStravaSportType, mapStravaWorkoutType } from '@web-runner/strava';
import type { StravaRateLimiter } from '../rate-limiter.js';

interface ActivityImportData {
  type: 'activity-import';
  userId: number;
  activityId: number;
}

export async function handleActivityImport(
  job: Job<ActivityImportData>,
  deps: { db: Database; queue: Queue; rateLimiter: StravaRateLimiter; logger: Logger; token?: string },
) {
  const { db, queue, rateLimiter, logger } = deps;
  const { userId, activityId } = job.data;

  const token = await getValidToken(db, userId);
  if (!token) throw new Error(`No valid token for user ${userId}`);

  const client = new StravaClient();

  const state = await rateLimiter.check();
  if (!state.allowed) {
    await job.moveToDelayed(Date.now() + state.delayMs, deps.token);
    throw new DelayedError();
  }

  await rateLimiter.increment();
  const { data: detail, rateLimit } = await client.getActivity(token, activityId);
  await rateLimiter.updateFromHeaders(rateLimit.usage);

  const [row] = await db.insert(activities).values({
    externalId: String(activityId),
    source: 'strava',
    userId,
    name: detail.name,
    sportType: mapStravaSportType(detail.sport_type),
    workoutType: mapStravaWorkoutType(detail.workout_type),
    distance: detail.distance,
    movingTime: detail.moving_time,
    elapsedTime: detail.elapsed_time,
    totalElevationGain: detail.total_elevation_gain,
    startDate: new Date(detail.start_date),
    startLatlng: detail.start_latlng,
    endLatlng: detail.end_latlng,
    averageSpeed: detail.average_speed,
    maxSpeed: detail.max_speed,
    averageHeartrate: detail.average_heartrate ?? null,
    maxHeartrate: detail.max_heartrate ?? null,
    averageCadence: detail.average_cadence ?? null,
    averageWatts: detail.average_watts ?? null,
    hasHeartrate: detail.has_heartrate,
    hasPower: detail.device_watts ?? ((detail.average_watts ?? 0) > 0),
    deviceName: detail.device_name ?? null,
    gearId: detail.gear_id ?? null,
    syncStatus: 'streams_pending',
    sourceRaw: detail,
  }).onConflictDoUpdate({
    target: [activities.source, activities.externalId],
    set: {
      name: detail.name,
      sportType: mapStravaSportType(detail.sport_type),
      workoutType: mapStravaWorkoutType(detail.workout_type),
      distance: detail.distance,
      movingTime: detail.moving_time,
      elapsedTime: detail.elapsed_time,
      totalElevationGain: detail.total_elevation_gain,
      startDate: new Date(detail.start_date),
      startLatlng: detail.start_latlng,
      endLatlng: detail.end_latlng,
      averageSpeed: detail.average_speed,
      maxSpeed: detail.max_speed,
      averageHeartrate: detail.average_heartrate ?? null,
      maxHeartrate: detail.max_heartrate ?? null,
      averageCadence: detail.average_cadence ?? null,
      averageWatts: detail.average_watts ?? null,
      hasHeartrate: detail.has_heartrate,
      hasPower: detail.device_watts ?? ((detail.average_watts ?? 0) > 0),
      syncStatus: 'streams_pending',
      sourceRaw: detail,
      updatedAt: new Date(),
    },
  }).returning({ id: activities.id });

  const actDbId = row.id;

  if (detail.laps && detail.laps.length > 0) {
    for (const lap of detail.laps) {
      await db.insert(activityLaps).values({
        activityId: actDbId,
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

  await queue.add('activity-streams', {
    type: 'activity-streams',
    userId,
    activityId,
  }, { priority: 5 });

  logger.info({ userId, activityId, actDbId }, 'Activity imported');
}
