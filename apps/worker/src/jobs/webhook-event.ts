import type { Job, Queue } from 'bullmq';
import type { Logger } from 'pino';
import { eq, and } from 'drizzle-orm';
import type { Database } from '@web-runner/db/client';
import { activities, oauthAccounts, users } from '@web-runner/db/schema';
import { JobPriority, type WebhookEventJobData } from '@web-runner/shared';

export async function handleWebhookEvent(
  job: Job<WebhookEventJobData>,
  deps: { db: Database; queue: Queue; logger: Logger },
) {
  const { db, queue, logger } = deps;
  const { event } = job.data;

  if (event.object_type === 'activity') {
    if (event.aspect_type === 'create' || event.aspect_type === 'update') {
      const userId = await findUserByStravaId(db, event.owner_id);
      if (!userId) {
        logger.warn({ ownerStravaId: event.owner_id }, 'Unknown Strava athlete, ignoring event');
        return;
      }

      await queue.add('activity-import', {
        type: 'activity-import',
        userId,
        activityId: event.object_id,
      }, { priority: JobPriority.activityImport });

      logger.info({ event: event.aspect_type, activityId: event.object_id }, 'Enqueued activity import');
    } else if (event.aspect_type === 'delete') {
      const userId = await findUserByStravaId(db, event.owner_id);
      if (!userId) {
        logger.warn({ ownerStravaId: event.owner_id }, 'Unknown Strava athlete for delete, ignoring');
        return;
      }

      await db.delete(activities)
        .where(and(
          eq(activities.source, 'strava'),
          eq(activities.externalId, String(event.object_id)),
          eq(activities.userId, userId),
        ));

      logger.info({ activityId: event.object_id, userId }, 'Deleted activity');
    }
  } else if (event.object_type === 'athlete') {
    if (event.updates && event.updates.authorized === 'false') {
      const userId = await findUserByStravaId(db, event.object_id);
      if (userId) {
        await db.delete(oauthAccounts)
          .where(and(
            eq(oauthAccounts.userId, userId),
            eq(oauthAccounts.provider, 'strava'),
          ));
        logger.info({ userId, stravaAthleteId: event.object_id }, 'Deauthorized user');
      }
    }
  }
}

async function findUserByStravaId(db: Database, stravaAthleteId: number): Promise<number | null> {
  const [user] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.stravaAthleteId, String(stravaAthleteId)));
  return user?.id ?? null;
}
