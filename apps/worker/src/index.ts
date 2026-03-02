import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { getDb } from '@web-runner/db/client';
import { processJob } from './processor.js';
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

const queue = new Queue('strava', {
	connection,
	defaultJobOptions: {
		attempts: 3,
		backoff: { type: 'exponential', delay: 30_000 },
	},
});

const worker = new Worker(
	'strava',
	async (job, token) => {
		logger.info({ jobId: job.id, type: job.data?.type }, 'Processing job');
		await processJob(job, { db, queue, rateLimiter, logger, token });
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

logger.info('Worker started');

async function shutdown() {
	logger.info('Shutting down worker...');
	await worker.close();
	await queue.close();
	await redis.quit();
	logger.info('Worker stopped');
	process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
