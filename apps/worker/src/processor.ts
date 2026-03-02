import type { Job, Queue } from 'bullmq';
import { DelayedError } from 'bullmq';
import type { Logger } from 'pino';
import type { Database } from '@web-runner/db/client';
import type { StravaRateLimiter } from './rate-limiter.js';
import { handleFullHistoryImport } from './jobs/full-history-import.js';
import { handleActivityImport } from './jobs/activity-import.js';
import { handleActivityStreams } from './jobs/activity-streams.js';
import { handleWebhookEvent } from './jobs/webhook-event.js';
import { StravaApiError, StravaRateLimitError } from '@web-runner/strava';

export interface ProcessorDeps {
  db: Database;
  queue: Queue;
  rateLimiter: StravaRateLimiter;
  logger: Logger;
  token?: string;
}

export async function processJob(job: Job, deps: ProcessorDeps): Promise<void> {
  const { logger } = deps;
  const jobType = job.data?.type;

  try {
    switch (jobType) {
      case 'full-history-import':
        await handleFullHistoryImport(job, deps);
        break;
      case 'activity-import':
        await handleActivityImport(job, deps);
        break;
      case 'activity-streams':
        await handleActivityStreams(job, deps);
        break;
      case 'webhook-event':
        await handleWebhookEvent(job, deps);
        break;
      default:
        logger.warn({ jobType }, 'Unknown job type');
    }
  } catch (err) {
    if (err instanceof DelayedError) {
      throw err;
    }

    if (err instanceof StravaRateLimitError) {
      logger.warn({ usage: err.usage }, 'Rate limited by Strava, delaying');
      await deps.rateLimiter.updateFromHeaders(err.usage);
      const state = await deps.rateLimiter.check();
      await job.moveToDelayed(Date.now() + state.delayMs, deps.token);
      throw new DelayedError();
    }

    if (err instanceof StravaApiError && err.status === 401) {
      logger.error({ jobType, status: err.status }, 'Auth error, job failed');
    }

    throw err;
  }
}
