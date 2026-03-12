import { fail } from '@sveltejs/kit';
import { getQueue } from '$lib/server/queue';
import { getUserOptions } from '$lib/server/admin-queries';
import { parseId } from '$lib/server/validation';
import { getDb } from '@web-runner/db/client';
import { activities } from '@web-runner/db/schema';
import { eq, desc } from 'drizzle-orm';
import { JobPriority } from '@web-runner/shared';
import type { ActivityImportJobData, FullHistoryImportJobData } from '@web-runner/shared';
import type { Job } from 'bullmq';
import type { PageServerLoad, Actions } from './$types';

function serializeJob(job: Job) {
	return {
		id: job.id,
		name: job.name,
		data: job.data,
		attemptsMade: job.attemptsMade,
		timestamp: job.timestamp,
		processedOn: job.processedOn,
		finishedOn: job.finishedOn,
		failedReason: job.failedReason,
		delay: job.delay,
	};
}

export const load: PageServerLoad = async () => {
	const queue = getQueue();
	const counts = await queue.getJobCounts('active', 'waiting', 'delayed', 'completed', 'failed');
	const failedJobs = (await queue.getFailed(0, 20)).map(serializeJob);
	const delayedJobs = (await queue.getDelayed(0, 20)).map(serializeJob);
	const activeJobs = (await queue.getActive(0, 20)).map(serializeJob);
	const completedJobs = (await queue.getCompleted(0, 20)).map(serializeJob);

	const userOptions = await getUserOptions();

	return { counts, failedJobs, delayedJobs, activeJobs, completedJobs, users: userOptions };
};

export const actions: Actions = {
	triggerSync: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const userId = parseId(data.get('userId'));
		if (!userId) return fail(400, { error: 'Invalid userId' });

		const jobData: FullHistoryImportJobData = { type: 'full-history-import', userId };
		const queue = getQueue();
		await queue.add('full-history-import', jobData, { priority: JobPriority.fullHistoryImport });
	},

	importRaces: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const userId = parseId(data.get('userId'));
		if (!userId) return fail(400, { error: 'Invalid userId' });

		const jobData: FullHistoryImportJobData = {
			type: 'full-history-import',
			userId,
			workoutTypeFilter: [1],
			after: 0, // override dev SYNC_AFTER limit — races can be at any point in history
		};
		const queue = getQueue();
		await queue.add('full-history-import', jobData, { priority: JobPriority.fullHistoryImport });
	},

	refreshSync: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const userId = parseId(data.get('userId'));
		if (!userId) return fail(400, { error: 'Invalid userId' });

		const db = getDb();
		const [latest] = await db
			.select({ startDate: activities.startDate })
			.from(activities)
			.where(eq(activities.userId, userId))
			.orderBy(desc(activities.startDate))
			.limit(1);

		if (!latest) return fail(400, { error: 'No activities found for user' });

		const after = Math.floor(latest.startDate.getTime() / 1000);
		const jobData: FullHistoryImportJobData = {
			type: 'full-history-import',
			userId,
			after,
		};
		const queue = getQueue();
		await queue.add('full-history-import', jobData, { priority: JobPriority.fullHistoryImport });
	},

	reimport: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const userId = parseId(data.get('userId'));
		if (!userId) return fail(400, { error: 'Invalid userId' });
		const activityId = parseId(data.get('activityId'));
		if (!activityId) return fail(400, { error: 'Invalid activityId' });

		const jobData: ActivityImportJobData = {
			type: 'activity-import',
			userId,
			activityId,
		};
		const queue = getQueue();
		await queue.add('activity-import', jobData, { priority: JobPriority.activityImport });
	},

	retryFailed: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const jobId = String(data.get('jobId'));
		const queue = getQueue();
		const job = await queue.getJob(jobId);
		if (job) {
			const state = await job.getState();
			if (state !== 'failed') return fail(400, { error: 'Job is not in failed state' });
			await job.retry();
		}
	},

	clean: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const status = String(data.get('status'));
		if (status !== 'completed' && status !== 'failed') {
			return fail(400, { error: 'Invalid status' });
		}
		const queue = getQueue();
		await queue.clean(0, 1000, status);
	},
};
