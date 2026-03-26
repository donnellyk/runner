import { Queue } from 'bullmq';
import { QUEUE_NAME, BULK_IMPORT_QUEUE_NAME } from '@web-runner/shared';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const parsedUrl = new URL(redisUrl);

const connection = {
	host: parsedUrl.hostname,
	port: Number(parsedUrl.port) || 6379,
	password: parsedUrl.password || undefined,
	username: parsedUrl.username || undefined,
	maxRetriesPerRequest: null,
};

let _queue: Queue | null = null;
let _bulkImportQueue: Queue | null = null;

export function getQueue(): Queue {
	if (!_queue) {
		_queue = new Queue(QUEUE_NAME, { connection });
	}
	return _queue;
}

export function getBulkImportQueue(): Queue {
	if (!_bulkImportQueue) {
		_bulkImportQueue = new Queue(BULK_IMPORT_QUEUE_NAME, { connection });
	}
	return _bulkImportQueue;
}
