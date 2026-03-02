import repl from 'node:repl';
import Redis from 'ioredis';
import { getDb } from '@web-runner/db/client';
import { StravaClient } from '@web-runner/strava';
import { Queue } from 'bullmq';
import { QUEUE_NAME } from '@web-runner/shared';
import * as schema from '@web-runner/db/schema';

const db = getDb();
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);
const parsed = new URL(redisUrl);
const queue = new Queue(QUEUE_NAME, {
	connection: {
		host: parsed.hostname,
		port: Number(parsed.port) || 6379,
		password: parsed.password || undefined,
		username: parsed.username || undefined,
	},
});
const strava = new StravaClient();

console.log('Available: db, redis, strava, queue, schema');
const r = repl.start('web-runner> ');
Object.assign(r.context, { db, redis, strava, queue, schema });
