import type { Job, Queue } from 'bullmq';
import { DelayedError } from 'bullmq';
import type { Logger } from 'pino';
import type { Database } from '@web-runner/db/client';
import { activities } from '@web-runner/db/schema';
import { StravaClient, getValidToken } from '@web-runner/strava';
import { buildActivityValues, buildActivityUpdateSet } from './activity-values.js';
import { JobPriority, type FullHistoryImportJobData } from '@web-runner/shared';
import type { StravaRateLimiter } from '../rate-limiter.js';

export async function handleFullHistoryImport(
  job: Job<FullHistoryImportJobData>,
  deps: { db: Database; queue: Queue; rateLimiter: StravaRateLimiter; logger: Logger; token?: string },
) {
  const { db, queue, rateLimiter, logger } = deps;
  const { userId } = job.data;

  const token = await getValidToken(db, userId);
  if (!token) throw new Error(`No valid token for user ${userId}`);

  const client = new StravaClient();
  let before: number | undefined;
  let totalImported = 0;

  const syncAfter = job.data.after ?? getSyncAfterEpoch();

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
      const { workoutTypeFilter } = job.data;
      const shouldImport = !workoutTypeFilter || workoutTypeFilter.includes(act.workout_type ?? 0);

      // Only upsert stub rows for activities we're actually going to import.
      // Skipping filtered-out activities avoids orphaned 'pending' rows that
      // never get an activity-import job queued.
      if (!shouldImport) continue;

      const values = buildActivityValues(userId, act);
      await db.insert(activities).values({
        ...values,
        syncStatus: 'pending',
      }).onConflictDoUpdate({
        target: [activities.source, activities.externalId],
        set: buildActivityUpdateSet(userId, act),
      });

      await queue.add('activity-import', {
        type: 'activity-import',
        userId,
        activityId: act.id,
      }, { priority: JobPriority.activityImport });
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
