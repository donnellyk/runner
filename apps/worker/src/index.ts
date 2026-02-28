import { Worker } from 'bullmq';
import pino from 'pino';

const logger = pino(
	process.env.NODE_ENV === 'production'
		? {}
		: { transport: { target: 'pino-pretty' } }
);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const url = new URL(redisUrl);

const connection = {
	host: url.hostname,
	port: Number(url.port) || 6379,
	maxRetriesPerRequest: null,
};

const worker = new Worker(
	'default',
	async (job) => {
		logger.info({ jobId: job.id, name: job.name }, 'Processing job');
	},
	{ connection }
);

worker.on('completed', (job) => {
	logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
	logger.error({ jobId: job?.id, err }, 'Job failed');
});

logger.info('Worker started');

async function shutdown() {
	logger.info('Shutting down worker...');
	await worker.close();
	logger.info('Worker stopped');
	process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
