import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { getDb } from '@web-runner/db/client';
import { QUEUE_NAME, BULK_IMPORT_QUEUE_NAME, PLAN_QUEUE_NAME } from '@web-runner/shared';
import { processJob, processBulkImportJob, processPlanJob } from './processor.js';
import { StravaRateLimiter } from './rate-limiter.js';

const logger = pino(
	process.env.NODE_ENV === 'production'
		? {}
		: { transport: { target: 'pino-pretty' } }
);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const parsedUrl = new URL(redisUrl);

const connection = {
	host: parsedUrl.hostname,
	port: Number(parsedUrl.port) || 6379,
	password: parsedUrl.password || undefined,
	username: parsedUrl.username || undefined,
	maxRetriesPerRequest: null,
};

const redis = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
await redis.connect();

const db = getDb();
const rateLimiter = new StravaRateLimiter(redis);

const queue = new Queue(QUEUE_NAME, {
	connection,
	defaultJobOptions: {
		attempts: 3,
		backoff: { type: 'exponential', delay: 30_000 },
	},
});

const worker = new Worker(
	QUEUE_NAME,
	async (job, token) => {
		logger.info({ jobId: job.id, type: job.data?.type }, 'Processing job');
		await processJob(job, { db, queue, planQueue, rateLimiter, logger, token });
	},
	{
		connection,
		concurrency: 1,
	}
);

const bulkImportQueue = new Queue(BULK_IMPORT_QUEUE_NAME, {
	connection,
	defaultJobOptions: {
		attempts: 1,
		removeOnComplete: false,
	},
});

const bulkImportWorker = new Worker(
	BULK_IMPORT_QUEUE_NAME,
	async (job) => {
		logger.info({ jobId: job.id, userId: job.data?.userId }, 'Processing bulk import');
		await processBulkImportJob(job, { db, queue: bulkImportQueue, logger });
	},
	{
		connection,
		concurrency: 1,
	}
);

const planQueue = new Queue(PLAN_QUEUE_NAME, {
	connection,
	defaultJobOptions: {
		attempts: 3,
		backoff: { type: 'exponential', delay: 5_000 },
	},
});

const planWorker = new Worker(
	PLAN_QUEUE_NAME,
	async (job) => {
		logger.info({ jobId: job.id, type: job.data?.type }, 'Processing plan job');
		await processPlanJob(job, { db, logger });
	},
	{
		connection,
		concurrency: 1,
	}
);

worker.on('completed', (job) => {
	logger.info({ jobId: job.id, type: job.data?.type }, 'Job completed');
});

worker.on('failed', (job, err) => {
	logger.error({ jobId: job?.id, type: job?.data?.type, err: err.message }, 'Job failed');
});

bulkImportWorker.on('completed', (job) => {
	logger.info({ jobId: job.id }, 'Bulk import completed');
});

bulkImportWorker.on('failed', (job, err) => {
	logger.error({ jobId: job?.id, err: err.message }, 'Bulk import failed');
});

planWorker.on('completed', (job) => {
	logger.info({ jobId: job.id, type: job.data?.type }, 'Plan job completed');
});

planWorker.on('failed', (job, err) => {
	logger.error({ jobId: job?.id, type: job?.data?.type, err: err.message }, 'Plan job failed');
});

logger.info('Worker started');

process.on('unhandledRejection', (reason) => {
	logger.error({ reason }, 'Unhandled promise rejection');
	process.exit(1);
});

process.on('uncaughtException', (err) => {
	logger.error({ err }, 'Uncaught exception');
	process.exit(1);
});

async function shutdown() {
	logger.info('Shutting down worker...');
	await Promise.all([worker.close(), bulkImportWorker.close(), planWorker.close()]);
	await Promise.all([queue.close(), bulkImportQueue.close(), planQueue.close()]);
	await redis.quit();
	logger.info('Worker stopped');
	process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
