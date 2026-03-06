import { fail } from '@sveltejs/kit';
import { getDb } from '@web-runner/db/client';
import { activities } from '@web-runner/db/schema';
import { eq } from 'drizzle-orm';
import { getQueue } from '$lib/server/queue';
import { JobPriority } from '@web-runner/shared';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ });

export const actions: Actions = {
	requeuePending: async ({ locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const db = getDb();
		const stuck = await db
			.select({ id: activities.id, externalId: activities.externalId, userId: activities.userId })
			.from(activities)
			.where(eq(activities.syncStatus, 'pending'));

		const queue = getQueue();
		const lines: string[] = [`Found ${stuck.length} pending activities`];

		for (const a of stuck) {
			await queue.add(
				'activity-import',
				{ type: 'activity-import', userId: a.userId, activityId: Number(a.externalId) },
				{ priority: JobPriority.activityImport },
			);
			lines.push(`  queued activity-import for ${a.externalId} (user ${a.userId})`);
		}

		lines.push('Done');
		return { script: 'requeuePending', lines };
	},

	requeueStreams: async ({ locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const db = getDb();
		const stuck = await db
			.select({ id: activities.id, externalId: activities.externalId, userId: activities.userId })
			.from(activities)
			.where(eq(activities.syncStatus, 'streams_pending'));

		const queue = getQueue();
		const lines: string[] = [`Found ${stuck.length} activities missing streams`];

		for (const a of stuck) {
			await queue.add(
				'activity-streams',
				{ type: 'activity-streams', userId: a.userId, activityId: Number(a.externalId) },
				{ priority: JobPriority.activityImport },
			);
			lines.push(`  queued activity-streams for ${a.externalId} (user ${a.userId})`);
		}

		lines.push('Done');
		return { script: 'requeueStreams', lines };
	},
};
