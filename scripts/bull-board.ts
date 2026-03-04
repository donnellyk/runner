import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const parsed = new URL(redisUrl);

const connection = {
	host: parsed.hostname,
	port: Number(parsed.port) || 6379,
	password: parsed.password || undefined,
	username: parsed.username || undefined,
};

const queue = new Queue('strava', { connection });
const serverAdapter = new ExpressAdapter();
createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
serverAdapter.setBasePath('/');

const app = express();
const port = Number(process.env.BULL_BOARD_PORT) || 3001;
app.use('/', serverAdapter.getRouter());
app.listen(port, () => console.log(`Bull Board at http://localhost:${port}`));
