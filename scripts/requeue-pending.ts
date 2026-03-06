/**
 * Requeue activity-import jobs for all activities stuck at syncStatus='pending'.
 * These are created by full-history-import as stub rows but may never have had
 * their import job queued (e.g. due to workoutTypeFilter or job failures).
 *
 * Usage: npx tsx scripts/requeue-pending.ts
 */
import { getDb } from '@web-runner/db/client';
import { activities } from '@web-runner/db/schema';
import { eq } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { QUEUE_NAME, JobPriority } from '@web-runner/shared';
import IORedis from 'ioredis';

const db = getDb();
const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
	maxRetriesPerRequest: null,
});
const queue = new Queue(QUEUE_NAME, { connection });

const stuck = await db
	.select({ id: activities.id, externalId: activities.externalId, userId: activities.userId })
	.from(activities)
	.where(eq(activities.syncStatus, 'pending'));

console.log(`Found ${stuck.length} pending activities`);

for (const a of stuck) {
	await queue.add(
		'activity-import',
		{ type: 'activity-import', userId: a.userId, activityId: Number(a.externalId) },
		{ priority: JobPriority.activityImport },
	);
	console.log(`  queued activity-import for ${a.externalId} (user ${a.userId})`);
}

console.log('Done');
await queue.close();
await connection.quit();
