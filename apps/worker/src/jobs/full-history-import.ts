import type { Job, Queue } from 'bullmq';
import { DelayedError } from 'bullmq';
import type { Logger } from 'pino';
import type { Database } from '@web-runner/db/client';
import { activities } from '@web-runner/db/schema';
import { StravaClient, getValidToken, mapStravaSportType, mapStravaWorkoutType } from '@web-runner/strava';
import type { StravaRateLimiter } from '../rate-limiter.js';

interface FullHistoryImportData {
  type: 'full-history-import';
  userId: number;
}

export async function handleFullHistoryImport(
  job: Job<FullHistoryImportData>,
  deps: { db: Database; queue: Queue; rateLimiter: StravaRateLimiter; logger: Logger; token?: string },
) {
  const { db, queue, rateLimiter, logger } = deps;
  const { userId } = job.data;

  const token = await getValidToken(db, userId);
  if (!token) throw new Error(`No valid token for user ${userId}`);

  const client = new StravaClient();
  let before: number | undefined;
  let totalImported = 0;

  const syncAfter = getSyncAfterEpoch();

  while (true) {
    const state = await rateLimiter.check();
    if (!state.allowed) {
      logger.info({ delayMs: state.delayMs }, 'Rate limited, delaying job');
      await job.moveToDelayed(Date.now() + state.delayMs, deps.token);
      throw new DelayedError();
    }

    await rateLimiter.increment();
    const { data: page, rateLimit } = await client.listActivities(token, {
      before,
      after: syncAfter ?? undefined,
      perPage: 200,
    });
    await rateLimiter.updateFromHeaders(rateLimit.usage);

    if (page.length === 0) break;

    for (const act of page) {
      await db.insert(activities).values({
        externalId: String(act.id),
        source: 'strava',
        userId,
        name: act.name,
        sportType: mapStravaSportType(act.sport_type),
        workoutType: mapStravaWorkoutType(act.workout_type),
        distance: act.distance,
        movingTime: act.moving_time,
        elapsedTime: act.elapsed_time,
        totalElevationGain: act.total_elevation_gain,
        startDate: new Date(act.start_date),
        startLatlng: act.start_latlng,
        endLatlng: act.end_latlng,
        averageSpeed: act.average_speed,
        maxSpeed: act.max_speed,
        averageHeartrate: act.average_heartrate ?? null,
        maxHeartrate: act.max_heartrate ?? null,
        averageCadence: act.average_cadence ?? null,
        averageWatts: act.average_watts ?? null,
        hasHeartrate: act.has_heartrate,
        hasPower: (act.average_watts ?? 0) > 0,
        deviceName: act.device_name ?? null,
        gearId: act.gear_id ?? null,
        syncStatus: 'pending',
      }).onConflictDoUpdate({
        target: [activities.source, activities.externalId],
        set: {
          name: act.name,
          sportType: mapStravaSportType(act.sport_type),
          workoutType: mapStravaWorkoutType(act.workout_type),
          distance: act.distance,
          movingTime: act.moving_time,
          elapsedTime: act.elapsed_time,
          totalElevationGain: act.total_elevation_gain,
          startDate: new Date(act.start_date),
          averageSpeed: act.average_speed,
          maxSpeed: act.max_speed,
          averageHeartrate: act.average_heartrate ?? null,
          maxHeartrate: act.max_heartrate ?? null,
          averageCadence: act.average_cadence ?? null,
          averageWatts: act.average_watts ?? null,
          hasHeartrate: act.has_heartrate,
          hasPower: (act.average_watts ?? 0) > 0,
          updatedAt: new Date(),
        },
      });

      await queue.add('activity-import', {
        type: 'activity-import',
        userId,
        activityId: act.id,
      }, { priority: 5 });
    }

    totalImported += page.length;
    logger.info({ userId, page: totalImported }, 'Imported activity page');

    before = Math.floor(new Date(page[page.length - 1].start_date).getTime() / 1000);

    if (page.length < 200) break;
  }

  logger.info({ userId, totalImported }, 'Full history import complete');
}

function getSyncAfterEpoch(): number | null {
  const val = process.env.SYNC_AFTER;
  if (!val) return null;
  if (val === 'dev') {
    return Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  }
  const n = Number(val);
  return isNaN(n) ? null : n;
}
